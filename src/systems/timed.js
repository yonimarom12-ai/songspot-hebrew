import { state } from "../state.js?v=20261122g";
import { saveUserStats } from "../services/storage.js?v=20261122g";

const TIMED_START_SEC = 60;
const TIMED_WIN_BONUS = 5;
const TIMED_WRONG_PENALTY = 3;

let timedActive = false;
let timedPaused = false;
let timeLeft = TIMED_START_SEC;
let timedScore = 0;
let timedCrystals = 0;
let timedInterval = null;
let onTimeUpCallback = null;

function renderTimedHud(flashText = "", flashKind = "") {
  const hud = document.getElementById("timed-hud-bar");
  const timerEl = document.getElementById("timed-clock-val");
  const scoreEl = document.getElementById("timed-score-val");
  const bestEl = document.getElementById("timed-best-val");
  const flashEl = document.getElementById("timed-delta-flash");

  if (hud) hud.classList.toggle("visible", timedActive);
  if (timerEl) {
    timerEl.textContent = `${Math.max(0, Math.ceil(timeLeft))}s`;
    timerEl.classList.toggle("is-low", timeLeft <= 10);
  }
  if (scoreEl) scoreEl.textContent = String(timedScore);
  if (bestEl) bestEl.textContent = String(state.userStats?.bestTimedScore || 0);

  if (flashEl && flashText) {
    flashEl.textContent = flashText;
    flashEl.className = `timed-delta-flash show ${flashKind}`;
    setTimeout(() => {
      if (flashEl) flashEl.classList.remove("show");
    }, 900);
  }
}

export function isTimedModeActive() {
  return timedActive;
}

export function getTimedRunStats() {
  return {
    score: timedScore,
    crystals: timedCrystals,
    best: state.userStats?.bestTimedScore || 0
  };
}

export function pauseTimedClock() {
  timedPaused = true;
}

export function resumeTimedClock() {
  if (timedActive) timedPaused = false;
}

export function stopTimedRun() {
  timedActive = false;
  timedPaused = false;
  clearInterval(timedInterval);
  timedInterval = null;
  onTimeUpCallback = null;
  renderTimedHud();
}

export function startTimedRun({ onTimeUp }) {
  stopTimedRun();
  timedActive = true;
  timedPaused = true; // מושהה עד שהשיר הראשון נטען
  timeLeft = TIMED_START_SEC;
  timedScore = 0;
  timedCrystals = 0;
  onTimeUpCallback = onTimeUp;
  renderTimedHud();

  timedInterval = setInterval(() => {
    if (!timedActive || timedPaused) return;
    timeLeft = Math.max(0, timeLeft - 1);
    renderTimedHud();
    if (timeLeft <= 0) {
      const finalScore = timedScore;
      const prevBest = state.userStats?.bestTimedScore || 0;
      const isNewRecord = finalScore > prevBest;
      if (isNewRecord && state.userStats) {
        state.userStats.bestTimedScore = finalScore;
        saveUserStats();
      }
      const cb = onTimeUpCallback;
      stopTimedRun();
      if (cb) cb({ score: finalScore, crystals: timedCrystals, isNewRecord, best: Math.max(finalScore, prevBest) });
    }
  }, 1000);
}

export function handleTimedWin(earnedPoints = 0) {
  if (!timedActive) return;
  timedScore += 1;
  timedCrystals = Math.round((timedCrystals + (earnedPoints || 0)) * 100) / 100;
  timeLeft = Math.min(99, timeLeft + TIMED_WIN_BONUS);
  if (state.userStats && timedScore > (state.userStats.bestTimedScore || 0)) {
    state.userStats.bestTimedScore = timedScore;
    saveUserStats();
  }
  renderTimedHud(`+${TIMED_WIN_BONUS}ש'`, "bonus");
}

export function handleTimedWrong() {
  if (!timedActive) return;
  timeLeft = Math.max(0, timeLeft - TIMED_WRONG_PENALTY);
  renderTimedHud(`-${TIMED_WRONG_PENALTY}ש'`, "penalty");
}
