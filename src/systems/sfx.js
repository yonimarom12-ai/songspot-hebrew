import { state } from "../state.js?v=20261123i";
import { safeStorageGet, safeStorageSet } from "../services/storage.js?v=20261123i";
import { initAudioContext } from "./audio.js?v=20261123i";

const SFX_STORAGE_KEY = "songspot_sfx_enabled_v1";

export function initSfxState() {
  const saved = safeStorageGet(SFX_STORAGE_KEY);
  state.sfxEnabled = saved === null ? true : saved !== "0";
}

export function setSfxEnabled(enabled) {
  state.sfxEnabled = Boolean(enabled);
  safeStorageSet(SFX_STORAGE_KEY, state.sfxEnabled ? "1" : "0");
}

function getReadyCtx() {
  if (!state.sfxEnabled) return null;
  const ctx = state.audioCtx || initAudioContext();
  if (!ctx || ctx.state !== "running") return null;
  return ctx;
}

function playTone(ctx, { freq, endFreq = null, type = "sine", startOffset = 0, duration = 0.08, gain = 0.06 }) {
  try {
    const now = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + duration);
    }
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.linearRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch (e) { }
}

export function playClickSfx() {
  const ctx = getReadyCtx();
  if (!ctx) return;
  playTone(ctx, { freq: 620, endFreq: 860, type: "sine", duration: 0.045, gain: 0.045 });
}

export function playSkipSfx() {
  const ctx = getReadyCtx();
  if (!ctx) return;
  playTone(ctx, { freq: 420, endFreq: 560, type: "triangle", duration: 0.075, gain: 0.05 });
}

export function playWrongSfx() {
  const ctx = getReadyCtx();
  if (!ctx) return;
  playTone(ctx, { freq: 240, endFreq: 170, type: "triangle", startOffset: 0, duration: 0.13, gain: 0.075 });
  playTone(ctx, { freq: 185, endFreq: 135, type: "triangle", startOffset: 0.1, duration: 0.16, gain: 0.065 });
}

export function playWinSfx() {
  const ctx = getReadyCtx();
  if (!ctx) return;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, idx) => {
    playTone(ctx, { freq: f, type: "triangle", startOffset: idx * 0.07, duration: 0.24, gain: 0.07 });
  });
}

export function playCrystalSfx() {
  const ctx = getReadyCtx();
  if (!ctx) return;
  const notes = [1318.5, 1760, 2093]; // E6 A6 C7 sparkle
  notes.forEach((f, idx) => {
    playTone(ctx, { freq: f, type: "sine", startOffset: 0.12 + idx * 0.065, duration: 0.22, gain: 0.05 });
  });
}
