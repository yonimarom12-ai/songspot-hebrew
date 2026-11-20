import { DURATIONS, STAGE_STOPS_PCT, START_OFFSET } from "../data/config.js?v=20261120d";
import { dom, PLAY_SVG, PAUSE_SVG } from "../dom.js?v=20261120d";
import { state } from "../state.js?v=20261120d";

let beforePlaySnippetHook = null;
let pendingRawFetch = null; // { roundId, promise }
let pendingDecode = null;   // { roundId, promise }
let prefetchedAudio = null; // { url, rawBuffer } - טעינה מוקדמת לשיר הבא בזמן מסך החשיפה
let playToken = 0;
let audioUnlocked = false;

// מצב השמעה חי — מאפשר הארכת ההשמעה ברצף כשלוחצים "דלג" תוך כדי ניגון
let activeGainNode = null;
let snippetStartPerf = null;
let snippetStartCtxTime = null;
let activeDurationSec = 0;
let activeTargetPct = 0;
let audioHealthTimer = null;
let lifecycleGuardsInstalled = false;

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

function attachContextStateListener(ctx) {
  if (!ctx) return;
  ctx.onstatechange = () => {
    if (ctx.state !== "running") {
      // ב-iOS Safari המעבר ל-interrupted/suspended מחייב שחרור מחדש במגע הבא
      audioUnlocked = false;
    }
  };
}

function recreateAudioContext() {
  if (state.audioCtx) {
    try { state.audioCtx.onstatechange = null; } catch (e) { }
    try { state.audioCtx.close(); } catch (e) { }
    state.audioCtx = null;
  }
  state.audioBuffer = null;
  audioUnlocked = false;
  return getAudioContext();
}

function getAudioContext() {
  if (state.audioCtx && state.audioCtx.state !== "closed") return state.audioCtx;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      state.audioCtx = new AudioContextClass();
      attachContextStateListener(state.audioCtx);
    }
  } catch (e) {
    state.audioCtx = null;
  }
  return state.audioCtx;
}

export function initAudioContext() {
  configureAudioSession();
  let ctx = getAudioContext();
  if (!ctx) return null;

  // אם ה-AudioContext ב-iOS נתקע במצב interrupted או closed — יוצרים חדש נקי
  if (ctx.state === "closed" || ctx.state === "interrupted") {
    ctx = recreateAudioContext();
    if (!ctx) return null;
  }

  if (ctx.state !== "running") {
    audioUnlocked = false;
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === "function") p.catch(() => { });
    } catch (e) { }
  }

  // טריק רשמי ל-iOS Safari: ניגון דגימה שקטה של 1 sample משחרר את Web Audio מיידית במגע
  if (!audioUnlocked) {
    try {
      const silentBuf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silentBuf;
      src.connect(ctx.destination);
      src.start(0);
      audioUnlocked = true;
    } catch (e) { }
  }

  // אם הקובץ הגולמי של הסיבוב כבר ירד בזמן שה-AudioContext היה נעול — מפענחים אותו מיד!
  if (state.rawAudioBuffer && !state.audioBuffer && !pendingDecode) {
    decodeRawAudioForRound(state.rawAudioBuffer, state.activeFetchRoundId);
  }

  return ctx;
}

export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    initAudioContext();
  };
  document.addEventListener("touchstart", unlock, { capture: true, passive: true, once: true });
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true, once: true });
  document.addEventListener("click", unlock, { capture: true, passive: true, once: true });

  if (!lifecycleGuardsInstalled) {
    lifecycleGuardsInstalled = true;
    const onForeground = () => {
      if (document.hidden) return;
      audioUnlocked = false;
      configureAudioSession();
      if (state.audioCtx && state.audioCtx.state !== "running") {
        try {
          const p = state.audioCtx.resume();
          if (p && typeof p.catch === "function") p.catch(() => { });
        } catch (e) { }
      }
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("pageshow", onForeground);
  }
}

// חוסם שליטה בשיר דרך ה-Dynamic Island / מסך הנעילה / מרכז הבקרה
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
    const timer = setTimeout(() => reject(new Error("decode timeout")), 5000);
    const done = (fn) => (val) => {
      clearTimeout(timer);
      fn(val);
    };
    try {
      const copy = arrayBuffer.slice(0);
      const maybePromise = ctx.decodeAudioData(copy, done(resolve), done(reject));
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(done(resolve), done(reject));
      }
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

function decodeRawAudioForRound(rawBuffer, roundId) {
  const ctx = getAudioContext();
  if (!ctx || !rawBuffer) return Promise.resolve(null);

  const promise = decodeCompat(ctx, rawBuffer)
    .then(decoded => {
      if (roundId === state.activeFetchRoundId) {
        state.audioBuffer = decoded;
        state.rawAudioBuffer = null; // שחרור זיכרון גולמי במובייל
      }
      return decoded;
    })
    .catch(() => {
      if (roundId === state.activeFetchRoundId) {
        state.audioDecodeFailed = true;
      }
      return null;
    });

  pendingDecode = { roundId, promise };
  return promise;
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

// טעינה מוקדמת של אודיו לשיר הבא ברקע (0ms המתנה בלחיצה על "לשיר הבא")
export async function prefetchAudioRaw(previewUrl) {
  if (!previewUrl) return null;
  if (prefetchedAudio?.url === previewUrl && prefetchedAudio.rawBuffer) {
    return prefetchedAudio.rawBuffer;
  }
  try {
    const raw = await fetchArrayBuffer(previewUrl, 5500);
    prefetchedAudio = { url: previewUrl, rawBuffer: raw };
    return raw;
  } catch (e) {
    return null;
  }
}

// מוריד את קובץ השמע מראש מיד כשהשיר נבחר; מפענח מיד רק אם ה-AudioContext כבר פתוח (מונע תקיעת decodeAudioData ב-iOS!)
export function preloadAudioBufferInBackground(previewUrl, roundId) {
  state.audioBuffer = null;
  state.rawAudioBuffer = null;
  state.audioDecodeFailed = false;
  pendingDecode = null;

  if (!previewUrl) {
    state.audioDecodeFailed = true;
    pendingRawFetch = null;
    return Promise.resolve(null);
  }

  const promise = (async () => {
    try {
      let raw = null;
      if (prefetchedAudio?.url === previewUrl && prefetchedAudio.rawBuffer) {
        raw = prefetchedAudio.rawBuffer;
        prefetchedAudio = null;
      } else {
        raw = await fetchArrayBuffer(previewUrl, 5500);
      }
      if (roundId !== state.activeFetchRoundId) return null;
      state.rawAudioBuffer = raw;

      // אם AudioContext כבר רץ (מסיבוב 1 ואילך אחרי המגע הראשון), מפענחים מראש ב-40ms -> לחיצה על Play היא 0ms!
      if (state.audioCtx && state.audioCtx.state === "running") {
        await decodeRawAudioForRound(raw, roundId);
      }
      return raw;
    } catch (e) {
      if (roundId === state.activeFetchRoundId) {
        state.audioDecodeFailed = true;
      }
      return null;
    }
  })();

  pendingRawFetch = { roundId, promise };
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

export function startProgressLoop(durationSec, resetStart = true) {
  cancelAnimationFrame(state.rafProgressId);
  activeDurationSec = durationSec;
  if (resetStart || snippetStartPerf === null) {
    snippetStartPerf = performance.now();
    if (dom.playbackFill) dom.playbackFill.style.width = "0%";
  }

  function tick(now) {
    if (!state.isPlayingSnippet) return;
    const elapsedSec = (now - snippetStartPerf) / 1000;
    if (dom.playbackFill) {
      dom.playbackFill.style.width = `${elapsedSecondsToBarPercent(Math.min(elapsedSec, activeDurationSec))}%`;
    }
    if (elapsedSec < activeDurationSec) {
      state.rafProgressId = requestAnimationFrame(tick);
    }
  }

  state.rafProgressId = requestAnimationFrame(tick);
}

export function stopAudioVisuals(finalPct = null) {
  playToken++;
  state.isPlayingSnippet = false;
  snippetStartPerf = null;
  snippetStartCtxTime = null;
  clearTimeout(state.uiTimer);
  state.uiTimer = null;
  clearTimeout(audioHealthTimer);
  audioHealthTimer = null;
  clearTimeout(state.playStartGuardTimer);
  state.playStartGuardTimer = null;
  cancelAnimationFrame(state.rafWatchId);
  state.rafWatchId = null;
  cancelAnimationFrame(state.rafProgressId);
  state.rafProgressId = null;

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

  if (activeGainNode) {
    try { activeGainNode.disconnect(); } catch (e) { }
    activeGainNode = null;
  }

  try {
    state.fallbackAudio.pause();
  } catch (e) { }

  if (dom.playbackFill && finalPct !== null) {
    dom.playbackFill.style.width = `${finalPct}%`;
  }

  dom.playIcon.innerHTML = PLAY_SVG;
  if (dom.playBtn) dom.playBtn.classList.remove("is-playing");
  if (dom.durationBadge) dom.durationBadge.classList.remove("is-playing");
  dom.equalizer.classList.remove("playing");
  dom.discWrapper.classList.remove("spinning");
}

function setPlayingVisuals() {
  state.isPlayingSnippet = true;
  dom.playIcon.innerHTML = PAUSE_SVG;
  if (dom.playBtn) dom.playBtn.classList.add("is-playing");
  if (dom.durationBadge) dom.durationBadge.classList.add("is-playing");
  dom.equalizer.classList.add("playing");
  dom.discWrapper.classList.add("spinning");
}

// מאריך את ההשמעה הפעילה לשלב הבא בלי לאפס או לעצור את השיר המתנגן
export function extendActivePlaybackToStage(stageIdx) {
  if (!state.isPlayingSnippet) return false;
  const idx = Math.min(stageIdx, DURATIONS.length - 1);
  const newDuration = DURATIONS[idx];
  const newTargetPct = STAGE_STOPS_PCT[idx];
  activeDurationSec = newDuration;
  activeTargetPct = newTargetPct;

  // אם השיר מתנגן דרך Web Audio — מעדכנים את מועד ההשתקה והסיום לזמן החדש
  if (state.activeSource && state.audioCtx && snippetStartCtxTime !== null) {
    const ctx = state.audioCtx;
    const elapsedCtx = Math.max(0, ctx.currentTime - snippetStartCtxTime);
    const remainingSec = Math.max(0.02, newDuration - elapsedCtx);

    if (activeGainNode) {
      try {
        activeGainNode.gain.cancelScheduledValues(ctx.currentTime);
        activeGainNode.gain.setValueAtTime(1, ctx.currentTime);
        activeGainNode.gain.setValueAtTime(0, snippetStartCtxTime + newDuration);
      } catch (e) { }
    }

    clearTimeout(state.uiTimer);
    state.uiTimer = setTimeout(() => {
      stopAudioVisuals(activeTargetPct);
    }, remainingSec * 1000 + 15);
  }

  // ממשיך את לולאת בר ההתקדמות מאותה נקודה אל היעד החדש
  if (snippetStartPerf !== null) {
    startProgressLoop(newDuration, false);
  }
  return true;
}

// ניגון מדויק דרך Web Audio: מאפשר גם הארכה חיה תוך כדי ניגון כשלוחצים "דלג"
function startBufferSnippet(ctx, buffer, duration, targetPct) {
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gainNode = ctx.createGain();
  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  state.activeSource = source;
  activeGainNode = gainNode;
  activeDurationSec = duration;
  activeTargetPct = targetPct;

  const clockBefore = ctx.currentTime;
  const when = clockBefore + 0.005;
  snippetStartCtxTime = when;
  gainNode.gain.setValueAtTime(1, when);
  gainNode.gain.setValueAtTime(0, when + duration);

  source.start(when, START_OFFSET);
  startProgressLoop(duration, true);

  // כלב שמירה ל-iOS Safari: אם שעון ה-AudioContext קפא (באג ידוע אחרי נעילת מסך/מעבר אפליקציה),
  // משחזרים AudioContext חדש ועוברים מיד לגיבוי <audio> כדי שלא יידרש לרענן את האתר!
  const myToken = playToken;
  clearTimeout(audioHealthTimer);
  audioHealthTimer = setTimeout(() => {
    if (myToken !== playToken || !state.isPlayingSnippet) return;
    if (ctx.state !== "running" || ctx.currentTime <= clockBefore + 0.001) {
      try { source.stop(); } catch (e) { }
      try { source.disconnect(); } catch (e) { }
      state.activeSource = null;
      clearTimeout(state.uiTimer);
      state.uiTimer = null;
      recreateAudioContext();
      if (state.currentSong?.previewUrl) {
        playViaMediaElement(activeDurationSec, activeTargetPct);
      }
    }
  }, 240);

  state.uiTimer = setTimeout(() => {
    stopAudioVisuals(activeTargetPct);
  }, duration * 1000 + 15);
}

// גיבוי בלבד: ניגון דרך <audio> (רק אם הורדה/פענוח של Web Audio נכשלו)
function playViaMediaElement(duration, targetPct) {
  const audio = state.fallbackAudio;
  const url = state.currentSong.previewUrl;
  activeDurationSec = duration;
  activeTargetPct = targetPct;

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
          startProgressLoop(activeDurationSec, true);
        }
        state.rafWatchId = requestAnimationFrame(watch);
        return;
      }

      if (now - realStartStamp >= activeDurationSec * 1000) {
        stopAudioVisuals(activeTargetPct);
        releaseMediaElement();
      } else {
        state.rafWatchId = requestAnimationFrame(watch);
      }
    };
    state.rafWatchId = requestAnimationFrame(watch);
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
  }, 8000);

  const p = audio.play();
  if (p && typeof p.then === "function") {
    p.then(() => {
      if (state.isPlayingSnippet && !watchStarted) beginWatch();
    }).catch(() => {
      stopAudioVisuals();
      if (dom.statusLabel) dom.statusLabel.textContent = "לחץ שוב על ניגון";
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

  // שחרור Web Audio מיידית בתוך מחוות הלחיצה
  const ctx = initAudioContext();
  const resumePromise = ctx && ctx.state !== "running"
    ? Promise.resolve(ctx.resume()).catch(() => { })
    : Promise.resolve();

  const duration = DURATIONS[state.currentAttempt];
  const targetPct = STAGE_STOPS_PCT[state.currentAttempt];
  const roundId = state.activeFetchRoundId;
  setPlayingVisuals();
  const myToken = playToken;

  // 1. הכי מהיר (0ms): הבאפר כבר מפוענח ב-RAM
  if (ctx && state.audioBuffer) {
    const buffer = state.audioBuffer;
    if (ctx.state === "running") {
      startBufferSnippet(ctx, buffer, duration, targetPct);
    } else {
      resumePromise.then(() => {
        if (myToken !== playToken || !state.isPlayingSnippet) return;
        startBufferSnippet(ctx, buffer, duration, targetPct);
      });
    }
    return;
  }

  // 2. הקובץ הגולמי כבר ירד או עדיין יורד (לוקח ~40–400ms בלבד)
  if (ctx && !state.audioDecodeFailed) {
    const prevStatus = dom.statusLabel ? dom.statusLabel.textContent : "";
    if (dom.statusLabel) dom.statusLabel.textContent = "מכין שמע...";

    (async () => {
      await resumePromise;
      if (myToken !== playToken || !state.isPlayingSnippet) return;

      let buffer = state.audioBuffer;
      if (!buffer && pendingDecode && pendingDecode.roundId === roundId) {
        buffer = await pendingDecode.promise;
      }
      if (!buffer && state.rawAudioBuffer) {
        buffer = await decodeRawAudioForRound(state.rawAudioBuffer, roundId);
      }
      if (!buffer && pendingRawFetch && pendingRawFetch.roundId === roundId) {
        const raw = await pendingRawFetch.promise;
        if (raw && !state.audioBuffer && myToken === playToken) {
          buffer = await decodeRawAudioForRound(raw, roundId);
        } else {
          buffer = state.audioBuffer;
        }
      }

      if (myToken !== playToken || !state.isPlayingSnippet) return;
      if (dom.statusLabel) dom.statusLabel.textContent = prevStatus;

      if (buffer) {
        startBufferSnippet(ctx, buffer, duration, targetPct);
      } else {
        // גיבוי אוטומטי ל-<audio> בלי לדרוש מהמשתמש ללחוץ שוב על ניגון
        playViaMediaElement(duration, targetPct);
      }
    })();
    return;
  }

  // 3. גיבוי אחרון (רק אם Web Audio נכשל)
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
        source.start(ctx.currentTime + 0.005, 0);
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
