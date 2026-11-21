import { ARTISTS_DB } from "../data/artists.js?v=20261121r";
import { state } from "../state.js?v=20261121r";
import { getArtistCatalog, ensureSeedCatalogLoaded } from "../services/itunes.js?v=20261121r";
import { initAudioContext, stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261121r";
import { awardPoints, updatePointsDisplay } from "./economy.js?v=20261121r";
import { saveUserStats } from "../services/storage.js?v=20261121r";
import { launchWinConfetti } from "./confetti.js?v=20261121r";
import { playClickSfx, playWinSfx, playWrongSfx, playCrystalSfx } from "./sfx.js?v=20261121r";

const TOTAL_QUESTIONS = 10;
const QUESTION_DURATION_MS = 15000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2026;

let activeSessionId = 0;
let questions = [];
let currentIndex = 0;
let totalScore = 0;
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

  // מחלקים למיקס של ~6 שאלות 4 אופציות ו-~4 שאלות ניחוש שנה (רק לשירים שיש להם שנת יציאה תקינה)
  const yearEligibleIndices = chosen
    .map((s, idx) => ({ idx, ok: Number.isFinite(s.releaseYear) && s.releaseYear >= MIN_YEAR && s.releaseYear <= MAX_YEAR }))
    .filter(x => x.ok)
    .map(x => x.idx);

  const yearTargetCount = Math.min(4, Math.floor(chosen.length * 0.4), yearEligibleIndices.length);
  const yearIndexSet = new Set(shuffle(yearEligibleIndices).slice(0, yearTargetCount));

  return chosen.map((song, idx) => {
    if (yearIndexSet.has(idx)) {
      return {
        type: "year",
        song,
        correctYear: song.releaseYear
      };
    }

    // בוחרים 3 מסיחים (עדיפות לשירים מאמנים שונים כדי שלא יהיו בלבולים מיותרים)
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

function calcYearScore(guessYear, actualYear) {
  const diff = Math.abs(guessYear - actualYear);
  if (diff === 0) return { points: 1000, label: "🎯 בול בשנה!" };
  if (diff === 1) return { points: 850, label: "🔥 מרחק שנה אחת!" };
  if (diff === 2) return { points: 700, label: "✨ קרוב מאוד!" };
  if (diff <= 4) return { points: 500, label: "👍 יפה מאוד!" };
  if (diff <= 7) return { points: 300, label: "👌 באזור" };
  if (diff <= 10) return { points: 150, label: "🤏 קצת רחוק" };
  return { points: 0, label: "❄️ רחוק מדי" };
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

function updateHeaderHUD() {
  const qNumEl = document.getElementById("marathon-q-counter");
  const scoreEl = document.getElementById("marathon-score-val");
  if (qNumEl) qNumEl.textContent = `שאלה ${Math.min(currentIndex + 1, questions.length)} מתוך ${questions.length}`;
  if (scoreEl) scoreEl.textContent = totalScore.toLocaleString("he-IL");
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
  if (fbPts) fbPts.textContent = pointsEarned > 0 ? `+${pointsEarned} נק'` : "0 נק'";
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
  clearQuestionTimers();
  playWrongSfx();

  const q = questions[currentIndex];
  if (q.type === "song") {
    document.querySelectorAll(".marathon-choice-btn").forEach(btn => {
      btn.disabled = true;
      if (btn.dataset.correct === "1") btn.classList.add("is-correct");
    });
    historyResults.push({
      q,
      points: 0,
      userAnswerText: "נגמר הזמן",
      correctText: `${q.song.title} — ${q.song.artist}`,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "⏰ נגמר הזמן!",
      subText: `השיר היה: ${q.song.title} · ${q.song.artist}`,
      pointsEarned: 0
    });
  } else {
    const lockBtn = document.getElementById("marathon-year-confirm-btn");
    const slider = document.getElementById("marathon-year-slider");
    if (lockBtn) lockBtn.disabled = true;
    if (slider) slider.disabled = true;
    historyResults.push({
      q,
      points: 0,
      userAnswerText: "נגמר הזמן",
      correctText: `שנת ${q.correctYear}`,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "⏰ נגמר הזמן!",
      subText: `השיר יצא בשנת ${q.correctYear}`,
      pointsEarned: 0
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
    const pts = Math.round(500 + 500 * remainingRatio);
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
    showFeedbackAndScheduleNext(sessionId, {
      isGood: true,
      titleText: "🎉 תשובה נכונה!",
      subText: `${q.song.title} · ${q.song.artist}`,
      pointsEarned: pts
    });
  } else {
    btn.classList.add("is-wrong");
    playWrongSfx();
    historyResults.push({
      q,
      points: 0,
      userAnswerText: opt.title,
      correctText: `${q.song.title} — ${q.song.artist}`,
      isGood: false
    });
    showFeedbackAndScheduleNext(sessionId, {
      isGood: false,
      titleText: "❌ לא הפעם",
      subText: `התשובה הנכונה: ${q.song.title} · ${q.song.artist}`,
      pointsEarned: 0
    });
  }
}

function handleYearLockIn(sessionId) {
  if (questionAnswered || sessionId !== activeSessionId) return;
  const q = questions[currentIndex];
  if (!q || q.type !== "year") return;

  questionAnswered = true;
  clearQuestionTimers();

  const slider = document.getElementById("marathon-year-slider");
  const lockBtn = document.getElementById("marathon-year-confirm-btn");
  const guessYear = Number(slider?.value || 2010);
  if (slider) slider.disabled = true;
  if (lockBtn) lockBtn.disabled = true;

  const { points, label } = calcYearScore(guessYear, q.correctYear);
  const diff = Math.abs(guessYear - q.correctYear);
  totalScore += points;
  updateHeaderHUD();

  if (points >= 500) playWinSfx();
  else if (points > 0) playClickSfx();
  else playWrongSfx();

  const diffText = diff === 0
    ? `בדיוק בשנת ${q.correctYear}!`
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

  if (q.type === "song") {
    if (typeBadge) typeBadge.textContent = "🎵 זהה את השיר";
    if (promptEl) promptEl.textContent = "איזה שיר מתנגן עכשיו?";
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

  const maxScore = questions.length * 1000;
  const goodCount = historyResults.filter(r => r.points >= 500).length;
  const crystalsEarned = Math.max(0, Math.round(totalScore / 200));

  let rankTitle = "🎧 חימום טוב!";
  if (totalScore >= maxScore * 0.8) rankTitle = "👑 אגדת מוזיקה!";
  else if (totalScore >= maxScore * 0.6) rankTitle = "🔥 אלוף מרתון!";
  else if (totalScore >= maxScore * 0.4) rankTitle = "🎵 אוזן חדה!";

  const rankEl = document.getElementById("marathon-sum-rank");
  const scoreEl = document.getElementById("marathon-sum-score");
  const accEl = document.getElementById("marathon-sum-acc");
  const cryEl = document.getElementById("marathon-sum-crystals");
  const listEl = document.getElementById("marathon-summary-list");

  if (rankEl) rankEl.textContent = rankTitle;
  if (scoreEl) scoreEl.textContent = `${totalScore.toLocaleString("he-IL")} / ${maxScore.toLocaleString("he-IL")}`;
  if (accEl) accEl.textContent = `${goodCount} / ${questions.length}`;
  if (cryEl) {
    cryEl.innerHTML = `+${crystalsEarned} <img class="icon-3d-mini icon-3d-crystal" src="assets/icon-crystal.png" alt="" />`;
  }

  if (crystalsEarned > 0 && state.currentUser) {
    awardPoints(crystalsEarned);
    updatePointsDisplay();
    saveUserStats();
    playCrystalSfx();
  }
  if (totalScore >= maxScore * 0.5) {
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
      pts.className = "marathon-sum-pts";
      pts.textContent = `+${item.points}`;

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
    } else {
      playClickSfx();
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
