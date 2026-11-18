import { DURATIONS, STAGE_STOPS_PCT, START_OFFSET } from "../data/config.js";
import { dom, PLAY_SVG, PAUSE_SVG } from "../dom.js";
import { state } from "../state.js";

let beforePlaySnippetHook = null;
let pendingDecode = null; // { roundId, promise }
let playToken = 0;

export function setBeforePlaySnippetHook(fn) {
  beforePlaySnippetHook = fn;
}

function configureAudioSession() {
  try {
    // iOS 17+: מאפשר שמע גם כשמתג ההשתקה הפיזי באייפון פעיל
    if (typeof navigator !== "undefined" && navigator.audioSession) {
      navigator.audioSession.type = "playback";
    }
  } catch (e) { }
}

// יוצר AudioContext (מותר גם בלי מגע משתמש — הוא פשוט מתחיל במצב suspended)
function getAudioContext() {
  if (state.audioCtx) return state.audioCtx;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) state.audioCtx = new AudioContextClass();
  } catch (e) {
    state.audioCtx = null;
  }
  return state.audioCtx;
}

export function initAudioContext() {
  configureAudioSession();
  const ctx = getAudioContext();
  if (ctx && ctx.state !== "running") {
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => { });
    } catch (e) { }
  }
  return ctx;
}

// משחרר את נעילת האודיו במובייל במגע הראשון של המשתמש
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    initAudioContext();
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("pointerdown", unlock, true);
  };
  document.addEventListener("touchstart", unlock, { capture: true, passive: true });
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
}

// חוסם שליטה בשיר דרך ה-Dynamic Island / מסך הנעילה / מרכז הבקרה (מונע האזנה ל-30 שניות מלאות)
export function installMediaSessionGuards() {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const block = () => {
    stopAudioVisuals();
    releaseMediaElement();
  };
  const actions = ["play", "pause", "stop", "seekto", "seekbackward", "seekforward", "previoustrack", "nexttrack"];
  for (const action of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, block);
    } catch (e) { }
  }
}

// מנקה את נגן ה-<audio> כדי שה-iPhone יסיר אותו מה-Dynamic Island
export function releaseMediaElement() {
  const audio = state.fallbackAudio;
  try { audio.pause(); } catch (e) { }
  if (audio.getAttribute("src")) {
    try {
      audio.removeAttribute("src");
      audio.load();
    } catch (e) { }
  }
  try {
    if (navigator.mediaSession) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    }
  } catch (e) { }
}

function decodeCompat(ctx, arrayBuffer) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = ctx.decodeAudioData(arrayBuffer, resolve, reject);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchArrayBuffer(url, timeoutMs) {
  let timer = null;
  try {
    const hasAbort = typeof AbortController !== "undefined";
    const controller = hasAbort ? new AbortController() : null;
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.arrayBuffer();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// טוען ומפענח מראש את קטע השמע של הסיבוב — כך שהלחיצה על Play מתנגנת מיידית ובדיוק של אלפית שנייה
export function preloadAudioBufferInBackground(previewUrl, roundId) {
  state.audioDecodeFailed = false;
  const ctx = getAudioContext();
  if (!ctx || !previewUrl) {
    state.audioDecodeFailed = true;
    pendingDecode = null;
    return Promise.resolve(null);
  }

  const promise = (async () => {
    try {
      const raw = await fetchArrayBuffer(previewUrl, 10000);
      const decoded = await decodeCompat(ctx, raw);
      if (roundId === state.activeFetchRoundId) {
        state.audioBuffer = decoded;
      }
      return decoded;
    } catch (e) {
      if (roundId === state.activeFetchRoundId) {
        state.audioDecodeFailed = true;
      }
      return null;
    }
  })();

  pendingDecode = { roundId, promise };
  return promise;
}

export function elapsedSecondsToBarPercent(sec) {
  if (sec <= 0) return 0;
  const times = [0, ...DURATIONS];
  const pcts = [0, ...STAGE_STOPS_PCT];
  for (let i = 0; i < DURATIONS.length; i++) {
    if (sec <= times[i + 1]) {
      const ratio = Math.max(0, Math.min(1, (sec - times[i]) / (times[i + 1] - times[i])));
      return pcts[i] + ratio * (pcts[i + 1] - pcts[i]);
    }
  }
  return 100;
}

export function updateTimelineMarkerForStage(stageIdx) {
  const idx = Math.min(stageIdx, DURATIONS.length - 1);
  const stopPct = STAGE_STOPS_PCT[idx];
  const dur = DURATIONS[idx];
  if (dom.timelineMarker) dom.timelineMarker.style.left = `${stopPct}%`;
  if (dom.markerTimeLabel) dom.markerTimeLabel.textContent = `${dur}s`;
  if (dom.playTimeLabel) dom.playTimeLabel.textContent = dur;
  if (dom.playbackFill && !state.isPlayingSnippet) {
    dom.playbackFill.style.width = stageIdx === 0 ? "1.2%" : `${STAGE_STOPS_PCT[stageIdx - 1]}%`;
  }
}

export function startProgressLoop(durationSec) {
  cancelAnimationFrame(state.rafProgressId);
  const startStamp = performance.now();

  function tick(now) {
    if (!state.isPlayingSnippet) return;
    const elapsedSec = (now - startStamp) / 1000;
    if (dom.playbackFill) {
      dom.playbackFill.style.width = `${elapsedSecondsToBarPercent(Math.min(elapsedSec, durationSec))}%`;
    }
    if (elapsedSec < durationSec) {
      state.rafProgressId = requestAnimationFrame(tick);
    }
  }

  if (dom.playbackFill) dom.playbackFill.style.width = "0%";
  state.rafProgressId = requestAnimationFrame(tick);
}

export function stopAudioVisuals(finalPct = null) {
  playToken++;
  state.isPlayingSnippet = false;
  clearTimeout(state.uiTimer);
  clearTimeout(state.playStartGuardTimer);
  state.playStartGuardTimer = null;
  cancelAnimationFrame(state.uiTimer);
  cancelAnimationFrame(state.rafProgressId);

  if (state.activeOnPlayingHandler) {
    state.fallbackAudio.removeEventListener("playing", state.activeOnPlayingHandler);
    state.activeOnPlayingHandler = null;
  }

  if (state.activeOnErrorHandler) {
    state.fallbackAudio.removeEventListener("error", state.activeOnErrorHandler);
    state.activeOnErrorHandler = null;
  }

  if (state.activeSource) {
    try { state.activeSource.stop(); } catch (e) { }
    try { state.activeSource.disconnect(); } catch (e) { }
    state.activeSource = null;
  }

  try {
    state.fallbackAudio.pause();
  } catch (e) { }

  if (dom.playbackFill && finalPct !== null) {
    dom.playbackFill.style.width = `${finalPct}%`;
  }

  dom.playIcon.innerHTML = PLAY_SVG;
  dom.equalizer.classList.remove("playing");
  dom.discWrapper.classList.remove("spinning");
}

function setPlayingVisuals() {
  state.isPlayingSnippet = true;
  dom.playIcon.innerHTML = PAUSE_SVG;
  dom.equalizer.classList.add("playing");
  dom.discWrapper.classList.add("spinning");
}

// ניגון מדויק דרך Web Audio: מתחיל בדיוק ב-START_OFFSET ונעצר בדיוק אחרי duration שניות
function startBufferSnippet(ctx, buffer, duration, targetPct) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  state.activeSource = source;

  const when = ctx.currentTime + 0.01;
  source.start(when, START_OFFSET, duration);
  startProgressLoop(duration);

  state.uiTimer = setTimeout(() => {
    stopAudioVisuals(targetPct);
  }, duration * 1000 + 10);
}

// גיבוי בלבד: ניגון דרך <audio> (רק אם הפענוח של Web Audio נכשל)
function playViaMediaElement(duration, targetPct) {
  const audio = state.fallbackAudio;
  const url = state.currentSong.previewUrl;

  if (audio.getAttribute("src") !== url || audio.error) {
    audio.src = url;
  }

  if (audio.readyState >= 1) {
    try { audio.currentTime = START_OFFSET; } catch (e) { }
  }

  let lastCt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  let realStartStamp = null;
  let watchStarted = false;

  const beginWatch = () => {
    if (watchStarted || !state.isPlayingSnippet) return;
    watchStarted = true;
    clearTimeout(state.playStartGuardTimer);
    state.playStartGuardTimer = null;

    const watch = (now) => {
      if (!state.isPlayingSnippet) return;
      const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

      if (realStartStamp === null) {
        if (ct < lastCt) {
          lastCt = ct;
        } else if (!audio.seeking && ct > lastCt + 0.002) {
          realStartStamp = now;
          startProgressLoop(duration);
        }
        state.uiTimer = requestAnimationFrame(watch);
        return;
      }

      if (now - realStartStamp >= duration * 1000) {
        stopAudioVisuals(targetPct);
        releaseMediaElement();
      } else {
        state.uiTimer = requestAnimationFrame(watch);
      }
    };
    state.uiTimer = requestAnimationFrame(watch);
  };

  state.activeOnPlayingHandler = () => {
    audio.removeEventListener("playing", state.activeOnPlayingHandler);
    state.activeOnPlayingHandler = null;
    beginWatch();
  };
  state.activeOnErrorHandler = () => {
    stopAudioVisuals();
    if (dom.statusLabel) dom.statusLabel.textContent = "שגיאה בטעינת השמע — לחץ שוב על ניגון";
  };

  audio.addEventListener("playing", state.activeOnPlayingHandler);
  audio.addEventListener("error", state.activeOnErrorHandler);

  state.playStartGuardTimer = setTimeout(() => {
    if (state.isPlayingSnippet && realStartStamp === null) {
      stopAudioVisuals();
      if (dom.statusLabel) dom.statusLabel.textContent = "הטעינה התעכבה — לחץ שוב על ניגון";
    }
  }, 10000);

  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      if (state.isPlayingSnippet && !watchStarted) beginWatch();
    }).catch(() => {
      stopAudioVisuals();
      if (dom.statusLabel) dom.statusLabel.textContent = "הדפדפן חסם את הניגון — לחץ שוב על ניגון";
    });
  }
}

export function playSnippet() {
  if (beforePlaySnippetHook) beforePlaySnippetHook();
  if (state.isPlayingSnippet) {
    stopAudioVisuals();
    return;
  }

  stopAudioVisuals();
  if (!state.currentSong || !state.currentSong.previewUrl) return;

  // חייב לקרות בתוך הלחיצה עצמה כדי לשחרר את האודיו ב-iOS
  const ctx = initAudioContext();
  const resumePromise = ctx && ctx.state !== "running"
    ? Promise.resolve(ctx.resume()).catch(() => { })
    : Promise.resolve();

  const duration = DURATIONS[state.currentAttempt];
  const targetPct = STAGE_STOPS_PCT[state.currentAttempt];
  setPlayingVisuals();
  const myToken = playToken;

  // מסלול מועדף: Web Audio עם באפר מפוענח מראש (מדויק, מיידי, ולא מופיע ב-Dynamic Island)
  if (ctx && state.audioBuffer) {
    const buffer = state.audioBuffer;
    resumePromise.then(() => {
      if (myToken !== playToken || !state.isPlayingSnippet) return;
      startBufferSnippet(ctx, buffer, duration, targetPct);
    });
    return;
  }

  // הבאפר עדיין בטעינה — ממתינים לו במקום לעבור ל-<audio> הלא מדויק
  if (ctx && !state.audioDecodeFailed && pendingDecode && pendingDecode.roundId === state.activeFetchRoundId) {
    const prevStatus = dom.statusLabel ? dom.statusLabel.textContent : "";
    if (dom.statusLabel) dom.statusLabel.textContent = "טוען את קטע השמע...";

    Promise.all([resumePromise, pendingDecode.promise]).then(([, buffer]) => {
      if (myToken !== playToken || !state.isPlayingSnippet) return;
      if (dom.statusLabel) dom.statusLabel.textContent = prevStatus;
      if (buffer) {
        startBufferSnippet(ctx, buffer, duration, targetPct);
      } else {
        stopAudioVisuals();
        if (dom.statusLabel) dom.statusLabel.textContent = "לחץ שוב על ניגון";
      }
    });
    return;
  }

  // גיבוי אחרון: <audio>
  playViaMediaElement(duration, targetPct);
}

// השמעת השיר המלא בסוף הסיבוב (אחרי שהתשובה נחשפה)
export function playRevealPreview() {
  const ctx = state.audioCtx;
  if (ctx && state.audioBuffer) {
    try {
      const source = ctx.createBufferSource();
      source.buffer = state.audioBuffer;
      source.connect(ctx.destination);
      state.activeSource = source;
      Promise.resolve(ctx.state !== "running" ? ctx.resume() : null).catch(() => { }).then(() => {
        if (state.activeSource !== source) return;
        source.start(ctx.currentTime + 0.01, 0);
        dom.equalizer.classList.add("playing");
      });
      source.onended = () => {
        if (state.activeSource === source) {
          state.activeSource = null;
          dom.equalizer.classList.remove("playing");
        }
      };
      return;
    } catch (e) { }
  }

  if (!state.currentSong) return;
  try {
    const audio = state.fallbackAudio;
    if (audio.getAttribute("src") !== state.currentSong.previewUrl) {
      audio.src = state.currentSong.previewUrl;
    }
    audio.currentTime = 0;
    const p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(() => dom.equalizer.classList.add("playing")).catch(() => { });
    }
  } catch (e) { }
}
