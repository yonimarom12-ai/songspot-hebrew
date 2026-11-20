import { state } from "../state.js?v=20261120f";
import { saveUserStats } from "../services/storage.js?v=20261120f";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261120f";
import { playCrystalSfx } from "./sfx.js?v=20261120f";

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

export const ACHIEVEMENT_BADGES = [
  { id: "first_win", icon: "🎵", title: "צעד ראשון", desc: "זיהוי שיר ראשון", check: (s) => (s.totalWon || 0) >= 1 },
  { id: "sharp_ear", icon: "⚡", title: "אוזן חדה", desc: "זיהוי תוך 0.1 או 0.5ש'", check: (s) => ((s.bySpeed?.["0.1"] || 0) + (s.bySpeed?.["0.5"] || 0)) >= 1 },
  { id: "streak_5", icon: "🔥", title: "בלתי עציר", desc: "רצף של 5 ניצחונות", check: (s) => (s.bestStreak || 0) >= 5 },
  { id: "streak_10", icon: "👑", title: "אגדה מוזיקלית", desc: "רצף של 10 ניצחונות", check: (s) => (s.bestStreak || 0) >= 10 },
  { id: "impossible_win", icon: "🏆", title: "בלתי אפשרי", desc: "ניצחון ברמת בלתי אפשרי", check: (s) => (s.byLevel?.impossible || 0) >= 1 },
  { id: "crystal_collector", icon: "💎", title: "אספן קריסטלים", desc: "צבירת 500+ קריסטלים", check: (s) => (s.totalPointsEarned || 0) >= 500 }
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

export function recordQuestProgress({ won, solvedDuration, currentStreak }) {
  if (!won || !state.userStats) return;
  const bucket = ensureDailyQuestBucket();
  if (!bucket) return;

  bucket.progress.win_3 = Math.min(3, (bucket.progress.win_3 || 0) + 1);
  if (Number(solvedDuration) <= 0.5) {
    bucket.progress.fast_win = 1;
  }
  if ((currentStreak || 0) > (bucket.progress.streak_4 || 0)) {
    bucket.progress.streak_4 = Math.min(4, currentStreak);
  }
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
  updatePointsDisplay(true);
  playCrystalSfx();
  launchCrystalRewardAnimation(quest.reward);
  renderQuestsAndBadgesModal();
  return true;
}

export function renderQuestsAndBadgesModal() {
  const questsEl = document.getElementById("profile-quests-list");
  const badgesEl = document.getElementById("profile-badges-grid");
  const stats = state.userStats || {};
  const bucket = ensureDailyQuestBucket();

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
      } else if (isDone) {
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

  if (badgesEl) {
    badgesEl.innerHTML = "";
    ACHIEVEMENT_BADGES.forEach(b => {
      const unlocked = Boolean(b.check(stats));
      const card = document.createElement("div");
      card.className = `badge-card ${unlocked ? "unlocked" : "locked"}`;
      card.title = b.desc;

      const icon = document.createElement("span");
      icon.className = "badge-icon";
      icon.textContent = b.icon;

      const label = document.createElement("span");
      label.className = "badge-title";
      label.textContent = b.title;

      card.append(icon, label);
      badgesEl.appendChild(card);
    });
  }
}
