import { ARTISTS_DB } from "../data/artists.js?v=20261122s";
import { DIFFICULTIES } from "../data/config.js?v=20261122s";
import { state, isIOS } from "../state.js?v=20261122s";
import { cleanTrackTitle, normalizeHebrew } from "../utils/text.js?v=20261122s";
import { safeStorageGet, safeStorageSet, safeStorageRemove } from "./storage.js?v=20261122s";

const BANNED_TRACK_WORDS = [
  "karaoke", "קריוקי", "instrumental", "אינסטרומנטלי", "אינסטרומנטל",
  "נעימה", "remix", "רמיקס", "live", "הופעה", "אקפלה", "intro", "סקיט"
];

export function fetchItunesJsonp(url, timeoutMs = 5500) {
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

async function fetchViaCorsProxyIo(url, timeoutMs = 4500) {
  const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
  return await fetchJsonWithTimeout(proxyUrl, timeoutMs);
}

async function fetchViaCodeTabs(url, timeoutMs = 4500) {
  const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
  return await fetchJsonWithTimeout(proxyUrl, timeoutMs);
}

async function fetchViaAllOriginsRaw(url, timeoutMs = 5500) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  return await fetchJsonWithTimeout(proxyUrl, timeoutMs);
}

async function fetchViaAllOriginsGet(url, timeoutMs = 5500) {
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  const wrapper = await fetchJsonWithTimeout(proxyUrl, timeoutMs);
  if (wrapper && typeof wrapper.contents === "string") {
    return JSON.parse(wrapper.contents);
  }
  throw new Error("Invalid allorigins wrapper");
}

// ניקוי מפתחות ישנים
safeStorageRemove("songspot_itunes_transport_v1");
safeStorageRemove("songspot_itunes_transport_v2");

const TRANSPORTS = {
  fetch: (url, t) => fetchJsonWithTimeout(url, Math.min(t, 6000)),
  jsonp: (url, t) => fetchItunesJsonp(url, Math.min(t, 7000)),
  corsproxy: (url, t) => fetchViaCorsProxyIo(url, Math.min(t, 6000)),
  codetabs: (url, t) => fetchViaCodeTabs(url, Math.min(t, 6000)),
  allorigins: (url, t) => fetchViaAllOriginsRaw(url, Math.min(t, 7000)),
  allorigins_get: (url, t) => fetchViaAllOriginsGet(url, Math.min(t, 7000))
};

function isValidPayload(data) {
  return data && Array.isArray(data.results);
}

// מריץ כמה ערוצים במקביל ומחזיר מיד את הראשון שמחזיר תשובה תקינה
function raceTransports(names, url, timeoutMs) {
  return new Promise((resolve, reject) => {
    let pending = names.length;
    let settled = false;
    let lastErr = null;
    if (pending === 0) return reject(new Error("no transports"));

    for (const name of names) {
      TRANSPORTS[name](url, timeoutMs)
        .then(data => {
          if (isValidPayload(data)) {
            if (!settled) {
              settled = true;
              resolve(data);
            }
          } else {
            throw new Error("bad payload");
          }
        })
        .catch(err => {
          lastErr = err;
          pending--;
          if (pending === 0 && !settled) {
            settled = true;
            reject(lastErr || new Error("all transports failed"));
          }
        });
    }
  });
}

// מונע שליחה כפולה של אותה בקשה במקביל
const inFlightRequests = new Map();
// זוכר אם ה-Edge Proxy של Cloudflare (/api/itunes) זמין ולא מוגבל קצב (429)
let edgeProxyAvailable = typeof window !== "undefined" && window.location.protocol.startsWith("http");
let edgeProxyBlockedUntil = 0;

async function tryCloudflareEdgeProxy(itunesUrl, timeoutMs) {
  if (!edgeProxyAvailable || Date.now() < edgeProxyBlockedUntil) return null;
  try {
    const parsed = new URL(itunesUrl);
    if (parsed.hostname !== "itunes.apple.com" || parsed.pathname !== "/search") return null;
    const proxyUrl = `/api/itunes${parsed.search}`;
    const hasAbort = typeof AbortController !== "undefined";
    const controller = hasAbort ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), Math.min(timeoutMs, 3500)) : null;
    try {
      const res = await fetch(proxyUrl, controller ? { signal: controller.signal } : undefined);
      if (res.status === 404 || res.status === 405) {
        edgeProxyAvailable = false;
        return null;
      }
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        // Apple חסם זמנית את ה-IP המשותף של Cloudflare -> מדלגים עליו ל-2 דקות
        edgeProxyBlockedUntil = Date.now() + 120000;
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return isValidPayload(data) ? data : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    return null;
  }
}

export async function fetchItunesData(url, timeoutMs = 7500) {
  if (inFlightRequests.has(url)) {
    return await inFlightRequests.get(url);
  }

  const reqPromise = (async () => {
    // 1. עדיפות ראשונה: פנייה ישירה מהמכשיר של המשתמש ל-iTunes (JSONP + fetch)
    //    לכל משתמש יש IP אישי ולכן Apple לא מחזיר 429, ועובד חלק גם ב-iOS Safari ובמובייל!
    const directTransports = isIOS ? ["jsonp", "fetch"] : ["fetch", "jsonp"];
    try {
      const directData = await raceTransports(directTransports, url, timeoutMs);
      if (isValidPayload(directData)) return directData;
    } catch (e) { }

    // 2. גיבוי א': Edge Proxy של Cloudflare (במקרה שהרשת של המשתמש חוסמת ישירות את itunes.apple.com)
    const edgeData = await tryCloudflareEdgeProxy(url, timeoutMs);
    if (edgeData) return edgeData;

    // 3. גיבוי ב': שרתי Proxy ציבוריים במקביל
    return await raceTransports(["corsproxy", "codetabs", "allorigins", "allorigins_get"], url, timeoutMs);
  })();

  inFlightRequests.set(url, reqPromise);
  try {
    return await reqPromise;
  } finally {
    inFlightRequests.delete(url);
  }
}

// ===== מטמון קטלוגים מקומי בזיכרון + localStorage (מונע JSON.parse חוזר שגורם לתקיעות במובייל) =====
const CATALOG_CACHE_KEY = "songspot_catalog_cache_v1";
const CATALOG_CACHE_MAX = 32;
const CATALOG_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
let persistedCatalogsMap = null;

function getPersistedMap() {
  if (persistedCatalogsMap) return persistedCatalogsMap;
  try {
    const parsed = JSON.parse(safeStorageGet(CATALOG_CACHE_KEY) || "{}");
    persistedCatalogsMap = parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    persistedCatalogsMap = {};
  }
  return persistedCatalogsMap;
}

let seedCatalogPromise = null;
let seedCatalogLoaded = false;

// טוען קטלוג שירים ישראליים מובנה מאותו דומיין (0 בעיות CORS/429 באייפון ובספארי!)
export function ensureSeedCatalogLoaded() {
  if (seedCatalogLoaded) return Promise.resolve(true);
  if (seedCatalogPromise) return seedCatalogPromise;
  seedCatalogPromise = fetch("assets/catalog-seed.json?v=20261122s")
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (data && typeof data === "object") {
        for (const [artistName, tracks] of Object.entries(data)) {
          if (!Array.isArray(tracks) || tracks.length === 0) continue;
          if (!state.artistCatalogCache[artistName]?.length) {
            state.artistCatalogCache[artistName] = tracks;
          }
          for (const s of tracks) {
            state.discoveredSongsMap.set(`${normalizeHebrew(s.title)}_${normalizeHebrew(artistName)}`, s);
          }
        }
        seedCatalogLoaded = true;
        return true;
      }
      return false;
    })
    .catch(() => false);
  return seedCatalogPromise;
}

export function hydratePersistedCatalogs() {
  const all = getPersistedMap();
  const now = Date.now();
  for (const [artistName, entry] of Object.entries(all)) {
    if (!entry || !Array.isArray(entry.tracks) || entry.tracks.length === 0) continue;
    if (now - (entry.ts || 0) > CATALOG_CACHE_TTL_MS) continue;
    if (!state.artistCatalogCache[artistName]?.length) {
      state.artistCatalogCache[artistName] = entry.tracks;
    }
    for (const s of entry.tracks) {
      state.discoveredSongsMap.set(`${normalizeHebrew(s.title)}_${normalizeHebrew(artistName)}`, s);
    }
  }
}

function getPersistedCatalog(artistName) {
  const all = getPersistedMap();
  const entry = all[artistName];
  if (!entry || !Array.isArray(entry.tracks) || Date.now() - (entry.ts || 0) > CATALOG_CACHE_TTL_MS) {
    return null;
  }
  return entry.tracks;
}

function persistCatalog(artistName, tracks) {
  const all = getPersistedMap();
  // שומר גרסה קומפקטית (עד 45 שירים לאמן) כדי לא להכביד על localStorage במובייל
  const compactTracks = tracks.slice(0, 45).map(s => ({
    trackId: s.trackId,
    title: s.title,
    artist: s.artist,
    releaseYear: s.releaseYear,
    previewUrl: s.previewUrl,
    artwork: s.artwork
  }));
  all[artistName] = { ts: Date.now(), tracks: compactTracks };
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

  const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=50&term=${encodeURIComponent(artistName)}`;
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

// מעדיף שירים שמעולם לא הושמעו; אם כולם הושמעו — נותן עדיפות נמוכה מאוד לשירים שהושמעו לאחרונה
export function pickWithRecencyPriority(tracks) {
  if (!tracks || tracks.length === 0) return null;
  const unplayed = tracks.filter(s => !state.playedTrackIds.has(s.trackId));
  if (unplayed.length > 0) {
    return unplayed[Math.floor(Math.random() * unplayed.length)];
  }

  // מיון לפי סדר השמעה (הישנים ביותר ראשונים, האחרונים שהושמעו בסוף)
  const historyOrder = Array.from(state.playedTrackIds);
  const recencyMap = new Map();
  historyOrder.forEach((id, idx) => recencyMap.set(id, idx));

  const sortedByOldest = [...tracks].sort(
    (a, b) => (recencyMap.get(a.trackId) ?? -1) - (recencyMap.get(b.trackId) ?? -1)
  );
  // בוחר אקראית מתוך ה-35% הישנים ביותר כדי ששירים אחרונים כמעט לא יחזרו
  const oldestPoolSize = Math.max(1, Math.ceil(sortedByOldest.length * 0.35));
  const oldestPool = sortedByOldest.slice(0, oldestPoolSize);
  return oldestPool[Math.floor(Math.random() * oldestPool.length)];
}

// חישוב חכם של חלון השירים לרמת קושי (מונע מצב שברמת בלתי אפשרי נותר רק שיר 1 כשלאמן יש פחות מ-32 שירים)
function getTierSlice(tracks, range) {
  const len = tracks.length;
  if (len === 0) return [];
  const minSliceSize = Math.min(len, 6);
  let startIdx = Math.min(range[0], Math.max(0, len - minSliceSize));
  let endIdx = Math.min(range[1], len);
  if (endIdx - startIdx < minSliceSize) {
    startIdx = Math.max(0, endIdx - minSliceSize);
  }
  const slice = tracks.slice(startIdx, endIdx);
  return slice.length > 0 ? slice : tracks;
}

// בוחר מיד שיר רענן (שעוד לא הושמע) מתוך אמנים שכבר טעונים במטמון עבור רמת הקושי הנוכחית
export function pickFreshSongFromCachedPool(candidatePool) {
  const diffObj = DIFFICULTIES[state.currentDifficulty];
  const freshNonRecent = [];
  const freshNotLast = [];

  for (const artist of candidatePool) {
    // מונע לחלוטין שני שירים של אותו זמר ברצף
    if (state.lastPlayedArtist && artist.name === state.lastPlayedArtist) continue;

    const catalog = state.artistCatalogCache[artist.name];
    if (!catalog || catalog.length === 0) continue;

    const decadeFiltered = catalog.filter(s => doesYearMatchSelectedDecades(s.releaseYear));
    if (decadeFiltered.length === 0) continue;

    const range = diffObj.tiers[artist.tier] || [0, 8];
    const slice = getTierSlice(decadeFiltered, range);

    const unplayed = slice.filter(s => !state.playedTrackIds.has(s.trackId));
    if (unplayed.length > 0) {
      if (!state.recentArtists.includes(artist.name)) {
        freshNonRecent.push(unplayed);
      } else {
        freshNotLast.push(unplayed);
      }
    }
  }

  const chosenBucket = freshNonRecent.length > 0 ? freshNonRecent : freshNotLast;
  if (chosenBucket.length === 0) return null;
  const chosenArtistSongs = chosenBucket[Math.floor(Math.random() * chosenBucket.length)];
  return chosenArtistSongs[Math.floor(Math.random() * chosenArtistSongs.length)];
}

// חימום רקע עדין (אמן אחד בלבד בכל פעם עם מרווח מינימלי כדי לעולם לא להיחסם ע"י מגבלת הקצב של iTunes)
let warmingInProgress = false;
let lastWarmAt = 0;

export async function warmCatalogCache() {
  const now = Date.now();
  if (warmingInProgress || now - lastWarmAt < 4500) return;
  warmingInProgress = true;
  lastWarmAt = now;
  try {
    const isAllGenres = state.selectedGenres.has("all") || state.selectedGenres.size === 0;
    const isAllDecades = state.selectedDecades.has("all") || state.selectedDecades.size === 0;

    let targetArtist = null;

    // 1. מחפש קודם שכבת קושי שעדיין יש בה פחות מ-4 אמנים במטמון (מונע האטה ברמות קל ובלתי אפשרי)
    for (const tier of ["superstars", "indie_deep", "established"]) {
      const tierArtists = ARTISTS_DB.filter(artist => {
        if (artist.tier !== tier) return false;
        const genreOk = isAllGenres || artist.genres.some(g => state.selectedGenres.has(g));
        const decadeOk = isAllDecades || artist.decades.some(d => state.selectedDecades.has(d));
        return genreOk && decadeOk;
      });
      const cachedCount = tierArtists.filter(a => state.artistCatalogCache[a.name]?.length > 0).length;
      if (cachedCount < 4) {
        const uncached = tierArtists.filter(a => !(state.artistCatalogCache[a.name]?.length > 0));
        if (uncached.length > 0) {
          targetArtist = uncached[Math.floor(Math.random() * uncached.length)];
          break;
        }
      }
    }

    // 2. אם לכל השכבות כבר יש 2+ אמנים, מוסיף אמן חדש לרמה הנוכחית לגיוון
    if (!targetArtist) {
      const uncachedCurrent = getCandidatePool().filter(a => !(state.artistCatalogCache[a.name]?.length > 0));
      if (uncachedCurrent.length > 0) {
        targetArtist = uncachedCurrent[Math.floor(Math.random() * uncachedCurrent.length)];
      }
    }

    if (targetArtist) {
      await getArtistCatalog(targetArtist.name);
    }
  } catch (e) {
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
  const slice = getTierSlice(sourceCatalog, range);

  return pickWithRecencyPriority(slice);
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
