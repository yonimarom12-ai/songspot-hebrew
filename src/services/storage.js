import { state } from "../state.js?v=20261123aa";

// גישה בטוחה ל-localStorage (מונעת קריסה במצב גלישה פרטית או WebViews במובייל)
export function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

export function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) { }
}

const PROMO_CRYSTAL_VALUES = {
  welcome100: 100, music2026: 250, spotifyvip: 50, kingcrown: 100, royalgold: 0, yonivip: 2500, test10k: 10000,
  songspot50: 50, israel2026: 120, beats150: 150, studio200: 200, hitmaker300: 300, vipgold500: 500, legend750: 750,
  galaxyvip: 100, crimsonvip: 100, arcticvip: 100, alienmask: 50, diamondface: 75, dragonking: 75, ghostmode: 50,
  aurorabg: 50, matrixbg: 50, velvetbg: 50
};

function calcPromoCrystalsFromCodes(codes) {
  if (!Array.isArray(codes)) return 0;
  return codes.reduce((sum, id) => sum + (PROMO_CRYSTAL_VALUES[id] || 0), 0);
}

// ניהול חשבונות משתמשים, אורח וסטטיסטיקות ב-localStorage
export function getDefaultStats() {
  return {
    totalHeard: 0,
    totalWon: 0,
    currentStreak: 0,
    bestStreak: 0,
    points: 0,
    totalPointsEarned: 0,
    earnedPoints: 0,
    promoPointsReceived: 0,
    byLevel: { easy: 0, medium: 0, hard: 0, very_hard: 0, impossible: 0 },
    bySpeed: { "0.1": 0, "0.5": 0, "2": 0, "8": 0, "15": 0 },
    wonSongs: [],
    ownedItems: [],
    equippedAvatar: "default",
    equippedBackground: "default",
    equippedTheme: "default",
    profileBanner: "default",
    customAvatarData: "",
    customBackgroundData: "",
    bestTimedScore: 0,
    bestMarathonScore: 0,
    bestReverseStreak: 0,
    bestTimelineScore: 0,
    completedDailyDate: "",
    completedWeeklyKey: "",
    powerups: { streakFreeze: 0, fiftyFifty: 0, extraTime: 0 },
    dailyQuests: null,
    starterQuests: { modesPlayed: [], boughtItem: false, completedMarathon: false, claimed: [] },
    dailyGifts: { lastClaimDate: "", streakDay: 0 },
    preferences: {
      selectedGenres: ["all"],
      selectedDecades: ["all"],
      easySearch: false,
      redFeedback: false,
      hintsEnabled: false,
      sfxEnabled: true
    },
    redeemedCodes: [],
    favorites: { song: "", album: "", artist: "", songImg: "", albumImg: "", artistImg: "" }
  };
}

export function normalizeStatsObj(parsed) {
  const def = getDefaultStats();
  if (!parsed) return def;
  const points = Number.isFinite(Number(parsed.points)) ? Math.max(0, Math.round(Number(parsed.points) * 100) / 100) : 0;
  const totalPointsEarned = Number.isFinite(Number(parsed.totalPointsEarned))
    ? Math.max(points, Math.round(Number(parsed.totalPointsEarned) * 100) / 100)
    : points;
  const redeemedCodes = Array.isArray(parsed.redeemedCodes) ? parsed.redeemedCodes : [];
  const promoPointsReceived = Number.isFinite(Number(parsed.promoPointsReceived))
    ? Math.max(0, Math.round(Number(parsed.promoPointsReceived) * 100) / 100)
    : calcPromoCrystalsFromCodes(redeemedCodes);
  const earnedPoints = Number.isFinite(Number(parsed.earnedPoints))
    ? Math.max(0, Math.round(Number(parsed.earnedPoints) * 100) / 100)
    : Math.max(0, Math.round((totalPointsEarned - promoPointsReceived) * 100) / 100);
  return {
    ...def,
    ...parsed,
    points,
    totalPointsEarned,
    earnedPoints,
    promoPointsReceived,
    byLevel: { ...def.byLevel, ...(parsed.byLevel || {}) },
    bySpeed: { ...def.bySpeed, ...(parsed.bySpeed || {}) },
    wonSongs: Array.isArray(parsed.wonSongs) ? parsed.wonSongs : [],
    ownedItems: Array.isArray(parsed.ownedItems) ? parsed.ownedItems : [],
    customAvatarData: typeof parsed.customAvatarData === "string" ? parsed.customAvatarData : "",
    customBackgroundData: typeof parsed.customBackgroundData === "string" ? parsed.customBackgroundData : "",
    bestTimedScore: Number.isFinite(Number(parsed.bestTimedScore)) ? Math.max(0, Number(parsed.bestTimedScore)) : 0,
    bestMarathonScore: Number.isFinite(Number(parsed.bestMarathonScore)) ? Math.max(0, Math.round(Number(parsed.bestMarathonScore))) : 0,
    bestReverseStreak: Number.isFinite(Number(parsed.bestReverseStreak)) ? Math.max(0, Math.round(Number(parsed.bestReverseStreak))) : 0,
    bestTimelineScore: Number.isFinite(Number(parsed.bestTimelineScore)) ? Math.max(0, Math.round(Number(parsed.bestTimelineScore))) : 0,
    completedDailyDate: typeof parsed.completedDailyDate === "string" ? parsed.completedDailyDate : "",
    completedWeeklyKey: typeof parsed.completedWeeklyKey === "string" ? parsed.completedWeeklyKey : "",
    powerups: {
      streakFreeze: Math.max(0, Number(parsed.powerups?.streakFreeze) || 0),
      fiftyFifty: Math.max(0, Number(parsed.powerups?.fiftyFifty) || 0),
      extraTime: Math.max(0, Number(parsed.powerups?.extraTime) || 0)
    },
    dailyQuests: parsed.dailyQuests && typeof parsed.dailyQuests === "object" ? parsed.dailyQuests : null,
    starterQuests: {
      modesPlayed: Array.isArray(parsed.starterQuests?.modesPlayed) ? parsed.starterQuests.modesPlayed : [],
      boughtItem: Boolean(parsed.starterQuests?.boughtItem),
      completedMarathon: Boolean(parsed.starterQuests?.completedMarathon),
      claimed: Array.isArray(parsed.starterQuests?.claimed) ? parsed.starterQuests.claimed : []
    },
    dailyGifts: {
      lastClaimDate: typeof parsed.dailyGifts?.lastClaimDate === "string" ? parsed.dailyGifts.lastClaimDate : "",
      streakDay: Number.isFinite(Number(parsed.dailyGifts?.streakDay)) ? Math.max(0, Math.min(7, Math.round(Number(parsed.dailyGifts.streakDay)))) : 0
    },
    preferences: {
      selectedGenres: Array.isArray(parsed.preferences?.selectedGenres) && parsed.preferences.selectedGenres.length > 0 ? parsed.preferences.selectedGenres : ["all"],
      selectedDecades: Array.isArray(parsed.preferences?.selectedDecades) && parsed.preferences.selectedDecades.length > 0 ? parsed.preferences.selectedDecades : ["all"],
      easySearch: Boolean(parsed.preferences?.easySearch),
      redFeedback: Boolean(parsed.preferences?.redFeedback),
      hintsEnabled: Boolean(parsed.preferences?.hintsEnabled),
      sfxEnabled: parsed.preferences?.sfxEnabled !== undefined ? Boolean(parsed.preferences.sfxEnabled) : true
    },
    redeemedCodes: Array.isArray(parsed.redeemedCodes) ? parsed.redeemedCodes : [],
    favorites: {
      song: typeof parsed.favorites?.song === "string" ? parsed.favorites.song : "",
      album: typeof parsed.favorites?.album === "string" ? parsed.favorites.album : "",
      artist: typeof parsed.favorites?.artist === "string" ? parsed.favorites.artist : "",
      songImg: typeof parsed.favorites?.songImg === "string" ? parsed.favorites.songImg : "",
      albumImg: typeof parsed.favorites?.albumImg === "string" ? parsed.favorites.albumImg : "",
      artistImg: typeof parsed.favorites?.artistImg === "string" ? parsed.favorites.artistImg : ""
    }
  };
}

export function loadAccountsMap() {
  try {
    return JSON.parse(safeStorageGet("songspot_accounts_v1") || "{}");
  } catch (e) {
    return {};
  }
}

export function saveAccountsMap(accounts) {
  return safeStorageSet("songspot_accounts_v1", JSON.stringify(accounts));
}

export function loadUserStats() {
  try {
    if (state.currentUser) {
      const accounts = loadAccountsMap();
      if (accounts[state.currentUser]) {
        return normalizeStatsObj(accounts[state.currentUser].stats);
      }
    }
    const raw = safeStorageGet("songspot_guest_stats_v2");
    return normalizeStatsObj(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return getDefaultStats();
  }
}

let bgSyncTimer = null;

function getBgSyncHeaders() {
  const token = safeStorageGet("songspot_session_token_v1") || "";
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

function scheduleBgCloudSync(username, stats) {
  if (!username || !stats || typeof window === "undefined" || !window.location.protocol.startsWith("http")) return;
  if (bgSyncTimer) clearTimeout(bgSyncTimer);
  bgSyncTimer = setTimeout(() => {
    bgSyncTimer = null;
    fetch("/api/sync", {
      method: "POST",
      headers: getBgSyncHeaders(),
      body: JSON.stringify({ username, stats })
    }).catch(() => {});
  }, 900);
}

export function saveUserStats() {
  try {
    if (state.currentUser) {
      const accounts = loadAccountsMap();
      if (accounts[state.currentUser]) {
        accounts[state.currentUser].stats = state.userStats;
        const ok = saveAccountsMap(accounts);
        // סנכרון שקט ומרוכז (debounced) ברקע לענן (D1) — מונע כתיבות כפולות מיותרות
        scheduleBgCloudSync(state.currentUser, state.userStats);
        return ok;
      }
    }
    return safeStorageSet("songspot_guest_stats_v2", JSON.stringify(state.userStats));
  } catch (e) {
    return false;
  }
}

export function loadPlayedIds() {
  try {
    return new Set(JSON.parse(safeStorageGet("songspot_played_ids") || "[]"));
  } catch (e) {
    return new Set();
  }
}

export function markSongAsPlayed(trackId) {
  // מחיקה והוספה מחדש שומרות על סדר הכרונולוגי (האחרונים שהושמעו נמצאים בסוף)
  state.playedTrackIds.delete(trackId);
  state.playedTrackIds.add(trackId);
  if (state.playedTrackIds.size > 1500) {
    state.playedTrackIds = new Set(Array.from(state.playedTrackIds).slice(-800));
  }
  safeStorageSet("songspot_played_ids", JSON.stringify(Array.from(state.playedTrackIds)));
}

export function initStorageState() {
  state.currentUser = safeStorageGet("songspot_current_user_v1") || null;
  state.userStats = loadUserStats();
  state.playedTrackIds = loadPlayedIds();
  // סנכרון אוטומטי והשגת Session Token חתום למשתמשים ותיקים שכבר מחוברים מקומית
  if (state.currentUser && typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    const existingToken = safeStorageGet("songspot_session_token_v1");
    if (!existingToken) {
      const accounts = loadAccountsMap();
      const acc = accounts[state.currentUser];
      if (acc?.password) {
        fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "login", username: acc.username, password: acc.password })
        })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (data?.token) {
              safeStorageSet("songspot_session_token_v1", data.token);
              scheduleBgCloudSync(state.currentUser, state.userStats);
            }
          })
          .catch(() => {});
        return;
      }
    }
    fetch("/api/sync", {
      method: "POST",
      headers: getBgSyncHeaders(),
      body: JSON.stringify({ username: state.currentUser, stats: state.userStats })
    }).catch(() => {});
  }
}
