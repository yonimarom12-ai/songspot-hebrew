import { dom } from "./dom.js?v=20261119h";
import { initStorageState } from "./services/storage.js?v=20261119h";
import { hydratePersistedCatalogs } from "./services/itunes.js?v=20261119h";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261119h";
import { initHintListeners } from "./systems/feedback.js?v=20261119h";
import { initSearchListeners } from "./systems/search.js?v=20261119h";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261119h";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261119h";
import { updatePointsDisplay } from "./systems/economy.js?v=20261119h";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261119h";
import { initAuthListeners } from "./systems/auth.js?v=20261119h";
import { initDrawerListeners } from "./systems/drawer.js?v=20261119h";
import {
  fetchRandomSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261119h";

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

  // Core game control bindings
  dom.playBtn.addEventListener("click", playSnippet);
  dom.submitBtn.addEventListener("click", handleGuess);
  dom.skipBtn.addEventListener("click", advanceAttempt);
  dom.retryBtn.addEventListener("click", fetchRandomSong);
  dom.nextBtn.addEventListener("click", fetchRandomSong);

  // Boot application
  updateStreakDisplay();
  updatePointsDisplay();
  applyEquippedCosmetics();
  fetchRandomSong();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootApp, { once: true });
} else {
  bootApp();
}
