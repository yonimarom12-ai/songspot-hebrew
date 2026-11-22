import { dom } from "./dom.js?v=20261122m";
import { initStorageState } from "./services/storage.js?v=20261122m";
import { hydratePersistedCatalogs, ensureSeedCatalogLoaded } from "./services/itunes.js?v=20261122m";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261122m";
import { initHintListeners } from "./systems/feedback.js?v=20261122m";
import { initSearchListeners } from "./systems/search.js?v=20261122m";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261122m";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261122m";
import { updatePointsDisplay } from "./systems/economy.js?v=20261122m";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261122m";
import { initAuthListeners } from "./systems/auth.js?v=20261122m";
import { initDrawerListeners } from "./systems/drawer.js?v=20261122m";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261122m";
import { initSfxState } from "./systems/sfx.js?v=20261122m";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261122m";
import { initPromoListeners } from "./systems/promo.js?v=20261122m";
import { startOnboardingTour } from "./systems/onboarding.js?v=20261122m";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261122m";

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
  updateHomeQuestsDot();
  showScreen("home");
  // מציג מדריך היכרות קצר בפעם הראשונה בלבד (ניתן לדילוג)
  setTimeout(() => startOnboardingTour(false), 450);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
