import { PLAY_SVG, PAUSE_SVG } from "../dom.js?v=20261122g";
import { state } from "../state.js?v=20261122g";
import { fetchItunesData } from "../services/itunes.js?v=20261122g";
import { saveUserStats } from "../services/storage.js?v=20261122g";
import { stopAudioVisuals } from "./audio.js?v=20261122g";

// ניגון אינטראקטיבי מתוך גלריית השירים בפרופיל + חשיפת קישור ל-Spotify
export function stopGalleryPreview() {
  try {
    state.galleryAudio.pause();
  } catch (e) { }
  state.playingGalleryTrackId = null;
  updateGalleryCardsPlayState();
}

export function updateGalleryCardsPlayState() {
  const cards = document.querySelectorAll(".gallery-item");
  cards.forEach(card => {
    const cardId = String(card.dataset.trackId);
    const isCurrentPlaying = cardId === String(state.playingGalleryTrackId) && !state.galleryAudio.paused;
    const isSelected = cardId === String(state.selectedGalleryTrackId);
    card.classList.toggle("playing", isCurrentPlaying);
    card.classList.toggle("selected-card", isSelected);
    const iconContainer = card.querySelector(".gallery-play-overlay svg");
    if (iconContainer) {
      iconContainer.innerHTML = isCurrentPlaying ? PAUSE_SVG : PLAY_SVG;
    }
  });
}

export async function toggleGallerySongPreview(item) {
  const itemId = item.trackId || `${item.title}_${item.artist}`;
  state.selectedGalleryTrackId = itemId;

  if (String(state.playingGalleryTrackId) === String(itemId) && !state.galleryAudio.paused) {
    stopGalleryPreview();
    return;
  }

  // עצירת אודיו של המשחק הראשי כדי שלא יתנגשו
  stopAudioVisuals();
  stopGalleryPreview();
  state.selectedGalleryTrackId = itemId;

  let previewUrl = item.previewUrl;
  if (!previewUrl) {
    try {
      const term = `${item.title} ${item.artist}`;
      const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=5&term=${encodeURIComponent(term)}`;
      const data = await fetchItunesData(url, 4500);
      if (data?.results?.length > 0) {
        const match = data.results.find(r => r.trackId === item.trackId) || data.results[0];
        if (match?.previewUrl) {
          previewUrl = match.previewUrl;
          item.previewUrl = previewUrl;
          saveUserStats();
        }
      }
    } catch (e) { }
  }

  if (!previewUrl) {
    updateGalleryCardsPlayState();
    return;
  }

  state.playingGalleryTrackId = itemId;
  state.galleryAudio.src = previewUrl;
  state.galleryAudio.currentTime = 0;
  updateGalleryCardsPlayState();

  state.galleryAudio.play().then(() => {
    updateGalleryCardsPlayState();
  }).catch(() => {
    state.playingGalleryTrackId = null;
    updateGalleryCardsPlayState();
  });
}

export function initGalleryAudioListeners() {
  state.galleryAudio.addEventListener("ended", () => {
    state.playingGalleryTrackId = null;
    updateGalleryCardsPlayState();
  });
}
