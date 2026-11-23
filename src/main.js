import { dom } from "./dom.js?v=20261123z";
import { initStorageState } from "./services/storage.js?v=20261123z";
import { hydratePersistedCatalogs, ensureSeedCatalogLoaded } from "./services/itunes.js?v=20261123z";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261123z";
import { initHintListeners } from "./systems/feedback.js?v=20261123z";
import { initSearchListeners } from "./systems/search.js?v=20261123z";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261123z";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261123z";
import { updatePointsDisplay } from "./systems/economy.js?v=20261123z";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261123z";
import { initAuthListeners } from "./systems/auth.js?v=20261123z";
import { initDrawerListeners, applyUserPreferencesFromStats } from "./systems/drawer.js?v=20261123z";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261123z";
import { initSfxState } from "./systems/sfx.js?v=20261123z";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261123z";
import { initPromoListeners } from "./systems/promo.js?v=20261123z";
import { initDailyGiftsListeners, updateHomeGiftsDot, maybeAutoOpenDailyGifts } from "./systems/dailyGifts.js?v=20261123z";
import { checkSharedProfileDeepLink, initProfileShareButton } from "./systems/friends.js?v=20261123z";
import { startOnboardingTour } from "./systems/onboarding.js?v=20261123z";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261123z";

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
  initNavigationListeners();

  // Core game control bindings
  dom.playBtn.addEventListener("click", playSnippet);
  dom.submitBtn.addEventListener("click", handleGuess);
  dom.skipBtn.addEventListener("click", advanceAttempt);
  dom.retryBtn.addEventListener("click", fetchRandomSong);
  dom.nextBtn.addEventListener("click", goToNextSong);

  // Boot application -> תפריט הבית הוא המסך הראשון שהשחקן רואה
  updateStreakDisplay();
  updatePointsDisplay();
  applyEquippedCosmetics();
  applyUserPreferencesFromStats();
  updateHomeQuestsDot();
  updateHomeGiftsDot();
  showScreen("home");
  // אם נכנסו דרך קישור פרופיל (?profile=...), פותח מיד את פרופיל השחקן עם כפתור הוספת חבר
  checkSharedProfileDeepLink((screen) => showScreen(screen));
  // מציג מדריך היכרות קצר בפעם הראשונה בלבד (ניתן לדילוג), ואם כבר הושלם — מציע מתנה יומית פעם ביום
  setTimeout(() => {
    if (!new URLSearchParams(window.location.search).get("profile")) {
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
