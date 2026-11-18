import { DURATIONS, STAGE_STOPS_PCT, START_OFFSET } from "../data/config.js";
import { dom, PLAY_SVG, PAUSE_SVG } from "../dom.js";
import { state, isIOS } from "../state.js";

let beforePlaySnippetHook = null;

export function setBeforePlaySnippetHook(fn) {
  beforePlaySnippetHook = fn;
}

export function initAudioContext() {
  try {
    // ב-iOS 17+ מאפשר השמעת סאונד גם כשמתג ההשתקה הפיזי באייפון פעיל
    if (typeof navigator !== "undefined" && navigator.audioSession) {
      navigator.audioSession.type = "playback";
    }
  } catch (e) { }

  if (isIOS) return;

  try {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) state.audioCtx = new AudioContextClass();
    }
    if (state.audioCtx && state.audioCtx.state === "suspended") {
      state.audioCtx.resume().catch(() => { });
    }
  } catch (e) { }
}

// משחרר את נעילת האודיו במובייל (iOS Safari / Chrome) במגע הראשון של המשתמש
export function unlockAudioOnFirstGesture() {
  const unlock = () => {
    initAudioContext();
    document.removeEventListener("touchstart", unlock, true);
    document.removeEventListener("pointerdown", unlock, true);
  };
  document.addEventListener("touchstart", unlock, { capture: true, passive: true });
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
}

export async function preloadAudioBufferInBackground(previewUrl, roundId) {
  // ב-iOS משתמשים ב-<audio> ישיר כדי לא להיחסם ע"י מתג ההשתקה או CORS של קובץ ה-m4a
  if (isIOS) return;

  let timer = null;
  try {
    if (!state.audioCtx || state.audioCtx.state !== "running") return;
    const hasAbort = typeof AbortController !== "undefined";
    const controller = hasAbort ? new AbortController() : null;
    if (controller) {
      timer = setTimeout(() => controller.abort(), 5000);
    }
    const audioRes = await fetch(previewUrl, controller ? { signal: controller.signal } : undefined);
    if (!audioRes.ok) return;
    const arrayBuffer = await audioRes.arrayBuffer();
    const decoded = await state.audioCtx.decodeAudioData(arrayBuffer);
    if (roundId === state.activeFetchRoundId) {
      state.audioBuffer = decoded;
    }
  } catch (e) {
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export function playSnippet() {
  if (beforePlaySnippetHook) beforePlaySnippetHook();
  if (state.isPlayingSnippet) {
    stopAudioVisuals();
    return;
  }

  stopAudioVisuals();
  initAudioContext();

  if (!state.currentSong || !state.currentSong.previewUrl) return;

  const duration = DURATIONS[state.currentAttempt];
  const targetPct = STAGE_STOPS_PCT[state.currentAttempt];
  state.isPlayingSnippet = true;
  dom.playIcon.innerHTML = PAUSE_SVG;
  dom.equalizer.classList.add("playing");
  dom.discWrapper.classList.add("spinning");

  if (!isIOS && state.audioCtx && state.audioBuffer && state.audioCtx.state === "running") {
    state.activeSource = state.audioCtx.createBufferSource();
    state.activeSource.buffer = state.audioBuffer;
    state.activeSource.connect(state.audioCtx.destination);

    state.activeSource.start(state.audioCtx.currentTime, START_OFFSET, duration);
    startProgressLoop(duration);

    state.uiTimer = setTimeout(() => {
      stopAudioVisuals(targetPct);
    }, duration * 1000);
    return;
  }

  if (!isIOS && !state.audioBuffer && state.currentSong) {
    preloadAudioBufferInBackground(state.currentSong.previewUrl, state.activeFetchRoundId);
  }

  const audio = state.fallbackAudio;

  // אם האלמנט ריק או נתקל בשגיאה קודמת — טען מחדש את הקישור
  if (!audio.src || audio.error) {
    audio.src = state.currentSong.previewUrl;
  }

  // הזזת נקודת התחלה רק כשהמטא-דאטה כבר טעונה (מונע תקיעת Seek ב-iOS Safari)
  if (audio.readyState >= 1) {
    try {
      audio.currentTime = START_OFFSET;
    } catch (e) { }
  }

  let lastCt = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
  let realStartStamp = null;
  let countdownStarted = false;

  const beginRealPlaybackWatch = () => {
    if (countdownStarted || !state.isPlayingSnippet) return;
    countdownStarted = true;
    clearTimeout(state.playStartGuardTimer);
    state.playStartGuardTimer = null;

    const watchUntilAudible = (now) => {
      if (!state.isPlayingSnippet) return;
      const ct = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;

      if (realStartStamp === null) {
        if (ct < lastCt) {
          // קפיצה אחורה בסיום Seek לנקודת ההתחלה
          lastCt = ct;
        } else if (!audio.seeking && ct > lastCt + 0.002) {
          // הסאונד באמת התחיל להתקדם ברמקול (מדלג על כל זמן הטעינה/Seek ב-iOS)
          realStartStamp = now;
          startProgressLoop(duration);
        }
        state.uiTimer = requestAnimationFrame(watchUntilAudible);
        return;
      }

      if (now - realStartStamp >= duration * 1000) {
        stopAudioVisuals(targetPct);
      } else {
        state.uiTimer = requestAnimationFrame(watchUntilAudible);
      }
    };

    state.uiTimer = requestAnimationFrame(watchUntilAudible);
  };

  state.activeOnPlayingHandler = () => {
    audio.removeEventListener("playing", state.activeOnPlayingHandler);
    state.activeOnPlayingHandler = null;
    beginRealPlaybackWatch();
  };

  state.activeOnErrorHandler = () => {
    stopAudioVisuals();
    if (dom.statusLabel) {
      dom.statusLabel.textContent = "שגיאה בטעינת השמע — לחץ שוב על ניגון או דלג לשיר הבא";
    }
  };

  audio.addEventListener("playing", state.activeOnPlayingHandler);
  audio.addEventListener("error", state.activeOnErrorHandler);

  // מגן מפני תקיעה אם הרשת במובייל לא הגיבה תוך 10 שניות
  state.playStartGuardTimer = setTimeout(() => {
    if (state.isPlayingSnippet && realStartStamp === null) {
      stopAudioVisuals();
      if (dom.statusLabel) {
        dom.statusLabel.textContent = "הטעינה התעכבה — לחץ שוב על ניגון";
      }
    }
  }, 10000);

  const playPromise = audio.play();
  if (playPromise && typeof playPromise.then === "function") {
    playPromise
      .then(() => {
        if (state.isPlayingSnippet && !countdownStarted) {
          beginRealPlaybackWatch();
        }
      })
      .catch(() => {
        stopAudioVisuals();
        if (dom.statusLabel) {
          dom.statusLabel.textContent = "הדפדפן חסם את הניגון — לחץ שוב על כפתור הניגון";
        }
      });
  }
}
