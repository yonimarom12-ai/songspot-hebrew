import { state } from "../state.js?v=20261123y";
import { stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261123y";
import { updateFilterPillsUI, toggleDrawer, setSettingsScreenHandler, saveUserPreferences } from "./drawer.js?v=20261123y";
import { toggleProfileModal, toggleShopModal, toggleStreakModal, toggleQuestsModal, updateBottomNavActiveTab } from "./profile.js?v=20261123y";
import { fetchRandomSong, setActiveDifficultyUI, startTimedGameSession, startDeterministicChallenge, getTodayDateKey, getCurrentWeekKey } from "./game.js?v=20261123y";
import { showGameToast } from "../utils/toast.js?v=20261123y";
import { stopTimedRun } from "./timed.js?v=20261123y";
import { startMarathonSession, stopMarathonSession } from "./marathon.js?v=20261123y";
import { startReverseSession, stopReverseSession } from "./reverse.js?v=20261123y";
import { startTimelineSession, stopTimelineSession } from "./timeline.js?v=20261123y";
import { loadFriendsScreen, refreshIncomingFriendsBadge } from "./friends.js?v=20261123y";
import { fetchGlobalLeaderboard, syncAccountToCloud } from "../services/cloud.js?v=20261123y";
import { playClickSfx } from "./sfx.js?v=20261123y";
import { vibrateTap } from "../utils/toast.js?v=20261123y";
import { isOnboardingOpen } from "./onboarding.js?v=20261123y";
import { recordStarterModePlayed } from "./quests.js?v=20261123y";

const SCREEN_IDS = {
  home: "screen-home",
  "modes-hub": "screen-modes-hub",
  leaderboard: "screen-leaderboard",
  friends: "screen-friends",
  marathon: "screen-marathon",
  reverse: "screen-reverse",
  timeline: "screen-timeline",
  "setup-genres": "screen-setup-genres",
  "setup-decades": "screen-setup-decades",
  mode: "screen-mode",
  settings: "screen-settings",
  game: "screen-game"
};

const MODE_CATALOG = {
  "1v1": {
    badge: "משחק חברתי",
    icon: "👥",
    title: "1 נגד 1",
    desc: "התחרו ראש בראש מול חבר באותו שיר — מי שמזהה מהר יותר מנצח וגורף את הקריסטלים!",
    status: "🚧 מצב אונליין בבנייה · בקרוב!",
    actionLabel: "שחק משחק מהיר בינתיים ▶",
    action: "quickplay"
  },
  marathon: {
    badge: "10 שאלות · טריוויה מוזיקלית",
    icon: "♾️",
    title: "מרתון",
    desc: "10 שאלות קצביות: זיהוי שיר מבין 4 אופציות וניחוש שנת יציאה! 15 שניות לכל שאלה — כמה שיותר מדויק ומהיר, יותר נקודות!",
    status: "🔥 זמין למשחק עכשיו",
    actionLabel: "התחל מרתון (10 שאלות) ▶",
    action: "start-marathon"
  },
  timed: {
    badge: "נגד השעון · 60 שניות",
    icon: "⏱️",
    title: "משחק בזמן",
    desc: "60 שניות על השעון! כל זיהוי נכון מוסיף +5 שניות, טעות מורידה -3 שניות. כמה שירים תספיקו?",
    status: "⚡ זמין למשחק עכשיו!",
    actionLabel: "התחל משחק בזמן (60ש') ▶",
    action: "start-timed"
  },
  daily: {
    badge: "אתגר יומי",
    icon: "📅",
    title: "אתגר יומי",
    desc: "שיר יומי מיוחד מרמת קושי קשה — בדקו אם תצליחו לזהות אותו בניסיון הראשון!",
    status: "✨ זמין למשחק",
    actionLabel: "שחק את האתגר היומי ▶",
    action: "start-daily"
  },
  weekly: {
    badge: "השיר השבועי",
    icon: "👑",
    title: "השיר השבועי",
    desc: "הלהיט הנבחר של השבוע מרמת קושי בלתי אפשרי — פי 4 קריסטלים למי שמזהה!",
    status: "👑 בונוס ×4 קריסטלים",
    actionLabel: "נסה לזהות את השיר השבועי ▶",
    action: "start-weekly"
  }
};

let currentScreen = "home";
let currentModeKey = null;
let selectedHomeMode = "quickplay";
let returnScreenFromSettings = "home";

const HOME_MODE_CONFIG = {
  quickplay: { title: "משחק מהיר", sub: "", themeClass: "" },
  marathon: { title: "מרתון", sub: "", themeClass: "mode-theme-marathon" },
  reverse: { title: "הפוך על הפוך", sub: "", themeClass: "mode-theme-reverse" },
  timeline: { title: "ציר זמן", sub: "", themeClass: "mode-theme-timeline" },
  timed: { title: "משחק בזמן", sub: "", themeClass: "mode-theme-timed" },
  daily: { title: "אתגר יומי", sub: "", themeClass: "mode-theme-daily" },
  weekly: { title: "השיר השבועי", sub: "", themeClass: "mode-theme-weekly" },
  "1v1": { title: "1 נגד 1", sub: "", themeClass: "mode-theme-1v1" }
};

function renderHomeModeStatsStrip() {
  const strip = document.getElementById("home-mode-stats-strip");
  if (!strip) return;
  const s = state.userStats || {};

  if (selectedHomeMode === "marathon") {
    const best = s.bestMarathonScore || 0;
    strip.innerHTML = best > 0
      ? `<span><img class="icon-3d-mini" src="assets/icon-marathon.png" alt="" /> שיא אישי: <strong>${best.toLocaleString("he-IL")} נק'</strong></span>`
      : `<span><img class="icon-3d-mini" src="assets/icon-marathon.png" alt="" /> שיא אישי: <strong>טרם נקבע</strong></span>`;
  } else if (selectedHomeMode === "reverse") {
    const best = s.bestReverseStreak || 0;
    strip.innerHTML = `<span><img class="icon-3d-mini" src="assets/icon-reverse.png" alt="" /> שיא רצף הפוך: <strong>${best}</strong></span>`;
  } else if (selectedHomeMode === "timeline") {
    const best = s.bestTimelineScore || 0;
    strip.innerHTML = `<span><img class="icon-3d-mini" src="assets/icon-timeline.png" alt="" /> שיא ציר זמן: <strong>${best} שירים</strong></span>`;
  } else if (selectedHomeMode === "timed") {
    const best = s.bestTimedScore || 0;
    strip.innerHTML = `<span><img class="icon-3d-mini" src="assets/icon-timed.png" alt="" /> שיא 60ש': <strong>${best} ${best === 1 ? "שיר" : "שירים"}</strong></span>`;
  } else if (selectedHomeMode === "daily") {
    const doneToday = s.completedDailyDate === getTodayDateKey();
    strip.innerHTML = doneToday
      ? `<span><img class="icon-3d-mini" src="assets/icon-daily.png" alt="" /> <strong>✅ הושלם להיום!</strong> חזור מחר</span>`
      : `<span><img class="icon-3d-mini" src="assets/icon-daily.png" alt="" /> שיר יומי זהה לכולם · <strong>ניסיון אחד!</strong></span>`;
  } else if (selectedHomeMode === "weekly") {
    const doneWeek = s.completedWeeklyKey === getCurrentWeekKey();
    strip.innerHTML = doneWeek
      ? `<span>👑 <strong>✅ השיר השבועי הושלם!</strong> חזור בשבוע הבא</span>`
      : `<span>👑 בונוס ×4 · שיר שבועי זהה לכולם · <strong>ניסיון אחד!</strong></span>`;
  } else if (selectedHomeMode === "1v1") {
    strip.innerHTML = `<span>🚧 מצב אונליין מול חברים · <strong>בקרוב</strong></span>`;
  } else {
    const won = s.totalWon || 0;
    const heard = s.totalHeard || 0;
    const rate = heard > 0 ? Math.round((won / heard) * 100) : 0;
    strip.innerHTML = `<span><img class="icon-3d-mini ui-theme-icon" data-ui-icon="notes" src="assets/ui-final-notes.png" alt="" /> זיהויים: <strong>${won}</strong></span><span class="hm-stat-sep">·</span><span><img class="icon-3d-mini ui-theme-icon" data-ui-icon="accuracy" src="assets/ui-final-accuracy.png" alt="" /> דיוק: <strong>${rate}%</strong></span>`;
  }
}

function updateHomeSelectedModeUI() {
  const cfg = HOME_MODE_CONFIG[selectedHomeMode] || HOME_MODE_CONFIG.quickplay;
  const btn = document.getElementById("home-quickplay-btn");
  const titleEl = document.getElementById("home-play-title");
  const subEl = document.getElementById("home-play-sub");
  if (titleEl) titleEl.textContent = cfg.title;
  if (subEl) {
    subEl.textContent = cfg.sub || "";
    subEl.style.display = cfg.sub ? "" : "none";
  }
  if (btn) {
    btn.classList.remove("mode-theme-marathon", "mode-theme-reverse", "mode-theme-timeline", "mode-theme-timed", "mode-theme-daily", "mode-theme-weekly", "mode-theme-1v1");
    if (cfg.themeClass) btn.classList.add(cfg.themeClass);
  }

  document.querySelectorAll("#screen-modes-hub [data-open-mode]").forEach(card => {
    const mode = card.dataset.openMode;
    const isSel = mode === selectedHomeMode;
    card.classList.toggle("is-selected", isSel);

    if (mode === "daily") {
      const done = state.userStats?.completedDailyDate === getTodayDateKey();
      card.classList.toggle("is-completed", done);
      const subEl = card.querySelector(".mode-card-sub");
      if (subEl) subEl.textContent = done ? "✓ כבר עשית את האתגר היומי להיום!" : "שיר חדש ומיוחד בכל יום";
    } else if (mode === "weekly") {
      const done = state.userStats?.completedWeeklyKey === getCurrentWeekKey();
      card.classList.toggle("is-completed", done);
      const subEl = card.querySelector(".weekly-sub");
      if (subEl) subEl.textContent = done ? "✓ כבר עשית את השיר השבועי השבוע!" : "תוכלו לגלות אותו עכשיו!";
    }
  });

  const filterBtn = document.getElementById("home-filter-btn");
  if (filterBtn) {
    filterBtn.style.display = selectedHomeMode === "quickplay" ? "inline-flex" : "none";
  }

  renderHomeModeStatsStrip();
}

function selectHomeMode(modeKey) {
  if (!HOME_MODE_CONFIG[modeKey]) return;
  selectedHomeMode = modeKey;
  updateHomeSelectedModeUI();
  showScreen("home");
}

function launchSelectedMode(modeKey) {
  if (modeKey && modeKey !== "1v1") {
    recordStarterModePlayed(modeKey);
  }
  if (modeKey === "marathon") {
    showScreen("marathon");
    startMarathonSession(() => showScreen("home"));
  } else if (modeKey === "reverse") {
    showScreen("reverse");
    startReverseSession(() => showScreen("home"));
  } else if (modeKey === "timeline") {
    showScreen("timeline");
    startTimelineSession(() => showScreen("home"));
  } else if (modeKey === "timed") {
    state.selectedGenres.clear();
    state.selectedGenres.add("all");
    state.selectedDecades.clear();
    state.selectedDecades.add("all");
    updateFilterPillsUI();
    showScreen("game");
    startTimedGameSession();
  } else if (modeKey === "daily") {
    if (state.userStats?.completedDailyDate === getTodayDateKey()) {
      showGameToast("✅ כבר שיחקת את האתגר היומי של היום! חזור מחר לשיר חדש 📅", "quest");
      return;
    }
    showScreen("game");
    startDeterministicChallenge("daily");
  } else if (modeKey === "weekly") {
    if (state.userStats?.completedWeeklyKey === getCurrentWeekKey()) {
      showGameToast("👑 כבר שיחקת את השיר השבועי! חזור בשבוע הבא לשיר חדש", "quest");
      return;
    }
    showScreen("game");
    startDeterministicChallenge("weekly");
  } else if (modeKey === "1v1") {
    openModeScreen("1v1");
  } else {
    // כניסה מיידית למשחק מהיר בלחיצה אחת עם הסינון הנוכחי!
    startGameDirectly(state.currentDifficulty || "easy");
  }
}

export function showScreen(screenName) {
  if (currentScreen !== screenName) playClickSfx();
  currentScreen = screenName;
  Object.entries(SCREEN_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === screenName);
  });

  // מסתיר את סרגל הניווט התחתון בתוך המשחק ובמסכי ההגדרה/הגדרות (גלוי בבית, מצבי משחק ודירוג)
  document.body.classList.toggle("hide-bottom-nav", screenName !== "home" && screenName !== "modes-hub" && screenName !== "leaderboard");

  if (screenName !== "marathon") stopMarathonSession();
  if (screenName !== "reverse") stopReverseSession();
  if (screenName !== "timeline") stopTimelineSession();

  if (screenName !== "game" && screenName !== "settings" && screenName !== "marathon" && screenName !== "reverse" && screenName !== "timeline") {
    stopTimedRun();
    state.activeSpecialChallenge = null;
    stopAudioVisuals();
    releaseMediaElement();
    const reveal = document.getElementById("result-banner");
    if (reveal) {
      reveal.classList.remove("open", "is-win", "is-loss");
      reveal.style.display = "none";
    }
  }

  if (screenName === "home") {
    updateBottomNavActiveTab("game");
    updateHomeSelectedModeUI();
    refreshIncomingFriendsBadge();
  } else if (screenName === "modes-hub") {
    updateBottomNavActiveTab("modes");
    updateHomeSelectedModeUI();
  } else if (screenName === "leaderboard") {
    updateBottomNavActiveTab("leaderboard");
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function syncSetupSelectionUI() {
  document.querySelectorAll("[data-setup-genre]").forEach(btn => {
    btn.classList.toggle("selected", state.selectedGenres.has(btn.dataset.setupGenre));
  });
  document.querySelectorAll("[data-setup-decade]").forEach(btn => {
    btn.classList.toggle("selected", state.selectedDecades.has(btn.dataset.setupDecade));
  });
  updateFilterPillsUI();
}

function toggleSetChoice(targetSet, val) {
  if (val === "all") {
    targetSet.clear();
    targetSet.add("all");
  } else {
    targetSet.delete("all");
    if (targetSet.has(val)) targetSet.delete(val);
    else targetSet.add(val);
    if (targetSet.size === 0) targetSet.add("all");
  }
  syncSetupSelectionUI();
  saveUserPreferences();
}

const MODE_ICONS_HTML = {
  "1v1": `<svg viewBox="0 0 64 40" width="76" height="48"><defs><linearGradient id="mVsG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c084fc"/><stop offset="100%" stop-color="#60a5fa"/></linearGradient></defs><circle cx="15" cy="13" r="6" fill="url(#mVsG)"/><path d="M5 31c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="url(#mVsG)" opacity="0.92"/><circle cx="49" cy="13" r="6" fill="url(#mVsG)"/><path d="M39 31c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="url(#mVsG)" opacity="0.92"/><text x="32" y="25" text-anchor="middle" fill="#f472b6" font-size="13" font-weight="900" font-family="Rubik,sans-serif">VS</text></svg>`,
  marathon: `<svg viewBox="0 0 56 32" width="72" height="42"><defs><linearGradient id="mInfG" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#ff6ec7"/><stop offset="50%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#fb7185"/></linearGradient></defs><path d="M16 8c-5 0-9 3.6-9 8s4 8 9 8c6 0 10-16 24-16 5 0 9 3.6 9 8s-4 8-9 8c-6 0-10-16-24-16z" fill="none" stroke="url(#mInfG)" stroke-width="4.5" stroke-linecap="round"/></svg>`,
  timed: `<svg viewBox="0 0 48 48" width="58" height="58"><defs><linearGradient id="mWtG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#bef264"/><stop offset="100%" stop-color="#22c55e"/></linearGradient></defs><rect x="20" y="5" width="8" height="4" rx="1.5" fill="#86efac"/><circle cx="24" cy="27" r="14" fill="rgba(16,185,129,0.16)" stroke="url(#mWtG)" stroke-width="3.5"/><path d="M24 19v8l5 3" fill="none" stroke="#ecfccb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  daily: `<svg viewBox="0 0 48 48" width="58" height="58"><defs><linearGradient id="mChG" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#67e8f9"/></linearGradient></defs><rect x="9" y="28" width="6" height="11" rx="2" fill="url(#mChG)"/><rect x="20" y="22" width="6" height="17" rx="2" fill="url(#mChG)"/><rect x="31" y="14" width="6" height="25" rx="2" fill="url(#mChG)"/><path d="M9 22l9-6 6 3 11-10m0 0h-7m7 0v7" fill="none" stroke="#cffafe" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  weekly: `<svg viewBox="0 0 48 48" width="62" height="62"><defs><linearGradient id="mCrG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs><path d="M6 34L10 14l9 8 5-12 5 12 9-8 4 20H6z" fill="url(#mCrG)" stroke="#fff7cc" stroke-width="1.5" stroke-linejoin="round"/><rect x="8" y="36" width="32" height="4" rx="2" fill="#fde047"/></svg>`
};

function openModeScreen(modeKey) {
  const cfg = MODE_CATALOG[modeKey];
  if (!cfg) return;
  currentModeKey = modeKey;

  const badge = document.getElementById("mode-screen-badge");
  const icon = document.getElementById("mode-detail-icon");
  const title = document.getElementById("mode-detail-title");
  const desc = document.getElementById("mode-detail-desc");
  const status = document.getElementById("mode-detail-status");
  const actionBtn = document.getElementById("mode-detail-action-btn");

  if (badge) badge.textContent = cfg.badge;
  if (icon) {
    if (MODE_ICONS_HTML[modeKey]) icon.innerHTML = MODE_ICONS_HTML[modeKey];
    else icon.textContent = cfg.icon;
  }
  if (title) title.textContent = cfg.title;
  if (desc) desc.textContent = cfg.desc;
  if (status) status.textContent = cfg.status;
  if (actionBtn) actionBtn.textContent = cfg.actionLabel;

  const lbWrap = document.getElementById("mode-leaderboard-wrap");
  if (lbWrap) {
    lbWrap.innerHTML = "";
    lbWrap.style.display = "none";
  }

  showScreen("mode");
}

let cachedLeaderboardRows = [];
let cachedFriendsLeaderboardRows = [];
let activeLeaderboardScope = "global";
let activeLeaderboardSort = "totalWon";

function formatMetricValue(val) {
  const n = Number(val) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function getSortedLeaderboardRows(rows, sortKey) {
  return [...rows].sort((a, b) => {
    if (sortKey === "bestStreak") {
      return ((b.bestStreak || 0) - (a.bestStreak || 0)) || ((b.totalWon || 0) - (a.totalWon || 0));
    }
    if (sortKey === "points") {
      return ((b.points || 0) - (a.points || 0)) || ((b.totalWon || 0) - (a.totalWon || 0));
    }
    if (sortKey === "bestMarathon") {
      return ((b.bestMarathon || 0) - (a.bestMarathon || 0)) || ((b.totalWon || 0) - (a.totalWon || 0));
    }
    return ((b.totalWon || 0) - (a.totalWon || 0)) || ((b.bestStreak || 0) - (a.bestStreak || 0)) || ((b.points || 0) - (a.points || 0));
  });
}

function renderLeaderboardView() {
  const podiumEl = document.getElementById("lb-podium");
  const myRankEl = document.getElementById("lb-my-rank-card");
  const listEl = document.getElementById("lb-table-list");
  if (!listEl) return;

  const baseRows = activeLeaderboardScope === "friends" ? cachedFriendsLeaderboardRows : cachedLeaderboardRows;
  const sorted = getSortedLeaderboardRows(baseRows, activeLeaderboardSort);

  // פודיום טופ 3
  if (podiumEl) {
    podiumEl.innerHTML = "";
    if (sorted.length >= 2) {
      const top3 = [sorted[1] || null, sorted[0] || null, sorted[2] || null];
      const rankMeta = [
        { pos: 2, cls: "rank-2", medal: "🥈" },
        { pos: 1, cls: "rank-1", medal: "🥇" },
        { pos: 3, cls: "rank-3", medal: "🥉" }
      ];
      top3.forEach((player, i) => {
        const slot = document.createElement("div");
        const meta = rankMeta[i];
        slot.className = `lb-podium-slot ${meta.cls}${!player ? " is-empty" : ""}`;
        if (!player) {
          slot.innerHTML = `<div class="lb-podium-medal">${meta.medal}</div><div class="lb-podium-name">—</div><div class="lb-podium-pedestal">${meta.pos}</div>`;
        } else {
          const isMe = state.currentUser && player.username.toLowerCase() === state.currentUser.toLowerCase();
          if (isMe) slot.classList.add("is-me");
          const scoreHtml = activeLeaderboardSort === "bestStreak"
            ? `${player.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/ui-final-flame.png" alt="" />`
            : activeLeaderboardSort === "points"
              ? `${formatMetricValue(player.points)}<img class="icon-3d-mini icon-3d-crystal" src="assets/ui-final-crystal.png" alt="" />`
              : activeLeaderboardSort === "bestMarathon"
                ? `${(player.bestMarathon || 0).toLocaleString("he-IL")} ♾️`
                : `${player.totalWon || 0} <img class="icon-3d-mini" src="assets/ui-final-notes.png" alt="" />`;
          const medalDiv = document.createElement("div");
          medalDiv.className = "lb-podium-medal";
          medalDiv.textContent = meta.medal;
          const nameDiv = document.createElement("div");
          nameDiv.className = "lb-podium-name";
          nameDiv.textContent = player.username;
          const scoreDiv = document.createElement("div");
          scoreDiv.className = "lb-podium-score";
          scoreDiv.innerHTML = scoreHtml;
          const pedDiv = document.createElement("div");
          pedDiv.className = "lb-podium-pedestal";
          pedDiv.textContent = String(meta.pos);
          slot.append(medalDiv, nameDiv, scoreDiv, pedDiv);
        }
        podiumEl.appendChild(slot);
      });
      podiumEl.style.display = "grid";
    } else {
      podiumEl.style.display = "none";
    }
  }

  // כרטיס מיקום אישי
  if (myRankEl) {
    if (state.currentUser) {
      const myIdx = sorted.findIndex(r => r.username.toLowerCase() === state.currentUser.toLowerCase());
      if (myIdx >= 0) {
        const me = sorted[myIdx];
        myRankEl.style.display = "flex";
        myRankEl.innerHTML = "";
        const label = document.createElement("span");
        label.className = "lb-my-rank-label";
        label.textContent = `המיקום שלך: #${myIdx + 1} (${me.username})`;
        const stats = document.createElement("span");
        stats.className = "lb-meta";
        stats.innerHTML = activeLeaderboardSort === "bestMarathon"
          ? `♾️ ${(me.bestMarathon || 0).toLocaleString("he-IL")} נק' · ${me.totalWon || 0} <img class="icon-3d-mini" src="assets/ui-final-notes.png" alt="" />`
          : `${me.totalWon || 0} <img class="icon-3d-mini" src="assets/ui-final-notes.png" alt="" /> · ${me.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/ui-final-flame.png" alt="" /> · ${formatMetricValue(me.points)}<img class="icon-3d-mini icon-3d-crystal" src="assets/ui-final-crystal.png" alt="" />`;
        myRankEl.append(label, stats);
      } else {
        myRankEl.style.display = "none";
      }
    } else {
      myRankEl.style.display = "flex";
      myRankEl.innerHTML = `<span class="lb-my-rank-guest">הירשם או התחבר דרך לשונית <strong>פרופיל</strong> כדי להופיע בטבלה העולמית!</span>`;
    }
  }

  // טבלה מלאה
  listEl.innerHTML = "";
  if (sorted.length === 0) {
    const empty = document.createElement("div");
    empty.className = "lb-empty";
    empty.textContent = activeLeaderboardScope === "friends"
      ? (state.currentUser
        ? "עדיין אין לך חברים מאושרים — הוסף חברים מכפתור 👥 חברים במסך הבית!"
        : "התחבר לחשבון כדי לראות טבלת חברים!")
      : "עדיין אין שחקנים רשומים בדירוג — הירשם בפרופיל כדי להיות הראשון בטבלה!";
    listEl.appendChild(empty);
    return;
  }

  sorted.forEach((r, idx) => {
    const row = document.createElement("div");
    const isMe = state.currentUser && r.username.toLowerCase() === state.currentUser.toLowerCase();
    row.className = `lb-table-row ${isMe ? "is-me" : ""}${idx < 3 ? ` top-${idx + 1}` : ""}`;

    const rankSpan = document.createElement("span");
    rankSpan.className = "lb-rank";
    rankSpan.textContent = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;

    const nameSpan = document.createElement("span");
    nameSpan.className = "lb-name";
    nameSpan.textContent = r.username;

    const metaSpan = document.createElement("span");
    metaSpan.className = "lb-meta";
    metaSpan.innerHTML = activeLeaderboardSort === "bestMarathon"
      ? `♾️ ${(r.bestMarathon || 0).toLocaleString("he-IL")} נק' · ${r.totalWon || 0} <img class="icon-3d-mini" src="assets/ui-final-notes.png" alt="" />`
      : `${r.totalWon || 0} <img class="icon-3d-mini" src="assets/ui-final-notes.png" alt="" /> · ${r.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/ui-final-flame.png" alt="" /> · ${formatMetricValue(r.points)}<img class="icon-3d-mini icon-3d-crystal" src="assets/ui-final-crystal.png" alt="" />`;

    row.append(rankSpan, nameSpan, metaSpan);
    listEl.appendChild(row);
  });
}

async function loadAndRenderLeaderboardPage() {
  const statusEl = document.getElementById("lb-page-status");
  const refreshBtn = document.getElementById("lb-refresh-btn");
  if (statusEl) statusEl.textContent = "טוען דירוג...";
  if (refreshBtn) refreshBtn.disabled = true;

  if (state.currentUser && state.userStats) {
    await syncAccountToCloud(state.currentUser, state.userStats).catch(() => false);
  }
  const { source, rows } = await fetchGlobalLeaderboard(50);
  cachedLeaderboardRows = Array.isArray(rows) ? rows : [];

  // טעינת חברים לטאב "חברים בלבד" (כולל את המשתמש עצמו)
  cachedFriendsLeaderboardRows = [];
  if (state.currentUser) {
    try {
      const fRes = await fetch(`/api/friends?username=${encodeURIComponent(state.currentUser)}&_t=${Date.now()}`, { cache: "no-store" });
      if (fRes.ok) {
        const fData = await fRes.json();
        if (fData.configured && Array.isArray(fData.friends)) {
          const meRow = cachedLeaderboardRows.find(r => r.username.toLowerCase() === state.currentUser.toLowerCase()) || {
            username: state.currentUser,
            totalWon: state.userStats?.totalWon || 0,
            bestStreak: state.userStats?.bestStreak || 0,
            points: state.userStats?.earnedPoints ?? state.userStats?.points ?? 0,
            bestMarathon: state.userStats?.bestMarathonScore || 0
          };
          cachedFriendsLeaderboardRows = [meRow, ...fData.friends];
        }
      }
    } catch (e) { }
  }

  if (statusEl) {
    statusEl.innerHTML = source === "cloud"
      ? "☁️ דירוג עולמי חי"
      : `<img class="icon-3d-mini" src="assets/ui-final-trophy.png" alt="" /> דירוג מקומי`;
    statusEl.classList.toggle("is-cloud", source === "cloud");
  }
  if (refreshBtn) refreshBtn.disabled = false;
  renderLeaderboardView();
}

function startGameDirectly(difficulty = "easy") {
  state.pendingNextDifficulty = null;
  setActiveDifficultyUI(difficulty);
  updateFilterPillsUI();
  showScreen("game");
  fetchRandomSong();
}

const MODE_LB_CONFIG = {
  marathon: { title: "♾️ טופ מרתון (10 שאלות)", field: "bestMarathon", format: (v) => `${Number(v || 0).toLocaleString("he-IL")} נק'` },
  timed: { title: "⏱️ טופ משחק בזמן (60ש')", field: "bestTimed", format: (v) => `${Number(v || 0)} שירים` },
  reverse: { title: "🔄 טופ הפוך על הפוך", field: "bestReverse", format: (v) => `רצף ${Number(v || 0)}` },
  timeline: { title: "⏳ טופ ציר זמן", field: "bestTimeline", format: (v) => `${Number(v || 0)} שירים` }
};

async function openModeLeaderboardModal(modeKey) {
  const cfg = MODE_LB_CONFIG[modeKey];
  const backdrop = document.getElementById("mode-lb-modal-backdrop");
  const titleEl = document.getElementById("mode-lb-modal-title");
  const listEl = document.getElementById("mode-lb-list");
  const myRankEl = document.getElementById("mode-lb-my-rank");
  if (!cfg || !backdrop || !listEl) return;

  if (titleEl) titleEl.textContent = cfg.title;
  if (myRankEl) myRankEl.style.display = "none";
  listEl.innerHTML = `<div class="lb-empty">טוען דירוג...</div>`;
  backdrop.classList.add("open");

  const { rows } = await fetchGlobalLeaderboard(50);
  const filtered = (rows || [])
    .filter(r => Number(r[cfg.field] || 0) > 0)
    .sort((a, b) => Number(b[cfg.field] || 0) - Number(a[cfg.field] || 0));

  listEl.innerHTML = "";
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="lb-empty">עדיין אין תוצאות במצב זה — שחקו והיו הראשונים בטבלה!</div>`;
    return;
  }

  if (myRankEl && state.currentUser) {
    const myIdx = filtered.findIndex(r => r.username.toLowerCase() === state.currentUser.toLowerCase());
    if (myIdx >= 0) {
      myRankEl.style.display = "flex";
      myRankEl.textContent = `המיקום שלך: #${myIdx + 1} · ${cfg.format(filtered[myIdx][cfg.field])}`;
    }
  }

  filtered.slice(0, 25).forEach((r, idx) => {
    const row = document.createElement("div");
    const isMe = state.currentUser && r.username.toLowerCase() === state.currentUser.toLowerCase();
    row.className = `lb-table-row ${isMe ? "is-me" : ""}${idx < 3 ? ` top-${idx + 1}` : ""}`;
    const rank = document.createElement("span");
    rank.className = "lb-rank";
    rank.textContent = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
    const nm = document.createElement("span");
    nm.className = "lb-name";
    nm.textContent = r.username;
    const val = document.createElement("span");
    val.className = "lb-meta";
    val.textContent = cfg.format(r[cfg.field]);
    row.append(rank, nm, val);
    listEl.appendChild(row);
  });
}

export function initNavigationListeners() {
  // כפתורי טופ נפרד לכל מצב משחק (מרתון / 60ש' / הפוך על הפוך / ציר זמן)
  document.querySelectorAll("[data-mode-lb]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      playClickSfx();
      openModeLeaderboardModal(btn.dataset.modeLb);
    });
  });
  const modeLbClose = document.getElementById("mode-lb-close-btn");
  const modeLbBackdrop = document.getElementById("mode-lb-modal-backdrop");
  if (modeLbClose) modeLbClose.addEventListener("click", () => modeLbBackdrop?.classList.remove("open"));
  if (modeLbBackdrop) {
    modeLbBackdrop.addEventListener("click", (e) => {
      if (e.target === modeLbBackdrop) modeLbBackdrop.classList.remove("open");
    });
  }
  // מחבר את פתיחת/סגירת ההגדרות כדף מסך מלא נפרד
  setSettingsScreenHandler((isOpen) => {
    if (isOpen) {
      if (currentScreen !== "settings") returnScreenFromSettings = currentScreen;
      showScreen("settings");
    } else {
      showScreen(returnScreenFromSettings || "home");
    }
  });

  const settingsBackBtn = document.getElementById("settings-back-btn");
  if (settingsBackBtn) {
    settingsBackBtn.addEventListener("click", () => toggleDrawer(false));
  }

  // כפתורי לובי עליונים (קריסטלים לתצוגה בלבד; פרופיל וחנות נגישים מהסרגל התחתון ומהחלקה)
  const homeStreakBtn = document.getElementById("home-streak-btn");
  const homeQuestsBtn = document.getElementById("home-quests-btn");
  const homeSettingsBtn = document.getElementById("home-settings-btn");
  const homeFriendsBtn = document.getElementById("home-friends-btn");
  const friendsBackBtn = document.getElementById("friends-back-btn");

  if (homeStreakBtn) homeStreakBtn.addEventListener("click", () => toggleStreakModal(true));
  if (homeQuestsBtn) homeQuestsBtn.addEventListener("click", () => toggleQuestsModal(true));
  if (homeSettingsBtn) homeSettingsBtn.addEventListener("click", () => toggleDrawer(true));
  if (homeFriendsBtn) {
    homeFriendsBtn.addEventListener("click", () => {
      showScreen("friends");
      loadFriendsScreen();
    });
  }
  if (friendsBackBtn) friendsBackBtn.addEventListener("click", () => showScreen("home"));

  // כפתור המשחק הראשי בבית — מפעיל את המוד שנבחר כרגע (ברירת מחדל: משחק מהיר)
  updateHomeSelectedModeUI();
  const quickplayBtn = document.getElementById("home-quickplay-btn");
  if (quickplayBtn) {
    quickplayBtn.addEventListener("click", () => {
      launchSelectedMode(selectedHomeMode);
    });
  }
  const changeModeBtn = document.getElementById("home-change-mode-btn");
  if (changeModeBtn) {
    changeModeBtn.addEventListener("click", () => {
      showScreen("modes-hub");
    });
  }
  const filterBtn = document.getElementById("home-filter-btn");
  if (filterBtn) {
    filterBtn.addEventListener("click", () => {
      syncSetupSelectionUI();
      showScreen("setup-genres");
    });
  }

  // בחירת ז'אנרים במסך ייעודי
  document.querySelectorAll("[data-setup-genre]").forEach(btn => {
    btn.addEventListener("click", () => toggleSetChoice(state.selectedGenres, btn.dataset.setupGenre));
  });

  // בחירת עשורים במסך ייעודי
  document.querySelectorAll("[data-setup-decade]").forEach(btn => {
    btn.addEventListener("click", () => toggleSetChoice(state.selectedDecades, btn.dataset.setupDecade));
  });

  // ניווט אשף משחק מהיר: ז'אנרים -> עשורים -> משחק
  const genresBack = document.getElementById("setup-genres-back-btn");
  const genresConfirm = document.getElementById("setup-genres-confirm-btn");
  const decadesBack = document.getElementById("setup-decades-back-btn");
  const decadesConfirm = document.getElementById("setup-decades-confirm-btn");

  if (genresBack) genresBack.addEventListener("click", () => showScreen("home"));
  if (genresConfirm) {
    genresConfirm.addEventListener("click", () => {
      syncSetupSelectionUI();
      showScreen("setup-decades");
    });
  }
  if (decadesBack) decadesBack.addEventListener("click", () => showScreen("setup-genres"));
  if (decadesConfirm) {
    decadesConfirm.addEventListener("click", () => startGameDirectly(state.currentDifficulty || "easy"));
  }

  // בחירת מוד מתפריט המשחקים -> מחליף את המוד במסך הבית ומחזיר אוטומטית לבית
  document.querySelectorAll("#screen-modes-hub [data-open-mode]").forEach(btn => {
    btn.addEventListener("click", () => selectHomeMode(btn.dataset.openMode));
  });

  const modeBackBtn = document.getElementById("mode-back-lobby-btn");
  if (modeBackBtn) modeBackBtn.addEventListener("click", () => showScreen("modes-hub"));

  // לשוניות סרגל תחתון: בית + משחקים + דירוג עולמי
  const navModesBtn = document.getElementById("nav-modes-btn");
  if (navModesBtn) {
    navModesBtn.addEventListener("click", () => {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("modes-hub");
    });
  }
  const navLeaderboardBtn = document.getElementById("nav-leaderboard-btn");
  if (navLeaderboardBtn) {
    navLeaderboardBtn.addEventListener("click", () => {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("leaderboard");
      loadAndRenderLeaderboardPage();
    });
  }
  const lbRefreshBtn = document.getElementById("lb-refresh-btn");
  if (lbRefreshBtn) {
    lbRefreshBtn.addEventListener("click", () => loadAndRenderLeaderboardPage());
  }
  document.querySelectorAll("[data-lb-scope]").forEach(tab => {
    tab.addEventListener("click", () => {
      activeLeaderboardScope = tab.dataset.lbScope || "global";
      document.querySelectorAll("[data-lb-scope]").forEach(t => t.classList.toggle("active", t === tab));
      renderLeaderboardView();
    });
  });
  document.querySelectorAll("[data-lb-sort]").forEach(tab => {
    tab.addEventListener("click", () => {
      activeLeaderboardSort = tab.dataset.lbSort || "totalWon";
      document.querySelectorAll("[data-lb-sort]").forEach(t => t.classList.toggle("active", t === tab));
      renderLeaderboardView();
    });
  });
  const navGameBtn = document.getElementById("nav-game-btn");
  if (navGameBtn) {
    navGameBtn.addEventListener("click", () => {
      showScreen("home");
    });
  }

  const modeActionBtn = document.getElementById("mode-detail-action-btn");
  if (modeActionBtn) {
    modeActionBtn.addEventListener("click", () => {
      const cfg = MODE_CATALOG[currentModeKey];
      if (!cfg) return showScreen("home");
      if (cfg.action === "start-marathon") {
        showScreen("marathon");
        startMarathonSession(() => showScreen("home"));
      } else if (cfg.action === "start-timed") {
        state.selectedGenres.clear();
        state.selectedGenres.add("all");
        state.selectedDecades.clear();
        state.selectedDecades.add("all");
        updateFilterPillsUI();
        showScreen("game");
        startTimedGameSession();
      } else if (cfg.action === "start-daily") {
        startGameDirectly("hard");
      } else if (cfg.action === "start-weekly") {
        startGameDirectly("impossible");
      } else {
        syncSetupSelectionUI();
        showScreen("setup-genres");
      }
    });
  }

  // כפתור יציאה ללובי בצד ימין למעלה בתוך המשחק
  const exitToLobbyBtn = document.getElementById("exit-to-lobby-btn");
  if (exitToLobbyBtn) {
    exitToLobbyBtn.addEventListener("click", () => showScreen("home"));
  }

  // החלקה אופקית (Swipe ימינה/שמאלה) + אנימציית החלקה כיוונית חלקה בין 5 הלשוניות
  // סדר הלשוניות מימין לשמאל ב-RTL: פרופיל -> חנות -> בית -> משחקים -> דירוג
  const SWIPE_TABS = ["profile", "shop", "home", "modes-hub", "leaderboard"];
  let lastTabIndex = 2; // home
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let swipeTracking = false;

  function triggerTabSlideAnimation(tabName, dir) {
    const targetEl = tabName === "profile"
      ? document.querySelector("#profile-modal-backdrop .profile-modal")
      : tabName === "shop"
        ? document.querySelector("#shop-modal-backdrop .profile-modal")
        : document.querySelector(`#${SCREEN_IDS[tabName]} > .app-shell`) || document.getElementById(SCREEN_IDS[tabName]);
    if (!targetEl) return;
    targetEl.classList.remove("tab-slide-from-left", "tab-slide-from-right");
    void targetEl.offsetWidth;
    targetEl.classList.add(dir > 0 ? "tab-slide-from-left" : "tab-slide-from-right");
    setTimeout(() => targetEl.classList.remove("tab-slide-from-left", "tab-slide-from-right"), 300);
  }

  function getActiveMainTab() {
    if (document.getElementById("profile-modal-backdrop")?.classList.contains("open")) return "profile";
    if (document.getElementById("shop-modal-backdrop")?.classList.contains("open")) return "shop";
    if (currentScreen === "home" || currentScreen === "modes-hub" || currentScreen === "leaderboard") {
      return currentScreen;
    }
    return null;
  }

  function navigateToMainTab(tabName) {
    const nextIdx = SWIPE_TABS.indexOf(tabName);
    const dir = nextIdx >= lastTabIndex ? 1 : -1;
    lastTabIndex = nextIdx >= 0 ? nextIdx : lastTabIndex;
    vibrateTap();
    if (tabName === "profile") {
      toggleProfileModal(true);
    } else if (tabName === "shop") {
      toggleShopModal(true);
    } else if (tabName === "home") {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("home");
    } else if (tabName === "modes-hub") {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("modes-hub");
    } else if (tabName === "leaderboard") {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("leaderboard");
      loadAndRenderLeaderboardPage();
    }
    triggerTabSlideAnimation(tabName, dir);
  }

  // מחבר את אנימציית ההחלקה גם ללחיצה ישירה על כפתורי הסרגל התחתון
  const bottomTabPairs = [
    ["profile-btn", "profile"],
    ["nav-shop-btn", "shop"],
    ["nav-game-btn", "home"],
    ["nav-modes-btn", "modes-hub"],
    ["nav-leaderboard-btn", "leaderboard"]
  ];
  bottomTabPairs.forEach(([id, tabName]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("click", () => {
      const newIdx = SWIPE_TABS.indexOf(tabName);
      if (newIdx < 0 || newIdx === lastTabIndex) return;
      const dir = newIdx > lastTabIndex ? 1 : -1;
      lastTabIndex = newIdx;
      triggerTabSlideAnimation(tabName, dir);
    });
  });

  document.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || isOnboardingOpen()) { swipeTracking = false; return; }
    // מתעלמים מהחלקה כשחלון קופץ משני פתוח או שנוגעים בשדה קלט/סליידר
    if (
      document.getElementById("streak-modal-backdrop")?.classList.contains("open") ||
      document.getElementById("quests-modal-backdrop")?.classList.contains("open") ||
      document.getElementById("promo-modal-backdrop")?.classList.contains("open") ||
      document.getElementById("shop-confirm-backdrop")?.classList.contains("open") ||
      document.getElementById("gifts-modal-backdrop")?.classList.contains("open") ||
      document.getElementById("qr-modal-backdrop")?.classList.contains("open") ||
      document.getElementById("qr-scanner-modal-backdrop")?.classList.contains("open")
    ) { swipeTracking = false; return; }
    const tag = e.target?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") { swipeTracking = false; return; }
    if (!getActiveMainTab()) { swipeTracking = false; return; }

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    swipeTracking = true;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    if (!swipeTracking || !e.changedTouches.length) return;
    swipeTracking = false;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    if (dt > 600 || Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.45) return;

    const active = getActiveMainTab();
    const idx = SWIPE_TABS.indexOf(active);
    if (idx < 0) return;

    // ב-RTL: החלקה ימינה (dx > 0) מושכת את הלשונית משמאל (idx + 1 -> משחקים/דירוג); החלקה שמאלה (dx < 0) מושכת מימין (idx - 1 -> חנות/פרופיל)
    const nextIdx = dx > 0 ? idx + 1 : idx - 1;
    if (nextIdx >= 0 && nextIdx < SWIPE_TABS.length) {
      navigateToMainTab(SWIPE_TABS[nextIdx]);
    }
  }, { passive: true });
}

export function getCurrentScreen() {
  return currentScreen;
}
