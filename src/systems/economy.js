import { BASE_POINTS_BY_DURATION, DIFFICULTIES } from "../data/config.js?v=20261123m";
import { dom } from "../dom.js?v=20261123m";
import { state } from "../state.js?v=20261123m";
import { saveUserStats } from "../services/storage.js?v=20261123m";

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

// בונוס רצף ניצחונות (Streak Multiplier) שמגדיל את הרווח ונותן תמריץ אמיתי לרצף
export function getStreakMultiplier(streak) {
  const s = Number(streak) || 0;
  if (s >= 10) return 2;
  if (s >= 5) return 1.35;
  if (s >= 3) return 1.15;
  return 1;
}

export function calculateRoundReward(
  durationSec,
  difficultyLevel,
  { usedHint = false, usedEasySearch = false, usedRedFeedback = false, streak = 0 } = {}
) {
  // משתמש לא רשום (אורח) לא יכול להרוויח קריסטלים
  if (!state.currentUser) return 0;

  const base = BASE_POINTS_BY_DURATION[String(durationSec)] ?? 0;
  const diffMultiplier = DIFFICULTIES[difficultyLevel]?.pointsMultiplier ?? 1;
  const streakMultiplier = getStreakMultiplier(streak);
  let reward = base * diffMultiplier * streakMultiplier;

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

export function awardPoints(amount, { persist = true, isPromo = false } = {}) {
  if (!state.currentUser) return 0;
  const delta = roundPoints(amount);
  if (delta <= 0 || !state.userStats) return 0;

  state.userStats.points = roundPoints((state.userStats.points || 0) + delta);
  state.userStats.totalPointsEarned = roundPoints((state.userStats.totalPointsEarned || 0) + delta);
  if (isPromo) {
    state.userStats.promoPointsReceived = roundPoints((state.userStats.promoPointsReceived || 0) + delta);
  } else {
    state.userStats.earnedPoints = roundPoints((state.userStats.earnedPoints || 0) + delta);
  }

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
  const formatted = formatPoints(balance);
  if (dom.pointsCountEl) {
    dom.pointsCountEl.textContent = formatted;
  }
  const homePointsEl = document.getElementById("home-points-count");
  if (homePointsEl) {
    homePointsEl.textContent = formatted;
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

// אנימציית קבלת קריסטלים: קריסטלים זוהרים שעפים אל מד הקריסטלים + טקסט מרחף
export function launchCrystalRewardAnimation(earnedAmount) {
  if (!state.currentUser || !earnedAmount || earnedAmount <= 0) return;

  const targetEl = dom.pointsBadge || document.getElementById("home-points-btn");
  const rawRect = targetEl ? targetEl.getBoundingClientRect() : null;
  const targetRect = (rawRect && rawRect.width > 0 && rawRect.height > 0)
    ? rawRect
    : { left: window.innerWidth / 2 - 10, top: 28, width: 20, height: 20 };

  const startX = window.innerWidth / 2;
  const startY = window.innerHeight * 0.56;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;

  // טקסט צף "+X 💎"
  const floatText = document.createElement("div");
  floatText.className = "crystal-float-text";
  floatText.textContent = `+${formatPoints(earnedAmount)} 💎`;
  floatText.style.left = `${startX}px`;
  floatText.style.top = `${startY - 26}px`;
  document.body.appendChild(floatText);
  setTimeout(() => floatText.remove(), 1200);

  // חלקיקי קריסטל 3D שקופים עפים אל המונה
  const count = Math.min(10, Math.max(5, Math.ceil(earnedAmount / 2)));
  for (let i = 0; i < count; i++) {
    const p = document.createElement("img");
    p.className = "crystal-fly-particle icon-3d-crystal";
    p.src = "assets/icon-crystal.png";
    p.alt = "";
    const jitterX = (Math.random() - 0.5) * 90;
    const jitterY = (Math.random() - 0.5) * 50;
    p.style.left = `${startX + jitterX}px`;
    p.style.top = `${startY + jitterY}px`;
    p.style.opacity = "1";
    p.style.transform = "scale(0.6)";
    document.body.appendChild(p);

    const delay = i * 55;
    setTimeout(() => {
      const dx = endX - (startX + jitterX);
      const dy = endY - (startY + jitterY);
      p.style.transform = `translate(${dx}px, ${dy}px) scale(1.15) rotate(${(Math.random() - 0.5) * 90}deg)`;
      p.style.opacity = "0";
    }, 30 + delay);

    setTimeout(() => p.remove(), 980 + delay);
  }
}
