import { BASE_POINTS_BY_DURATION, DIFFICULTIES } from "../data/config.js?v=20261119i";
import { dom } from "../dom.js?v=20261119i";
import { state } from "../state.js?v=20261119i";
import { saveUserStats } from "../services/storage.js?v=20261119i";

// מערכת קריסטלים וכלכלת משחק (זמינה למשתמשים רשומים בלבד, מוכנה לחנות העתידית)
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

export function calculateRoundReward(
  durationSec,
  difficultyLevel,
  { usedHint = false, usedEasySearch = false, usedRedFeedback = false } = {}
) {
  // משתמש לא רשום (אורח) לא יכול להרוויח קריסטלים
  if (!state.currentUser) return 0;

  const base = BASE_POINTS_BY_DURATION[String(durationSec)] ?? 0;
  const diffMultiplier = DIFFICULTIES[difficultyLevel]?.pointsMultiplier ?? 1;
  let reward = base * diffMultiplier;

  // אם הופעל רמז בסיבוב: 0 קריסטלים ברוב הרמות, וחצי כמות ברמה הכי קשה (impossible)
  if (usedHint) {
    if (difficultyLevel === "impossible") {
      reward *= 0.5;
    } else {
      return 0;
    }
  }

  // בחיפוש קל מקבלים חצי (×0.5) מהכמות הרגילה
  if (usedEasySearch) {
    reward *= 0.5;
  }

  // בחיווי אדום מקבלים 50% פחות קריסטלים בשלבים 8 ו-15 שניות
  if (usedRedFeedback && Number(durationSec) >= 8) {
    reward *= 0.5;
  }

  return roundPoints(reward);
}

export function getPointsBalance() {
  if (!state.currentUser) return 0;
  return roundPoints(state.userStats?.points || 0);
}

export function awardPoints(amount, { persist = true } = {}) {
  if (!state.currentUser) return 0;
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
  if (!state.currentUser) return false;
  const normalizedCost = roundPoints(cost);
  return normalizedCost >= 0 && getPointsBalance() >= normalizedCost;
}

export function spendPoints(cost) {
  const normalizedCost = roundPoints(cost);
  if (!state.currentUser || normalizedCost < 0 || !canAfford(normalizedCost) || !state.userStats) {
    return false;
  }

  state.userStats.points = roundPoints(state.userStats.points - normalizedCost);
  saveUserStats();
  updatePointsDisplay();
  return true;
}

export function updatePointsDisplay(animate = false) {
  const isLoggedIn = Boolean(state.currentUser);
  const balance = getPointsBalance();
  if (dom.pointsCountEl) {
    dom.pointsCountEl.textContent = formatPoints(balance);
  }
  if (dom.pointsBadge) {
    dom.pointsBadge.classList.toggle("guest-locked", !isLoggedIn);
    dom.pointsBadge.title = isLoggedIn
      ? "יתרת קריסטלים (ישמש לקנייה בחנות)"
      : "התחבר או הירשם כדי לצבור קריסטלים";
    if (animate && isLoggedIn) {
      dom.pointsBadge.classList.remove("points-pop");
      void dom.pointsBadge.offsetWidth;
      dom.pointsBadge.classList.add("points-pop");
    }
  }
}
