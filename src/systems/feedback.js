import { DURATIONS } from "../data/config.js?v=20261123q";
import { dom } from "../dom.js?v=20261123q";
import { state } from "../state.js?v=20261123q";
import { normalizeHebrew } from "../utils/text.js?v=20261123q";

export function evaluateTargetMatch(normTyped, normTarget) {
  if (!normTyped || !normTarget) return { matchedChars: 0, wrongChars: 0, accuracy: 1 };
  const freq = {};
  for (const ch of normTarget) freq[ch] = (freq[ch] || 0) + 1;
  let matched = 0;
  let wrong = 0;
  for (const ch of normTyped) {
    if (freq[ch] > 0) {
      matched++;
      freq[ch]--;
    } else {
      wrong++;
    }
  }
  return { matchedChars: matched, wrongChars: wrong, accuracy: matched / normTyped.length };
}

export function clearSearchBarFeedback() {
  dom.guessInput.style.backgroundColor = "";
  dom.guessInput.style.borderColor = "";
  dom.guessInput.style.boxShadow = "";
  if (dom.searchIcon) dom.searchIcon.style.fill = "";
}

export function updateSearchBarProximityFeedback(rawText) {
  if (!state.redFeedbackEnabled || DURATIONS[state.currentAttempt] < 8 || !state.currentSong || !rawText?.trim()) {
    clearSearchBarFeedback();
    return;
  }

  const sepIdx = rawText.lastIndexOf(" - ");
  const typedPart = sepIdx > 0 ? rawText.slice(0, sepIdx) : rawText;
  const normTyped = normalizeHebrew(typedPart).replace(/\s+/g, "");
  if (!normTyped) {
    clearSearchBarFeedback();
    return;
  }

  const normSongTitle = normalizeHebrew(state.currentSong.title).replace(/\s+/g, "");
  const normArtistName = normalizeHebrew(state.currentSong.artist).replace(/\s+/g, "");

  const bestEval = [
    evaluateTargetMatch(normTyped, normSongTitle),
    evaluateTargetMatch(normTyped, normArtistName),
    evaluateTargetMatch(normTyped, normSongTitle + normArtistName)
  ].sort((a, b) => b.accuracy - a.accuracy)[0];

  if (bestEval.wrongChars > 0 && (bestEval.wrongChars >= 2 || bestEval.accuracy < 0.6)) {
    const refLen = Math.max(3, Math.min(normSongTitle.length, normArtistName.length));
    const redIntensity = Math.min(1, (bestEval.wrongChars / refLen) * (1.2 - bestEval.accuracy * 0.5));
    dom.guessInput.style.backgroundColor = `rgba(233, 20, 41, ${(0.10 + redIntensity * 0.40).toFixed(2)})`;
    dom.guessInput.style.borderColor = `rgba(233, 20, 41, ${(0.40 + redIntensity * 0.60).toFixed(2)})`;
    dom.guessInput.style.boxShadow = `0 0 18px rgba(233, 20, 41, ${(0.12 + redIntensity * 0.38).toFixed(2)})`;
    if (dom.searchIcon) dom.searchIcon.style.fill = "#ff4d5e";
  } else {
    clearSearchBarFeedback();
  }
}

export function updateSettingsStatusPills() {
  if (dom.easySearchStatusPill) {
    dom.easySearchStatusPill.classList.toggle("visible", state.easySearchFiftyActive);
  }
  if (dom.redFeedbackStatusPill) {
    dom.redFeedbackStatusPill.classList.toggle("visible", state.redFeedbackEnabled);
  }
}

export function updateHintsPanelVisibility() {
  dom.hintsPanel.style.display = (state.hintsEnabled && DURATIONS[state.currentAttempt] >= 15 && state.currentSong) ? "flex" : "none";
}

export function resetHintButtons() {
  dom.hintArtistBtn.classList.remove("revealed");
  dom.hintArtistBtn.textContent = "🎤 חשוף זמר/ת";
  dom.hintYearBtn.classList.remove("revealed");
  dom.hintYearBtn.textContent = "📅 שנת יציאה";
  dom.hintPatternBtn.classList.remove("revealed");
  dom.hintPatternBtn.textContent = "🔤 תבנית ואות ראשונה";
  dom.hintsPanel.style.display = "none";
}

export function initHintListeners() {
  dom.hintArtistBtn.addEventListener("click", () => {
    if (!state.currentSong) return;
    state.usedHintInRound = true;
    dom.hintArtistBtn.classList.add("revealed");
    dom.hintArtistBtn.textContent = `🎤 זמר/ת: ${state.currentSong.artist}`;
  });

  dom.hintYearBtn.addEventListener("click", () => {
    if (!state.currentSong) return;
    state.usedHintInRound = true;
    dom.hintYearBtn.classList.add("revealed");
    dom.hintYearBtn.textContent = `📅 יצא בשנת: ${state.currentSong.releaseYear || "לא ידועה"}`;
  });

  dom.hintPatternBtn.addEventListener("click", () => {
    if (!state.currentSong) return;
    state.usedHintInRound = true;
    dom.hintPatternBtn.classList.add("revealed");
    const words = state.currentSong.title.trim().split(/\s+/);
    const firstLetter = state.currentSong.title.trim().charAt(0);
    const pattern = words.map((w, idx) =>
      idx === 0 ? firstLetter + "·".repeat(Math.max(0, w.length - 1)) : "·".repeat(w.length)
    ).join(" ");
    dom.hintPatternBtn.textContent = `🔤 ${words.length} מילים (${pattern})`;
  });
}
