import { state } from "../state.js?v=20261119k";
import { stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261119k";
import { updateFilterPillsUI, toggleDrawer } from "./drawer.js?v=20261119k";
import { toggleProfileModal, toggleShopModal, updateBottomNavActiveTab } from "./profile.js?v=20261119k";
import { fetchRandomSong, setActiveDifficultyUI } from "./game.js?v=20261119k";

const SCREEN_IDS = {
  home: "screen-home",
  "setup-genres": "screen-setup-genres",
  "setup-decades": "screen-setup-decades",
  mode: "screen-mode",
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
    desc: "טבלת השחקנים המובילים ב״נחש את השיר״ לפי רצף ניצחונות, מהירות זיהוי וכמות קריסטלים.",
    status: "🚧 לוח תוצאות עולמי יחובר בקרוב",
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
    badge: "נגד השעון",
    icon: "⏱️",
    title: "משחק בזמן",
    desc: "60 שניות על השעון — נחשו כמה שיותר שירים ישראליים לפני שהזמן נגמר!",
    status: "🚧 מצב שעון עצר בפיתוח · בקרוב",
    actionLabel: "שחק משחק מהיר בינתיים ▶",
    action: "quickplay"
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

export function showScreen(screenName) {
  currentScreen = screenName;
  Object.entries(SCREEN_IDS).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === screenName);
  });

  // מסתיר את סרגל הניווט התחתון בתוך המשחק ובמסכי ההגדרה/מודים
  document.body.classList.toggle("hide-bottom-nav", screenName !== "home");

  if (screenName !== "game") {
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

  showScreen("mode");
}

function startGameDirectly(difficulty = "easy") {
  state.pendingNextDifficulty = null;
  setActiveDifficultyUI(difficulty);
  updateFilterPillsUI();
  showScreen("game");
  fetchRandomSong();
}

export function initNavigationListeners() {
  // כפתורי לובי עליונים
  const homeAvatarBtn = document.getElementById("home-avatar-btn");
  const homeStreakBtn = document.getElementById("home-streak-btn");
  const homePointsBtn = document.getElementById("home-points-btn");
  const homeSettingsBtn = document.getElementById("home-settings-btn");
  const homeShopCardBtn = document.getElementById("home-shop-card-btn");

  if (homeAvatarBtn) homeAvatarBtn.addEventListener("click", () => toggleProfileModal(true));
  if (homeStreakBtn) homeStreakBtn.addEventListener("click", () => toggleProfileModal(true));
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
  if (modeBackBtn) modeBackBtn.addEventListener("click", () => showScreen("home"));

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
