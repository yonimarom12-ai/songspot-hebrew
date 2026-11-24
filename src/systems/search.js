import { dom } from "../dom.js?v=20261124c";
import { state } from "../state.js?v=20261124c";
import { normalizeHebrew, normalizeHebrewFuzzy, getSongKey } from "../utils/text.js?v=20261124c";
import { updateSearchBarProximityFeedback } from "./feedback.js?v=20261124c";

export function updateSubmitButtonVisibility() {
  const hasTyped = dom.guessInput && !dom.guessInput.disabled && dom.guessInput.value.trim().length > 0;
  dom.submitBtn.classList.toggle("visible", hasTyped);
  dom.submitBtn.disabled = !hasTyped;
}

// מחליט באופן עקבי לכל סיבוב אילו 50% מהשירים נשארים ב"חיפוש קל" (התשובה הנכונה תמיד בפנים, אך מוצגת רק אם הטקסט שהוקלד מתאים לה)
export function isSongAllowedInEasyMode(title, artist) {
  if (!state.currentSong) return true;
  const key = getSongKey(title, artist);
  const targetKey = getSongKey(state.currentSong.title, state.currentSong.artist);
  if (key === targetKey || normalizeHebrew(title) === normalizeHebrew(state.currentSong.title)) {
    return true;
  }
  if (!state.currentRoundEasyMask.has(key)) {
    state.currentRoundEasyMask.set(key, Math.random() < 0.5);
  }
  return state.currentRoundEasyMask.get(key);
}

export function prepareEasySearchMaskForRound() {
  state.currentRoundEasyMask.clear();
  if (!state.currentSong) return;

  const targetKey = getSongKey(state.currentSong.title, state.currentSong.artist);
  state.currentRoundEasyMask.set(targetKey, true);

  for (const [artistName, tracks] of Object.entries(state.artistCatalogCache)) {
    const otherTracks = tracks.filter(t => getSongKey(t.title, t.artist) !== targetKey);
    const shuffled = [...otherTracks].sort(() => Math.random() - 0.5);
    const isTargetArtist = normalizeHebrew(artistName) === normalizeHebrew(state.currentSong.artist);
    const keepCount = isTargetArtist
      ? Math.max(1, Math.floor(tracks.length / 2) - 1)
      : Math.ceil(tracks.length / 2);

    shuffled.forEach((t, idx) => {
      state.currentRoundEasyMask.set(getSongKey(t.title, t.artist), idx < keepCount);
    });
  }
}

export function closeSuggestionsDropdown() {
  dom.suggestionsList.style.display = "none";
  state.currentSuggestionItems = [];
  state.highlightedSuggestionIndex = -1;
}

function splitArtistParts(artistStr) {
  return String(artistStr || "")
    .split(/\s*(?:,|&|\+|feat\.?|ft\.?|×|\bעם\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}

function artistsOverlap(aStr, bStr) {
  const aParts = splitArtistParts(aStr).map(normalizeHebrew).filter(Boolean);
  const bParts = splitArtistParts(bStr).map(normalizeHebrew).filter(Boolean);
  if (!aParts.length || !bParts.length) return false;
  return aParts.some(a => bParts.some(b => a === b || (a.length >= 3 && b.includes(a)) || (b.length >= 3 && a.includes(b))));
}

function mergeArtistNames(aStr, bStr) {
  const seen = new Set();
  const out = [];
  for (const part of [...splitArtistParts(aStr), ...splitArtistParts(bStr)]) {
    const key = normalizeHebrew(part);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(part);
    }
  }
  return out.join(", ");
}

function ensureSearchIndex(song) {
  if (song._idxReady) return song;
  const nt = normalizeHebrew(song.title || "");
  const na = normalizeHebrew(song.artist || "");
  const nAlt = song.itunesTitle ? normalizeHebrew(song.itunesTitle) : "";
  const ft = normalizeHebrewFuzzy(song.title || "");
  const fa = normalizeHebrewFuzzy(song.artist || "");
  const fAlt = song.itunesTitle ? normalizeHebrewFuzzy(song.itunesTitle) : "";
  song._nt = nt;
  song._na = na;
  song._nc = `${nt} ${na}`;
  song._nAlt = nAlt;
  song._nAltC = nAlt ? `${nAlt} ${na}` : "";
  song._ft = ft;
  song._fa = fa;
  song._fc = `${ft} ${fa}`;
  song._fAlt = fAlt;
  song._idxReady = true;
  return song;
}

function dedupeAndMergeSongs(items) {
  const merged = [];
  const byTrackId = new Map();
  const byPreview = new Map();
  const byNormTitle = new Map(); // O(N) bucket lookup instead of O(N^2)!

  for (const raw of items) {
    if (!raw || !raw.title) continue;
    const normTitle = raw._nt || normalizeHebrew(raw.title);
    let existing = null;

    if (raw.trackId && byTrackId.has(String(raw.trackId))) {
      existing = byTrackId.get(String(raw.trackId));
    } else if (raw.previewUrl && byPreview.has(raw.previewUrl)) {
      existing = byPreview.get(raw.previewUrl);
    } else {
      const bucket = byNormTitle.get(normTitle);
      if (bucket) {
        existing = bucket.find(m => artistsOverlap(m.artist, raw.artist)) || null;
      }
    }

    if (existing) {
      existing.artist = mergeArtistNames(existing.artist, raw.artist);
      if (!existing.trackId && raw.trackId) {
        existing.trackId = raw.trackId;
        byTrackId.set(String(raw.trackId), existing);
      }
      if (!existing.previewUrl && raw.previewUrl) {
        existing.previewUrl = raw.previewUrl;
        byPreview.set(raw.previewUrl, existing);
      }
    } else {
      const clone = { ...raw, _nt: normTitle };
      merged.push(clone);
      if (clone.trackId) byTrackId.set(String(clone.trackId), clone);
      if (clone.previewUrl) byPreview.set(clone.previewUrl, clone);
      if (!byNormTitle.has(normTitle)) byNormTitle.set(normTitle, []);
      byNormTitle.get(normTitle).push(clone);
    }
  }
  return merged;
}

export function isSongAlreadyGuessed(item) {
  if (!item || !state.guessedWrongKeys || state.guessedWrongKeys.size === 0) return false;
  if (item.trackId && state.guessedWrongKeys.has(`id:${item.trackId}`)) return true;
  const fullKey = getSongKey(item.title, item.artist || "");
  if (state.guessedWrongKeys.has(fullKey)) return true;
  // בדיקה גם מול חלקי אמנים (במקרה של שיר עם כמה זמרים מאוחדים)
  for (const part of splitArtistParts(item.artist || "")) {
    if (state.guessedWrongKeys.has(getSongKey(item.title, part))) return true;
  }
  return false;
}

export function selectSuggestionItem(item) {
  if (!item || isSongAlreadyGuessed(item)) return;
  dom.guessInput.value = `${item.title} - ${item.artist}`;
  dom.guessInput.dataset.selectedTitle = item.title;
  dom.guessInput.dataset.selectedArtist = item.artist || "";
  if (item.trackId) dom.guessInput.dataset.selectedTrackId = String(item.trackId);
  else delete dom.guessInput.dataset.selectedTrackId;
  updateSubmitButtonVisibility();
  updateSearchBarProximityFeedback(item.title);
  closeSuggestionsDropdown();
}

export function updateSuggestionHighlight() {
  const rows = dom.suggestionsList.querySelectorAll(".suggestion-row");
  rows.forEach((row, idx) => {
    const isHighlighted = idx === state.highlightedSuggestionIndex;
    row.classList.toggle("highlighted", isHighlighted);
    row.classList.toggle("kb-active", isHighlighted);
    if (isHighlighted) {
      row.scrollIntoView({ block: "nearest" });
    }
  });
}

export function renderSuggestions(items) {
  dom.suggestionsList.innerHTML = "";
  const cleanItems = dedupeAndMergeSongs(items || []);
  state.currentSuggestionItems = cleanItems;
  state.highlightedSuggestionIndex = -1;

  if (state.currentSuggestionItems.length === 0) {
    closeSuggestionsDropdown();
    return;
  }

  state.currentSuggestionItems.forEach((item, idx) => {
    const alreadyGuessed = isSongAlreadyGuessed(item);
    const div = document.createElement("div");
    div.className = `suggestion-row${alreadyGuessed ? " is-already-guessed" : ""}`;
    if (alreadyGuessed) div.setAttribute("aria-disabled", "true");

    const titleSpan = document.createElement("span");
    titleSpan.className = "suggestion-title";
    titleSpan.textContent = item.title;

    const artistSpan = document.createElement("span");
    artistSpan.className = "suggestion-artist";
    artistSpan.textContent = item.artist;

    div.append(titleSpan, artistSpan);

    if (alreadyGuessed) {
      const tag = document.createElement("span");
      tag.className = "suggestion-guessed-tag";
      tag.textContent = "השיר כבר נוחש";
      div.appendChild(tag);
    } else {
      div.addEventListener("mouseenter", () => {
        state.highlightedSuggestionIndex = idx;
        const rows = dom.suggestionsList.querySelectorAll(".suggestion-row");
        rows.forEach((r, i) => r.classList.toggle("highlighted", i === idx));
      });

      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
      });

      div.addEventListener("click", () => {
        selectSuggestionItem(item);
      });
    }
    dom.suggestionsList.appendChild(div);
  });

  dom.suggestionsList.style.display = "block";
}

function scoreIndexedSong(song, normVal, fuzzyVal, queryWords, fuzzyWords) {
  const s = ensureSearchIndex(song);
  let best = 0;

  if (s._nt === normVal) return 100;
  if (s._nt.startsWith(normVal)) best = 85;
  else if (s._nt.includes(normVal)) best = 70;
  else if (queryWords.length >= 2 && queryWords.every(w => s._nc.includes(w))) best = 65;
  else if (s._na.startsWith(normVal)) best = 55;
  else if (s._na.includes(normVal)) best = 45;

  if (best < 70 && s._nAlt) {
    if (s._nAlt === normVal) return 95;
    if (s._nAlt.startsWith(normVal)) best = Math.max(best, 80);
    else if (s._nAlt.includes(normVal)) best = Math.max(best, 68);
    else if (queryWords.length >= 2 && queryWords.every(w => s._nAltC.includes(w))) best = Math.max(best, 62);
  }

  if (best === 0 && fuzzyVal.length >= 2) {
    if (s._ft === fuzzyVal) best = 75;
    else if (s._ft.startsWith(fuzzyVal)) best = 60;
    else if (s._ft.includes(fuzzyVal)) best = 40;
    else if (s._fa.includes(fuzzyVal)) best = 32;
    else if (s._fAlt && s._fAlt.includes(fuzzyVal)) best = 38;
    else if (fuzzyWords.length >= 2 && fuzzyWords.every(w => s._fc.includes(w))) best = 50;
  }

  return best;
}

function ensureCurrentSongInList(list, normVal, fuzzyVal, queryWords, fuzzyWords, limit) {
  if (!state.currentSong) return list;
  const score = scoreIndexedSong(state.currentSong, normVal, fuzzyVal, queryWords, fuzzyWords);
  if (score <= 0) return list;

  const curTitle = state.currentSong.title || "";
  const curArtist = state.currentSong.artist || "";
  const curNormTitle = state.currentSong._nt || normalizeHebrew(curTitle);
  const targetIdx = list.findIndex(c =>
    (c.trackId && state.currentSong.trackId && String(c.trackId) === String(state.currentSong.trackId)) ||
    ((c._nt || normalizeHebrew(c.title)) === curNormTitle && artistsOverlap(c.artist, curArtist))
  );
  if (targetIdx === -1) {
    const insertPos = Math.floor(Math.random() * Math.min(5, list.length + 1));
    list.splice(insertPos, 0, {
      title: curTitle,
      artist: curArtist,
      trackId: state.currentSong.trackId,
      previewUrl: state.currentSong.previewUrl,
      _nt: curNormTitle
    });
  } else if (targetIdx >= limit) {
    const [targetItem] = list.splice(targetIdx, 1);
    const insertPos = Math.floor(Math.random() * Math.min(5, list.length + 1));
    list.splice(insertPos, 0, targetItem);
  }
  return list;
}

function runInstantCatalogSearch(val) {
  const normalizedVal = normalizeHebrew(val);
  const fuzzyVal = normalizeHebrewFuzzy(val);
  if (!normalizedVal) {
    closeSuggestionsDropdown();
    return;
  }

  const queryWords = normalizedVal.split(/\s+/).filter(Boolean);
  const fuzzyWords = queryWords.length >= 2 ? queryWords.map(w => normalizeHebrewFuzzy(w)).filter(Boolean) : [];
  const MAX_RESULTS = 12;

  // איסוף מהיר (<1ms) עם אינדקס טרום-מחושב + חיתוך ל-40 המובילים בלבד לפני איחוד אמנים
  const scoredLocal = [];
  for (const s of state.discoveredSongsMap.values()) {
    if (state.easySearchFiftyActive && !isSongAllowedInEasyMode(s.title, s.artist)) continue;
    const score = scoreIndexedSong(s, normalizedVal, fuzzyVal, queryWords, fuzzyWords);
    if (score > 0) scoredLocal.push({ item: s, score });
  }
  scoredLocal.sort((a, b) => b.score - a.score);

  const topCandidates = scoredLocal.slice(0, 40).map(x => x.item);
  const mergedLocal = dedupeAndMergeSongs(topCandidates);
  ensureCurrentSongInList(mergedLocal, normalizedVal, fuzzyVal, queryWords, fuzzyWords, MAX_RESULTS);
  renderSuggestions(mergedLocal.slice(0, MAX_RESULTS));
}

export function triggerSearchForCurrentInput() {
  const val = dom.guessInput.value.trim();
  clearTimeout(state.searchDebounce);

  if (val.length < 1) {
    closeSuggestionsDropdown();
    return;
  }

  // השהייה זעירה (45ms) כדי שהמקלדת במובייל ובמחשב תגיב בצורה חלקה לחלוטין ללא שום תקיעה!
  state.searchDebounce = setTimeout(() => {
    const latest = dom.guessInput.value.trim();
    if (latest.length < 1) {
      closeSuggestionsDropdown();
      return;
    }
    runInstantCatalogSearch(latest);
  }, 45);
}

export function initSearchListeners({ onSubmitGuess }) {
  dom.guessInput.addEventListener("input", () => {
    delete dom.guessInput.dataset.selectedTitle;
    delete dom.guessInput.dataset.selectedArtist;
    delete dom.guessInput.dataset.selectedTrackId;

    const val = dom.guessInput.value.trim();
    updateSubmitButtonVisibility();
    updateSearchBarProximityFeedback(val);
    triggerSearchForCurrentInput();
  });

  // ניווט מקלדת מלא בתיבת החיפוש (ArrowDown, ArrowUp, Enter, Escape)
  dom.guessInput.addEventListener("keydown", (e) => {
    const isDropdownOpen = dom.suggestionsList.style.display === "block" && state.currentSuggestionItems.length > 0;

    if (e.key === "ArrowDown" && isDropdownOpen) {
      e.preventDefault();
      state.highlightedSuggestionIndex = (state.highlightedSuggestionIndex + 1) % state.currentSuggestionItems.length;
      updateSuggestionHighlight();
      return;
    }

    if (e.key === "ArrowUp" && isDropdownOpen) {
      e.preventDefault();
      state.highlightedSuggestionIndex = (state.highlightedSuggestionIndex - 1 + state.currentSuggestionItems.length) % state.currentSuggestionItems.length;
      updateSuggestionHighlight();
      return;
    }

    if (e.key === "Escape" && isDropdownOpen) {
      e.preventDefault();
      closeSuggestionsDropdown();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (isDropdownOpen && state.highlightedSuggestionIndex >= 0) {
        selectSuggestionItem(state.currentSuggestionItems[state.highlightedSuggestionIndex]);
      } else if (dom.guessInput.value.trim().length > 0) {
        onSubmitGuess();
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-box")) {
      closeSuggestionsDropdown();
    }
  });
}
