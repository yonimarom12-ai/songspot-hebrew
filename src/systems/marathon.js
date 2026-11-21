import { ARTISTS_DB, ARTIST_BY_NAME } from "../data/artists.js?v=20261122f";
import { state } from "../state.js?v=20261122f";
import { getArtistCatalog, ensureSeedCatalogLoaded } from "../services/itunes.js?v=20261122f";
import { initAudioContext, stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261122f";
import { awardPoints, updatePointsDisplay } from "./economy.js?v=20261122f";
import { saveUserStats } from "../services/storage.js?v=20261122f";
import { launchWinConfetti } from "./confetti.js?v=20261122f";
import { playClickSfx, playWinSfx, playWrongSfx, playCrystalSfx } from "./sfx.js?v=20261122f";
import { vibrateTap, vibrateWin, vibrateError, animateCountUp } from "../utils/toast.js?v=20261122f";

const TOTAL_QUESTIONS = 10;
const QUESTION_DURATION_MS = 15000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2026;

let activeSessionId = 0;
let questions = [];
let currentIndex = 0;
let totalScore = 0;
let marathonStreak = 0;
let historyResults = [];
let questionAnswered = false;
let questionStartPerf = 0;
let timerRafId = null;
let autoNextTimer = null;
let exitCallback = null;
let listenersBound = false;

function getAudioEl() {
  return document.getElementById("game-audio");
}

function stopMarathonAudio() {
  const audio = getAudioEl();
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) { }
  }
}

function clearQuestionTimers() {
  if (timerRafId) {
    cancelAnimationFrame(timerRafId);
    timerRafId = null;
  }
  if (autoNextTimer) {
    clearTimeout(autoNextTimer);
    autoNextTimer = null;
  }
}

export function stopMarathonSession() {
  activeSessionId++;
  clearQuestionTimers();
  stopMarathonAudio();
  const cd = document.getElementById("marathon-countdown-overlay");
  if (cd) cd.classList.remove("visible");
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function collectCachedSongs() {
  const map = new Map();
  for (const tracks of Object.values(state.artistCatalogCache || {})) {
    if (!Array.isArray(tracks)) continue;
    for (const s of tracks) {
      if (s && s.previewUrl && s.title && s.artist && !map.has(s.trackId)) {
        map.set(s.trackId, s);
      }
    }
  }
  return Array.from(map.values());
}

async function prepareMarathonSongPool() {
  await ensureSeedCatalogLoaded();
  let pool = collectCachedSongs();

  // אם יש פחות מ-24 שירים במטמון, נשלוף עוד 4-6 אמנים במקביל (2 בכל פעם כדי לא להכביד על iTunes)
  if (pool.length < 24) {
    const superstars = shuffle(ARTISTS_DB.filter(a => a.tier === "superstars" || a.tier === "established"));
    const uncached = superstars.filter(a => !(state.artistCatalogCache[a.name]?.length > 0)).slice(0, 6);
    for (let i = 0; i < uncached.length; i += 2) {
      const batch = uncached.slice(i, i + 2);
      await Promise.allSettled(batch.map(a => getArtistCatalog(a.name)));
      pool = collectCachedSongs();
      if (pool.length >= 28) break;
    }
  }
  return pool;
}

function buildQuestionsDeck(pool) {
  if (pool.length < 4) return [];

  const shuffled = shuffle(pool);
  // מעדיפים שירים מאמנים שונים ככל האפשר
  const chosen = [];
  const usedArtists = new Set();
  for (const s of shuffled) {
    if (chosen.length >= TOTAL_QUESTIONS) break;
    if (!usedArtists.has(s.artist)) {
      chosen.push(s);
      usedArtists.add(s.artist);
    }
  }
  if (chosen.length < TOTAL_QUESTIONS) {
    const chosenIds = new Set(chosen.map(s => s.trackId));
    for (const s of shuffled) {
      if (chosen.length >= TOTAL_QUESTIONS) break;
      if (!chosenIds.has(s.trackId)) {
        chosen.push(s);
        chosenIds.add(s.trackId);
      }
    }
  }

  // מחלקים למיקס מגוון של 4 סוגי שאלות: זיהוי שיר (4), ניחוש שנה (2-3), מי הזמר? (2), איזה שיר יצא קודם? (1-2)
  const yearEligibleIndices = chosen
    .map((s, idx) => ({ idx, ok: Number.isFinite(s.releaseYear) && s.releaseYear >= MIN_YEAR && s.releaseYear <= MAX_YEAR }))
    .filter(x => x.ok)
    .map(x => x.idx);

  const shuffledYearIdx = shuffle(yearEligibleIndices);
  const yearIndexSet = new Set(shuffledYearIdx.slice(0, Math.min(3, shuffledYearIdx.length)));
  const remainingAfterYear = chosen.map((_, i) => i).filter(i => !yearIndexSet.has(i));
  const shuffledRem = shuffle(remainingAfterYear);
  const artistIndexSet = new Set(shuffledRem.slice(0, 2));
  const olderCandidates = shuffledRem.slice(2).filter(i => Number.isFinite(chosen[i].releaseYear));
  const olderIndexSet = new Set(olderCandidates.slice(0, 2));

  return chosen.map((song, idx) => {
    if (yearIndexSet.has(idx)) {
      return {
        type: "year",
        song,
        correctYear: song.releaseYear
      };
    }

    if (olderIndexSet.has(idx) && Number.isFinite(song.releaseYear)) {
      const rival = shuffle(
        pool.filter(s => s.trackId !== song.trackId && Number.isFinite(s.releaseYear) && Math.abs(s.releaseYear - song.releaseYear) >= 3)
      )[0];
      if (rival) {
        const songIsOlder = song.releaseYear < rival.releaseYear;
        const olderSong = songIsOlder ? song : rival;
        const newerSong = songIsOlder ? rival : song;
        return {
          type: "older",
          song,
          olderSong,
          newerSong,
          options: shuffle([
            { title: olderSong.title, artist: olderSong.artist, isCorrect: true },
            { title: newerSong.title, artist: newerSong.artist, isCorrect: false }
          ])
        };
      }
    }

    if (artistIndexSet.has(idx)) {
      const otherArtists = shuffle(
        Array.from(new Set(pool.map(s => s.artist).filter(a => a && a !== song.artist)))
      ).slice(0, 3);
      if (otherArtists.length === 3) {
        return {
          type: "artist",
          song,
          options: shuffle([
            { title: song.artist, artist: "זמר / להקה", isCorrect: true },
            ...otherArtists.map(a => ({ title: a, artist: "זמר / להקה", isCorrect: false }))
          ])
        };
      }
    }

    // ברירת מחדל: זיהוי שיר מתוך 4 אופציות
    const distractorCandidates = shuffle(
      pool.filter(s => s.trackId !== song.trackId && s.title !== song.title)
    );
    const distractors = [];
    const seenTitles = new Set([song.title]);
    for (const d of distractorCandidates) {
      if (distractors.length >= 3) break;
      if (!seenTitles.has(d.title)) {
        seenTitles.add(d.title);
        distractors.push(d);
      }
    }

    const options = shuffle([
      { title: song.title, artist: song.artist, isCorrect: true },
      ...distractors.map(d => ({ title: d.title, artist: d.artist, isCorrect: false }))
    ]);

    return {
      type: "song",
      song,
      options
    };
  });
}

function getSongDifficultyMeta(song) {
  const artistObj = ARTIST_BY_NAME[song.artist];
  const tier = artistObj?.tier || "established";
  const catalog = state.artistCatalogCache?.[song.artist] || [];
  const idx = catalog.findIndex(t => t.trackId === song.trackId);
  const pos = idx >= 0 ? idx : 8;

  if (tier === "indie_deep" || pos >= 18) {
    return { mult: 1.75, label: "קשה מאוד" };
  }
  if (tier === "established" && pos >= 10) {
    return { mult: 1.45, label: "קשה" };
  }
  if (tier === "established" || pos >= 8) {
    return { mult: 1.22, label: "בינוני" };
  }
  return { mult: 1.0, label: "קל" };
}

// מחשב ניקוד דינמי: בסיס * קושי השיר * מהירות * רצף * גורם מזל (ללא תקרה קבועה של 10,000!)
function applyDynamicFactors(basePoints, song, remainingRatio, currentStreak) {
  if (basePoints <= 0) return { points: 0, lucky: false, diffLabel: "" };
  const { mult: diffMult, label: diffLabel } = getSongDifficultyMeta(song);
  // מהירות: בין ×0.75 (בשנייה האחרונה) ל-×1.45 (תשובה מיידית)
  const speedMult = 0.75 + Math.pow(Math.max(0, Math.min(1, remainingRatio)), 0.85) * 0.7;
  // בונוס רצף במרתון: +7% לכל פגיעה רצופה (עד +35%)
  const streakMult = 1 + Math.min(5, Math.max(0, currentStreak - 1)) * 0.07;
  // גורם מזל: תנודה טבעית ±14%, ועם סיכוי של 12% ל"מזל גדול!" (×1.20–×1.32)
  const isLuckyRoll = Math.random() < 0.12;
  const luckMult = isLuckyRoll
    ? (1.20 + Math.random() * 0.12)
    : (0.86 + Math.random() * 0.28);

  const finalPts = Math.max(50, Math.round(basePoints * diffMult * speedMult * streakMult * luckMult));
  return { points: finalPts, lucky: isLuckyRoll, diffLabel };
}

function calcYearScore(guessYear, actualYear, song, remainingRatio, currentStreak) {
  const diff = Math.abs(guessYear - actualYear);
  if (diff > 10) {
    // טעות של יותר מ-10 שנים מורידה נקודות בהתאם למרחק
    let penaltyBase = 210;
    if (diff > 25) penaltyBase = 460;
    else if (diff > 15) penaltyBase = 320;
    const penalty = -Math.round(penaltyBase * (0.88 + Math.random() * 0.24));
    return { points: penalty, label: "❄️ רחוק מדי!", diffLabel: "" };
  }

  let base = 0;
  let label = "🤏 קצת רחוק";
  if (diff === 0) { base = 1100; label = "🎯 בול בשנה!"; }
  else if (diff === 1) { base = 900; label = "🔥 מרחק שנה אחת!"; }
  else if (diff === 2) { base = 740; label = "✨ קרוב מאוד!"; }
  else if (diff <= 4) { base = 540; label = "👍 יפה מאוד!"; }
  else if (diff <= 7) { base = 320; label = "👌 באזור"; }
  else if (diff <= 10) { base = 160; label = "🤏 קצת רחוק"; }

  const dyn = applyDynamicFactors(base, song, remainingRatio, currentStreak);
  return { points: dyn.points, label: dyn.lucky ? `${label} ⚡ מזל!` : label, diffLabel: dyn.diffLabel };
}

function playSongSnippet(previewUrl) {
  const audio = getAudioEl();
  if (!audio || !previewUrl) return;
  try {
    audio.pause();
    audio.src = previewUrl;
    audio.currentTime = 0;
    audio.volume = 1;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => { });
  } catch (e) { }
}

function updateMarathonPowerupButtons() {
  const pu5050 = document.getElementById("marathon-pu-5050");
  const puTime = document.getElementById("marathon-pu-time");
  const q = questions[currentIndex];
  const c5050 = state.userStats?.powerups?.fiftyFifty || 0;
  const cTime = state.userStats?.powerups?.extraTime || 0;

  if (pu5050) {
    pu5050.textContent = `🎯 50/50 (${c5050})`;
    const can5050 = !questionAnswered && c5050 > 0 && q && (q.type === "song" || q.type === "artist");
    pu5050.disabled = !can5050;
  }
  if (puTime) {
    puTime.textContent = `⏸️ +5ש' (${cTime})`;
    puTime.disabled = questionAnswered || cTime <= 0;
  }
}

let displayedScore = 0;

function updateHeaderHUD() {
  const qNumEl = document.getElementById("marathon-q-counter");
  const scoreEl = document.getElementById("marathon-score-val");
  if (qNumEl) qNumEl.textContent = `שאלה ${Math.min(currentIndex + 1, questions.length)} מתוך ${questions.length}`;
  if (scoreEl) {
    animateCountUp(scoreEl, displayedScore, totalScore, v => Math.round(v).toLocaleString("he-IL"), 380);
    displayedScore = totalScore;
  }
  updateMarathonPowerupButtons();
}

function startQuestionTimerBar(sessionId) {
  clearQuestionTimers();
  const fill = document.getElementById("marathon-timer-fill");
  if (!fill) return;
  fill.classList.remove("is-warn", "is-danger");
  fill.style.width = "100%";
  questionStartPerf = performance.now();

  const tick = (now) => {
    if (sessionId !== activeSessionId || questionAnswered) return;
    const elapsed = now - questionStartPerf;
    const remainingRatio = Math.max(0, 1 - elapsed / QUESTION_DURATION_MS);
    fill.style.width = `${(remainingRatio * 100).toFixed(2)}%`;

    if (remainingRatio <= 0.25) {
      fill.classList.add("is-danger");
      fill.classList.remove("is-warn");
    } else if (remainingRatio <= 0.52) {
      fill.classList.add("is-warn");
      fill.classList.remove("is-danger");
    }

    if (remainingRatio <= 0) {
      handleTimeout(sessionId);
      return;
    }
    timerRafId = requestAnimationFrame(tick);
  };
  timerRafId = requestAnimationFrame(tick);
}

function showFeedbackAndScheduleNext(sessionId, { isGood, titleText, subText, pointsEarned }) {
  const fb = document.getElementById("marathon-feedback-bar");
  const fbTitle = document.getElementById("marathon-feedback-title");
  const fbSub = document.getElementById("marathon-feedback-sub");
  const fbPts = document.getElementById("marathon-feedback-pts");
  const nextBtn = document.getElementById("marathon-next-q-btn");

  if (fb) {
    fb.classList.remove("is-good", "is-bad");
    fb.classList.add("visible", isGood ? "is-good" : "is-bad");
  }
  if (fbTitle) fbTitle.textContent = titleText;
  if (fbSub) fbSub.textContent = subText;
  if (fbPts) {
    fbPts.classList.toggle("is-negative", pointsEarned < 0);
    fbPts.textContent = pointsEarned > 0
      ? `+${pointsEarned} נק'`
      : pointsEarned < 0
        ? `${pointsEarned} נק'`
        : "0 נק'";
  }
  if (nextBtn) {
    nextBtn.textContent = currentIndex + 1 >= questions.length ? "לסיכום המרתון 🏆" : "לשאלה הבאה ←";
  }

  // חושפים את עטיפת השיר על הדיסק
  const coverImg = document.getElementById("marathon-cover-img");
  const q = questions[currentIndex];
  if (coverImg && q?.song?.artwork) {
    coverImg.src = q.song.artwork;
    coverImg.classList.add("revealed");
  }

  autoNextTimer = setTimeout(() => {
    if (sessionId !== activeSessionId) return;
    advanceQuestion(sessionId);
  }, 2200);
}

function handleTimeout(sessionId) {
  if (questionAnswered || sessionId !== activeSessionId) return;
  questionAnswered = true;
  marathonStreak = 0;
  clearQuestionTimers();
  playWrongSfx();

  const timeoutPenalty = -150;
  totalScore = Math.max(0, totalScore + timeoutPenalty);
  updateHeaderHUD();

  const q = questions[currentIndex];
  if (q.type !== "year") {
    document.querySelectorAll(".marathon-choice-btn").forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.correct === "1") btn.classList.add("is-correct");
    });
    const ansLabel = q.type === "older"
      ? `${q.olderSong.title} (${q.olderSong.releaseYear}) קדם ל-${q.newerSong.title} (${q.newerSong.releaseYear})`
      : `${q.song.title} · ${q.song.artist}`;
    historyResults.push({
      q,
      points: timeoutPenalty,
      userAnswerText: "נגמר הזמן",
      correctText: ansLabel,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "⏰ נגמר הזמן!",
      subText: ansLabel,
      pointsEarned: timeoutPenalty
    });
  } else {
    const lockBtn = document.getElementById("marathon-year-confirm-btn");
    const slider = document.getElementById("marathon-year-slider");
    if (lockBtn) lockBtn.disabled = true;
    if (slider) slider.disabled = true;
    historyResults.push({
      q,
      points: timeoutPenalty,
      userAnswerText: "נגמר הזמן",
      correctText: `שנת ${q.correctYear}`,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "⏰ נגמר הזמן!",
      subText: `השיר יצא בשנת ${q.correctYear}`,
      pointsEarned: timeoutPenalty
    });
  }
}

function handleSongChoiceClick(btn, opt, sessionId) {
  if (questionAnswered || sessionId !== activeSessionId) return;
  questionAnswered = true;
  const elapsed = performance.now() - questionStartPerf;
  const remainingRatio = Math.max(0, 1 - elapsed / QUESTION_DURATION_MS);
  clearQuestionTimers();

  const q = questions[currentIndex];
  document.querySelectorAll(".marathon-choice-btn").forEach(b => {
    b.disabled = true;
    if (b.dataset.correct === "1") b.classList.add("is-correct");
  });

  if (opt.isCorrect) {
    marathonStreak++;
    const { points: pts, lucky, diffLabel } = applyDynamicFactors(820, q.song, remainingRatio, marathonStreak);
    totalScore += pts;
    updateHeaderHUD();
    playWinSfx();
    historyResults.push({
      q,
      points: pts,
      userAnswerText: opt.title,
      correctText: `${q.song.title} — ${q.song.artist}`,
      isGood: true
    });
    const bonusTag = [diffLabel ? `קושי: ${diffLabel}` : "", marathonStreak >= 2 ? `רצף ×${marathonStreak}` : "", lucky ? "⚡ בונוס מזל!" : ""].filter(Boolean).join(" · ");
    showFeedbackAndScheduleNext(sessionId, {
      isGood: true,
      titleText: lucky ? "⚡ תשובה נכונה + מזל!" : "🎉 תשובה נכונה!",
      subText: `${q.song.title} · ${q.song.artist}${bonusTag ? ` (${bonusTag})` : ""}`,
      pointsEarned: pts
    });
  } else {
    marathonStreak = 0;
    const wrongPenalty = -Math.round(230 + Math.random() * 90);
    totalScore = Math.max(0, totalScore + wrongPenalty);
    updateHeaderHUD();
    btn.classList.add("is-wrong");
    playWrongSfx();
    vibrateError();
    historyResults.push({
      q,
      points: wrongPenalty,
      userAnswerText: opt.title,
      correctText: `${q.song.title} — ${q.song.artist}`,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "❌ טעות בשיר!",
      subText: `התשובה הנכונה: ${q.song.title} · ${q.song.artist}`,
      pointsEarned: wrongPenalty
    });
  }
}

function handleYearLockIn(sessionId) {
  if (questionAnswered || sessionId !== activeSessionId) return;
  const q = questions[currentIndex];
  if (!q || q.type !== "year") return;

  questionAnswered = true;
  const elapsed = performance.now() - questionStartPerf;
  const remainingRatio = Math.max(0, 1 - elapsed / QUESTION_DURATION_MS);
  clearQuestionTimers();

  const slider = document.getElementById("marathon-year-slider");
  const lockBtn = document.getElementById("marathon-year-confirm-btn");
  const guessYear = Number(slider?.value || 2010);
  if (slider) slider.disabled = true;
  if (lockBtn) lockBtn.disabled = true;

  const diff = Math.abs(guessYear - q.correctYear);
  if (diff <= 4) marathonStreak++;
  else marathonStreak = 0;

  const { points, label, diffLabel } = calcYearScore(guessYear, q.correctYear, q.song, remainingRatio, marathonStreak);
  totalScore = Math.max(0, totalScore + points);
  updateHeaderHUD();

  if (points >= 500) playWinSfx();
  else if (points > 0) playClickSfx();
  else playWrongSfx();

  const diffText = diff === 0
    ? `בדיוק בשנת ${q.correctYear}!${diffLabel ? ` (קושי: ${diffLabel})` : ""}`
    : `יצא בשנת ${q.correctYear} (ניחשת ${guessYear} · הפרש ${diff} ${diff === 1 ? "שנה" : "שנים"})`;

  historyResults.push({
    q,
    points,
    userAnswerText: `שנת ${guessYear}`,
    correctText: `שנת ${q.correctYear}`,
    isGood: points >= 500
  });

  showFeedbackAndScheduleNext(sessionId, {
    isGood: points >= 300,
    titleText: label,
    subText: diffText,
    pointsEarned: points
  });
}

function renderCurrentQuestion(sessionId) {
  if (sessionId !== activeSessionId) return;
  const q = questions[currentIndex];
  if (!q) {
    renderMarathonSummary();
    return;
  }

  questionAnswered = false;
  updateHeaderHUD();

  const playView = document.getElementById("marathon-play-view");
  const summaryView = document.getElementById("marathon-summary-view");
  if (playView) playView.style.display = "flex";
  if (summaryView) summaryView.style.display = "none";

  const typeBadge = document.getElementById("marathon-q-type-badge");
  const promptEl = document.getElementById("marathon-q-prompt");
  const songMetaEl = document.getElementById("marathon-year-song-meta");
  const coverImg = document.getElementById("marathon-cover-img");
  const choicesGrid = document.getElementById("marathon-choices-grid");
  const yearBox = document.getElementById("marathon-year-box");
  const fb = document.getElementById("marathon-feedback-bar");

  if (fb) fb.classList.remove("visible", "is-good", "is-bad");
  if (coverImg) {
    coverImg.classList.remove("revealed");
    coverImg.src = q.song.artwork || "";
  }

  if (q.type === "song" || q.type === "artist" || q.type === "older") {
    if (typeBadge) {
      typeBadge.textContent = q.type === "artist"
        ? "🎤 מי הזמר/ת?"
        : q.type === "older"
          ? "⏳ איזה שיר יצא קודם?"
          : "🎵 זהה את השיר";
    }
    if (promptEl) {
      promptEl.textContent = q.type === "artist"
        ? "מי שר/ה את השיר שמתנגן?"
        : q.type === "older"
          ? "איזה מבין השניים יצא קודם?"
          : "איזה שיר מתנגן עכשיו?";
    }
    if (songMetaEl) songMetaEl.style.display = "none";
    if (yearBox) yearBox.style.display = "none";
    if (choicesGrid) {
      choicesGrid.style.display = "grid";
      choicesGrid.innerHTML = "";
      q.options.forEach(opt => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "marathon-choice-btn";
        btn.dataset.correct = opt.isCorrect ? "1" : "0";

        const tSpan = document.createElement("span");
        tSpan.className = "marathon-choice-title";
        tSpan.textContent = opt.title;
        const aSpan = document.createElement("span");
        aSpan.className = "marathon-choice-artist";
        aSpan.textContent = opt.artist;

        btn.append(tSpan, aSpan);
        btn.addEventListener("click", () => handleSongChoiceClick(btn, opt, sessionId));
        choicesGrid.appendChild(btn);
      });
    }
  } else {
    if (typeBadge) typeBadge.textContent = "📅 נחש את השנה";
    if (promptEl) promptEl.textContent = "באיזו שנה יצא השיר הזה?";
    if (coverImg) coverImg.classList.add("revealed");
    if (songMetaEl) {
      songMetaEl.style.display = "block";
      songMetaEl.textContent = `${q.song.title} · ${q.song.artist}`;
    }
    if (choicesGrid) choicesGrid.style.display = "none";
    if (yearBox) yearBox.style.display = "flex";

    const slider = document.getElementById("marathon-year-slider");
    const yearDisplay = document.getElementById("marathon-year-val");
    const lockBtn = document.getElementById("marathon-year-confirm-btn");
    if (slider) {
      slider.disabled = false;
      slider.value = "2008";
    }
    if (yearDisplay) yearDisplay.textContent = "2008";
    if (lockBtn) lockBtn.disabled = false;
  }

  playSongSnippet(q.song.previewUrl);
  startQuestionTimerBar(sessionId);
}

function advanceQuestion(sessionId) {
  if (sessionId !== activeSessionId) return;
  clearQuestionTimers();
  stopMarathonAudio();
  currentIndex++;
  if (currentIndex >= questions.length) {
    renderMarathonSummary();
  } else {
    renderCurrentQuestion(sessionId);
  }
}

function renderMarathonSummary() {
  clearQuestionTimers();
  stopMarathonAudio();

  const playView = document.getElementById("marathon-play-view");
  const summaryView = document.getElementById("marathon-summary-view");
  if (playView) playView.style.display = "none";
  if (summaryView) summaryView.style.display = "flex";

  const goodCount = historyResults.filter(r => r.points >= 450).length;
  const crystalsEarned = Math.max(0, Math.round(totalScore / 220));
  const prevBest = state.userStats?.bestMarathonScore || 0;
  const isNewRecord = totalScore > 0 && totalScore > prevBest;
  if (isNewRecord && state.userStats) {
    state.userStats.bestMarathonScore = totalScore;
  }

  let rankTitle = "🎧 חימום טוב!";
  if (totalScore >= 12000) rankTitle = "👑 אגדת מרתון!";
  else if (totalScore >= 8500) rankTitle = "🔥 אלוף מרתון!";
  else if (totalScore >= 5000) rankTitle = "🎵 אוזן חדה!";

  const rankEl = document.getElementById("marathon-sum-rank");
  const scoreEl = document.getElementById("marathon-sum-score");
  const accEl = document.getElementById("marathon-sum-acc");
  const cryEl = document.getElementById("marathon-sum-crystals");
  const listEl = document.getElementById("marathon-summary-list");

  if (rankEl) rankEl.textContent = isNewRecord ? `🏆 שיא אישי חדש! · ${rankTitle}` : rankTitle;
  if (scoreEl) {
    const bestLabel = isNewRecord ? totalScore : prevBest;
    scoreEl.innerHTML = `${totalScore.toLocaleString("he-IL")} נק' <span class="marathon-best-sub">שיא אישי: ${bestLabel.toLocaleString("he-IL")}</span>`;
  }
  if (accEl) accEl.textContent = `${goodCount} / ${questions.length}`;
  if (cryEl) {
    cryEl.innerHTML = `+${crystalsEarned} <img class="icon-3d-mini icon-3d-crystal" src="assets/icon-crystal.png" alt="" />`;
  }

  if (crystalsEarned > 0 && state.currentUser) {
    awardPoints(crystalsEarned);
    updatePointsDisplay();
    saveUserStats();
    playCrystalSfx();
  } else if (isNewRecord) {
    saveUserStats();
  }
  if (isNewRecord || totalScore >= 5500) {
    launchWinConfetti();
  }

  if (listEl) {
    listEl.innerHTML = "";
    historyResults.forEach((item, idx) => {
      const row = document.createElement("div");
      row.className = `marathon-sum-row ${item.points >= 500 ? "is-hit" : item.points > 0 ? "is-close" : "is-miss"}`;

      const img = document.createElement("img");
      img.className = "marathon-sum-thumb";
      img.src = item.q.song.artwork || "";
      img.alt = "";

      const meta = document.createElement("div");
      meta.className = "marathon-sum-meta";

      const title = document.createElement("div");
      title.className = "marathon-sum-song";
      title.textContent = `${idx + 1}. ${item.q.song.title} · ${item.q.song.artist}`;

      const detail = document.createElement("div");
      detail.className = "marathon-sum-detail";
      detail.textContent = item.q.type === "year"
        ? `📅 שנת יציאה: ${item.q.correctYear} · ניחשת: ${item.userAnswerText}`
        : `🎵 תשובתך: ${item.userAnswerText}`;

      meta.append(title, detail);

      const pts = document.createElement("span");
      pts.className = `marathon-sum-pts${item.points < 0 ? " is-negative" : ""}`;
      pts.textContent = item.points > 0 ? `+${item.points}` : String(item.points);

      row.append(img, meta, pts);
      listEl.appendChild(row);
    });
  }
}

async function runBigCountdown(sessionId, prepPromise) {
  const overlay = document.getElementById("marathon-countdown-overlay");
  const numEl = document.getElementById("marathon-countdown-num");
  const subEl = document.getElementById("marathon-countdown-sub");
  if (!overlay || !numEl) {
    return await prepPromise;
  }

  overlay.classList.add("visible");
  if (subEl) subEl.textContent = "התכוננו — 10 שאלות · 15 שניות לכל שאלה!";

  const steps = ["3", "2", "1", "צא!"];
  for (let i = 0; i < steps.length; i++) {
    if (sessionId !== activeSessionId) return null;
    numEl.textContent = steps[i];
    numEl.classList.remove("pop", "is-go");
    void numEl.offsetWidth;
    numEl.classList.add("pop");
    if (i === 3) {
      numEl.classList.add("is-go");
      playWinSfx();
      vibrateWin();
    } else {
      playClickSfx();
      vibrateTap();
    }
    await new Promise(r => setTimeout(r, i === 3 ? 650 : 850));
  }

  if (sessionId !== activeSessionId) return null;
  if (subEl) subEl.textContent = "טוען שירים...";
  const pool = await prepPromise;
  if (sessionId !== activeSessionId) return null;
  overlay.classList.remove("visible");
  return pool;
}

function bindMarathonListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const slider = document.getElementById("marathon-year-slider");
  const yearVal = document.getElementById("marathon-year-val");
  if (slider && yearVal) {
    slider.addEventListener("input", () => {
      yearVal.textContent = slider.value;
    });
  }

  document.querySelectorAll("[data-year-step]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!slider || slider.disabled) return;
      const step = Number(btn.dataset.yearStep || 0);
      const next = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Number(slider.value) + step));
      slider.value = String(next);
      if (yearVal) yearVal.textContent = String(next);
      playClickSfx();
    });
  });

  const pu5050 = document.getElementById("marathon-pu-5050");
  if (pu5050) {
    pu5050.addEventListener("click", () => {
      if (questionAnswered || !(state.userStats?.powerups?.fiftyFifty > 0)) return;
      const wrongBtns = Array.from(document.querySelectorAll(".marathon-choice-btn"))
        .filter(b => b.dataset.correct !== "1" && !b.disabled);
      if (wrongBtns.length < 2) return;
      state.userStats.powerups.fiftyFifty--;
      saveUserStats();
      shuffle(wrongBtns).slice(0, 2).forEach(b => {
        b.disabled = true;
        b.style.opacity = "0.22";
      });
      playClickSfx();
      updateMarathonPowerupButtons();
      pu5050.disabled = true;
    });
  }

  const puTime = document.getElementById("marathon-pu-time");
  if (puTime) {
    puTime.addEventListener("click", () => {
      if (questionAnswered || !(state.userStats?.powerups?.extraTime > 0)) return;
      state.userStats.powerups.extraTime--;
      saveUserStats();
      questionStartPerf = Math.min(performance.now(), questionStartPerf + 5000);
      playCrystalSfx();
      updateMarathonPowerupButtons();
    });
  }

  const lockBtn = document.getElementById("marathon-year-confirm-btn");
  if (lockBtn) {
    lockBtn.addEventListener("click", () => handleYearLockIn(activeSessionId));
  }

  const nextBtn = document.getElementById("marathon-next-q-btn");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => advanceQuestion(activeSessionId));
  }

  const replayAudioBtn = document.getElementById("marathon-replay-audio-btn");
  if (replayAudioBtn) {
    replayAudioBtn.addEventListener("click", () => {
      const q = questions[currentIndex];
      if (q?.song?.previewUrl) playSongSnippet(q.song.previewUrl);
    });
  }

  const exitBtn = document.getElementById("marathon-exit-btn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (questions.length > 0 && currentIndex < questions.length && currentIndex > 0) {
        if (!window.confirm("לצאת באמצע המרתון? ההתקדמות בריצה הנוכחית תימחק.")) return;
      }
      stopMarathonSession();
      if (typeof exitCallback === "function") exitCallback();
    });
  }

  const replayBtn = document.getElementById("marathon-replay-btn");
  if (replayBtn) {
    replayBtn.addEventListener("click", () => startMarathonSession(exitCallback));
  }

  const homeBtn = document.getElementById("marathon-home-btn");
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      stopMarathonSession();
      if (typeof exitCallback === "function") exitCallback();
    });
  }

  const shareBtn = document.getElementById("marathon-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const grid = historyResults.map(r => (r.points >= 450 ? "🟩" : r.points > 0 ? "🟨" : "🟥")).join("");
      const hits = historyResults.filter(r => r.points >= 450).length;
      const text = `🎵 נחש את השיר · מרתון 10 שאלות\n${grid}\n🏆 ${totalScore.toLocaleString("he-IL")} נק' (${hits}/${historyResults.length})\nתצליחו לעקוף אותי? 👇\nhttps://guessthesonghebrew.pages.dev`;
      if (navigator.share) {
        try {
          await navigator.share({ text });
          return;
        } catch (e) { }
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text).catch(() => { });
      }
      shareBtn.textContent = "✓ התוצאה הועתקה לוואטסאפ!";
      setTimeout(() => { shareBtn.textContent = "📤 שתף תוצאה (בלי ספוילרים)"; }, 2200);
    });
  }
}

export async function startMarathonSession(onExit) {
  bindMarathonListenersOnce();
  stopAudioVisuals();
  releaseMediaElement();
  initAudioContext();

  // שחרור אודיו מוקדם במגע ל-iOS Safari
  const audio = getAudioEl();
  if (audio) {
    try { audio.load(); } catch (e) { }
  }

  exitCallback = onExit || null;
  const sessionId = ++activeSessionId;
  clearQuestionTimers();
  questions = [];
  currentIndex = 0;
  totalScore = 0;
  displayedScore = 0;
  marathonStreak = 0;
  historyResults = [];
  questionAnswered = false;

  const playView = document.getElementById("marathon-play-view");
  const summaryView = document.getElementById("marathon-summary-view");
  if (playView) playView.style.display = "flex";
  if (summaryView) summaryView.style.display = "none";

  // מתחילים להכין את חבילת השירים במקביל לספירה לאחור 3..2..1..צא!
  const prepPromise = prepareMarathonSongPool();
  const pool = await runBigCountdown(sessionId, prepPromise);
  if (sessionId !== activeSessionId || !pool) return;

  questions = buildQuestionsDeck(pool);
  if (questions.length === 0) {
    const promptEl = document.getElementById("marathon-q-prompt");
    if (promptEl) promptEl.textContent = "לא הצלחנו לטעון שירים כרגע — נסה שוב בעוד רגע.";
    return;
  }

  renderCurrentQuestion(sessionId);
}
