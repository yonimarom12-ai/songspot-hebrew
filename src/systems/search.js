import { dom } from "../dom.js?v=20261122m";
import { state } from "../state.js?v=20261122m";
import { cleanTrackTitle, normalizeHebrew, normalizeHebrewFuzzy, getSongKey } from "../utils/text.js?v=20261122m";
import { fetchItunesData } from "../services/itunes.js?v=20261122m";
import { updateSearchBarProximityFeedback } from "./feedback.js?v=20261122m";

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

export function selectSuggestionItem(item) {
  if (!item) return;
  dom.guessInput.value = `${item.title} - ${item.artist}`;
  dom.guessInput.dataset.selectedTitle = item.title;
  dom.guessInput.dataset.selectedArtist = item.artist;
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
  state.currentSuggestionItems = items || [];
  state.highlightedSuggestionIndex = -1;

  if (state.currentSuggestionItems.length === 0) {
    closeSuggestionsDropdown();
    return;
  }

  state.currentSuggestionItems.forEach((item, idx) => {
    const div = document.createElement("div");
    div.className = "suggestion-row";

    const titleSpan = document.createElement("span");
    titleSpan.className = "suggestion-title";
    titleSpan.textContent = item.title;

    const artistSpan = document.createElement("span");
    artistSpan.className = "suggestion-artist";
    artistSpan.textContent = item.artist;

    div.append(titleSpan, artistSpan);

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
    dom.suggestionsList.appendChild(div);
  });

  dom.suggestionsList.style.display = "block";
}

function scoreSongMatch(title, artist, normVal, fuzzyVal, queryWords) {
  const normTitle = normalizeHebrew(title);
  const normArtist = normalizeHebrew(artist);
  const combinedNorm = `${normTitle} ${normArtist}`;
  if (normTitle === normVal) return 100;
  if (normTitle.startsWith(normVal)) return 85;
  if (normTitle.includes(normVal)) return 70;
  if (queryWords.length >= 2 && queryWords.every(w => combinedNorm.includes(w))) return 65;
  if (normArtist.startsWith(normVal)) return 55;
  if (normArtist.includes(normVal)) return 45;
  if (fuzzyVal.length >= 2) {
    const fuzzyTitle = normalizeHebrewFuzzy(title);
    const fuzzyArtist = normalizeHebrewFuzzy(artist);
    const fuzzyCombined = `${fuzzyTitle} ${fuzzyArtist}`;
    if (fuzzyTitle === fuzzyVal) return 75;
    if (fuzzyTitle.startsWith(fuzzyVal)) return 60;
    if (fuzzyTitle.includes(fuzzyVal)) return 40;
    if (fuzzyArtist.includes(fuzzyVal)) return 32;
    const fuzzyWords = queryWords.map(w => normalizeHebrewFuzzy(w)).filter(Boolean);
    if (fuzzyWords.length >= 2 && fuzzyWords.every(w => fuzzyCombined.includes(w))) return 50;
  }
  return 0;
}

async function fetchDeezerTrackSuggestions(query) {
  const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");
  if (!isHttp) return [];
  try {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 3500) : null;
    const res = await fetch(`/api/deezer?type=track&limit=20&q=${encodeURIComponent(query)}`, controller ? { signal: controller.signal } : undefined);
    if (timer) clearTimeout(timer);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data) ? json.data : [];
  } catch (e) {
    return [];
  }
}

function ensureCurrentSongInList(list, normVal, fuzzyVal, queryWords, limit) {
  if (!state.currentSong) return list;
  const curTitle = state.currentSong.title || "";
  const curAltTitle = state.currentSong.itunesTitle || "";
  const curArtist = state.currentSong.artist || "";

  const scoreMain = scoreSongMatch(curTitle, curArtist, normVal, fuzzyVal, queryWords);
  const scoreAlt = curAltTitle ? scoreSongMatch(curAltTitle, curArtist, normVal, fuzzyVal, queryWords) : 0;
  if (scoreMain <= 0 && scoreAlt <= 0) return list;

  const curNormTitle = normalizeHebrew(curTitle);
  const targetIdx = list.findIndex(c => normalizeHebrew(c.title) === curNormTitle);
  if (targetIdx === -1) {
    const insertPos = Math.floor(Math.random() * Math.min(5, list.length + 1));
    list.splice(insertPos, 0, { title: curTitle, artist: curArtist });
  } else if (targetIdx >= limit) {
    const [targetItem] = list.splice(targetIdx, 1);
    const insertPos = Math.floor(Math.random() * Math.min(5, list.length + 1));
    list.splice(insertPos, 0, targetItem);
  }
  return list;
}

export function triggerSearchForCurrentInput() {
  const val = dom.guessInput.value.trim();
  clearTimeout(state.searchDebounce);

  if (val.length < 1) {
    closeSuggestionsDropdown();
    return;
  }

  const normalizedVal = normalizeHebrew(val);
  const fuzzyVal = normalizeHebrewFuzzy(val);
  if (!normalizedVal) {
    closeSuggestionsDropdown();
    return;
  }

  const queryWords = normalizedVal.split(/\s+/).filter(Boolean);
  const MAX_RESULTS = 12;

  const scoredLocal = [];
  for (const s of state.discoveredSongsMap.values()) {
    if (state.easySearchFiftyActive && !isSongAllowedInEasyMode(s.title, s.artist)) continue;
    const score = scoreSongMatch(s.title, s.artist, normalizedVal, fuzzyVal, queryWords);
    if (score > 0) scoredLocal.push({ item: s, score });
  }
  scoredLocal.sort((a, b) => b.score - a.score);
  const localMatches = scoredLocal.map(x => x.item);

  ensureCurrentSongInList(localMatches, normalizedVal, fuzzyVal, queryWords, MAX_RESULTS);
  renderSuggestions(localMatches.slice(0, MAX_RESULTS));

  if (val.length >= 2) {
    state.searchDebounce = setTimeout(() => {
      const combined = [...localMatches];
      const seen = new Set(combined.map(c => `${normalizeHebrew(c.title)}|${normalizeHebrew(c.artist)}`));

      const appendRemote = (rawTitle, rawArtist) => {
        const cleanTitle = cleanTrackTitle(rawTitle || "");
        const artistName = (rawArtist || "").trim();
        if (!cleanTitle) return;
        const score = scoreSongMatch(cleanTitle, artistName, normalizedVal, fuzzyVal, queryWords);
        if (score <= 0) return;
        if (state.easySearchFiftyActive && !isSongAllowedInEasyMode(cleanTitle, artistName)) return;
        const key = `${normalizeHebrew(cleanTitle)}|${normalizeHebrew(artistName)}`;
        if (seen.has(key)) return;
        seen.add(key);
        combined.push({ title: cleanTitle, artist: artistName });
      };

      const commit = () => {
        if (dom.guessInput.value.trim() !== val) return;
        ensureCurrentSongInList(combined, normalizedVal, fuzzyVal, queryWords, MAX_RESULTS);
        renderSuggestions(combined.slice(0, MAX_RESULTS));
      };

      // 1. Deezer proxy מהיר (~200ms) — מוצג מיד בלי לחכות ל-iTunes!
      fetchDeezerTrackSuggestions(val).then((dzList) => {
        if (dom.guessInput.value.trim() !== val || !dzList.length) return;
        dzList.forEach(r => appendRemote(r.title, r.artist?.name));
        commit();
      }).catch(() => { });

      // 2. iTunes IL במקביל — משלים שירים נוספים אם חוזר
      const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=20&term=${encodeURIComponent(val)}`;
      fetchItunesData(url, 4000).then((data) => {
        if (dom.guessInput.value.trim() !== val || !data?.results) return;
        data.results.forEach(r => appendRemote(r.trackName, r.artistName));
        commit();
      }).catch(() => { });
    }, 200);
  }
}

export function initSearchListeners({ onSubmitGuess }) {
  dom.guessInput.addEventListener("input", () => {
    delete dom.guessInput.dataset.selectedTitle;
    delete dom.guessInput.dataset.selectedArtist;

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
