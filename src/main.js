import { dom } from "./dom.js?v=20261124h";
import { initStorageState } from "./services/storage.js?v=20261124h";
import { hydratePersistedCatalogs, ensureSeedCatalogLoaded } from "./services/itunes.js?v=20261124h";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261124h";
import { initHintListeners } from "./systems/feedback.js?v=20261124h";
import { initSearchListeners } from "./systems/search.js?v=20261124h";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261124h";
import { updateStreakDisplay, initProfileListeners, refreshUserStatsFromCloud, recordDailyLoginStreak } from "./systems/profile.js?v=20261124h";
import { updatePointsDisplay } from "./systems/economy.js?v=20261124h";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261124h";
import { initAuthListeners } from "./systems/auth.js?v=20261124h";
import { initDrawerListeners, applyUserPreferencesFromStats } from "./systems/drawer.js?v=20261124h";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261124h";
import { initSfxState } from "./systems/sfx.js?v=20261124h";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261124h";
import { initPromoListeners } from "./systems/promo.js?v=20261124h";
import { initDailyGiftsListeners, updateHomeGiftsDot, maybeAutoOpenDailyGifts } from "./systems/dailyGifts.js?v=20261124h";
import { checkSharedProfileDeepLink, initProfileShareButton } from "./systems/friends.js?v=20261124h";
import { initPlaylistListeners, checkSharedPlaylistDeepLink, openPlaylistSummaryModal } from "./systems/playlists.js?v=20261124h";
import { startOnboardingTour } from "./systems/onboarding.js?v=20261124h";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners,
  setOnPlaylistRunCompleteHook
} from "./systems/game.js?v=20261124h";

function bootApp() {
  // Hydrate persisted user, stats, played track IDs, and cached catalogs safely
  initStorageState();
  initSfxState();
  hydratePersistedCatalogs();
  ensureSeedCatalogLoaded();

  // Unlock mobile Web Audio on first touch/tap
  unlockAudioOnFirstGesture();
  installMediaSessionGuards();

  // Prevent main snippet audio and gallery preview audio from overlapping
  setBeforePlaySnippetHook(stopGalleryPreview);

  // Initialize all modular game systems
  initDifficultyListeners();
  initHintListeners();
  initSearchListeners({ onSubmitGuess: handleGuess });
  initDrawerListeners();
  initAuthListeners();
  initGalleryAudioListeners();
  initProfileListeners();
  initShopListeners();
  initPromoListeners();
  initDailyGiftsListeners();
  initProfileShareButton();
  setOnPlaylistRunCompleteHook(openPlaylistSummaryModal);
  initPlaylistListeners({
    onStartGameScreen: () => showScreen("game"),
    onNavigateScreen: (screen) => showScreen(screen)
  });
  initNavigationListeners();

  // Core game control bindings
  dom.playBtn.addEventListener("click", playSnippet);
  dom.submitBtn.addEventListener("click", handleGuess);
  dom.skipBtn.addEventListener("click", advanceAttempt);
  dom.retryBtn.addEventListener("click", fetchRandomSong);
  dom.nextBtn.addEventListener("click", goToNextSong);

  // Boot application -> תפריט הבית הוא המסך הראשון שהשחקן רואה
  recordDailyLoginStreak();
  updateStreakDisplay();
  updatePointsDisplay();
  applyEquippedCosmetics();
  applyUserPreferencesFromStats();
  updateHomeQuestsDot();
  updateHomeGiftsDot();
  showScreen("home");
  // סנכרון אוטומטי מהענן בעלייה ובחזרה ללשונית — מונע פערים בין דפדפן Safari לאפליקציית מסך הבית!
  refreshUserStatsFromCloud();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      recordDailyLoginStreak();
      refreshUserStatsFromCloud();
    }
  });
  // אם נכנסו דרך קישור פרופיל (?profile=...) או פלייליסט משותף (?playlist=...)
  const bootParams = new URLSearchParams(window.location.search);
  const hasDeepLink = Boolean(bootParams.get("profile") || bootParams.get("playlist"));
  checkSharedProfileDeepLink((screen) => showScreen(screen));
  checkSharedPlaylistDeepLink((screen) => showScreen(screen));
  // מציג מדריך היכרות קצר בפעם הראשונה בלבד (ניתן לדילוג), ואם כבר הושלם — מציע מתנה יומית פעם ביום
  setTimeout(() => {
    if (!hasDeepLink) {
      startOnboardingTour(false);
      setTimeout(() => maybeAutoOpenDailyGifts(), 350);
    }
  }, 450);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
