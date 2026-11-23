import { ARTIST_BY_NAME } from "../data/artists.js?v=20261123q";
import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js?v=20261123q";
import { dom } from "../dom.js?v=20261123q";
import { state } from "../state.js?v=20261123q";
import { cleanTrackTitle, normalizeHebrew, isFuzzySongMatch, getSongKey } from "../utils/text.js?v=20261123q";
import { saveUserStats, markSongAsPlayed } from "../services/storage.js?v=20261123q";
import { syncAccountToCloud } from "../services/cloud.js?v=20261123q";
import {
  doesYearMatchSelectedDecades,
  getArtistCatalog,
  pickSongFromCatalog,
  pickFreshSongFromCachedPool,
  pickWithRecencyPriority,
  getCandidatePool,
  warmCatalogCache,
  ensureSeedCatalogLoaded
} from "../services/itunes.js?v=20261123q";
import {
  prefetchAudioRaw,
  preloadAudioBufferInBackground,
  updateTimelineMarkerForStage,
  stopAudioVisuals,
  extendActivePlaybackToStage,
  releaseMediaElement,
  playRevealPreview
} from "./audio.js?v=20261123q";
import { launchWinConfetti } from "./confetti.js?v=20261123q";
import {
  clearSearchBarFeedback,
  updateHintsPanelVisibility,
  resetHintButtons
} from "./feedback.js?v=20261123q";
import {
  prepareEasySearchMaskForRound,
  closeSuggestionsDropdown,
  updateSubmitButtonVisibility
} from "./search.js?v=20261123q";
import { updateStreakDisplay } from "./profile.js?v=20261123q";
import {
  calculateRoundReward,
  getStreakMultiplier,
  awardPoints,
  formatPoints,
  updatePointsDisplay,
  launchCrystalRewardAnimation
} from "./economy.js?v=20261123q";
import { recordQuestProgress } from "./quests.js?v=20261123q";
import {
  isTimedModeActive,
  startTimedRun,
  pauseTimedClock,
  resumeTimedClock,
  handleTimedWin,
  handleTimedWrong,
  recordTimedSong
} from "./timed.js?v=20261123q";
import { playWinSfx, playCrystalSfx, playWrongSfx, playSkipSfx } from "./sfx.js?v=20261123q";
import { showGameToast, vibrateWin, vibrateError } from "../utils/toast.js?v=20261123q";

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

function syncGameModeVisibility() {
  const isTimed = isTimedModeActive();
  const isSpecial = !!state.activeSpecialChallenge;
  const isClassic = !isTimed && !isSpecial;

  const streakSlot = document.querySelector(".streak-top-slot");
  const diffBar = document.getElementById("difficulty-bar");
  const filterRow = document.querySelector(".filter-summary-row");
  const timelineWrap = document.getElementById("timeline-wrapper");

  if (streakSlot) streakSlot.style.display = isClassic ? "" : "none";
  if (diffBar) diffBar.style.display = isClassic ? "" : "none";
  if (filterRow) filterRow.style.display = isClassic ? "" : "none";
  if (timelineWrap) timelineWrap.style.display = isTimed ? "none" : "";
}

export function updateSkipButtonLabel() {
  if (isTimedModeActive()) {
    dom.skipBtn.textContent = "דלג לשיר הבא ⏭️";
    return;
  }
  const nextIdx = state.currentAttempt + 1;
  dom.skipBtn.textContent = nextIdx < DURATIONS.length ? `דלג (+${DURATIONS[nextIdx]}ש')` : "דלג (וותר)";
}

export function resetUI() {
  const isTimed = isTimedModeActive();
  state.currentAttempt = isTimed ? DURATIONS.length - 1 : 0;
  state.usedHintInRound = false;
  state.usedEasySearchInRound = state.easySearchFiftyActive;
  state.usedRedFeedbackInRound = state.redFeedbackEnabled;
  state.guessedWrongKeys.clear();
  state.roundEnded = false;
  state.maxAudioHeardSec = 0;
  state.lastExactSolveSec = null;
  state.audioBuffer = null;
  state.rawAudioBuffer = null;
  stopAudioVisuals(0);
  releaseMediaElement();
  resetHintButtons();
  syncGameModeVisibility();

  dom.discWrapper.classList.remove("revealed");
  dom.statusLabel.style.color = "var(--text-sub)";
  dom.durationBadge.style.display = "flex";
  if (dom.timelineMarker) dom.timelineMarker.style.display = isTimed ? "none" : "flex";
  updateTimelineMarkerForStage(state.currentAttempt);
  updateSkipButtonLabel();
  if (isTimed && dom.hintsPanel) dom.hintsPanel.style.display = "none";

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
  dom.resultBanner.classList.remove("open", "is-win", "is-loss", "is-challenge-win");
  dom.resultBanner.style.display = "none";
  delete dom.nextBtn.dataset.exitToLobby;
  delete dom.nextBtn.dataset.restartTimed;
  const timedSumList = document.getElementById("timed-summary-list");
  if (timedSumList) {
    timedSumList.style.display = "none";
    timedSumList.innerHTML = "";
  }
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
  if (isTimedModeActive()) {
    // במוד 60 שניות: שירים אקראיים לחלוטין מכל הקטלוג ללא סינון רמות קושי, ז'אנרים או עשורים
    await ensureSeedCatalogLoaded();
    if (roundId !== state.activeFetchRoundId) return;
    const allTimedSongs = Array.from(state.discoveredSongsMap.values()).filter(s => s && s.previewUrl && s.title);
    const notLast = allTimedSongs.filter(s => s.artist !== state.lastPlayedArtist);
    const nonRecent = notLast.filter(s => !state.recentArtists.includes(s.artist));
    const poolForTimed = nonRecent.length > 0 ? nonRecent : (notLast.length > 0 ? notLast : allTimedSongs);
    if (poolForTimed.length > 0) {
      selectedSong = pickWithRecencyPriority(poolForTimed);
    }
  } else if (
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
  if (!selectedSong) {
    await ensureSeedCatalogLoaded();
    if (roundId !== state.activeFetchRoundId) return;
    selectedSong = pickFreshSongFromCachedPool(candidatePool);
  }
  let lastErrorMsg = "";
  let emptyCatalogCount = 0;

  // אם אין עדיין שיר רענן במטמון עבור רמת הקושי/סינון — שולפים עד 3 אמנים במקביל (מהיר פי 3!)
  if (!selectedSong) {
    startSongLoadingBar({ immediate: true, label: "טוען שיר חדש..." });
    const triedArtists = new Set();

    for (let batch = 0; batch < 2; batch++) {
      if (roundId !== state.activeFetchRoundId || candidatePool.length === 0) break;

      const remaining = candidatePool.filter(a => !triedArtists.has(a.name));
      if (remaining.length === 0) break;

      const nonRecent = remaining.filter(a => !state.recentArtists.includes(a.name));
      const notLast = remaining.filter(a => a.name !== state.lastPlayedArtist);
      const pickPool = nonRecent.length > 0 ? nonRecent : (notLast.length > 0 ? notLast : remaining);

      // בוחרים עד 2 אמנים שונים במכה (מהיר מאוד ועדין למגבלת הקצב של iTunes במובייל)
      const shuffled = [...pickPool].sort(() => Math.random() - 0.5);
      const batchArtists = shuffled.slice(0, 2);
      batchArtists.forEach(a => triedArtists.add(a.name));

      const results = await Promise.allSettled(
        batchArtists.map(a => getArtistCatalog(a.name).then(catalog => ({ artist: a, catalog })))
      );
      if (roundId !== state.activeFetchRoundId) return;

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.catalog?.length > 0) {
          const song = pickSongFromCatalog(r.value.catalog, r.value.artist.tier, batch >= 1);
          if (song) {
            selectedSong = song;
            break;
          }
        } else if (r.status === "fulfilled") {
          emptyCatalogCount++;
        } else {
          lastErrorMsg = r.reason?.message || "network";
        }
      }
      if (selectedSong) break;
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

export function recordRoundStats(won, solvedDuration, difficultyLevel, earnedPoints = 0, exactTimeSec = null) {
  const isClassic = !isTimedModeActive() && !state.activeSpecialChallenge;
  state.userStats.totalHeard = (state.userStats.totalHeard || 0) + 1;
  if (won) {
    state.userStats.totalWon = (state.userStats.totalWon || 0) + 1;
    if (isClassic) {
      state.userStats.currentStreak = (state.userStats.currentStreak || 0) + 1;
      if (state.userStats.currentStreak > (state.userStats.bestStreak || 0)) {
        state.userStats.bestStreak = state.userStats.currentStreak;
      }
    }
    if (!state.userStats.byLevel) state.userStats.byLevel = {};
    if (!state.userStats.bySpeed) state.userStats.bySpeed = {};
    if (!Array.isArray(state.userStats.wonSongs)) state.userStats.wonSongs = [];
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
        exactTimeSec: exactTimeSec ?? solvedDuration,
        level: difficultyLevel,
        pointsEarned: earnedPoints
      });
      if (state.userStats.wonSongs.length > 60) {
        state.userStats.wonSongs = state.userStats.wonSongs.slice(0, 60);
      }
    }
  } else if (isClassic) {
    // מגן רצף מהחנות: פועל אך ורק במשחק הקלאסי!
    if ((state.userStats.currentStreak || 0) > 0 && (state.userStats.powerups?.streakFreeze || 0) > 0) {
      state.userStats.powerups.streakFreeze--;
      state.lastRoundStreakSaved = true;
    } else {
      state.userStats.currentStreak = 0;
      state.lastRoundStreakSaved = false;
    }
  } else {
    state.lastRoundStreakSaved = false;
  }

  recordQuestProgress({
    won,
    solvedDuration,
    currentStreak: isClassic ? (state.userStats.currentStreak || 0) : 0
  });
  saveUserStats();
  if (state.currentUser) {
    syncAccountToCloud(state.currentUser, state.userStats);
  }
  updateStreakDisplay();
  updatePointsDisplay(won && earnedPoints > 0);
}

export function endRound(won) {
  if (state.roundEnded) return;
  state.roundEnded = true;

  stopAudioVisuals(won ? 100 : 0);
  closeSuggestionsDropdown();
  dom.hintsPanel.style.display = "none";
  dom.discWrapper.classList.add("revealed");
  dom.durationBadge.style.display = "none";
  if (dom.timelineMarker) dom.timelineMarker.style.display = "none";

  const specialChallenge = state.activeSpecialChallenge ? { ...state.activeSpecialChallenge } : null;
  const isClassic = !isTimedModeActive() && !specialChallenge;
  const solvedAtSec = DURATIONS[Math.min(state.currentAttempt, DURATIONS.length - 1)] || 15;
  // הנקודה הרחוקה ביותר שאליה השחקן האזין בשיר בסיבוב הזה (גם אם ניגן מחדש אח"כ!)
  const rawHeard = Number(state.maxAudioHeardSec) || 0;
  const exactSolveSec = Number.isFinite(rawHeard) && rawHeard > 0
    ? Math.max(0.1, Math.min(solvedAtSec, Math.round(rawHeard * 10) / 10))
    : solvedAtSec;
  state.lastExactSolveSec = won ? exactSolveSec : null;
  const exactSolveLabel = Number.isInteger(exactSolveSec) ? String(exactSolveSec) : exactSolveSec.toFixed(1);
  const playedDifficulty = state.currentDifficulty;
  const usedHint = state.usedHintInRound;
  const usedEasySearch = state.usedEasySearchInRound || state.easySearchFiftyActive;
  const usedRedFeedback = (state.usedRedFeedbackInRound || state.redFeedbackEnabled) && solvedAtSec >= 8;
  const nextStreakIfWon = isClassic && won ? (state.userStats.currentStreak || 0) + 1 : 0;
  const earnedPoints = won
    ? calculateRoundReward(solvedAtSec, playedDifficulty, {
        usedHint,
        usedEasySearch,
        usedRedFeedback,
        streak: isClassic ? nextStreakIfWon : 0
      })
    : 0;
  try {
    recordRoundStats(won, solvedAtSec, playedDifficulty, earnedPoints, exactSolveSec);
  } catch (e) { }

  // מסמן השלמת אתגר יומי / שיר שבועי (ניסיון אחד בלבד ליום/שבוע!)
  if (specialChallenge) {
    if (specialChallenge.kind === "daily") {
      state.userStats.completedDailyDate = specialChallenge.key;
    } else if (specialChallenge.kind === "weekly") {
      state.userStats.completedWeeklyKey = specialChallenge.key;
    }
    state.lastCompletedSpecialKind = specialChallenge.kind;
    state.activeSpecialChallenge = null;
    saveUserStats();
    if (state.currentUser) {
      syncAccountToCloud(state.currentUser, state.userStats);
    }
  } else {
    state.lastCompletedSpecialKind = null;
  }

  if (isTimedModeActive()) {
    pauseTimedClock();
    if (won) handleTimedWin(earnedPoints);
  }

  if (won) {
    const seg = dom.segments[state.currentAttempt];
    if (seg) {
      seg.classList.remove("active");
      seg.classList.add("correct");
    }
    if (dom.playbackFill) dom.playbackFill.style.width = "100%";
    dom.statusLabel.textContent = `זיהית נכון תוך ${exactSolveLabel} שניות!`;
    dom.statusLabel.style.color = "var(--spotify-green)";
    try { launchWinConfetti(); } catch (e) { }
    try { playWinSfx(); } catch (e) { }
    try { vibrateWin(); } catch (e) { }
    if (earnedPoints > 0) {
      try { playCrystalSfx(); } catch (e) { }
      try { launchCrystalRewardAnimation(earnedPoints); } catch (e) { }
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
        const streakMult = isClassic ? getStreakMultiplier(nextStreakIfWon) : 1;
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

  if (isClassic) {
    const currDiffIdx = DIFFICULTY_ORDER.indexOf(playedDifficulty);
    if (currDiffIdx >= 0) {
      state.pendingNextDifficulty = DIFFICULTY_ORDER[(currDiffIdx + 1) % DIFFICULTY_ORDER.length];
    }
  } else {
    state.pendingNextDifficulty = null;
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
  const isSpecialWin = Boolean(specialChallenge && won);
  if (revealOutcome) {
    if (isSpecialWin) {
      revealOutcome.textContent = specialChallenge.kind === "weekly"
        ? `👑 פיצחת את השיר השבועי תוך ${exactSolveLabel} שניות!`
        : `🏆 פיצחת את האתגר היומי תוך ${exactSolveLabel} שניות!`;
    } else {
      revealOutcome.textContent = won
        ? `✓ זיהית נכון תוך ${exactSolveLabel} שניות!`
        : "השיר היה:";
    }
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

  if (specialChallenge) {
    dom.nextBtn.textContent = "חזרה ללובי 🏠";
    dom.nextBtn.dataset.exitToLobby = "1";
  } else {
    delete dom.nextBtn.dataset.exitToLobby;
    dom.nextBtn.textContent = "לשיר הבא";
  }

  dom.resultBanner.classList.remove("is-win", "is-loss", "is-challenge-win");
  dom.resultBanner.classList.add(won ? "is-win" : "is-loss", "open");
  if (isSpecialWin) dom.resultBanner.classList.add("is-challenge-win");
  dom.resultBanner.style.display = "flex";

  // טוען מראש ברקע את השיר הבא רק במשחק הקלאסי
  if (isClassic) {
    preloadNextSongInBackground(state.pendingNextDifficulty || playedDifficulty);
  }

  clearSearchBarFeedback();
  dom.guessInput.disabled = true;
  dom.submitBtn.classList.remove("visible");
  dom.submitBtn.disabled = true;
  dom.skipBtn.disabled = true;
  dom.playBtn.disabled = true;
}

export function advanceAttempt() {
  // במוד 60 שניות: דילוג חינם מיידי לשיר הבא בלי לחשוף את השיר הנוכחי!
  if (isTimedModeActive()) {
    if (!state.currentSong) return;
    recordTimedSong(state.currentSong, "skipped");
    playSkipSfx();
    stopAudioVisuals(0);
    fetchRandomSong();
    return;
  }

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

function splitArtistTokens(str) {
  return String(str || "")
    .split(/\s*(?:,|&|\+|feat\.?|ft\.?|×|\bעם\b)\s*/i)
    .map(normalizeHebrew)
    .filter(Boolean);
}

function isArtistMatchingSong(guessArtist, songArtist) {
  const gTokens = splitArtistTokens(guessArtist);
  const sTokens = splitArtistTokens(songArtist);
  if (!gTokens.length || !sTokens.length) return true;
  return gTokens.some(g => sTokens.some(s => g === s || (g.length >= 3 && s.includes(g)) || (s.length >= 3 && g.includes(s))));
}

function recordWrongGuessKey(title, artist, trackId) {
  if (trackId) state.guessedWrongKeys.add(`id:${trackId}`);
  if (title) {
    state.guessedWrongKeys.add(getSongKey(title, artist || ""));
    for (const part of String(artist || "").split(/\s*(?:,|&|\+|feat\.?|ft\.?|×|\bעם\b)\s*/i).map(s => s.trim()).filter(Boolean)) {
      state.guessedWrongKeys.add(getSongKey(title, part));
    }
  }
}

export function handleGuess() {
  if (!state.currentSong) return;

  let rawValue = dom.guessInput.dataset.selectedTitle;
  let selectedArtist = dom.guessInput.dataset.selectedArtist || "";
  const selectedTrackId = dom.guessInput.dataset.selectedTrackId || "";
  if (!rawValue) {
    const sepIdx = dom.guessInput.value.lastIndexOf(" - ");
    if (sepIdx > 0) {
      rawValue = dom.guessInput.value.slice(0, sepIdx);
      selectedArtist = dom.guessInput.value.slice(sepIdx + 3).trim();
    } else {
      rawValue = dom.guessInput.value;
    }
  }

  const userGuess = normalizeHebrew(rawValue);
  if (!userGuess) return;

  closeSuggestionsDropdown();
  const itunesTitle = state.currentSong.itunesTitle ? cleanTrackTitle(state.currentSong.itunesTitle) : "";
  const titleMatched =
    isFuzzySongMatch(rawValue, state.currentSong.title) ||
    (itunesTitle && isFuzzySongMatch(rawValue, itunesTitle));

  // התאמה מדויקת: אם נבחר Track ID זהה -> נכון; אחרת אם יש אמן בבחירה, חייבת להיות גם התאמת אמן!
  const sameTrackId = Boolean(selectedTrackId && state.currentSong.trackId && String(selectedTrackId) === String(state.currentSong.trackId));
  const artistOk = !selectedArtist || isArtistMatchingSong(selectedArtist, state.currentSong.artist);
  const isMatched = sameTrackId || (titleMatched && artistOk);

  if (isTimedModeActive()) {
    if (isMatched) {
      stopAudioVisuals(0);
      const earnedPoints = calculateRoundReward(15, "medium", { streak: 0 });
      const rawHeard = state.maxAudioHeardSec || 0;
      const timedExact = rawHeard > 0 ? Math.max(0.1, Math.min(15, Math.round(rawHeard * 10) / 10)) : 15;
      recordTimedSong(state.currentSong, "hit");
      recordRoundStats(true, 15, "medium", earnedPoints, timedExact);
      handleTimedWin(earnedPoints);
      playWinSfx();
      vibrateWin();
      showGameToast(`✓ ${state.currentSong.title} (+5ש')`, "quest");
      fetchRandomSong();
    } else {
      recordWrongGuessKey(rawValue, selectedArtist, selectedTrackId);
      playWrongSfx();
      vibrateError();
      handleTimedWrong();
      dom.guessInput.value = "";
      delete dom.guessInput.dataset.selectedTitle;
      delete dom.guessInput.dataset.selectedArtist;
      delete dom.guessInput.dataset.selectedTrackId;
      updateSubmitButtonVisibility();
      dom.playerCard.classList.remove("shake");
      void dom.playerCard.offsetWidth;
      dom.playerCard.classList.add("shake");
    }
    return;
  }

  if (isMatched) {
    endRound(true);
  } else {
    recordWrongGuessKey(rawValue, selectedArtist, selectedTrackId);
    playWrongSfx();
    vibrateError();
    if (state.lastRoundStreakSaved) {
      state.lastRoundStreakSaved = false;
      showGameToast("🛡️ מגן הרצף הציל את אש הרצף שלך!", "shield");
      if (dom.pointsEarnedNotice) {
        dom.pointsEarnedNotice.classList.remove("is-muted");
        dom.pointsEarnedNotice.textContent = "🛡️ מגן הרצף הציל את הרצף שלך!";
        dom.pointsEarnedNotice.style.display = "inline-flex";
      }
    }
    dom.playerCard.classList.remove("shake");
    void dom.playerCard.offsetWidth;
    dom.playerCard.classList.add("shake");
    advanceAttempt();
  }
}

export function startTimedGameSession() {
  state.activeSpecialChallenge = null;
  state.pendingNextDifficulty = null;
  startTimedRun({
    onTimeUp: ({ score, crystals, isNewRecord, best, history = [] }) => {
      stopAudioVisuals(0);
      closeSuggestionsDropdown();
      const revealOutcome = document.getElementById("reveal-outcome-badge");
      const revealCover = document.getElementById("reveal-cover-img");
      const revealBg = document.getElementById("reveal-bg-blur");
      const revealMediaActions = document.getElementById("reveal-media-actions");
      const sumList = document.getElementById("timed-summary-list");
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

      if (sumList) {
        sumList.innerHTML = "";
        if (history.length > 0) {
          history.forEach(item => {
            const row = document.createElement("div");
            row.className = `timed-sum-row is-${item.status}`;
            const img = document.createElement("img");
            img.className = "timed-sum-thumb";
            img.src = item.artwork || "";
            img.alt = "";
            const meta = document.createElement("div");
            meta.className = "timed-sum-meta";
            const t = document.createElement("span");
            t.className = "timed-sum-title";
            t.textContent = item.title;
            const a = document.createElement("span");
            a.className = "timed-sum-artist";
            a.textContent = item.artist;
            meta.append(t, a);
            const badge = document.createElement("span");
            badge.className = `timed-sum-badge is-${item.status}`;
            badge.textContent = item.status === "hit"
              ? "✓ זיהית"
              : item.status === "skipped"
                ? "⏭️ דילגת"
                : "⏱️ נגמר הזמן";
            row.append(img, meta, badge);
            sumList.appendChild(row);
          });
          sumList.style.display = "flex";
        } else {
          sumList.style.display = "none";
        }
      }

      dom.nextBtn.textContent = "שחק שוב משחק בזמן ⏱️";
      dom.nextBtn.dataset.restartTimed = "1";
      dom.resultBanner.classList.remove("is-win", "is-loss", "is-challenge-win");
      dom.resultBanner.classList.add(score > 0 ? "is-win" : "is-loss", "open");
      dom.resultBanner.style.display = "flex";
    }
  });
  fetchRandomSong();
}

export function getTodayDateKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getCurrentWeekKey() {
  const d = new Date();
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d - jan1) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function hashSeedString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// מפעיל אתגר יומי או שיר שבועי דטרמיניסטי — אותו שיר בדיוק לכל השחקנים לפי תאריך!
export async function startDeterministicChallenge(kind) {
  await ensureSeedCatalogLoaded();
  const key = kind === "weekly" ? getCurrentWeekKey() : getTodayDateKey();
  const songs = Array.from(state.discoveredSongsMap.values())
    .filter(s => s && s.trackId && s.previewUrl && s.title && s.artist)
    .sort((a, b) => Number(a.trackId) - Number(b.trackId));

  if (songs.length === 0) {
    state.activeSpecialChallenge = null;
    setActiveDifficultyUI(kind === "weekly" ? "impossible" : "hard");
    fetchRandomSong();
    return;
  }

  const idx = hashSeedString(`${kind}:${key}`) % songs.length;
  const chosenSong = songs[idx];

  state.activeSpecialChallenge = { kind, key };
  state.pendingNextDifficulty = null;
  setActiveDifficultyUI(kind === "weekly" ? "impossible" : "hard");
  state.preloadedNextSong = {
    difficulty: state.currentDifficulty,
    song: chosenSong
  };
  fetchRandomSong();
}

export function goToNextSong() {
  if (dom.nextBtn?.dataset.exitToLobby === "1") {
    delete dom.nextBtn.dataset.exitToLobby;
    const exitBtn = document.getElementById("exit-to-lobby-btn");
    if (exitBtn) exitBtn.click();
    return;
  }
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
      if (isTimedModeActive() || state.activeSpecialChallenge) return;
      state.pendingNextDifficulty = null;
      state.preloadedNextSong = null;
      setActiveDifficultyUI(btn.dataset.level);
      fetchRandomSong();
    });
  });

  // שיתוף תוצאה בסגנון Wordle (ללא ספוילרים) ממסך חשיפת השיר
  const revealShareBtn = document.getElementById("reveal-share-btn");
  if (revealShareBtn) {
    revealShareBtn.addEventListener("click", async () => {
      const won = dom.resultBanner?.classList.contains("is-win");
      const squares = DURATIONS.map((_, i) => {
        if (won && i === state.currentAttempt) return "🟩";
        if (i < state.currentAttempt || (!won && i <= state.currentAttempt)) return "🟥";
        return "⬜";
      }).join("");
      const diffLabel = DIFFICULTIES[state.currentDifficulty]?.label || "";
      const sec = state.lastExactSolveSec ?? DURATIONS[Math.min(state.currentAttempt, DURATIONS.length - 1)];
      const line = won
        ? `זיהיתי תוך ${sec} שניות! 🔥 (רמת ${diffLabel})`
        : `לא הצלחתי הפעם 😅 (רמת ${diffLabel})`;
      const specialTag = state.lastCompletedSpecialKind === "daily"
        ? ` · אתגר יומי (${getTodayDateKey()})`
        : state.lastCompletedSpecialKind === "weekly"
          ? ` · השיר השבועי (${getCurrentWeekKey()})`
          : "";
      const text = `🎵 נחש את השיר${specialTag}\n${squares}\n${line}\nתצליחו לזהות מהר יותר? 👇\nhttps://guessthesonghebrew.pages.dev`;
      if (navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch (e) { }
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text).catch(() => { });
      }
      revealShareBtn.textContent = "✓ הועתק! הדבק בוואטסאפ";
      setTimeout(() => { revealShareBtn.textContent = "📤 שתף תוצאה"; }, 2200);
    });
  }
}
