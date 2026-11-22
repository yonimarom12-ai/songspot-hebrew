import { state } from "../state.js?v=20261122u";
import { ensureSeedCatalogLoaded } from "../services/itunes.js?v=20261122u";
import { initAudioContext, stopAudioVisuals, releaseMediaElement } from "./audio.js?v=20261122u";
import { awardPoints, updatePointsDisplay } from "./economy.js?v=20261122u";
import { saveUserStats } from "../services/storage.js?v=20261122u";
import { launchWinConfetti } from "./confetti.js?v=20261122u";
import { playClickSfx, playWinSfx, playWrongSfx, playCrystalSfx } from "./sfx.js?v=20261122u";

let sessionId = 0;
let currentSong = null;
let reversedBuffer = null;
let activeSource = null;
let reverseStreak = 0;
let answered = false;
let exitCallback = null;
let listenersBound = false;

function stopReverseAudio() {
  if (activeSource) {
    try { activeSource.stop(); } catch (e) { }
    try { activeSource.disconnect(); } catch (e) { }
    activeSource = null;
  }
  const el = document.getElementById("game-audio");
  if (el) {
    try { el.pause(); el.currentTime = 0; } catch (e) { }
  }
  const disc = document.getElementById("reverse-disc");
  if (disc) disc.classList.remove("spinning");
}

export function stopReverseSession() {
  sessionId++;
  stopReverseAudio();
  reversedBuffer = null;
  currentSong = null;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function collectSongs() {
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

function createReversedBuffer(ctx, original) {
  const sliceSec = Math.min(7, original.duration);
  const startOffsetSec = original.duration > 10 ? 3 : 0;
  const startSample = Math.floor(startOffsetSec * original.sampleRate);
  const frameCount = Math.max(1, Math.floor(sliceSec * original.sampleRate));
  const safeCount = Math.min(frameCount, original.length - startSample);

  const rev = ctx.createBuffer(original.numberOfChannels, safeCount, original.sampleRate);
  for (let ch = 0; ch < original.numberOfChannels; ch++) {
    const src = original.getChannelData(ch);
    const dst = rev.getChannelData(ch);
    for (let i = 0; i < safeCount; i++) {
      dst[i] = src[startSample + (safeCount - 1 - i)];
    }
  }
  return rev;
}

function playReversedClip() {
  const ctx = initAudioContext();
  if (!ctx || !reversedBuffer) return;
  stopReverseAudio();
  try {
    const src = ctx.createBufferSource();
    src.buffer = reversedBuffer;
    src.connect(ctx.destination);
    const disc = document.getElementById("reverse-disc");
    if (disc) disc.classList.add("spinning");
    src.onended = () => {
      if (activeSource === src) activeSource = null;
      if (disc) disc.classList.remove("spinning");
    };
    src.start(0);
    activeSource = src;
  } catch (e) { }
}

function playForwardReveal(previewUrl) {
  stopReverseAudio();
  const el = document.getElementById("game-audio");
  if (!el || !previewUrl) return;
  try {
    el.src = previewUrl;
    el.currentTime = 3;
    el.volume = 1;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => { });
  } catch (e) { }
}

function updateReverseHUD() {
  const streakEl = document.getElementById("reverse-streak-val");
  const bestEl = document.getElementById("reverse-best-val");
  if (streakEl) streakEl.textContent = String(reverseStreak);
  if (bestEl) bestEl.textContent = String(state.userStats?.bestReverseStreak || 0);
}

async function loadNextReverseRound(mySession) {
  if (mySession !== sessionId) return;
  answered = false;
  reversedBuffer = null;
  stopReverseAudio();
  updateReverseHUD();

  const statusEl = document.getElementById("reverse-status-text");
  const choicesEl = document.getElementById("reverse-choices-grid");
  const coverEl = document.getElementById("reverse-cover-img");
  const playBtn = document.getElementById("reverse-play-btn");
  const fbEl = document.getElementById("reverse-feedback-box");

  if (fbEl) fbEl.classList.remove("visible", "is-win", "is-loss");
  if (coverEl) coverEl.classList.remove("revealed");
  if (playBtn) playBtn.disabled = true;
  if (choicesEl) choicesEl.innerHTML = "";
  if (statusEl) statusEl.textContent = "הופך את השיר להילוך אחורי... 🔄";

  await ensureSeedCatalogLoaded();
  if (mySession !== sessionId) return;

  const pool = shuffle(collectSongs());
  if (pool.length < 4) {
    if (statusEl) statusEl.textContent = "לא נמצאו מספיק שירים כרגע — נסה שוב.";
    return;
  }

  const ctx = initAudioContext();
  let chosen = null;
  let decoded = null;

  for (let i = 0; i < Math.min(4, pool.length); i++) {
    if (mySession !== sessionId) return;
    const cand = pool[i];
    try {
      const res = await fetch(cand.previewUrl);
      if (!res.ok) continue;
      const arrBuf = await res.arrayBuffer();
      if (!ctx) break;
      decoded = await ctx.decodeAudioData(arrBuf.slice(0));
      chosen = cand;
      break;
    } catch (e) { }
  }

  if (mySession !== sessionId) return;
  if (!chosen || !decoded) {
    if (statusEl) statusEl.textContent = "שגיאה בפענוח השמע — לחץ על נסה שוב.";
    return;
  }

  currentSong = chosen;
  reversedBuffer = createReversedBuffer(ctx, decoded);
  if (coverEl && chosen.artwork) coverEl.src = chosen.artwork;
  if (playBtn) playBtn.disabled = false;
  if (statusEl) statusEl.textContent = "האזן לשיר בהילוך אחורי ונחש מהו! 🔄";

  const distractors = [];
  const seen = new Set([chosen.title]);
  for (const s of pool) {
    if (distractors.length >= 3) break;
    if (s.trackId !== chosen.trackId && !seen.has(s.title)) {
      seen.add(s.title);
      distractors.push(s);
    }
  }

  const options = shuffle([
    { title: chosen.title, artist: chosen.artist, isCorrect: true },
    ...distractors.map(d => ({ title: d.title, artist: d.artist, isCorrect: false }))
  ]);

  if (choicesEl) {
    choicesEl.innerHTML = "";
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "marathon-choice-btn";
      btn.dataset.correct = opt.isCorrect ? "1" : "0";
      const t = document.createElement("span");
      t.className = "marathon-choice-title";
      t.textContent = opt.title;
      const a = document.createElement("span");
      a.className = "marathon-choice-artist";
      a.textContent = opt.artist;
      btn.append(t, a);
      btn.addEventListener("click", () => handleReverseChoice(btn, opt, mySession));
      choicesEl.appendChild(btn);
    });
  }

  playReversedClip();
}

function handleReverseChoice(btn, opt, mySession) {
  if (answered || mySession !== sessionId || !currentSong) return;
  answered = true;

  document.querySelectorAll("#reverse-choices-grid .marathon-choice-btn").forEach(b => {
    b.disabled = true;
    if (b.dataset.correct === "1") b.classList.add("is-correct");
  });

  const coverEl = document.getElementById("reverse-cover-img");
  if (coverEl) coverEl.classList.add("revealed");

  const fbEl = document.getElementById("reverse-feedback-box");
  const fbTitle = document.getElementById("reverse-fb-title");
  const fbSub = document.getElementById("reverse-fb-sub");

  if (opt.isCorrect) {
    reverseStreak++;
    if (state.userStats && reverseStreak > (state.userStats.bestReverseStreak || 0)) {
      state.userStats.bestReverseStreak = reverseStreak;
    }
    if (state.currentUser) {
      awardPoints(12);
      updatePointsDisplay();
    }
    saveUserStats();
    updateReverseHUD();
    playWinSfx();
    playCrystalSfx();
    if (reverseStreak >= 3) launchWinConfetti();

    if (fbEl) { fbEl.classList.remove("is-loss"); fbEl.classList.add("visible", "is-win"); }
    if (fbTitle) fbTitle.textContent = "🎉 בול! זיהית בהילוך אחורי! (+12 קריסטלים)";
    if (fbSub) fbSub.textContent = `האזן עכשיו למקור: ${currentSong.title} · ${currentSong.artist}`;
  } else {
    btn.classList.add("is-wrong");
    reverseStreak = 0;
    updateReverseHUD();
    playWrongSfx();
    if (fbEl) { fbEl.classList.remove("is-win"); fbEl.classList.add("visible", "is-loss"); }
    if (fbTitle) fbTitle.textContent = "❌ לא הפעם!";
    if (fbSub) fbSub.textContent = `השיר היה: ${currentSong.title} · ${currentSong.artist} (מתנגן כרגיל עכשיו)`;
  }

  // משמיע את השיר קדימה כדי לחוות את רגע ה"אההה!!"
  playForwardReveal(currentSong.previewUrl);
}

function bindListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const playBtn = document.getElementById("reverse-play-btn");
  if (playBtn) playBtn.addEventListener("click", () => { playClickSfx(); playReversedClip(); });

  const nextBtn = document.getElementById("reverse-next-btn");
  if (nextBtn) nextBtn.addEventListener("click", () => loadNextReverseRound(sessionId));

  const exitBtn = document.getElementById("reverse-exit-btn");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      stopReverseSession();
      if (typeof exitCallback === "function") exitCallback();
    });
  }
}

export function startReverseSession(onExit) {
  bindListenersOnce();
  stopAudioVisuals();
  releaseMediaElement();
  initAudioContext();
  exitCallback = onExit || null;
  reverseStreak = 0;
  const mySession = ++sessionId;
  loadNextReverseRound(mySession);
}
