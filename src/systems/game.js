import { ARTIST_BY_NAME } from "../data/artists.js?v=20261121b";
import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js?v=20261121b";
import { dom } from "../dom.js?v=20261121b";
import { state } from "../state.js?v=20261121b";
import { cleanTrackTitle, normalizeHebrew, isFuzzySongMatch } from "../utils/text.js?v=20261121b";
import { saveUserStats, markSongAsPlayed } from "../services/storage.js?v=20261121b";
import { syncAccountToCloud } from "../services/cloud.js?v=20261121b";
import {
  doesYearMatchSelectedDecades,
  getArtistCatalog,
  pickSongFromCatalog,
  pickFreshSongFromCachedPool,
  pickWithRecencyPriority,
  getCandidatePool,
  warmCatalogCache
} from "../services/itunes.js?v=20261121b";
import {
  prefetchAudioRaw,
  preloadAudioBufferInBackground,
  updateTimelineMarkerForStage,
  stopAudioVisuals,
  extendActivePlaybackToStage,
  releaseMediaElement,
  playRevealPreview
} from "./audio.js?v=20261121b";
import { launchWinConfetti } from "./confetti.js?v=20261121b";
import {
  clearSearchBarFeedback,
  updateHintsPanelVisibility,
  resetHintButtons
} from "./feedback.js?v=20261121b";
import {
  prepareEasySearchMaskForRound,
  closeSuggestionsDropdown,
  updateSubmitButtonVisibility
} from "./search.js?v=20261121b";
import { updateStreakDisplay } from "./profile.js?v=20261121b";
import {
  calculateRoundReward,
  getStreakMultiplier,
  awardPoints,
  formatPoints,
  updatePointsDisplay,
  launchCrystalRewardAnimation
} from "./economy.js?v=20261121b";
import { recordQuestProgress } from "./quests.js?v=20261121b";
import {
  isTimedModeActive,
  startTimedRun,
  stopTimedRun,
  pauseTimedClock,
  resumeTimedClock,
  handleTimedWin,
  handleTimedWrong
} from "./timed.js?v=20261121b";
import { playWinSfx, playCrystalSfx, playWrongSfx, playSkipSfx } from "./sfx.js?v=20261121b";

let loadingDelayTimer = null;
let loadingTickTimer = null;
let loadingHideTimer = null;
let loadingProgress = 0;

function stopLoadingTimers() {
  clearTimeout(loadingDelayTimer);
  clearInterval(loadingTickTimer);
  clearTimeout(loadingHideTimer);
  loadingDelayTimer = null;
  loadingTickTimer = null;
  loadingHideTimer = null;
}

function showSongLoadingBar(label = "טוען שיר...") {
  const wrap = document.getElementById("song-loading-wrap");
  const fill = document.getElementById("song-loading-fill");
  const text = document.getElementById("song-loading-text");
  if (!wrap || !fill) return;
  clearTimeout(loadingHideTimer);
  loadingProgress = Math.max(loadingProgress, 18);
  fill.style.width = `${loadingProgress}%`;
  if (text) text.textContent = label;
  wrap.classList.add("visible");

  if (!loadingTickTimer) {
    loadingTickTimer = setInterval(() => {
      if (loadingProgress < 90) {
        loadingProgress = Math.min(90, loadingProgress + (90 - loadingProgress) * 0.18 + 2);
        fill.style.width = `${Math.round(loadingProgress)}%`;
      }
    }, 180);
  }
}

function startSongLoadingBar({ immediate = false, label = "טוען שיר..." } = {}) {
  stopLoadingTimers();
  loadingProgress = 12;
  if (immediate) {
    showSongLoadingBar(label);
  } else {
    // מופיע אוטומטית אם הטעינה לוקחת יותר משנייה שלמה
    loadingDelayTimer = setTimeout(() => showSongLoadingBar(label), 1000);
  }
}

function finishSongLoadingBar() {
  stopLoadingTimers();
  const wrap = document.getElementById("song-loading-wrap");
  const fill = document.getElementById("song-loading-fill");
  if (!wrap || !fill) return;
  if (!wrap.classList.contains("visible")) return;
  loadingProgress = 100;
  fill.style.width = "100%";
  loadingHideTimer = setTimeout(() => {
    wrap.classList.remove("visible");
    fill.style.width = "0%";
    loadingProgress = 0;
  }, 240);
}

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
  state.usedHintInRound = false;
  state.usedEasySearchInRound = state.easySearchFiftyActive;
  state.usedRedFeedbackInRound = state.redFeedbackEnabled;
  state.audioBuffer = null;
  state.rawAudioBuffer = null;
  stopAudioVisuals(0);
  releaseMediaElement();
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
  dom.resultBanner.classList.remove("open", "is-win", "is-loss");
  dom.resultBanner.style.display = "none";
  if (dom.pointsEarnedNotice) dom.pointsEarnedNotice.style.display = "none";
  dom.levelUpNotice.style.display = "none";
  dom.retryBtn.style.display = "none";

  dom.segments.forEach((seg, i) => {
    seg.className = i === 0 ? "segment active" : "segment";
  });
}

let warmTimerId = null;

// טעינה מוקדמת של השיר הבא ברקע בזמן מסך החשיפה -> מעבר מיידי של 0ms בלחיצה על "לשיר הבא"
function preloadNextSongInBackground(nextDifficulty) {
  const savedDiff = state.currentDifficulty;
  try {
    state.currentDifficulty = nextDifficulty || savedDiff;
    const pool = getCandidatePool();
    const candidate = pickFreshSongFromCachedPool(pool);
    if (candidate && candidate.trackId !== state.currentSong?.trackId) {
      state.preloadedNextSong = { difficulty: state.currentDifficulty, song: candidate };
      if (candidate.artwork) {
        const img = new Image();
        img.src = candidate.artwork;
      }
      prefetchAudioRaw(candidate.previewUrl);
    } else {
      state.preloadedNextSong = null;
    }
  } finally {
    state.currentDifficulty = savedDiff;
  }
}

export async function fetchRandomSong() {
  const roundId = ++state.activeFetchRoundId;
  clearTimeout(warmTimerId);
  if (isTimedModeActive()) pauseTimedClock();
  resetUI();
  dom.statusLabel.textContent = "שולף שיר חדש מהקטלוג...";
  dom.retryBtn.style.display = "none";

  let selectedSong = null;
  if (
    state.preloadedNextSong &&
    state.preloadedNextSong.difficulty === state.currentDifficulty &&
    state.preloadedNextSong.song?.artist !== state.lastPlayedArtist
  ) {
    selectedSong = state.preloadedNextSong.song;
    state.preloadedNextSong = null;
  } else {
    state.preloadedNextSong = null;
  }

  const candidatePool = getCandidatePool();
  if (!selectedSong) {
    selectedSong = pickFreshSongFromCachedPool(candidatePool);
  }
  let lastErrorMsg = "";
  let emptyCatalogCount = 0;

  // אם אין עדיין שיר רענן במטמון עבור רמת הקושי/סינון — מציגים בר טעינה ושולפים אמן מהרשת
  if (!selectedSong) {
    startSongLoadingBar({ immediate: true, label: "טוען שיר חדש..." });
    const triedArtists = new Set();

    for (let attempt = 0; attempt < 5; attempt++) {
      if (roundId !== state.activeFetchRoundId || candidatePool.length === 0) break;

      const remaining = candidatePool.filter(a => !triedArtists.has(a.name));
      if (remaining.length === 0) break;

      // מונע בחירה של אותו זמר פעמיים ברצף ומעדיף זמרים שלא הופיעו בסיבובים האחרונים
      const nonRecent = remaining.filter(a => !state.recentArtists.includes(a.name));
      const notLast = remaining.filter(a => a.name !== state.lastPlayedArtist);
      const pickPool = nonRecent.length > 0 ? nonRecent : (notLast.length > 0 ? notLast : remaining);
      const picked = pickPool[Math.floor(Math.random() * pickPool.length)];
      triedArtists.add(picked.name);

      try {
        const catalog = await getArtistCatalog(picked.name);
        if (roundId !== state.activeFetchRoundId) return;

        if (catalog && catalog.length > 0) {
          selectedSong = pickSongFromCatalog(catalog, picked.tier, attempt >= 3);
          if (selectedSong) break;
        } else {
          emptyCatalogCount++;
        }
      } catch (err) {
        lastErrorMsg = err?.message || "network";
      }
    }
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
    const baseCached = filteredCached.length > 0 ? filteredCached : allCached;
    const notLastArtistCached = baseCached.filter(s => s.artist !== state.lastPlayedArtist);
    const nonRecentArtistCached = notLastArtistCached.filter(s => !state.recentArtists.includes(s.artist));
    const cachedSongs = nonRecentArtistCached.length > 0
      ? nonRecentArtistCached
      : (notLastArtistCached.length > 0 ? notLastArtistCached : baseCached);
    selectedSong = pickWithRecencyPriority(cachedSongs);
  }

  if (!selectedSong) {
    finishSongLoadingBar();
    const diag = lastErrorMsg ? ` (${lastErrorMsg})` : (emptyCatalogCount > 0 ? " (0 תוצאות תואמות)" : "");
    dom.statusLabel.textContent = `לא נמצאו שירים בסינון זה או שיש שגיאת רשת${diag}. נסה שוב.`;
    dom.retryBtn.style.display = "inline-block";
    return;
  }

  state.currentSong = selectedSong;
  state.lastPlayedArtist = selectedSong.artist;
  state.recentArtists = [
    selectedSong.artist,
    ...state.recentArtists.filter(a => a !== selectedSong.artist)
  ].slice(0, 3);
  markSongAsPlayed(state.currentSong.trackId);
  prepareEasySearchMaskForRound();

  dom.songCover.src = state.currentSong.artwork;

  // מתחילים לטעון ולפענח את השמע מיד — אם טעינת השמע לוקחת יותר משנייה, בר הטעינה מוצג עד לסיום
  const wrap = document.getElementById("song-loading-wrap");
  if (!wrap?.classList.contains("visible")) {
    startSongLoadingBar({ immediate: false, label: "טוען שמע..." });
  } else {
    showSongLoadingBar("טוען שמע...");
  }
  preloadAudioBufferInBackground(state.currentSong.previewUrl, roundId).finally(() => {
    if (roundId === state.activeFetchRoundId) {
      finishSongLoadingBar();
    }
  });

  dom.statusLabel.textContent = "מוכן! לחץ על ניגון";
  dom.playBtn.disabled = false;
  dom.guessInput.disabled = false;
  dom.skipBtn.disabled = false;
  updateSubmitButtonVisibility();
  if (isTimedModeActive()) resumeTimedClock();

  // מחמם בעדינות אמן אחד ברקע אחרי שהמשתמש כבר בשלב (מונע עומס על מגבלת הקצב של iTunes)
  warmTimerId = setTimeout(() => warmCatalogCache(), 3500);
}

export function recordRoundStats(won, solvedDuration, difficultyLevel, earnedPoints = 0) {
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

    if (earnedPoints > 0) {
      awardPoints(earnedPoints, { persist: false });
    }

    if (state.currentSong) {
      state.userStats.wonSongs = state.userStats.wonSongs.filter(s => s.trackId !== state.currentSong.trackId);
      state.userStats.wonSongs.unshift({
        trackId: state.currentSong.trackId,
        title: state.currentSong.title,
        artist: state.currentSong.artist,
        artwork: state.currentSong.artwork,
        previewUrl: state.currentSong.previewUrl,
        timeSec: solvedDuration,
        level: difficultyLevel,
        pointsEarned: earnedPoints
      });
      if (state.userStats.wonSongs.length > 60) {
        state.userStats.wonSongs = state.userStats.wonSongs.slice(0, 60);
      }
    }
  } else {
    state.userStats.currentStreak = 0;
  }

  recordQuestProgress({
    won,
    solvedDuration,
    currentStreak: state.userStats.currentStreak || 0
  });
  saveUserStats();
  if (state.currentUser) {
    syncAccountToCloud(state.currentUser, state.userStats);
  }
  updateStreakDisplay();
  updatePointsDisplay(won && earnedPoints > 0);
}

export function endRound(won) {
  stopAudioVisuals(won ? 100 : 0);
  closeSuggestionsDropdown();
  dom.hintsPanel.style.display = "none";
  dom.discWrapper.classList.add("revealed");
  dom.durationBadge.style.display = "none";
  if (dom.timelineMarker) dom.timelineMarker.style.display = "none";

  const solvedAtSec = DURATIONS[Math.min(state.currentAttempt, DURATIONS.length - 1)];
  const playedDifficulty = state.currentDifficulty;
  const usedHint = state.usedHintInRound;
  const usedEasySearch = state.usedEasySearchInRound || state.easySearchFiftyActive;
  const usedRedFeedback = (state.usedRedFeedbackInRound || state.redFeedbackEnabled) && solvedAtSec >= 8;
  const nextStreakIfWon = won ? (state.userStats.currentStreak || 0) + 1 : 0;
  const earnedPoints = won
    ? calculateRoundReward(solvedAtSec, playedDifficulty, {
        usedHint,
        usedEasySearch,
        usedRedFeedback,
        streak: nextStreakIfWon
      })
    : 0;
  recordRoundStats(won, solvedAtSec, playedDifficulty, earnedPoints);

  if (isTimedModeActive()) {
    pauseTimedClock();
    if (won) handleTimedWin(earnedPoints);
  }

  if (won) {
    dom.segments[state.currentAttempt].classList.remove("active");
    dom.segments[state.currentAttempt].classList.add("correct");
    if (dom.playbackFill) dom.playbackFill.style.width = "100%";
    dom.statusLabel.textContent = `זיהית נכון תוך ${solvedAtSec} שניות!`;
    dom.statusLabel.style.color = "var(--spotify-green)";
    launchWinConfetti();
    playWinSfx();
    if (earnedPoints > 0) {
      playCrystalSfx();
      launchCrystalRewardAnimation(earnedPoints);
    }

    if (dom.pointsEarnedNotice) {
      dom.pointsEarnedNotice.classList.remove("is-muted");
      if (!state.currentUser) {
        dom.pointsEarnedNotice.textContent = "🔒 התחבר או הירשם כדי לצבור קריסטלים";
        dom.pointsEarnedNotice.classList.add("is-muted");
      } else if (usedHint && playedDifficulty !== "impossible") {
        dom.pointsEarnedNotice.textContent = "💎 0 קריסטלים (הופעל רמז)";
        dom.pointsEarnedNotice.classList.add("is-muted");
      } else {
        const notes = [];
        const mult = DIFFICULTIES[playedDifficulty]?.pointsMultiplier ?? 1;
        const streakMult = getStreakMultiplier(nextStreakIfWon);
        if (mult > 1) notes.push(`×${mult}`);
        if (streakMult > 1) notes.push(`רצף ×${streakMult}🔥`);
        if (usedHint && playedDifficulty === "impossible") notes.push("רמז ×0.5");
        if (usedEasySearch) notes.push("חיפוש קל ×0.5");
        if (usedRedFeedback) notes.push("חיווי אדום ×0.5");
        const suffix = notes.length > 0 ? ` (${notes.join(" · ")})` : "";
        dom.pointsEarnedNotice.textContent = `💎 +${formatPoints(earnedPoints)} קריסטלים${suffix}`;
      }
      dom.pointsEarnedNotice.style.display = "inline-flex";
    }
  } else {
    dom.statusLabel.textContent = "";
    if (dom.pointsEarnedNotice) dom.pointsEarnedNotice.style.display = "none";
  }

  // משמיע אוטומטית את השיר המלא גם בניצחון וגם בהפסד (ונכבה אוטומטית כשממשיכים לשיר הבא)
  playRevealPreview();

  // מעבר לשלב הבא יקרה רק בלחיצה על "לשיר הבא", ואחרי בלתי אפשרי חוזר לקל בלולאה
  const currDiffIdx = DIFFICULTY_ORDER.indexOf(playedDifficulty);
  if (currDiffIdx >= 0) {
    state.pendingNextDifficulty = DIFFICULTY_ORDER[(currDiffIdx + 1) % DIFFICULTY_ORDER.length];
  }
  if (dom.levelUpNotice) {
    dom.levelUpNotice.textContent = "";
    dom.levelUpNotice.style.display = "none";
  }

  const hiResArt = (state.currentSong.artwork || "").replace("400x400bb", "600x600bb");
  const revealCover = document.getElementById("reveal-cover-img");
  const revealBg = document.getElementById("reveal-bg-blur");
  const revealOutcome = document.getElementById("reveal-outcome-badge");
  if (revealCover) {
    revealCover.src = hiResArt;
    revealCover.alt = state.currentSong.title;
  }
  if (revealBg) {
    revealBg.style.backgroundImage = hiResArt ? `url("${hiResArt}")` : "";
  }
  if (revealOutcome) {
    revealOutcome.textContent = won
      ? `✓ זיהית נכון תוך ${solvedAtSec} שניות!`
      : "השיר היה:";
    revealOutcome.className = `reveal-outcome-badge ${won ? "is-win" : "is-loss"}`;
  }

  const revealSpotify = document.getElementById("reveal-spotify-link");
  const revealApple = document.getElementById("reveal-apple-link");
  const revealMediaActions = document.getElementById("reveal-media-actions");
  const searchQuery = encodeURIComponent(`${state.currentSong.title} ${state.currentSong.artist}`);
  if (revealSpotify) revealSpotify.href = `https://open.spotify.com/search/${searchQuery}`;
  if (revealApple) revealApple.href = `https://music.apple.com/il/search?term=${searchQuery}`;
  if (revealMediaActions) revealMediaActions.style.display = "flex";

  dom.songTitleReveal.textContent = state.currentSong.title;
  dom.songArtistReveal.textContent = state.currentSong.artist;
  dom.nextBtn.textContent = "לשיר הבא";
  dom.resultBanner.classList.remove("is-win", "is-loss");
  dom.resultBanner.classList.add(won ? "is-win" : "is-loss", "open");
  dom.resultBanner.style.display = "flex";

  // טוען מראש ברקע את השיר הבא + השמע שלו כדי שהמעבר יהיה מיידי
  preloadNextSongInBackground(state.pendingNextDifficulty || playedDifficulty);

  clearSearchBarFeedback();
  dom.guessInput.disabled = true;
  dom.submitBtn.classList.remove("visible");
  dom.submitBtn.disabled = true;
  dom.skipBtn.disabled = true;
  dom.playBtn.disabled = true;
}

export function advanceAttempt() {
  const wasPlaying = state.isPlayingSnippet;
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
    playSkipSfx();
    dom.segments[state.currentAttempt].classList.add("active");
    updateTimelineMarkerForStage(state.currentAttempt);
    updateSkipButtonLabel();
    updateHintsPanelVisibility();

    // אם השיר התנגן בזמן הלחיצה על "דלג" — ממשיכים להשמיע ברצף עד סוף השלב החדש בלי לאפס
    if (wasPlaying) {
      extendActivePlaybackToStage(state.currentAttempt);
    }
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
  const itunesTitle = state.currentSong.itunesTitle ? cleanTrackTitle(state.currentSong.itunesTitle) : "";
  const isMatched =
    isFuzzySongMatch(rawValue, state.currentSong.title) ||
    (itunesTitle && isFuzzySongMatch(rawValue, itunesTitle));

  if (isMatched) {
    endRound(true);
  } else {
    playWrongSfx();
    if (isTimedModeActive()) handleTimedWrong();
    dom.playerCard.classList.remove("shake");
    void dom.playerCard.offsetWidth;
    dom.playerCard.classList.add("shake");
    advanceAttempt();
  }
}

export function startTimedGameSession() {
  state.pendingNextDifficulty = null;
  setActiveDifficultyUI("easy");
  startTimedRun({
    onTimeUp: ({ score, crystals, isNewRecord, best }) => {
      stopAudioVisuals(0);
      closeSuggestionsDropdown();
      const revealOutcome = document.getElementById("reveal-outcome-badge");
      const revealCover = document.getElementById("reveal-cover-img");
      const revealBg = document.getElementById("reveal-bg-blur");
      const revealMediaActions = document.getElementById("reveal-media-actions");
      if (revealOutcome) {
        revealOutcome.textContent = isNewRecord ? "🏆 שיא אישי חדש במשחק בזמן!" : "⏱️ נגמר הזמן!";
        revealOutcome.className = `reveal-outcome-badge ${score > 0 ? "is-win" : "is-loss"}`;
      }
      if (revealCover && state.currentSong?.artwork) {
        revealCover.src = state.currentSong.artwork;
      }
      if (revealBg && state.currentSong?.artwork) {
        revealBg.style.backgroundImage = `url("${state.currentSong.artwork}")`;
      }
      if (revealMediaActions) revealMediaActions.style.display = "none";

      dom.songTitleReveal.textContent = `זיהית ${score} שירים ב-60 שניות!`;
      dom.songArtistReveal.textContent = `שיא אישי: ${best} שירים`;
      if (dom.pointsEarnedNotice) {
        if (crystals > 0) {
          dom.pointsEarnedNotice.textContent = `💎 סה"כ בסבב: +${formatPoints(crystals)} קריסטלים`;
          dom.pointsEarnedNotice.classList.remove("is-muted");
          dom.pointsEarnedNotice.style.display = "inline-flex";
        } else {
          dom.pointsEarnedNotice.style.display = "none";
        }
      }
      dom.nextBtn.textContent = "שחק שוב משחק בזמן ⏱️";
      dom.nextBtn.dataset.restartTimed = "1";
      dom.resultBanner.classList.remove("is-win", "is-loss");
      dom.resultBanner.classList.add(score > 0 ? "is-win" : "is-loss", "open");
      dom.resultBanner.style.display = "flex";
    }
  });
  fetchRandomSong();
}

export function goToNextSong() {
  if (dom.nextBtn?.dataset.restartTimed === "1") {
    delete dom.nextBtn.dataset.restartTimed;
    startTimedGameSession();
    return;
  }
  if (state.pendingNextDifficulty) {
    setActiveDifficultyUI(state.pendingNextDifficulty);
    state.pendingNextDifficulty = null;
  }
  fetchRandomSong();
}

export function initDifficultyListeners() {
  dom.diffButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      state.pendingNextDifficulty = null;
      state.preloadedNextSong = null;
      setActiveDifficultyUI(btn.dataset.level);
      fetchRandomSong();
    });
  });
}
