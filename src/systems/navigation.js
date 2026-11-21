import { state } from "../state.js?v=20261121j";
import { stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261121j";
import { updateFilterPillsUI, toggleDrawer, setSettingsScreenHandler } from "./drawer.js?v=20261121j";
import { toggleProfileModal, toggleShopModal, toggleStreakModal, toggleQuestsModal, updateBottomNavActiveTab } from "./profile.js?v=20261121j";
import { fetchRandomSong, setActiveDifficultyUI, startTimedGameSession } from "./game.js?v=20261121j";
import { stopTimedRun } from "./timed.js?v=20261121j";
import { fetchGlobalLeaderboard, syncAccountToCloud } from "../services/cloud.js?v=20261121j";
import { playClickSfx } from "./sfx.js?v=20261121j";

const SCREEN_IDS = {
  home: "screen-home",
  "modes-hub": "screen-modes-hub",
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
  leaderboard: {
    badge: "תחרות עולמית",
    icon: "🏆",
    title: "דירוג עולמי",
    desc: "טבלת השחקנים המובילים ב״נחש את השיר״ לפי כמות זיהויים, שיא רצף וקריסטלים.",
    status: "טוען דירוג...",
    actionLabel: "שחק וצבור קריסטלים ▶",
    action: "quickplay"
  },
  marathon: {
    badge: "אתגר רצף",
    icon: "♾️",
    title: "מרתון",
    desc: "רצף שירים אינסופי ברמות קושי עולות בלופ — נסו לשבור את שיא הרצף האישי שלכם!",
    status: "🔥 זמין למשחק עכשיו",
    actionLabel: "התחל מרתון עכשיו ▶",
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
let returnScreenFromSettings = "home";

export function showScreen(screenName) {
  if (currentScreen !== screenName) playClickSfx();
  currentScreen = screenName;
  Object.entries(SCREEN_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === screenName);
  });

  // מסתיר את סרגל הניווט התחתון בתוך המשחק ובמסכי ההגדרה/הגדרות (גלוי בבית ובמסך מצבי המשחק)
  document.body.classList.toggle("hide-bottom-nav", screenName !== "home" && screenName !== "modes-hub");

  if (screenName !== "game" && screenName !== "settings") {
    stopTimedRun();
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
  } else if (screenName === "modes-hub") {
    updateBottomNavActiveTab("modes");
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
}

const MODE_ICONS_HTML = {
  "1v1": `<svg viewBox="0 0 64 40" width="76" height="48"><defs><linearGradient id="mVsG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c084fc"/><stop offset="100%" stop-color="#60a5fa"/></linearGradient></defs><circle cx="15" cy="13" r="6" fill="url(#mVsG)"/><path d="M5 31c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="url(#mVsG)" opacity="0.92"/><circle cx="49" cy="13" r="6" fill="url(#mVsG)"/><path d="M39 31c0-5.5 4.5-9 10-9s10 3.5 10 9" fill="url(#mVsG)" opacity="0.92"/><text x="32" y="25" text-anchor="middle" fill="#f472b6" font-size="13" font-weight="900" font-family="Rubik,sans-serif">VS</text></svg>`,
  leaderboard: `<svg viewBox="0 0 48 48" width="58" height="58"><defs><linearGradient id="mTrG" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="45%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient></defs><path d="M13 8h22v11c0 6.5-4.8 11.5-11 11.5S13 25.5 13 19V8z" fill="url(#mTrG)"/><path d="M13 11H8c0 6 2.5 10 6 10.5M35 11h5c0 6-2.5 10-6 10.5" fill="none" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/><rect x="21" y="30" width="6" height="6" fill="#d97706"/><rect x="15" y="36" width="18" height="4" rx="2" fill="url(#mTrG)"/><polygon points="24,13 25.8,16.8 30,17.3 26.9,20.2 27.7,24.3 24,22.3 20.3,24.3 21.1,20.2 18,17.3 22.2,16.8" fill="#fff7cc"/></svg>`,
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
    lbWrap.style.display = modeKey === "leaderboard" ? "flex" : "none";
  }

  showScreen("mode");

  if (modeKey === "leaderboard" && lbWrap) {
    const syncFirst = state.currentUser && state.userStats
      ? syncAccountToCloud(state.currentUser, state.userStats).catch(() => false)
      : Promise.resolve(false);
    syncFirst.then(() => fetchGlobalLeaderboard(25)).then(({ source, rows }) => {
      if (currentModeKey !== "leaderboard") return;
      if (status) {
        status.textContent = source === "cloud"
          ? "☁️ דירוג עולמי חי"
          : "🏆 דירוג מקומי";
      }
      lbWrap.innerHTML = "";
      if (!rows || rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "lb-empty";
        empty.textContent = "עדיין אין שחקנים רשומים בדירוג — הירשם בפרופיל ושחק כדי להיכנס לטבלה!";
        lbWrap.appendChild(empty);
        return;
      }
      rows.forEach((r, idx) => {
        const item = document.createElement("div");
        const isMe = state.currentUser && r.username.toLowerCase() === state.currentUser.toLowerCase();
        item.className = `lb-row ${isMe ? "is-me" : ""}`;
        const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
        const rankSpan = document.createElement("span");
        rankSpan.className = "lb-rank";
        rankSpan.textContent = medal;
        const nameSpan = document.createElement("span");
        nameSpan.className = "lb-name";
        nameSpan.textContent = r.username;
        const metaSpan = document.createElement("span");
        metaSpan.className = "lb-meta";
        metaSpan.innerHTML = `${r.totalWon} 🎵 · ${r.bestStreak}<img class="icon-3d-mini icon-3d-flame" src="assets/icon-flame.png" alt="" /> · ${r.points}<img class="icon-3d-mini icon-3d-crystal" src="assets/icon-crystal.png" alt="" />`;
        item.append(rankSpan, nameSpan, metaSpan);
        lbWrap.appendChild(item);
      });
    });
  }
}

function startGameDirectly(difficulty = "easy") {
  state.pendingNextDifficulty = null;
  setActiveDifficultyUI(difficulty);
  updateFilterPillsUI();
  showScreen("game");
  fetchRandomSong();
}

export function initNavigationListeners() {
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

  // כפתורי לובי עליונים (פרופיל נגיש רק מהסרגל התחתון)
  const homeStreakBtn = document.getElementById("home-streak-btn");
  const homePointsBtn = document.getElementById("home-points-btn");
  const homeQuestsBtn = document.getElementById("home-quests-btn");
  const homeSettingsBtn = document.getElementById("home-settings-btn");

  if (homeStreakBtn) homeStreakBtn.addEventListener("click", () => toggleStreakModal(true));
  if (homePointsBtn) homePointsBtn.addEventListener("click", () => toggleShopModal(true));
  if (homeQuestsBtn) homeQuestsBtn.addEventListener("click", () => toggleQuestsModal(true));
  if (homeSettingsBtn) homeSettingsBtn.addEventListener("click", () => toggleDrawer(true));

  // כפתור "משחק מהיר" -> שלב 1: בחירת ז'אנרים
  const quickplayBtn = document.getElementById("home-quickplay-btn");
  if (quickplayBtn) {
    quickplayBtn.addEventListener("click", () => {
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

  // פתיחת מסכי מודים נפרדים מהלובי
  document.querySelectorAll("[data-open-mode]").forEach(btn => {
    btn.addEventListener("click", () => openModeScreen(btn.dataset.openMode));
  });

  const modeBackBtn = document.getElementById("mode-back-lobby-btn");
  if (modeBackBtn) modeBackBtn.addEventListener("click", () => showScreen("modes-hub"));

  // לשוניות סרגל תחתון: בית + משחקים (מודים)
  const navModesBtn = document.getElementById("nav-modes-btn");
  if (navModesBtn) {
    navModesBtn.addEventListener("click", () => {
      toggleProfileModal(false);
      toggleShopModal(false);
      showScreen("modes-hub");
    });
  }
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
        state.selectedGenres.clear();
        state.selectedGenres.add("all");
        state.selectedDecades.clear();
        state.selectedDecades.add("all");
        startGameDirectly("easy");
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
}

export function getCurrentScreen() {
  return currentScreen;
}
