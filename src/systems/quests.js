import { state } from "../state.js?v=20261124f";
import { saveUserStats } from "../services/storage.js?v=20261124f";
import { syncAccountToCloud } from "../services/cloud.js?v=20261124f";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261124f";
import { playCrystalSfx } from "./sfx.js?v=20261124f";
import { showGameToast } from "../utils/toast.js?v=20261124f";

function getTodayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const DAILY_QUESTS = [
  { id: "win_3", title: "זהה 3 שירים נכון היום", target: 3, reward: 25, icon: "🎵" },
  { id: "fast_win", title: "זהה שיר בפחות מ-2 שניות", target: 1, reward: 35, icon: "⚡" },
  { id: "streak_4", title: "הגע לרצף של 4 ניצחונות", target: 4, reward: 40, icon: "🔥" }
];

export const STARTER_QUESTS = [
  {
    id: "starter_account",
    icon: "👤",
    title: "צור חשבון או התחבר",
    target: 1,
    reward: 100,
    getProgress: () => (state.currentUser ? 1 : 0)
  },
  {
    id: "starter_modes_3",
    icon: "🎮",
    title: "שחק ב-3 מצבי משחק שונים",
    target: 3,
    reward: 120,
    getProgress: (s) => Math.min(3, (s?.starterQuests?.modesPlayed || []).length)
  },
  {
    id: "starter_shop",
    icon: "🛍️",
    title: "רכוש פריט כלשהו בחנות",
    target: 1,
    reward: 80,
    getProgress: (s) => ((s?.ownedItems?.length || 0) > 0 || s?.starterQuests?.boughtItem ? 1 : 0)
  },
  {
    id: "starter_streak_5",
    icon: "🔥",
    title: "השג רצף של 5 ניחושים נכונים",
    target: 5,
    reward: 150,
    getProgress: (s) => Math.min(5, s?.bestStreak || 0)
  },
  {
    id: "starter_marathon",
    icon: "♾️",
    title: "השלם סיבוב במצב מרתון",
    target: 1,
    reward: 120,
    getProgress: (s) => (s?.starterQuests?.completedMarathon || (s?.bestMarathonScore || 0) > 0 ? 1 : 0)
  }
];

function ensureStarterQuestBucket() {
  if (!state.userStats) return null;
  if (!state.userStats.starterQuests || typeof state.userStats.starterQuests !== "object") {
    state.userStats.starterQuests = { modesPlayed: [], boughtItem: false, completedMarathon: false, claimed: [] };
  }
  if (!Array.isArray(state.userStats.starterQuests.modesPlayed)) state.userStats.starterQuests.modesPlayed = [];
  if (!Array.isArray(state.userStats.starterQuests.claimed)) state.userStats.starterQuests.claimed = [];
  return state.userStats.starterQuests;
}

export function recordStarterModePlayed(modeKey) {
  if (!modeKey || !state.userStats) return;
  const sq = ensureStarterQuestBucket();
  if (!sq || sq.modesPlayed.includes(modeKey)) return;
  sq.modesPlayed.push(modeKey);
  saveUserStats();
  if (sq.modesPlayed.length === 3) {
    showGameToast("🌟 משימת היכרות הושלמה: שחק ב-3 מצבי משחק שונים!", "quest");
  }
  updateHomeQuestsDot();
}

export function recordStarterShopPurchase() {
  if (!state.userStats) return;
  const sq = ensureStarterQuestBucket();
  if (!sq || sq.boughtItem) return;
  sq.boughtItem = true;
  saveUserStats();
  showGameToast("🌟 משימת היכרות הושלמה: רכוש פריט בחנות!", "quest");
  updateHomeQuestsDot();
}

export function recordStarterMarathonComplete() {
  if (!state.userStats) return;
  const sq = ensureStarterQuestBucket();
  if (!sq || sq.completedMarathon) return;
  sq.completedMarathon = true;
  saveUserStats();
  showGameToast("🌟 משימת היכרות הושלמה: השלם סיבוב במרתון!", "quest");
  updateHomeQuestsDot();
}

// 16 הישגים מדורגים (מרגיל ועד אגדי / קשה במיוחד) — לכל הישג מוסבר איך משיגים אותו
export const ACHIEVEMENT_BADGES = [
  { id: "first_win", tier: "רגיל", icon: "🎵", title: "צעד ראשון", desc: "זהה את השיר הראשון שלך נכון", progress: (s) => `${Math.min(1, s.totalWon || 0)}/1`, check: (s) => (s.totalWon || 0) >= 1 },
  { id: "wins_10", tier: "רגיל", icon: "🎧", title: "חובב מוזיקה", desc: "זהה 10 שירים נכון בסך הכל", progress: (s) => `${Math.min(10, s.totalWon || 0)}/10`, check: (s) => (s.totalWon || 0) >= 10 },
  { id: "sharp_ear", tier: "רגיל", icon: "⚡", title: "אוזן חדה", desc: "זהה שיר תוך 0.1 או 0.5 שניות", progress: (s) => `${Math.min(1, (s.bySpeed?.["0.1"] || 0) + (s.bySpeed?.["0.5"] || 0))}/1`, check: (s) => ((s.bySpeed?.["0.1"] || 0) + (s.bySpeed?.["0.5"] || 0)) >= 1 },
  { id: "timed_5", tier: "רגיל", icon: "⏱️", title: "ספרינטר", desc: "זהה 5 שירים בסבב אחד של משחק בזמן", progress: (s) => `${Math.min(5, s.bestTimedScore || 0)}/5`, check: (s) => (s.bestTimedScore || 0) >= 5 },
  { id: "shop_1", tier: "רגיל", icon: "🛍️", title: "סטייליסט", desc: "רכוש פריט אחד לפחות בחנות הקריסטלים", progress: (s) => `${Math.min(1, s.ownedItems?.length || 0)}/1`, check: (s) => (s.ownedItems?.length || 0) >= 1 },

  { id: "streak_5", tier: "מתקדם", icon: "🔥", title: "בלתי עציר", desc: "הגע לרצף של 5 ניצחונות ברצף", progress: (s) => `${Math.min(5, s.bestStreak || 0)}/5`, check: (s) => (s.bestStreak || 0) >= 5 },
  { id: "wins_25", tier: "מתקדם", icon: "💿", title: "אספן להיטים", desc: "זהה 25 שירים נכון בסך הכל", progress: (s) => `${Math.min(25, s.totalWon || 0)}/25`, check: (s) => (s.totalWon || 0) >= 25 },
  { id: "blink_01", tier: "מתקדם", icon: "👁️", title: "בלי למצמץ", desc: "זהה שיר תוך 0.1 שנייה בלבד!", progress: (s) => `${Math.min(1, s.bySpeed?.["0.1"] || 0)}/1`, check: (s) => (s.bySpeed?.["0.1"] || 0) >= 1 },
  { id: "crystal_500", tier: "מתקדם", icon: "💎", title: "אספן קריסטלים", desc: "צבור 500 קריסטלים בסך הכל", progress: (s) => `${Math.min(500, Math.floor(s.totalPointsEarned || 0))}/500`, check: (s) => (s.totalPointsEarned || 0) >= 500 },
  { id: "shop_4", tier: "מתקדם", icon: "🎨", title: "אספן סטייל", desc: "רכוש 4 פריטים שונים בחנות", progress: (s) => `${Math.min(4, s.ownedItems?.length || 0)}/4`, check: (s) => (s.ownedItems?.length || 0) >= 4 },

  { id: "streak_10", tier: "קשה", icon: "👑", title: "אגדה מוזיקלית", desc: "הגע לרצף של 10 ניצחונות ברצף", progress: (s) => `${Math.min(10, s.bestStreak || 0)}/10`, check: (s) => (s.bestStreak || 0) >= 10 },
  { id: "impossible_1", tier: "קשה", icon: "🏆", title: "שובר בלתי אפשרי", desc: "זהה שיר ברמת בלתי אפשרי", progress: (s) => `${Math.min(1, s.byLevel?.impossible || 0)}/1`, check: (s) => (s.byLevel?.impossible || 0) >= 1 },
  { id: "timed_12", tier: "קשה", icon: "🚀", title: "אלוף הזמן", desc: "זהה 12 שירים בסבב אחד של 60 שניות", progress: (s) => `${Math.min(12, s.bestTimedScore || 0)}/12`, check: (s) => (s.bestTimedScore || 0) >= 12 },

  { id: "streak_20", tier: "אגדי", icon: "🌋", title: "על-אנושי", desc: "הגע לרצף מטורף של 20 ניצחונות ברצף!", progress: (s) => `${Math.min(20, s.bestStreak || 0)}/20`, check: (s) => (s.bestStreak || 0) >= 20 },
  { id: "impossible_10", tier: "אגדי", icon: "🌌", title: "מאסטר בלתי אפשרי", desc: "זהה 10 שירים ברמת בלתי אפשרי!", progress: (s) => `${Math.min(10, s.byLevel?.impossible || 0)}/10`, check: (s) => (s.byLevel?.impossible || 0) >= 10 },
  { id: "wins_100", tier: "אגדי", icon: "🌟", title: "מכונת להיטים", desc: "זהה 100 שירים נכון בסך הכל!", progress: (s) => `${Math.min(100, s.totalWon || 0)}/100`, check: (s) => (s.totalWon || 0) >= 100 }
];

function ensureDailyQuestBucket() {
  if (!state.userStats) return null;
  const today = getTodayKey();
  if (!state.userStats.dailyQuests || state.userStats.dailyQuests.date !== today) {
    state.userStats.dailyQuests = {
      date: today,
      progress: { win_3: 0, fast_win: 0, streak_4: 0 },
      claimed: []
    };
  }
  return state.userStats.dailyQuests;
}

export function hasUnclaimedQuestReward() {
  if (!state.currentUser || !state.userStats) return false;
  const bucket = ensureDailyQuestBucket();
  const hasDaily = bucket && DAILY_QUESTS.some(q => (bucket.progress?.[q.id] || 0) >= q.target && !bucket.claimed.includes(q.id));
  const sq = ensureStarterQuestBucket();
  const hasStarter = sq && STARTER_QUESTS.some(q => q.getProgress(state.userStats) >= q.target && !sq.claimed.includes(q.id));
  return Boolean(hasDaily || hasStarter);
}

export function updateHomeQuestsDot() {
  const dot = document.getElementById("home-quests-dot");
  if (dot) dot.classList.toggle("visible", hasUnclaimedQuestReward());
}

export function recordQuestProgress({ won, solvedDuration, currentStreak }) {
  if (!won || !state.userStats) return;
  const bucket = ensureDailyQuestBucket();
  if (!bucket) return;

  const prevDone = new Set(
    DAILY_QUESTS.filter(q => (bucket.progress?.[q.id] || 0) >= q.target).map(q => q.id)
  );

  bucket.progress.win_3 = Math.min(3, (bucket.progress.win_3 || 0) + 1);
  if (Number(solvedDuration) <= 0.5) {
    bucket.progress.fast_win = 1;
  }
  if ((currentStreak || 0) > (bucket.progress.streak_4 || 0)) {
    bucket.progress.streak_4 = Math.min(4, currentStreak);
  }

  for (const q of DAILY_QUESTS) {
    if (!prevDone.has(q.id) && (bucket.progress?.[q.id] || 0) >= q.target) {
      showGameToast(`🎯 משימה יומית הושלמה: ${q.title}!`, "quest");
    }
  }
  updateHomeQuestsDot();
}

export function claimQuestReward(questId) {
  if (!state.currentUser || !state.userStats) return false;
  const quest = DAILY_QUESTS.find(q => q.id === questId);
  const bucket = ensureDailyQuestBucket();
  if (!quest || !bucket) return false;

  const progress = bucket.progress?.[questId] || 0;
  if (progress < quest.target || bucket.claimed.includes(questId)) return false;

  bucket.claimed.push(questId);
  awardPoints(quest.reward, { persist: false });
  saveUserStats();
  syncAccountToCloud(state.currentUser, state.userStats);
  updatePointsDisplay(true);
  playCrystalSfx();
  launchCrystalRewardAnimation(quest.reward);
  renderQuestsModal();
  updateHomeQuestsDot();
  return true;
}

export function claimStarterQuestReward(questId) {
  if (!state.currentUser || !state.userStats) return false;
  const quest = STARTER_QUESTS.find(q => q.id === questId);
  const sq = ensureStarterQuestBucket();
  if (!quest || !sq) return false;
  if (quest.getProgress(state.userStats) < quest.target || sq.claimed.includes(questId)) return false;

  sq.claimed.push(questId);
  awardPoints(quest.reward, { persist: false });
  saveUserStats();
  syncAccountToCloud(state.currentUser, state.userStats);
  updatePointsDisplay(true);
  playCrystalSfx();
  launchCrystalRewardAnimation(quest.reward);
  renderQuestsModal();
  updateHomeQuestsDot();
  return true;
}

export function renderQuestsModal() {
  const questsEl = document.getElementById("quests-modal-list");
  const guestHint = document.getElementById("quests-guest-hint");
  const bucket = ensureDailyQuestBucket();
  const sq = ensureStarterQuestBucket();

  if (guestHint) {
    guestHint.style.display = state.currentUser ? "none" : "block";
  }

  if (questsEl && bucket) {
    questsEl.innerHTML = "";

    const renderQuestRow = (q, prog, isClaimed, onClaim) => {
      const isDone = prog >= q.target;
      const pct = Math.round((Math.min(q.target, prog) / q.target) * 100);
      const row = document.createElement("div");
      row.className = `quest-row ${isClaimed ? "is-claimed" : (isDone ? "is-ready" : "")}`;

      const top = document.createElement("div");
      top.className = "quest-row-top";

      const title = document.createElement("span");
      title.className = "quest-title";
      title.textContent = `${q.icon} ${q.title}`;

      const right = document.createElement("div");
      if (isClaimed) {
        const donePill = document.createElement("span");
        donePill.className = "quest-status-pill claimed";
        donePill.textContent = "✓ נאסף";
        right.appendChild(donePill);
      } else if (isDone && state.currentUser) {
        const claimBtn = document.createElement("button");
        claimBtn.type = "button";
        claimBtn.className = "quest-claim-btn";
        claimBtn.innerHTML = `<img class="icon-3d-mini" src="assets/ui-final-gifts.png" alt="" /> אסוף +${q.reward} <img class="icon-3d-mini" src="assets/ui-final-crystal.png" alt="" />`;
        claimBtn.addEventListener("click", onClaim);
        right.appendChild(claimBtn);
      } else {
        const progPill = document.createElement("span");
        progPill.className = "quest-status-pill";
        progPill.innerHTML = `${Math.min(q.target, prog)}/${q.target} · +${q.reward} <img class="icon-3d-mini" src="assets/ui-final-crystal.png" alt="" />`;
        right.appendChild(progPill);
      }

      top.append(title, right);

      const track = document.createElement("div");
      track.className = "quest-progress-track";
      const fill = document.createElement("div");
      fill.className = "quest-progress-fill";
      fill.style.width = `${pct}%`;
      track.appendChild(fill);

      row.append(top, track);
      questsEl.appendChild(row);
    };

    // 5 משימות היכרות עם פרסים נדיבים (מוצגות כל עוד לא נאספו כולן)
    const allStarterClaimed = sq && STARTER_QUESTS.every(q => sq.claimed.includes(q.id));
    if (sq && !allStarterClaimed) {
      const stHeader = document.createElement("div");
      stHeader.className = "quests-group-title is-starter";
      stHeader.textContent = "🌟 משימות היכרות (פרסים נדיבים!)";
      questsEl.appendChild(stHeader);

      STARTER_QUESTS.forEach(q => {
        const prog = q.getProgress(state.userStats);
        const isClaimed = sq.claimed.includes(q.id);
        renderQuestRow(q, prog, isClaimed, () => claimStarterQuestReward(q.id));
      });
    }

    const dailyHeader = document.createElement("div");
    dailyHeader.className = "quests-group-title";
    dailyHeader.textContent = "📅 משימות יומיות";
    questsEl.appendChild(dailyHeader);

    DAILY_QUESTS.forEach(q => {
      const prog = Math.min(q.target, bucket.progress?.[q.id] || 0);
      const isClaimed = bucket.claimed.includes(q.id);
      renderQuestRow(q, prog, isClaimed, () => claimQuestReward(q.id));
    });
  }
  updateHomeQuestsDot();
}

export function renderQuestsAndBadgesModal() {
  renderQuestsModal();

  const badgesEl = document.getElementById("profile-badges-grid");
  const summaryEl = document.getElementById("badges-summary-count");
  const stats = state.userStats || {};
  if (!badgesEl) return;

  badgesEl.innerHTML = "";
  let unlockedCount = 0;

  ACHIEVEMENT_BADGES.forEach(b => {
    const unlocked = Boolean(b.check(stats));
    if (unlocked) unlockedCount++;

    const card = document.createElement("div");
    card.className = `badge-row-card ${unlocked ? "unlocked" : "locked"} tier-${b.tier}`;

    const icon = document.createElement("span");
    icon.className = "badge-row-icon";
    icon.textContent = unlocked ? b.icon : "🔒";

    const info = document.createElement("div");
    info.className = "badge-row-info";

    const head = document.createElement("div");
    head.className = "badge-row-head";

    const title = document.createElement("strong");
    title.className = "badge-row-title";
    title.textContent = b.title;

    const tierPill = document.createElement("span");
    tierPill.className = `badge-tier-pill tier-${b.tier}`;
    tierPill.textContent = b.tier;

    head.append(title, tierPill);

    const desc = document.createElement("span");
    desc.className = "badge-row-desc";
    desc.textContent = b.desc;

    info.append(head, desc);

    const status = document.createElement("span");
    status.className = `badge-row-status ${unlocked ? "done" : ""}`;
    status.textContent = unlocked ? "✓ הושג" : b.progress(stats);

    card.append(icon, info, status);
    badgesEl.appendChild(card);
  });

  if (summaryEl) {
    summaryEl.textContent = `הישגים שנפתחו: ${unlockedCount}/${ACHIEVEMENT_BADGES.length}`;
  }
  const progressFill = document.getElementById("badges-progress-fill");
  if (progressFill) {
    const pct = ACHIEVEMENT_BADGES.length > 0 ? Math.round((unlockedCount / ACHIEVEMENT_BADGES.length) * 100) : 0;
    progressFill.style.width = `${pct}%`;
  }

  // משכפל את רשימת המשימות הפעילות גם לתוך טאב ההישגים בפרופיל
  const profileQuestsEl = document.getElementById("profile-quests-list");
  const modalQuestsEl = document.getElementById("quests-modal-list");
  if (profileQuestsEl && modalQuestsEl) {
    profileQuestsEl.innerHTML = modalQuestsEl.innerHTML;
  }
}
