import { BASE_POINTS_BY_DURATION, DIFFICULTIES } from "../data/config.js";
import { dom } from "../dom.js";
import { state } from "../state.js";
import { saveUserStats } from "../services/storage.js";

// מערכת נקודות וכלכלת משחק (מוכנה לשימוש עתידי בחנות)
export function roundPoints(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function formatPoints(value) {
  const rounded = roundPoints(value);
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

export function calculateRoundReward(durationSec, difficultyLevel) {
  const base = BASE_POINTS_BY_DURATION[String(durationSec)] ?? 0;
  const multiplier = DIFFICULTIES[difficultyLevel]?.pointsMultiplier ?? 1;
  return roundPoints(base * multiplier);
}

export function getPointsBalance() {
  return roundPoints(state.userStats?.points || 0);
}

export function awardPoints(amount, { persist = true } = {}) {
  const delta = roundPoints(amount);
  if (delta <= 0 || !state.userStats) return 0;

  state.userStats.points = roundPoints((state.userStats.points || 0) + delta);
  state.userStats.totalPointsEarned = roundPoints((state.userStats.totalPointsEarned || 0) + delta);

  if (persist) {
    saveUserStats();
  }
  return delta;
}

export function canAfford(cost) {
  const normalizedCost = roundPoints(cost);
  return normalizedCost >= 0 && getPointsBalance() >= normalizedCost;
}

export function spendPoints(cost) {
  const normalizedCost = roundPoints(cost);
  if (normalizedCost < 0 || !canAfford(normalizedCost) || !state.userStats) {
    return false;
  }

  state.userStats.points = roundPoints(state.userStats.points - normalizedCost);
  saveUserStats();
  updatePointsDisplay();
  return true;
}

export function updatePointsDisplay(animate = false) {
  const balance = getPointsBalance();
  if (dom.pointsCountEl) {
    dom.pointsCountEl.textContent = formatPoints(balance);
  }
  if (dom.pointsBadge && animate) {
    dom.pointsBadge.classList.remove("points-pop");
    void dom.pointsBadge.offsetWidth;
    dom.pointsBadge.classList.add("points-pop");
  }
}
