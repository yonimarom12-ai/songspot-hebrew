import { state } from "../state.js?v=20261122t";
import { saveUserStats } from "../services/storage.js?v=20261122t";
import { syncAccountToCloud } from "../services/cloud.js?v=20261122t";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261122t";
import { playCrystalSfx } from "./sfx.js?v=20261122t";
import { showGameToast } from "../utils/toast.js?v=20261122t";

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
  const bucket = ensureDailyQuestBucket();
  if (!bucket || !state.currentUser) return false;
  return DAILY_QUESTS.some(q => (bucket.progress?.[q.id] || 0) >= q.target && !bucket.claimed.includes(q.id));
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

export function renderQuestsModal() {
  const questsEl = document.getElementById("quests-modal-list");
  const guestHint = document.getElementById("quests-guest-hint");
  const bucket = ensureDailyQuestBucket();

  if (guestHint) {
    guestHint.style.display = state.currentUser ? "none" : "block";
  }

  if (questsEl && bucket) {
    questsEl.innerHTML = "";
    DAILY_QUESTS.forEach(q => {
      const prog = Math.min(q.target, bucket.progress?.[q.id] || 0);
      const isDone = prog >= q.target;
      const isClaimed = bucket.claimed.includes(q.id);
      const pct = Math.round((prog / q.target) * 100);

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
        claimBtn.textContent = `🎁 אסוף +${q.reward} 💎`;
        claimBtn.addEventListener("click", () => claimQuestReward(q.id));
        right.appendChild(claimBtn);
      } else {
        const progPill = document.createElement("span");
        progPill.className = "quest-status-pill";
        progPill.textContent = `${prog}/${q.target} · +${q.reward} 💎`;
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
    icon.textContent = b.icon;

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
    summaryEl.textContent = `${unlockedCount} / ${ACHIEVEMENT_BADGES.length} הושגו`;
  }
}
