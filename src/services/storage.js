import { state } from "../state.js";

// ניהול חשבונות משתמשים, אורח וסטטיסטיקות ב-localStorage
export function getDefaultStats() {
  return {
    totalHeard: 0,
    totalWon: 0,
    currentStreak: 0,
    bestStreak: 0,
    byLevel: { easy: 0, medium: 0, hard: 0, very_hard: 0, impossible: 0 },
    bySpeed: { "0.1": 0, "0.5": 0, "2": 0, "8": 0, "15": 0 },
    wonSongs: []
  };
}

export function normalizeStatsObj(parsed) {
  const def = getDefaultStats();
  if (!parsed) return def;
  return {
    ...def,
    ...parsed,
    byLevel: { ...def.byLevel, ...(parsed.byLevel || {}) },
    bySpeed: { ...def.bySpeed, ...(parsed.bySpeed || {}) },
    wonSongs: Array.isArray(parsed.wonSongs) ? parsed.wonSongs : []
  };
}

export function loadAccountsMap() {
  try {
    return JSON.parse(localStorage.getItem("songspot_accounts_v1") || "{}");
  } catch (e) {
    return {};
  }
}

export function saveAccountsMap(accounts) {
  try {
    localStorage.setItem("songspot_accounts_v1", JSON.stringify(accounts));
  } catch (e) { }
}

export function loadUserStats() {
  try {
    if (state.currentUser) {
      const accounts = loadAccountsMap();
      if (accounts[state.currentUser]) {
        return normalizeStatsObj(accounts[state.currentUser].stats);
      }
    }
    const raw = localStorage.getItem("songspot_guest_stats_v2");
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
    localStorage.setItem("songspot_guest_stats_v2", JSON.stringify(state.userStats));
  } catch (e) { }
}

export function loadPlayedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem("songspot_played_ids") || "[]"));
  } catch (e) {
    return new Set();
  }
}

export function markSongAsPlayed(trackId) {
  state.playedTrackIds.add(trackId);
  if (state.playedTrackIds.size > 1500) {
    state.playedTrackIds = new Set(Array.from(state.playedTrackIds).slice(-800));
  }
  try {
    localStorage.setItem("songspot_played_ids", JSON.stringify(Array.from(state.playedTrackIds)));
  } catch (e) { }
}

export function initStorageState() {
  state.currentUser = localStorage.getItem("songspot_current_user_v1") || null;
  state.userStats = loadUserStats();
  state.playedTrackIds = loadPlayedIds();
}
