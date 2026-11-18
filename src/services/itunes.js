import { ARTISTS_DB } from "../data/artists.js";
import { DIFFICULTIES } from "../data/config.js";
import { state } from "../state.js";
import { cleanTrackTitle, normalizeHebrew } from "../utils/text.js";
import { safeStorageGet, safeStorageSet } from "./storage.js";

const BANNED_TRACK_WORDS = [
  "karaoke", "קריוקי", "instrumental", "אינסטרומנטלי", "אינסטרומנטל",
  "נעימה", "remix", "רמיקס", "live", "הופעה", "אקפלה", "intro", "סקיט"
];

export function fetchItunesJsonp(url, timeoutMs = 6500) {
  return new Promise((resolve, reject) => {
    const callbackName = "itunesCb_" + Math.random().toString(36).slice(2, 11);
    const script = document.createElement("script");
    script.async = true;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[callbackName]; } catch (e) { window[callbackName] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP network error"));
    };

    script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + callbackName;
    document.head.appendChild(script);
  });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  let timer = null;
  try {
    const hasAbort = typeof AbortController !== "undefined";
    const controller = hasAbort ? new AbortController() : null;
    if (controller) {
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchViaCorsProxy(url, timeoutMs = 7500) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  return await fetchJsonWithTimeout(proxyUrl, timeoutMs);
}

const TRANSPORT_KEY = "songspot_itunes_transport_v1";
const TRANSPORTS = {
  fetch: (url, t) => fetchJsonWithTimeout(url, Math.min(t, 3000)),
  jsonp: (url, t) => fetchItunesJsonp(url, t),
  proxy: (url, t) => fetchViaCorsProxy(url, t)
};

// זוכר (גם בין ביקורים) איזה ערוץ עבד במכשיר הזה — כדי שהאייפון לא יבזבז זמן על ערוצים חסומים
let preferredTransport = safeStorageGet(TRANSPORT_KEY);
if (!TRANSPORTS[preferredTransport]) preferredTransport = null;

function rememberTransport(name) {
  if (preferredTransport !== name) {
    preferredTransport = name;
    safeStorageSet(TRANSPORT_KEY, name);
  }
}

function isValidPayload(data) {
  return data && Array.isArray(data.results);
}

// מריץ כמה ערוצים במקביל ומחזיר את הראשון שהצליח
function firstSuccessful(names, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let pending = names.length;
    let lastErr = null;
    if (pending === 0) return reject(new Error("no transports"));
    for (const name of names) {
      TRANSPORTS[name](url, timeoutMs)
        .then(data => {
          if (isValidPayload(data)) {
            rememberTransport(name);
            resolve(data);
          } else {
            throw new Error("bad payload");
          }
        })
        .catch(err => {
          lastErr = err;
          pending--;
          if (pending === 0) reject(lastErr);
        });
    }
  });
}

export async function fetchItunesData(url, timeoutMs = 7500) {
  // 1. ערוץ שכבר הוכח כעובד במכשיר הזה
  if (preferredTransport) {
    try {
      const data = await TRANSPORTS[preferredTransport](url, timeoutMs);
      if (isValidPayload(data)) return data;
    } catch (e) { }
    const others = Object.keys(TRANSPORTS).filter(n => n !== preferredTransport);
    return await firstSuccessful(others, url, timeoutMs);
  }

  // 2. ביקור ראשון: fetch רגיל, ואם נכשל — JSONP ו-Proxy במקביל (הראשון שעונה מנצח)
  try {
    const data = await TRANSPORTS.fetch(url, timeoutMs);
    if (isValidPayload(data)) {
      rememberTransport("fetch");
      return data;
    }
  } catch (e) { }
  return await firstSuccessful(["jsonp", "proxy"], url, timeoutMs);
}

// ===== מטמון קטלוגים מקומי (מאיץ טעינה בביקורים חוזרים) =====
const CATALOG_CACHE_KEY = "songspot_catalog_cache_v1";
const CATALOG_CACHE_MAX = 30;
const CATALOG_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function loadPersistedCatalogs() {
  try {
    const parsed = JSON.parse(safeStorageGet(CATALOG_CACHE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {};
  }
}

function getPersistedCatalog(artistName) {
  const all = loadPersistedCatalogs();
  const entry = all[artistName];
  if (!entry || !Array.isArray(entry.tracks) || Date.now() - (entry.ts || 0) > CATALOG_CACHE_TTL_MS) {
    return null;
  }
  return entry.tracks;
}

function persistCatalog(artistName, tracks) {
  const all = loadPersistedCatalogs();
  all[artistName] = { ts: Date.now(), tracks };
  const names = Object.keys(all);
  if (names.length > CATALOG_CACHE_MAX) {
    names
      .sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0))
      .slice(0, names.length - CATALOG_CACHE_MAX)
      .forEach(n => delete all[n]);
  }
  safeStorageSet(CATALOG_CACHE_KEY, JSON.stringify(all));
}

// מוודא ששם השיר הוא אכן בעברית (מונע דליפה של שירים באנגלית או בשפות זרות אחרות)
export function isHebrewSongTitle(rawTitle) {
  const cleaned = cleanTrackTitle(rawTitle || "");
  if (!cleaned) return false;

  // חוסם שירים הכוללים אותיות בשפות זרות (ערבית, קירילית, יוונית, מזרח-אסיה)
  if (/[\u0600-\u06FF\u0400-\u04FF\u0370-\u03FF\u3040-\u30FF\u4E00-\u9FFF]/.test(cleaned)) {
    return false;
  }

  const hebrewMatches = cleaned.match(/[\u0590-\u05FF]/g) || [];
  const latinMatches = cleaned.match(/[a-zA-Z]/g) || [];
  const hebrewCount = hebrewMatches.length;
  const latinCount = latinMatches.length;

  if (hebrewCount === 0) return false;
  if (latinCount > 0 && hebrewCount <= latinCount) return false;
  return hebrewCount >= 2 || latinCount === 0;
}

function isArtistNameMatch(normTrackArtist, normExpected) {
  if (!normTrackArtist || !normExpected) return false;
  if (normTrackArtist === normExpected) return true;
  if (normTrackArtist.includes(normExpected)) return true;
  // מונע התאמה שגויה של שם קצר כמו "אדם" בתוך "עומר אדם"
  return normTrackArtist.length >= 4 && normExpected.includes(normTrackArtist);
}

function findDominantArtistId(results, expectedArtist) {
  const normExpected = normalizeHebrew(expectedArtist);
  const idScores = new Map();
  let exactArtistId = null;

  for (let i = 0; i < Math.min(results.length, 30); i++) {
    const t = results[i];
    if (!t || !t.artistId || !t.artistName) continue;
    const normTrackArtist = normalizeHebrew(t.artistName);
    if (isArtistNameMatch(normTrackArtist, normExpected)) {
      exactArtistId = t.artistId;
      break;
    }
    const weight = isHebrewSongTitle(t.trackName) ? 3 : 1;
    idScores.set(t.artistId, (idScores.get(t.artistId) || 0) + weight);
  }

  if (exactArtistId) return exactArtistId;

  let bestId = null;
  let bestScore = 0;
  for (const [id, score] of idScores.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestScore >= 2 ? bestId : null;
}

export function isValidStudioTrack(track, expectedArtist, dominantArtistId = null, relaxedHebrew = false) {
  if (!track || !track.previewUrl || !track.trackName || !track.artistName) return false;
  const lowerTitle = track.trackName.toLowerCase();
  if (BANNED_TRACK_WORDS.some(w => lowerTitle.includes(w))) return false;

  // חובה: שם השיר חייב להיות בעברית
  if (relaxedHebrew) {
    if (!/[\u0590-\u05FF]/.test(cleanTrackTitle(track.trackName))) return false;
  } else {
    if (!isHebrewSongTitle(track.trackName)) return false;
  }

  const normArtist = normalizeHebrew(expectedArtist);
  const normTrackArtist = normalizeHebrew(track.artistName);
  const nameMatched = isArtistNameMatch(normTrackArtist, normArtist);
  const idMatched = Boolean(dominantArtistId && track.artistId === dominantArtistId);

  return nameMatched || idMatched;
}

export function doesYearMatchSelectedDecades(releaseYear) {
  if (state.selectedDecades.has("all") || state.selectedDecades.size === 0 || !releaseYear) return true;
  for (const dec of state.selectedDecades) {
    if (dec === "1970-1990" && releaseYear < 1990) return true;
    if (dec === "1990-2000" && releaseYear >= 1990 && releaseYear < 2000) return true;
    if (dec === "2000-2010" && releaseYear >= 2000 && releaseYear < 2010) return true;
    if (dec === "2010-2020" && releaseYear >= 2010 && releaseYear < 2020) return true;
    if (dec === "2020-2030" && releaseYear >= 2020) return true;
  }
  return false;
}

function extractTracksFromResults(results, artistName, dominantArtistId, relaxedHebrew = false) {
  const uniqueTracks = [];
  const seenTitles = new Set();

  for (const t of results) {
    if (!isValidStudioTrack(t, artistName, dominantArtistId, relaxedHebrew)) continue;
    const cleanTitle = cleanTrackTitle(t.trackName);
    const normTitle = normalizeHebrew(cleanTitle);
    if (!normTitle || seenTitles.has(normTitle)) continue;

    seenTitles.add(normTitle);
    const releaseYear = t.releaseDate ? new Date(t.releaseDate).getFullYear() : null;
    const songObj = {
      trackId: t.trackId,
      title: cleanTitle,
      itunesTitle: t.trackName,
      artist: artistName,
      releaseYear: releaseYear && !isNaN(releaseYear) ? releaseYear : null,
      previewUrl: t.previewUrl,
      artwork: (t.artworkUrl100 || "").replace("100x100bb", "400x400bb")
    };

    uniqueTracks.push(songObj);
    state.discoveredSongsMap.set(`${normTitle}_${normalizeHebrew(artistName)}`, songObj);
  }

  return uniqueTracks;
}

export async function getArtistCatalog(artistName) {
  if (state.artistCatalogCache[artistName]?.length > 0) {
    return state.artistCatalogCache[artistName];
  }

  // מטמון מקומי מביקור קודם — טעינה מיידית בלי רשת
  const persisted = getPersistedCatalog(artistName);
  if (persisted && persisted.length > 0) {
    state.artistCatalogCache[artistName] = persisted;
    for (const s of persisted) {
      state.discoveredSongsMap.set(`${normalizeHebrew(s.title)}_${normalizeHebrew(artistName)}`, s);
    }
    return persisted;
  }

  const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=60&term=${encodeURIComponent(artistName)}`;
  const data = await fetchItunesData(url);

  let uniqueTracks = [];
  if (data && Array.isArray(data.results) && data.results.length > 0) {
    const dominantArtistId = findDominantArtistId(data.results, artistName);
    uniqueTracks = extractTracksFromResults(data.results, artistName, dominantArtistId, false);
    if (uniqueTracks.length === 0) {
      uniqueTracks = extractTracksFromResults(data.results, artistName, dominantArtistId, true);
    }
  }

  if (uniqueTracks.length > 0) {
    state.artistCatalogCache[artistName] = uniqueTracks;
    persistCatalog(artistName, uniqueTracks);
  }
  return uniqueTracks;
}

// טוען ברקע קטלוגים של כמה אמנים מתאימים כדי שהסיבוב הבא יהיה מיידי
let warmingInProgress = false;
export async function warmCatalogCache(count = 2) {
  if (warmingInProgress) return;
  warmingInProgress = true;
  try {
    const pool = getCandidatePool().filter(a => !(state.artistCatalogCache[a.name]?.length > 0));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const [artist] = pool.splice(idx, 1);
      try {
        await getArtistCatalog(artist.name);
      } catch (e) { }
    }
  } finally {
    warmingInProgress = false;
  }
}

export function pickSongFromCatalog(catalog, chosenTierName, allowFallbackIfEmptyDecade = false) {
  const decadeFiltered = catalog.filter(s => doesYearMatchSelectedDecades(s.releaseYear));
  const sourceCatalog = decadeFiltered.length > 0 ? decadeFiltered : (allowFallbackIfEmptyDecade ? catalog : []);
  if (sourceCatalog.length === 0) return null;

  const diffObj = DIFFICULTIES[state.currentDifficulty];
  const range = diffObj.tiers[chosenTierName] || [0, 8];

  const startIdx = Math.min(range[0], Math.max(0, sourceCatalog.length - 1));
  const endIdx = Math.min(range[1], sourceCatalog.length);
  let slice = sourceCatalog.slice(startIdx, endIdx);
  if (slice.length === 0) slice = sourceCatalog;

  const unplayedSlice = slice.filter(s => !state.playedTrackIds.has(s.trackId));
  const finalPool = unplayedSlice.length > 0 ? unplayedSlice : slice;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

export function getCandidatePool() {
  const isAllGenres = state.selectedGenres.has("all") || state.selectedGenres.size === 0;
  const isAllDecades = state.selectedDecades.has("all") || state.selectedDecades.size === 0;
  const allowedTiers = Object.keys(DIFFICULTIES[state.currentDifficulty].tiers);

  const filterByCriteria = (restrictToDifficultyTiers) =>
    ARTISTS_DB.filter(artist => {
      if (restrictToDifficultyTiers && !allowedTiers.includes(artist.tier)) return false;
      const genreOk = isAllGenres || artist.genres.some(g => state.selectedGenres.has(g));
      const decadeOk = isAllDecades || artist.decades.some(d => state.selectedDecades.has(d));
      return genreOk && decadeOk;
    });

  const primaryPool = filterByCriteria(true);
  return primaryPool.length > 0 ? primaryPool : filterByCriteria(false);
}
