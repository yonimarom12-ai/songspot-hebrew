import { state } from "../state.js?v=20261124d";
import { saveUserStats } from "../services/storage.js?v=20261124d";
import { syncAccountToCloud } from "../services/cloud.js?v=20261124d";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261124d";
import { launchWinConfetti } from "./confetti.js?v=20261124d";
import { playWinSfx, playCrystalSfx } from "./sfx.js?v=20261124d";
import { showGameToast, vibrateWin } from "../utils/toast.js?v=20261124d";
import { isOnboardingOpen } from "./onboarding.js?v=20261124d";

export const DAILY_GIFTS_SCHEDULE = [
  { day: 1, emoji: "💎", title: "20 קריסטלים", crystals: 20 },
  { day: 2, emoji: "💎", title: "35 קריסטלים", crystals: 35 },
  { day: 3, emoji: "⏸️", title: "+5ש' (60ש')", powerup: "extraTime", qty: 1 },
  { day: 4, emoji: "💎", title: "50 קריסטלים", crystals: 50 },
  { day: 5, emoji: "🎯", title: "עזר 50/50", powerup: "fiftyFifty", qty: 1 },
  { day: 6, emoji: "💎", title: "75 קריסטלים", crystals: 75 },
  { day: 7, emoji: "👑", title: "🛡️ מגן רצף + 150 💎", crystals: 150, powerup: "streakFreeze", qty: 1, grand: true }
];

function formatLocalDateKey(dateObj) {
  return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
}

function getTodayKey() {
  return formatLocalDateKey(new Date());
}

function getYesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDateKey(d);
}

function getGiftState() {
  const raw = state.userStats?.dailyGifts || {};
  const lastClaimDate = typeof raw.lastClaimDate === "string" ? raw.lastClaimDate : "";
  const streakDay = Number.isFinite(Number(raw.streakDay)) ? Math.max(0, Math.min(7, Math.round(Number(raw.streakDay)))) : 0;
  const today = getTodayKey();
  const yesterday = getYesterdayKey();

  if (lastClaimDate === today) {
    return {
      claimedToday: true,
      completedDays: streakDay || 1,
      activeDay: null
    };
  }

  if (lastClaimDate === yesterday && streakDay >= 1 && streakDay < 7) {
    return {
      claimedToday: false,
      completedDays: streakDay,
      activeDay: streakDay + 1
    };
  }

  return {
    claimedToday: false,
    completedDays: 0,
    activeDay: 1
  };
}

export function hasUnclaimedDailyGift() {
  if (!state.currentUser) return false;
  return !getGiftState().claimedToday;
}

export function updateHomeGiftsDot() {
  const dot = document.getElementById("home-gifts-dot");
  if (!dot) return;
  dot.classList.toggle("visible", hasUnclaimedDailyGift());
}

export function renderDailyGiftsModal() {
  const grid = document.getElementById("gifts-calendar-grid");
  const claimBtn = document.getElementById("gifts-claim-btn");
  const guestHint = document.getElementById("gifts-guest-hint");
  const subEl = document.getElementById("gifts-modal-sub");
  if (!grid) return;

  const isGuest = !state.currentUser;
  const gs = getGiftState();

  if (guestHint) guestHint.style.display = isGuest ? "block" : "none";
  if (subEl) {
    subEl.textContent = gs.claimedToday
      ? "מעולה! אספת את המתנה של היום — חזור מחר להמשיך את הרצף 🎁"
      : `יום ${gs.activeDay} מתוך 7 · חזור כל יום כדי לפתוח את הפרס הגדול!`;
  }

  grid.innerHTML = "";
  DAILY_GIFTS_SCHEDULE.forEach(item => {
    const isClaimed = item.day <= gs.completedDays;
    const isToday = !gs.claimedToday && item.day === gs.activeDay;
    const card = document.createElement("div");
    card.className = `gift-day-card${item.grand ? " is-grand" : ""}${isClaimed ? " is-claimed" : ""}${isToday ? " is-today" : ""}`;

    const dayLabel = document.createElement("span");
    dayLabel.className = "gift-day-num";
    dayLabel.textContent = isClaimed ? `יום ${item.day} ✓` : isToday ? `יום ${item.day} · היום!` : `יום ${item.day}`;

    const em = document.createElement("span");
    em.className = "gift-day-emoji";
    em.textContent = item.emoji;

    const title = document.createElement("span");
    title.className = "gift-day-reward";
    title.textContent = item.title;

    card.append(dayLabel, em, title);
    grid.appendChild(card);
  });

  if (claimBtn) {
    if (isGuest) {
      claimBtn.disabled = true;
      claimBtn.textContent = "🔒 התחבר בפרופיל כדי לאסוף";
    } else if (gs.claimedToday) {
      claimBtn.disabled = true;
      claimBtn.textContent = "✓ אספת את המתנה להיום · חזור מחר";
    } else {
      const reward = DAILY_GIFTS_SCHEDULE.find(x => x.day === gs.activeDay) || DAILY_GIFTS_SCHEDULE[0];
      claimBtn.disabled = false;
      claimBtn.textContent = `אסוף מתנת יום ${reward.day}: ${reward.title} 🎁`;
    }
  }
}

function claimTodayGift() {
  if (!state.currentUser || !state.userStats) return;
  const gs = getGiftState();
  if (gs.claimedToday || !gs.activeDay) return;

  const reward = DAILY_GIFTS_SCHEDULE.find(x => x.day === gs.activeDay);
  if (!reward) return;

  if (reward.crystals > 0) {
    awardPoints(reward.crystals, { persist: false, isPromo: false });
  }
  if (reward.powerup) {
    if (!state.userStats.powerups) {
      state.userStats.powerups = { streakFreeze: 0, fiftyFifty: 0, extraTime: 0 };
    }
    state.userStats.powerups[reward.powerup] = (state.userStats.powerups[reward.powerup] || 0) + (reward.qty || 1);
  }

  state.userStats.dailyGifts = {
    lastClaimDate: getTodayKey(),
    streakDay: reward.day
  };

  saveUserStats();
  syncAccountToCloud(state.currentUser, state.userStats);
  updatePointsDisplay(reward.crystals > 0);
  updateHomeGiftsDot();
  renderDailyGiftsModal();

  launchWinConfetti();
  playWinSfx();
  vibrateWin();
  if (reward.crystals > 0) {
    playCrystalSfx();
    launchCrystalRewardAnimation(reward.crystals);
  }
  showGameToast(`🎁 קיבלת מתנת יום ${reward.day}: ${reward.title}!`, "quest");
}

export function toggleDailyGiftsModal(isOpen) {
  const backdrop = document.getElementById("gifts-modal-backdrop");
  if (!backdrop) return;
  if (isOpen) renderDailyGiftsModal();
  backdrop.classList.toggle("open", isOpen);
}

export function maybeAutoOpenDailyGifts() {
  if (!hasUnclaimedDailyGift()) return;
  if (isOnboardingOpen()) return;
  const today = getTodayKey();
  try {
    if (sessionStorage.getItem("songspot_gift_prompt_date") === today) return;
    sessionStorage.setItem("songspot_gift_prompt_date", today);
  } catch (e) { }
  toggleDailyGiftsModal(true);
}

export function initDailyGiftsListeners() {
  const openBtn = document.getElementById("home-gifts-btn");
  const closeBtn = document.getElementById("gifts-close-btn");
  const backdrop = document.getElementById("gifts-modal-backdrop");
  const claimBtn = document.getElementById("gifts-claim-btn");

  if (openBtn) openBtn.addEventListener("click", () => toggleDailyGiftsModal(true));
  if (closeBtn) closeBtn.addEventListener("click", () => toggleDailyGiftsModal(false));
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) toggleDailyGiftsModal(false);
    });
  }
  if (claimBtn) claimBtn.addEventListener("click", claimTodayGift);
}
