import { dom } from "./dom.js?v=20261124i";
import { initStorageState } from "./services/storage.js?v=20261124i";
import { hydratePersistedCatalogs, ensureSeedCatalogLoaded } from "./services/itunes.js?v=20261124i";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261124i";
import { initHintListeners } from "./systems/feedback.js?v=20261124i";
import { initSearchListeners } from "./systems/search.js?v=20261124i";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261124i";
import { updateStreakDisplay, initProfileListeners, refreshUserStatsFromCloud, recordDailyLoginStreak } from "./systems/profile.js?v=20261124i";
import { updatePointsDisplay } from "./systems/economy.js?v=20261124i";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261124i";
import { initAuthListeners } from "./systems/auth.js?v=20261124i";
import { initDrawerListeners, applyUserPreferencesFromStats } from "./systems/drawer.js?v=20261124i";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261124i";
import { initSfxState } from "./systems/sfx.js?v=20261124i";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261124i";
import { initPromoListeners } from "./systems/promo.js?v=20261124i";
import { initDailyGiftsListeners, updateHomeGiftsDot, maybeAutoOpenDailyGifts } from "./systems/dailyGifts.js?v=20261124i";
import { checkSharedProfileDeepLink, initProfileShareButton } from "./systems/friends.js?v=20261124i";
import { initPlaylistListeners, checkSharedPlaylistDeepLink, openPlaylistSummaryModal } from "./systems/playlists.js?v=20261124i";
import { startOnboardingTour } from "./systems/onboarding.js?v=20261124i";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners,
  setOnPlaylistRunCompleteHook
} from "./systems/game.js?v=20261124i";

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
