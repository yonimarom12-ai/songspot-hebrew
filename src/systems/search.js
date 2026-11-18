import { dom } from "../dom.js";
import { state } from "../state.js";
import { cleanTrackTitle, normalizeHebrew, getSongKey } from "../utils/text.js";
import { fetchItunesData } from "../services/itunes.js";
import { updateSearchBarProximityFeedback } from "./feedback.js";

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

    div.addEventListener("click", () => {
      selectSuggestionItem(item);
    });
    dom.suggestionsList.appendChild(div);
  });

  dom.suggestionsList.style.display = "block";
}

export function triggerSearchForCurrentInput() {
  const val = dom.guessInput.value.trim();
  clearTimeout(state.searchDebounce);

  if (val.length < 1) {
    closeSuggestionsDropdown();
    return;
  }

  const normalizedVal = normalizeHebrew(val);
  if (!normalizedVal) {
    closeSuggestionsDropdown();
    return;
  }

  let localMatches = Array.from(state.discoveredSongsMap.values()).filter(s =>
    normalizeHebrew(s.title).includes(normalizedVal) ||
    normalizeHebrew(s.artist).includes(normalizedVal)
  );

  if (state.easySearchFiftyActive) {
    localMatches = localMatches.filter(s => isSongAllowedInEasyMode(s.title, s.artist));
  }

  renderSuggestions(localMatches.slice(0, 8));

  if (val.length >= 2) {
    state.searchDebounce = setTimeout(async () => {
      try {
        const url = `https://itunes.apple.com/search?country=IL&media=music&entity=song&limit=16&term=${encodeURIComponent(val)}`;
        const data = await fetchItunesData(url, 4000);
        if (dom.guessInput.value.trim() !== val) return;

        if (data?.results) {
          const combined = [...localMatches];
          data.results.forEach(r => {
            const cleanTitle = cleanTrackTitle(r.trackName || "");
            const artistName = r.artistName || "";
            if (!cleanTitle) return;

            const matchesQuery =
              normalizeHebrew(cleanTitle).includes(normalizedVal) ||
              normalizeHebrew(artistName).includes(normalizedVal);
            if (!matchesQuery) return;

            if (state.easySearchFiftyActive && !isSongAllowedInEasyMode(cleanTitle, artistName)) {
              return;
            }

            const exists = combined.some(c =>
              normalizeHebrew(c.title) === normalizeHebrew(cleanTitle) &&
              normalizeHebrew(c.artist) === normalizeHebrew(artistName)
            );
            if (!exists) {
              combined.push({ title: cleanTitle, artist: artistName });
            }
          });

          if (state.currentSong) {
            const targetMatchesQuery =
              normalizeHebrew(state.currentSong.title).includes(normalizedVal) ||
              normalizeHebrew(state.currentSong.artist).includes(normalizedVal);

            if (targetMatchesQuery) {
              const targetIdx = combined.findIndex(
                c => normalizeHebrew(c.title) === normalizeHebrew(state.currentSong.title)
              );
              if (targetIdx === -1) {
                const insertPos = Math.floor(Math.random() * Math.min(5, combined.length + 1));
                combined.splice(insertPos, 0, { title: state.currentSong.title, artist: state.currentSong.artist });
              } else if (targetIdx >= 8) {
                const [targetItem] = combined.splice(targetIdx, 1);
                const insertPos = Math.floor(Math.random() * Math.min(5, combined.length + 1));
                combined.splice(insertPos, 0, targetItem);
              }
            }
          }

          renderSuggestions(combined.slice(0, 8));
        }
      } catch (e) { }
    }, 250);
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
