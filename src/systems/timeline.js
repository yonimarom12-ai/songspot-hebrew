import { state } from "../state.js?v=20261122e";
import { ensureSeedCatalogLoaded } from "../services/itunes.js?v=20261122e";
import { initAudioContext, stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261122e";
import { awardPoints, updatePointsDisplay } from "./economy.js?v=20261122e";
import { saveUserStats } from "../services/storage.js?v=20261122e";
import { launchWinConfetti } from "./confetti.js?v=20261122e";
import { playClickSfx, playWinSfx, playWrongSfx, playCrystalSfx } from "./sfx.js?v=20261122e";

const TARGET_CARDS = 8;
const MAX_LIVES = 3;

let sessionId = 0;
let timelineCards = []; // ממוינים לפי releaseYear עולה
let deck = [];
let currentMystery = null;
let lives = MAX_LIVES;
let correctPlacements = 0;
let locked = false;
let exitCallback = null;
let listenersBound = false;

function stopTimelineAudio() {
  const el = document.getElementById("game-audio");
  if (el) {
    try { el.pause(); el.currentTime = 0; } catch (e) { }
  }
}

export function stopTimelineSession() {
  sessionId++;
  stopTimelineAudio();
  currentMystery = null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function collectYearSongs() {
  const map = new Map();
  for (const tracks of Object.values(state.artistCatalogCache || {})) {
    if (!Array.isArray(tracks)) continue;
    for (const s of tracks) {
      if (s && s.previewUrl && s.title && s.artist && Number.isFinite(s.releaseYear) && s.releaseYear >= 1970 && s.releaseYear <= 2026 && !map.has(s.trackId)) {
        map.set(s.trackId, s);
      }
    }
  }
  return Array.from(map.values());
}

function playPreview(url) {
  const el = document.getElementById("game-audio");
  if (!el || !url) return;
  try {
    el.pause();
    el.src = url;
    el.currentTime = 0;
    el.volume = 1;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => { });
  } catch (e) { }
}

function updateTimelineHUD() {
  const livesEl = document.getElementById("timeline-lives-pill");
  const progEl = document.getElementById("timeline-progress-pill");
  if (livesEl) {
    livesEl.textContent = "❤️".repeat(Math.max(0, lives)) + "🖤".repeat(Math.max(0, MAX_LIVES - lives));
  }
  if (progEl) {
    progEl.textContent = `${timelineCards.length} / ${TARGET_CARDS} שירים`;
  }
}

function renderTimelineBoard(mySession) {
  const board = document.getElementById("timeline-board");
  const mysteryTitle = document.getElementById("timeline-mystery-title");
  const mysteryArtist = document.getElementById("timeline-mystery-artist");
  if (!board) return;

  updateTimelineHUD();
  if (currentMystery) {
    if (mysteryTitle) mysteryTitle.textContent = currentMystery.title;
    if (mysteryArtist) mysteryArtist.textContent = currentMystery.artist;
  }

  board.innerHTML = "";
  const showSlots = Boolean(currentMystery && !locked);

  // יוצרים כפתורי "+ מקם כאן" לפני, בין ואחרי כל כרטיס בציר הזמן
  for (let i = 0; i <= timelineCards.length; i++) {
    if (showSlots) {
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "tl-drop-slot";
      if (i === 0) {
        slot.textContent = `+ לפני ${timelineCards[0].releaseYear}`;
      } else if (i === timelineCards.length) {
        slot.textContent = `+ אחרי ${timelineCards[timelineCards.length - 1].releaseYear}`;
      } else {
        slot.textContent = `+ בין ${timelineCards[i - 1].releaseYear} ל-${timelineCards[i].releaseYear}`;
      }
      slot.addEventListener("click", () => handleSlotPick(i, mySession));
      board.appendChild(slot);
    }

    if (i < timelineCards.length) {
      const card = timelineCards[i];
      const el = document.createElement("div");
      el.className = `tl-card${card._justPlaced ? " is-new" : ""}`;
      el.innerHTML = `
        <span class="tl-card-year">${card.releaseYear}</span>
        <span class="tl-card-meta">
          <strong class="tl-card-title"></strong>
          <span class="tl-card-artist"></span>
        </span>
      `;
      el.querySelector(".tl-card-title").textContent = card.title;
      el.querySelector(".tl-card-artist").textContent = card.artist;
      board.appendChild(el);
    }
  }
}

function handleSlotPick(slotIndex, mySession) {
  if (locked || !currentMystery || mySession !== sessionId) return;
  locked = true;
  const yr = currentMystery.releaseYear;
  const prevYr = slotIndex > 0 ? timelineCards[slotIndex - 1].releaseYear : -Infinity;
  const nextYr = slotIndex < timelineCards.length ? timelineCards[slotIndex].releaseYear : Infinity;
  const isCorrect = yr >= prevYr && yr <= nextYr;

  const fbEl = document.getElementById("timeline-feedback-banner");

  timelineCards.forEach(c => { delete c._justPlaced; });

  if (isCorrect) {
    correctPlacements++;
    const placed = { ...currentMystery, _justPlaced: true };
    timelineCards.splice(slotIndex, 0, placed);
    playWinSfx();
    if (state.currentUser) {
      awardPoints(8);
      updatePointsDisplay();
    }
    if (fbEl) {
      fbEl.className = "tl-feedback-banner visible is-win";
      fbEl.textContent = `✅ בול! "${currentMystery.title}" יצא בשנת ${yr} (+8 קריסטלים)`;
    }
  } else {
    lives--;
    playWrongSfx();
    if (fbEl) {
      fbEl.className = "tl-feedback-banner visible is-loss";
      fbEl.textContent = `❌ טעות! "${currentMystery.title}" יצא בשנת ${yr} (-1 לב)`;
    }
  }

  saveUserStats();
  renderTimelineBoard(mySession);

  setTimeout(() => {
    if (mySession !== sessionId) return;
    if (timelineCards.length >= TARGET_CARDS || lives <= 0 || deck.length === 0) {
      finishTimelineGame();
    } else {
      locked = false;
      currentMystery = deck.shift();
      if (fbEl) fbEl.classList.remove("visible");
      renderTimelineBoard(mySession);
      playPreview(currentMystery.previewUrl);
    }
  }, 1700);
}

function finishTimelineGame() {
  stopTimelineAudio();
  const won = timelineCards.length >= TARGET_CARDS;
  const playView = document.getElementById("timeline-play-view");
  const sumView = document.getElementById("timeline-summary-view");
  if (playView) playView.style.display = "none";
  if (sumView) sumView.style.display = "flex";

  const prevBest = state.userStats?.bestTimelineScore || 0;
  const score = correctPlacements;
  const isNewRecord = score > prevBest;
  if (isNewRecord && state.userStats) {
    state.userStats.bestTimelineScore = score;
  }

  let bonusCrystals = won ? 35 : 0;
  if (bonusCrystals > 0 && state.currentUser) {
    awardPoints(bonusCrystals);
    updatePointsDisplay();
    playCrystalSfx();
  }
  saveUserStats();
  if (won || isNewRecord) launchWinConfetti();

  const titleEl = document.getElementById("tl-sum-title");
  const subEl = document.getElementById("tl-sum-sub");
  if (titleEl) {
    titleEl.textContent = won ? "👑 ציר זמן מושלם! (+35 קריסטלים)" : "⏳ נגמרו הלבבות!";
  }
  if (subEl) {
    subEl.textContent = `מיקמת נכון ${score} שירים · שיא אישי: ${Math.max(score, prevBest)} שירים`;
  }
}

function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const replayAudio = document.getElementById("timeline-replay-audio-btn");
  if (replayAudio) {
    replayAudio.addEventListener("click", () => {
      playClickSfx();
      if (currentMystery?.previewUrl) playPreview(currentMystery.previewUrl);
    });
  }

  const exitBtn = document.getElementById("timeline-exit-btn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (correctPlacements > 0 && lives > 0 && timelineCards.length < TARGET_CARDS) {
        if (!window.confirm("לצאת באמצע ציר הזמן? ההתקדמות בריצה הנוכחית תימחק.")) return;
      }
      stopTimelineSession();
      if (typeof exitCallback === "function") exitCallback();
    });
  }

  const replayBtn = document.getElementById("tl-replay-btn");
  if (replayBtn) replayBtn.addEventListener("click", () => startTimelineSession(exitCallback));

  const homeBtn = document.getElementById("tl-home-btn");
  if (homeBtn) {
    homeBtn.addEventListener("click", () => {
      stopTimelineSession();
      if (typeof exitCallback === "function") exitCallback();
    });
  }

  const shareBtn = document.getElementById("tl-share-btn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const won = timelineCards.length >= TARGET_CARDS;
      const hearts = "❤️".repeat(Math.max(0, lives)) + "🖤".repeat(Math.max(0, MAX_LIVES - lives));
      const text = `⏳ נחש את השיר · ציר זמן\n${hearts}\n${won ? "👑 בניתי ציר זמן מושלם!" : `מיקמתי נכון ${correctPlacements} שירים!`}\nתצליחו לנצח אותי? 👇\nhttps://guessthesonghebrew.pages.dev`;
      if (navigator.share) {
        try { await navigator.share({ text }); return; } catch (e) { }
      }
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text).catch(() => { });
      shareBtn.textContent = "✓ הועתק לוואטסאפ!";
      setTimeout(() => { shareBtn.textContent = "📤 שתף תוצאה"; }, 2000);
    });
  }
}

export async function startTimelineSession(onExit) {
  bindListenersOnce();
  stopAudioVisuals();
  releaseMediaElement();
  initAudioContext();

  exitCallback = onExit || null;
  const mySession = ++sessionId;
  lives = MAX_LIVES;
  correctPlacements = 0;
  locked = false;

  const playView = document.getElementById("timeline-play-view");
  const sumView = document.getElementById("timeline-summary-view");
  const fbEl = document.getElementById("timeline-feedback-banner");
  if (playView) playView.style.display = "flex";
  if (sumView) sumView.style.display = "none";
  if (fbEl) fbEl.classList.remove("visible");

  await ensureSeedCatalogLoaded();
  if (mySession !== sessionId) return;

  // בוחרים שירים עם שנים שונות כדי שהמשחק יהיה הוגן ומעניין
  const all = shuffle(collectYearSongs());
  const distinct = [];
  const usedYears = new Set();
  for (const s of all) {
    if (!usedYears.has(s.releaseYear)) {
      usedYears.add(s.releaseYear);
      distinct.push(s);
    }
    if (distinct.length >= 16) break;
  }

  if (distinct.length < 4) return;
  timelineCards = [distinct[0]];
  deck = distinct.slice(1);
  currentMystery = deck.shift();

  renderTimelineBoard(mySession);
  playPreview(currentMystery.previewUrl);
}
