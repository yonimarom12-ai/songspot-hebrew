import { dom } from "./dom.js?v=20261121f";
import { initStorageState } from "./services/storage.js?v=20261121f";
import { hydratePersistedCatalogs } from "./services/itunes.js?v=20261121f";
import { playSnippet, setBeforePlaySnippetHook, unlockAudioOnFirstGesture, installMediaSessionGuards } from "./systems/audio.js?v=20261121f";
import { initHintListeners } from "./systems/feedback.js?v=20261121f";
import { initSearchListeners } from "./systems/search.js?v=20261121f";
import { stopGalleryPreview, initGalleryAudioListeners } from "./systems/gallery.js?v=20261121f";
import { updateStreakDisplay, initProfileListeners } from "./systems/profile.js?v=20261121f";
import { updatePointsDisplay } from "./systems/economy.js?v=20261121f";
import { initShopListeners, applyEquippedCosmetics } from "./systems/shop.js?v=20261121f";
import { initAuthListeners } from "./systems/auth.js?v=20261121f";
import { initDrawerListeners } from "./systems/drawer.js?v=20261121f";
import { initNavigationListeners, showScreen } from "./systems/navigation.js?v=20261121f";
import { initSfxState } from "./systems/sfx.js?v=20261121f";
import { updateHomeQuestsDot } from "./systems/quests.js?v=20261121f";
import { initPromoListeners } from "./systems/promo.js?v=20261121f";
import {
  fetchRandomSong,
  goToNextSong,
  handleGuess,
  advanceAttempt,
  initDifficultyListeners
} from "./systems/game.js?v=20261121f";

function bootApp() {
  // Hydrate persisted user, stats, played track IDs, and cached catalogs safely
  initStorageState();
  initSfxState();
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
