import { state } from "../state.js";

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
  } catch (e) { }
}

export function safeStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) { }
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
    byLevel: { easy: 0, medium: 0, hard: 0, very_hard: 0, impossible: 0 },
    bySpeed: { "0.1": 0, "0.5": 0, "2": 0, "8": 0, "15": 0 },
    wonSongs: []
  };
}

export function normalizeStatsObj(parsed) {
  const def = getDefaultStats();
  if (!parsed) return def;
  const points = Number.isFinite(Number(parsed.points)) ? Math.max(0, Math.round(Number(parsed.points) * 100) / 100) : 0;
  const totalPointsEarned = Number.isFinite(Number(parsed.totalPointsEarned))
    ? Math.max(points, Math.round(Number(parsed.totalPointsEarned) * 100) / 100)
    : points;
  return {
    ...def,
    ...parsed,
    points,
    totalPointsEarned,
    byLevel: { ...def.byLevel, ...(parsed.byLevel || {}) },
    bySpeed: { ...def.bySpeed, ...(parsed.bySpeed || {}) },
    wonSongs: Array.isArray(parsed.wonSongs) ? parsed.wonSongs : []
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
  safeStorageSet("songspot_accounts_v1", JSON.stringify(accounts));
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

export function saveUserStats() {
  try {
    if (state.currentUser) {
      const accounts = loadAccountsMap();
      if (accounts[state.currentUser]) {
        accounts[state.currentUser].stats = state.userStats;
        saveAccountsMap(accounts);
        return;
      }
    }
    safeStorageSet("songspot_guest_stats_v2", JSON.stringify(state.userStats));
  } catch (e) { }
}

export function loadPlayedIds() {
  try {
    return new Set(JSON.parse(safeStorageGet("songspot_played_ids") || "[]"));
  } catch (e) {
    return new Set();
  }
}

export function markSongAsPlayed(trackId) {
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
}
