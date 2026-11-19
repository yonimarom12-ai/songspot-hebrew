import { dom } from "./dom.js?v=20261119m";
import { initStorageState } from "./services/storage.js?v=20261119m";
import { hydratePersistedCatalogs } from "./services/itunes.js?v=20261119m";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261119m";
import { initHintListeners } from "./systems/feedback.js?v=20261119m";
import { initSearchListeners } from "./systems/search.js?v=20261119m";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261119m";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261119m";
import { updatePointsDisplay } from "./systems/economy.js?v=20261119m";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261119m";
import { initAuthListeners } from "./systems/auth.js?v=20261119m";
import { initDrawerListeners } from "./systems/drawer.js?v=20261119m";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261119m";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261119m";

function bootApp() {
  // Hydrate persisted user, stats, played track IDs, and cached catalogs safely
  initStorageState();
  hydratePersistedCatalogs();

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
  showScreen("home");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
