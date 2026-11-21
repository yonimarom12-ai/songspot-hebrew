import { state } from "../state.js?v=20261121a";
import { stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261121a";
import { updateFilterPillsUI, toggleDrawer, setSettingsScreenHandler } from "./drawer.js?v=20261121a";
import { toggleProfileModal, toggleShopModal, toggleStreakModal, updateBottomNavActiveTab } from "./profile.js?v=20261121a";
import { fetchRandomSong, setActiveDifficultyUI, startTimedGameSession } from "./game.js?v=20261121a";
import { stopTimedRun } from "./timed.js?v=20261121a";
import { fetchGlobalLeaderboard } from "../services/cloud.js?v=20261121a";
import { playClickSfx } from "./sfx.js?v=20261121a";

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
  if (icon) icon.textContent = cfg.icon;
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
    fetchGlobalLeaderboard(25).then(({ source, rows }) => {
      if (currentModeKey !== "leaderboard") return;
      if (status) {
        status.textContent = source === "cloud"
          ? "☁️ דירוג עולמי חי מהענן"
          : "📱 דירוג מקומי · הוסף Supabase ב-cloud.js לסנכרון עולמי";
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
        metaSpan.textContent = `${r.totalWon}🎵 · ${r.bestStreak}🔥 · ${r.points}💎`;
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

  // כפתורי לובי עליונים
  const homeAvatarBtn = document.getElementById("home-avatar-btn");
  const homeStreakBtn = document.getElementById("home-streak-btn");
  const homePointsBtn = document.getElementById("home-points-btn");
  const homeSettingsBtn = document.getElementById("home-settings-btn");
  const homeShopCardBtn = document.getElementById("home-shop-card-btn");

  if (homeAvatarBtn) homeAvatarBtn.addEventListener("click", () => toggleProfileModal(true));
  if (homeStreakBtn) homeStreakBtn.addEventListener("click", () => toggleStreakModal(true));
  if (homePointsBtn) homePointsBtn.addEventListener("click", () => toggleShopModal(true));
  if (homeSettingsBtn) homeSettingsBtn.addEventListener("click", () => toggleDrawer(true));
  if (homeShopCardBtn) homeShopCardBtn.addEventListener("click", () => toggleShopModal(true));

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
