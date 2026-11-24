import { state } from "../state.js?v=20261124e";
import { saveUserStats } from "../services/storage.js?v=20261124e";
import { syncAccountToCloud } from "../services/cloud.js?v=20261124e";
import { playCrystalSfx } from "./sfx.js?v=20261124e";

const TIMED_START_SEC = 60;
const TIMED_WIN_BONUS = 5;
const TIMED_WRONG_PENALTY = 3;

let timedActive = false;
let timedPaused = false;
let timeLeft = TIMED_START_SEC;
let timedScore = 0;
let timedCrystals = 0;
let timedHistory = [];
let timedInterval = null;
let flashTimer = null;
let onTimeUpCallback = null;
let timedPuBound = false;

function updateTimedExtraTimeButton() {
  const btn = document.getElementById("timed-pu-time");
  if (!btn) return;
  const count = state.userStats?.powerups?.extraTime || 0;
  btn.textContent = `⏸️ +5ש' (${count})`;
  btn.disabled = !timedActive || count <= 0;
}

function bindTimedPowerupListenerOnce() {
  if (timedPuBound) return;
  timedPuBound = true;
  const btn = document.getElementById("timed-pu-time");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!timedActive) return;
    const count = state.userStats?.powerups?.extraTime || 0;
    if (count <= 0) return;
    state.userStats.powerups.extraTime = count - 1;
    timeLeft = Math.min(999, timeLeft + 5);
    saveUserStats();
    if (state.currentUser) {
      syncAccountToCloud(state.currentUser, state.userStats);
    }
    playCrystalSfx();
    renderTimedHud("+5ש' ⚡", "bonus");
  });
}

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
  updateTimedExtraTimeButton();

  if (flashEl && flashText) {
    clearTimeout(flashTimer);
    flashEl.textContent = flashText;
    flashEl.className = `timed-delta-flash show ${flashKind}`;
    flashTimer = setTimeout(() => {
      if (flashEl) flashEl.classList.remove("show");
      flashTimer = null;
    }, 900);
  }
}

export function isTimedModeActive() {
  return timedActive;
}

export function recordTimedSong(song, status) {
  if (!timedActive || !song) return;
  timedHistory.push({
    trackId: song.trackId,
    title: song.title || "",
    artist: song.artist || "",
    artwork: song.artwork || "",
    status // "hit" | "skipped" | "timeout"
  });
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
  clearTimeout(flashTimer);
  flashTimer = null;
  onTimeUpCallback = null;
  renderTimedHud();
}

export function startTimedRun({ onTimeUp }) {
  bindTimedPowerupListenerOnce();
  stopTimedRun();
  timedActive = true;
  timedPaused = true; // מושהה עד שהשיר הראשון נטען
  timeLeft = TIMED_START_SEC;
  timedScore = 0;
  timedCrystals = 0;
  timedHistory = [];
  onTimeUpCallback = onTimeUp;
  renderTimedHud();

  timedInterval = setInterval(() => {
    if (!timedActive || timedPaused) return;
    timeLeft = Math.max(0, timeLeft - 1);
    renderTimedHud();
    if (timeLeft <= 0) {
      if (state.currentSong) {
        const last = timedHistory[timedHistory.length - 1];
        if (!last || last.trackId !== state.currentSong.trackId) {
          timedHistory.push({
            trackId: state.currentSong.trackId,
            title: state.currentSong.title || "",
            artist: state.currentSong.artist || "",
            artwork: state.currentSong.artwork || "",
            status: "timeout"
          });
        }
      }
      const finalScore = timedScore;
      const finalCrystals = timedCrystals;
      const finalHistory = [...timedHistory];
      const prevBest = state.userStats?.bestTimedScore || 0;
      const isNewRecord = finalScore > prevBest;
      if (isNewRecord && state.userStats) {
        state.userStats.bestTimedScore = finalScore;
        saveUserStats();
      }
      const cb = onTimeUpCallback;
      stopTimedRun();
      if (cb) {
        cb({
          score: finalScore,
          crystals: finalCrystals,
          isNewRecord,
          best: Math.max(finalScore, prevBest),
          history: finalHistory
        });
      }
    }
  }, 1000);
}

export function handleTimedWin(earnedPoints = 0) {
  if (!timedActive) return;
  timedScore += 1;
  timedCrystals = Math.round((timedCrystals + (earnedPoints || 0)) * 100) / 100;
  timeLeft = Math.min(999, timeLeft + TIMED_WIN_BONUS);
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
