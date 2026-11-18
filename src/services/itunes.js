import { ARTISTS_DB } from "../data/artists.js";
import { DIFFICULTIES } from "../data/config.js";
import { state } from "../state.js";
import { cleanTrackTitle, normalizeHebrew } from "../utils/text.js";

const BANNED_TRACK_WORDS = [
  "karaoke", "קריוקי", "instrumental", "אינסטרומנטלי", "אינסטרומנטל",
  "נעימה", "remix", "רמיקס", "live", "הופעה", "אקפלה", "intro", "סקיט"
];

export function fetchItunesJsonp(url, timeoutMs = 9000) {
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

export async function fetchItunesData(url, timeoutMs = 9000) {
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
  } catch (err) {
    return await fetchItunesJsonp(url, timeoutMs);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

function findDominantArtistId(results, expectedArtist) {
  const normExpected = normalizeHebrew(expectedArtist);
  const idCounts = new Map();
  let matchedArtistId = null;

  for (let i = 0; i < Math.min(results.length, 25); i++) {
    const t = results[i];
    if (!t || !t.artistId || !t.artistName) continue;
    const normTrackArtist = normalizeHebrew(t.artistName);
    if (normTrackArtist && (normTrackArtist.includes(normExpected) || normExpected.includes(normTrackArtist))) {
      matchedArtistId = t.artistId;
      break;
    }
    if (isHebrewSongTitle(t.trackName)) {
      idCounts.set(t.artistId, (idCounts.get(t.artistId) || 0) + 1);
    }
  }

  if (matchedArtistId) return matchedArtistId;

  let bestId = null;
  let bestCount = 0;
  for (const [id, count] of idCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  return bestCount >= 2 ? bestId : null;
}

export function isValidStudioTrack(track, expectedArtist, dominantArtistId = null) {
  if (!track || !track.previewUrl || !track.trackName || !track.artistName) return false;
  const lowerTitle = track.trackName.toLowerCase();
  if (BANNED_TRACK_WORDS.some(w => lowerTitle.includes(w))) return false;

  // חובה: שם השיר חייב להיות בעברית
  if (!isHebrewSongTitle(track.trackName)) return false;

  const normArtist = normalizeHebrew(expectedArtist);
  const normTrackArtist = normalizeHebrew(track.artistName);
  const isNameMatch = normTrackArtist.includes(normArtist) || normArtist.includes(normTrackArtist);
  const isIdMatch = Boolean(dominantArtistId && track.artistId === dominantArtistId);

  return isNameMatch || isIdMatch;
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

function extractTracksFromResults(results, artistName, dominantArtistId) {
  const uniqueTracks = [];
  const seenTitles = new Set();

  for (const t of results) {
    if (!isValidStudioTrack(t, artistName, dominantArtistId)) continue;
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

  const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=80&term=${encodeURIComponent(artistName)}`;
  const data = await fetchItunesData(url);

  let uniqueTracks = [];
  if (data && Array.isArray(data.results) && data.results.length > 0) {
    const dominantArtistId = findDominantArtistId(data.results, artistName);
    uniqueTracks = extractTracksFromResults(data.results, artistName, dominantArtistId);
  }

  if (uniqueTracks.length > 0) {
    state.artistCatalogCache[artistName] = uniqueTracks;
  }
  return uniqueTracks;
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
