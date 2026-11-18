import { ARTIST_BY_NAME } from "../data/artists.js";
import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js";
import { dom } from "../dom.js";
import { state } from "../state.js";
import { cleanTrackTitle, normalizeHebrew } from "../utils/text.js";
import { saveUserStats, markSongAsPlayed } from "../services/storage.js";
import {
  doesYearMatchSelectedDecades,
  getArtistCatalog,
  pickSongFromCatalog,
  getCandidatePool
} from "../services/itunes.js";
import {
  preloadAudioBufferInBackground,
  updateTimelineMarkerForStage,
  stopAudioVisuals
} from "./audio.js";
import { launchWinConfetti } from "./confetti.js";
import {
  clearSearchBarFeedback,
  updateHintsPanelVisibility,
  resetHintButtons
} from "./feedback.js";
import {
  prepareEasySearchMaskForRound,
  closeSuggestionsDropdown,
  updateSubmitButtonVisibility
} from "./search.js";
import { updateStreakDisplay } from "./profile.js";

export function setActiveDifficultyUI(level) {
  state.currentDifficulty = level;
  const diff = DIFFICULTIES[level] || DIFFICULTIES.easy;
  dom.diffButtons.forEach(b => b.classList.toggle("active", b.dataset.level === level));
  dom.streamsBadge.textContent = diff.streamsText;
  document.documentElement.style.setProperty("--level-color", diff.color);
  document.documentElement.style.setProperty("--level-glow", diff.glow);
}

export function updateSkipButtonLabel() {
  const nextIdx = state.currentAttempt + 1;
  dom.skipBtn.textContent = nextIdx < DURATIONS.length ? `דלג (+${DURATIONS[nextIdx]}ש')` : "דלג (וותר)";
}

export function resetUI() {
  state.currentAttempt = 0;
  state.audioBuffer = null;
  stopAudioVisuals(0);
  resetHintButtons();

  dom.discWrapper.classList.remove("revealed");
  dom.statusLabel.style.color = "var(--text-sub)";
  dom.durationBadge.style.display = "flex";
  if (dom.timelineMarker) dom.timelineMarker.style.display = "flex";
  updateTimelineMarkerForStage(0);
  updateSkipButtonLabel();

  dom.guessInput.value = "";
  delete dom.guessInput.dataset.selectedTitle;
  delete dom.guessInput.dataset.selectedArtist;
  clearSearchBarFeedback();
  closeSuggestionsDropdown();
  dom.guessInput.disabled = true;
  dom.submitBtn.classList.remove("visible");
  dom.submitBtn.disabled = true;
  dom.skipBtn.disabled = true;
  dom.playBtn.disabled = true;
  dom.resultBanner.style.display = "none";
  dom.levelUpNotice.style.display = "none";
  dom.retryBtn.style.display = "none";

  dom.segments.forEach((seg, i) => {
    seg.className = i === 0 ? "segment active" : "segment";
  });
}

export async function fetchRandomSong() {
  const roundId = ++state.activeFetchRoundId;
  resetUI();
  dom.statusLabel.textContent = "שולף שיר חדש מהקטלוג...";
  dom.retryBtn.style.display = "none";

  let selectedSong = null;
  const candidatePool = getCandidatePool();

  for (let attempt = 0; attempt < 9; attempt++) {
    if (roundId !== state.activeFetchRoundId || candidatePool.length === 0) break;

    const picked = candidatePool[Math.floor(Math.random() * candidatePool.length)];
    try {
      const catalog = await getArtistCatalog(picked.name);
      if (roundId !== state.activeFetchRoundId) return;

      if (catalog && catalog.length > 0) {
        selectedSong = pickSongFromCatalog(catalog, picked.tier, attempt >= 6);
        if (selectedSong) break;
      }
    } catch (err) { }
  }

  if (roundId !== state.activeFetchRoundId) return;

  if (!selectedSong && state.discoveredSongsMap.size > 0) {
    const isAllGenres = state.selectedGenres.has("all") || state.selectedGenres.size === 0;
    const allCached = Array.from(state.discoveredSongsMap.values());
    const filteredCached = allCached.filter(s => {
      const artistObj = ARTIST_BY_NAME[s.artist];
      const genreOk = isAllGenres || (artistObj && artistObj.genres.some(g => state.selectedGenres.has(g)));
      const decadeOk = doesYearMatchSelectedDecades(s.releaseYear);
      return genreOk && decadeOk;
    });
    const cachedSongs = filteredCached.length > 0 ? filteredCached : allCached;
    const unplayedCached = cachedSongs.filter(s => !state.playedTrackIds.has(s.trackId));
    const pool = unplayedCached.length > 0 ? unplayedCached : cachedSongs;
    selectedSong = pool[Math.floor(Math.random() * pool.length)];
  }

  if (!selectedSong) {
    dom.statusLabel.textContent = "לא נמצאו שירים בסינון זה או שיש שגיאת רשת. נסה שוב.";
    dom.retryBtn.style.display = "inline-block";
    return;
  }

  state.currentSong = selectedSong;
  markSongAsPlayed(state.currentSong.trackId);
  prepareEasySearchMaskForRound();

  dom.songCover.src = state.currentSong.artwork;
  state.fallbackAudio.src = state.currentSong.previewUrl;
  state.fallbackAudio.load();

  dom.statusLabel.textContent = "מוכן! לחץ על ניגון";
  dom.playBtn.disabled = false;
  dom.guessInput.disabled = false;
  dom.skipBtn.disabled = false;
  updateSubmitButtonVisibility();

  preloadAudioBufferInBackground(state.currentSong.previewUrl, roundId);
}

export function recordRoundStats(won, solvedDuration, difficultyLevel) {
  state.userStats.totalHeard = (state.userStats.totalHeard || 0) + 1;
  if (won) {
    state.userStats.totalWon = (state.userStats.totalWon || 0) + 1;
    state.userStats.currentStreak = (state.userStats.currentStreak || 0) + 1;
    if (state.userStats.currentStreak > (state.userStats.bestStreak || 0)) {
      state.userStats.bestStreak = state.userStats.currentStreak;
    }
    state.userStats.byLevel[difficultyLevel] = (state.userStats.byLevel[difficultyLevel] || 0) + 1;
    const speedKey = String(solvedDuration);
    state.userStats.bySpeed[speedKey] = (state.userStats.bySpeed[speedKey] || 0) + 1;

    if (state.currentSong) {
      state.userStats.wonSongs = state.userStats.wonSongs.filter(s => s.trackId !== state.currentSong.trackId);
      state.userStats.wonSongs.unshift({
        trackId: state.currentSong.trackId,
        title: state.currentSong.title,
        artist: state.currentSong.artist,
        artwork: state.currentSong.artwork,
        previewUrl: state.currentSong.previewUrl,
        timeSec: solvedDuration,
        level: difficultyLevel
      });
      if (state.userStats.wonSongs.length > 60) {
        state.userStats.wonSongs = state.userStats.wonSongs.slice(0, 60);
      }
    }
  } else {
    state.userStats.currentStreak = 0;
  }

  saveUserStats();
  updateStreakDisplay();
}

export function endRound(won) {
  stopAudioVisuals(won ? 100 : 0);
  closeSuggestionsDropdown();
  dom.hintsPanel.style.display = "none";
  dom.discWrapper.classList.add("revealed");
  dom.durationBadge.style.display = "none";
  if (dom.timelineMarker) dom.timelineMarker.style.display = "none";

  const solvedAtSec = DURATIONS[Math.min(state.currentAttempt, DURATIONS.length - 1)];
  recordRoundStats(won, solvedAtSec, state.currentDifficulty);

  if (won) {
    dom.segments[state.currentAttempt].classList.remove("active");
    dom.segments[state.currentAttempt].classList.add("correct");
    if (dom.playbackFill) dom.playbackFill.style.width = "100%";
    dom.statusLabel.textContent = `זיהית נכון תוך ${solvedAtSec} שניות!`;
    dom.statusLabel.style.color = "var(--spotify-green)";
    launchWinConfetti();

    const currDiffIdx = DIFFICULTY_ORDER.indexOf(state.currentDifficulty);
    if (currDiffIdx >= 0 && currDiffIdx < DIFFICULTY_ORDER.length - 1) {
      const nextDiff = DIFFICULTY_ORDER[currDiffIdx + 1];
      setActiveDifficultyUI(nextDiff);
      dom.levelUpNotice.textContent = `⬆️ עלית אוטומטית לרמת "${DIFFICULTIES[nextDiff].label}" (ניתן לשנות ידנית למעלה)`;
      dom.levelUpNotice.style.display = "inline-block";
    } else {
      dom.levelUpNotice.style.display = "none";
    }

    try {
      state.fallbackAudio.currentTime = 0;
      state.fallbackAudio.play().catch(() => { });
      dom.equalizer.classList.add("playing");
    } catch (e) { }
  } else {
    dom.statusLabel.textContent = "נגמרו הניסיונות";
    dom.statusLabel.style.color = "var(--danger)";
    dom.levelUpNotice.style.display = "none";
  }

  dom.songTitleReveal.textContent = state.currentSong.title;
  dom.songArtistReveal.textContent = state.currentSong.artist;
  dom.resultBanner.style.display = "flex";

  clearSearchBarFeedback();
  dom.guessInput.disabled = true;
  dom.submitBtn.classList.remove("visible");
  dom.submitBtn.disabled = true;
  dom.skipBtn.disabled = true;
  dom.playBtn.disabled = true;
}

export function advanceAttempt() {
  stopAudioVisuals();
  closeSuggestionsDropdown();
  dom.segments[state.currentAttempt].classList.remove("active");
  dom.segments[state.currentAttempt].classList.add("wrong");
  state.currentAttempt++;
  dom.guessInput.value = "";
  delete dom.guessInput.dataset.selectedTitle;
  delete dom.guessInput.dataset.selectedArtist;
  updateSubmitButtonVisibility();
  clearSearchBarFeedback();

  if (state.currentAttempt < DURATIONS.length) {
    dom.segments[state.currentAttempt].classList.add("active");
    updateTimelineMarkerForStage(state.currentAttempt);
    updateSkipButtonLabel();
    updateHintsPanelVisibility();
  } else {
    endRound(false);
  }
}

export function handleGuess() {
  if (!state.currentSong) return;

  let rawValue = dom.guessInput.dataset.selectedTitle;
  if (!rawValue) {
    const sepIdx = dom.guessInput.value.lastIndexOf(" - ");
    rawValue = sepIdx > 0 ? dom.guessInput.value.slice(0, sepIdx) : dom.guessInput.value;
  }

  const userGuess = normalizeHebrew(rawValue);
  if (!userGuess) return;

  closeSuggestionsDropdown();
  const targetTitle = normalizeHebrew(state.currentSong.title);
  const itunesTitle = normalizeHebrew(state.currentSong.itunesTitle ? cleanTrackTitle(state.currentSong.itunesTitle) : "");

  const isExactMatch = (userGuess === targetTitle) || (itunesTitle && userGuess === itunesTitle);
  const isSubstantialSubstring =
    userGuess.length >= 4 &&
    userGuess.length >= Math.ceil(targetTitle.length * 0.65) &&
    (targetTitle.includes(userGuess) || userGuess.includes(targetTitle));

  if (isExactMatch || isSubstantialSubstring) {
    endRound(true);
  } else {
    dom.playerCard.classList.remove("shake");
    void dom.playerCard.offsetWidth;
    dom.playerCard.classList.add("shake");
    advanceAttempt();
  }
}

export function initDifficultyListeners() {
  dom.diffButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      setActiveDifficultyUI(btn.dataset.level);
      fetchRandomSong();
    });
  });
}
