// Centralized mutable runtime state & caches
const fallbackAudio = new Audio();
fallbackAudio.crossOrigin = "anonymous";

const galleryAudio = new Audio();
galleryAudio.crossOrigin = "anonymous";

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
