import { DURATIONS, STAGE_STOPS_PCT, START_OFFSET } from "../data/config.js";
import { dom, PLAY_SVG, PAUSE_SVG } from "../dom.js";
import { state } from "../state.js";

let beforePlaySnippetHook = null;

export function setBeforePlaySnippetHook(fn) {
  beforePlaySnippetHook = fn;
}

export function initAudioContext() {
  try {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) state.audioCtx = new AudioContextClass();
    }
    if (state.audioCtx && state.audioCtx.state === "suspended") {
      state.audioCtx.resume().catch(() => {});
    }
  } catch (e) { }
}

export async function preloadAudioBufferInBackground(previewUrl, roundId) {
  try {
    if (!state.audioCtx || state.audioCtx.state !== "running") return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const audioRes = await fetch(previewUrl, { signal: controller.signal });
    clearTimeout(timer);
    const arrayBuffer = await audioRes.arrayBuffer();
    const decoded = await state.audioCtx.decodeAudioData(arrayBuffer);
    if (roundId === state.activeFetchRoundId) {
      state.audioBuffer = decoded;
    }
  } catch (e) { }
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
  cancelAnimationFrame(state.uiTimer);
  cancelAnimationFrame(state.rafProgressId);

  if (state.activeOnPlayingHandler) {
    state.fallbackAudio.removeEventListener("playing", state.activeOnPlayingHandler);
    state.activeOnPlayingHandler = null;
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

  const duration = DURATIONS[state.currentAttempt];
  const targetPct = STAGE_STOPS_PCT[state.currentAttempt];
  state.isPlayingSnippet = true;
  dom.playIcon.innerHTML = PAUSE_SVG;
  dom.equalizer.classList.add("playing");
  dom.discWrapper.classList.add("spinning");

  if (state.audioCtx && state.audioBuffer && state.audioCtx.state === "running") {
    state.activeSource = state.audioCtx.createBufferSource();
    state.activeSource.buffer = state.audioBuffer;
    state.activeSource.connect(state.audioCtx.destination);

    state.activeSource.start(state.audioCtx.currentTime, START_OFFSET, duration);
    startProgressLoop(duration);

    state.uiTimer = setTimeout(() => {
      stopAudioVisuals(targetPct);
    }, duration * 1000);
  } else {
    if (!state.audioBuffer && state.currentSong) {
      preloadAudioBufferInBackground(state.currentSong.previewUrl, state.activeFetchRoundId);
    }

    try {
      state.fallbackAudio.currentTime = START_OFFSET;
    } catch (e) { }

    state.activeOnPlayingHandler = () => {
      state.fallbackAudio.removeEventListener("playing", state.activeOnPlayingHandler);
      state.activeOnPlayingHandler = null;
      const startStamp = performance.now();
      startProgressLoop(duration);

      function checkFrame(now) {
        if (!state.isPlayingSnippet) return;
        if (now - startStamp >= duration * 1000) {
          stopAudioVisuals(targetPct);
        } else {
          state.uiTimer = requestAnimationFrame(checkFrame);
        }
      }
      state.uiTimer = requestAnimationFrame(checkFrame);
    };

    state.fallbackAudio.addEventListener("playing", state.activeOnPlayingHandler);
    state.fallbackAudio.play().catch(() => {
      stopAudioVisuals();
    });
  }
}
