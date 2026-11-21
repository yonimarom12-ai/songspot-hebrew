import { dom } from "./dom.js?v=20261122e";
import { initStorageState } from "./services/storage.js?v=20261122e";
import { hydratePersistedCatalogs, ensureSeedCatalogLoaded } from "./services/itunes.js?v=20261122e";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261122e";
import { initHintListeners } from "./systems/feedback.js?v=20261122e";
import { initSearchListeners } from "./systems/search.js?v=20261122e";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261122e";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261122e";
import { updatePointsDisplay } from "./systems/economy.js?v=20261122e";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261122e";
import { initAuthListeners } from "./systems/auth.js?v=20261122e";
import { initDrawerListeners } from "./systems/drawer.js?v=20261122e";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261122e";
import { initSfxState } from "./systems/sfx.js?v=20261122e";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261122e";
import { initPromoListeners } from "./systems/promo.js?v=20261122e";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261122e";

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
