import { dom } from "./dom.js";
import { initStorageState } from "./services/storage.js";
import { hydratePersistedCatalogs } from "./services/itunes.js";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js";
import { initHintListeners } from "./systems/feedback.js";
import { initSearchListeners } from "./systems/search.js";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js";
import { updatePointsDisplay } from "./systems/economy.js";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js";
import { initAuthListeners } from "./systems/auth.js";
import { initDrawerListeners } from "./systems/drawer.js";
import {
  fetchRandomSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js";

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
