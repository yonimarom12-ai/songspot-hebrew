// Centralized mutable runtime state & caches
export const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function getOrCreateMobileAudio(elementId) {
  const existing = typeof document !== "undefined" ? document.getElementById(elementId) : null;
  const audio = existing || new Audio();
  // ללא crossOrigin — iTunes CDN לא תמיד שולח כותרות CORS ולכן crossOrigin חוסם ניגון ב-iOS Safari
  audio.preload = "auto";
  audio.playsInline = true;
  audio.setAttribute("playsinline", "");
  audio.setAttribute("webkit-playsinline", "");
  return audio;
}

const fallbackAudio = getOrCreateMobileAudio("game-audio");
const galleryAudio = getOrCreateMobileAudio("gallery-audio");

export const state = {
  currentDifficulty: "easy",
  selectedGenres: new Set(["all"]),
  selectedDecades: new Set(["all"]),
  hintsEnabled: true,
  // כבוי כברירת מחדל לפי בקשת המשתמש
  easySearchFiftyActive: false,
  redFeedbackEnabled: false,
  currentRoundEasyMask: new Map(),

  currentAttempt: 0,
  currentSong: null,
  usedHintInRound: false,
  usedEasySearchInRound: false,
  searchDebounce: null,
  activeFetchRoundId: 0,
  isPlayingSnippet: false,

  // ניווט מקלדת ברשימת ההצעות
  currentSuggestionItems: [],
  highlightedSuggestionIndex: -1,

  artistCatalogCache: {},
  discoveredSongsMap: new Map(),

  // User & persistence state (hydrated via initStorageState)
  currentUser: null,
  userStats: null,
  playedTrackIds: new Set(),

  // Web Audio API & Fallback Audio
  audioCtx: null,
  audioBuffer: null,
  activeSource: null,
  fallbackAudio,
  activeOnPlayingHandler: null,
  activeOnErrorHandler: null,
  playStartGuardTimer: null,
  uiTimer: null,
  rafProgressId: null,

  // נגן ייעודי לגלריית השירים בפרופיל
  galleryAudio,
  playingGalleryTrackId: null,
  selectedGalleryTrackId: null,

  // שחזור סיסמא
  pendingResetAccountKey: null,
  pendingResetCode: null
};
