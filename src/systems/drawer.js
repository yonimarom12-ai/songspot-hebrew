import { GENRE_LABELS, DECADE_LABELS } from "../data/config.js?v=20261121p";
import { dom } from "../dom.js?v=20261121p";
import { state } from "../state.js?v=20261121p";
import {
  updateSettingsStatusPills,
  updateSearchBarProximityFeedback,
  updateHintsPanelVisibility
} from "./feedback.js?v=20261121p";
import { triggerSearchForCurrentInput, closeSuggestionsDropdown } from "./search.js?v=20261121p";
import { setSfxEnabled, playClickSfx } from "./sfx.js?v=20261121p";

let settingsScreenHandler = null;

export function setSettingsScreenHandler(fn) {
  settingsScreenHandler = fn;
}

// פתיחה/סגירה של דף ההגדרות הנפרד
export function toggleDrawer(isOpen) {
  if (settingsScreenHandler) {
    settingsScreenHandler(isOpen);
  }
}

export function formatFilterPillLabel(selectedSet, labelsMap, allText, pluralUnit) {
  if (selectedSet.has("all") || selectedSet.size === 0) return allText;
  if (selectedSet.size === 1) {
    const onlyKey = Array.from(selectedSet)[0];
    return labelsMap[onlyKey] || onlyKey;
  }
  return `${selectedSet.size} ${pluralUnit}`;
}

export function updateFilterPillsUI() {
  dom.genreOptionBtns.forEach(btn => btn.classList.toggle("selected", state.selectedGenres.has(btn.dataset.genre)));
  dom.decadeOptionBtns.forEach(btn => btn.classList.toggle("selected", state.selectedDecades.has(btn.dataset.decade)));

  dom.activeGenrePill.textContent = formatFilterPillLabel(state.selectedGenres, GENRE_LABELS, "כל הז'אנרים", "ז'אנרים");
  dom.activeDecadePill.textContent = formatFilterPillLabel(state.selectedDecades, DECADE_LABELS, "כל העשורים", "עשורים");
}

export function setupMultiSelectFilter(buttons, dataKey, targetSet) {
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const val = btn.dataset[dataKey];
      if (val === "all") {
        targetSet.clear();
        targetSet.add("all");
      } else {
        targetSet.delete("all");
        if (targetSet.has(val)) targetSet.delete(val);
        else targetSet.add(val);
        if (targetSet.size === 0) targetSet.add("all");
      }
      updateFilterPillsUI();
    });
  });
}

export function initDrawerListeners() {
  setupMultiSelectFilter(dom.genreOptionBtns, "genre", state.selectedGenres);
  setupMultiSelectFilter(dom.decadeOptionBtns, "decade", state.selectedDecades);

  dom.easySearchSettingToggle.addEventListener("click", () => {
    state.easySearchFiftyActive = !state.easySearchFiftyActive;
    if (state.easySearchFiftyActive) {
      state.usedEasySearchInRound = true;
    }
    dom.easySearchSettingToggle.classList.toggle("on", state.easySearchFiftyActive);
    updateSettingsStatusPills();
    if (dom.guessInput.value.trim().length > 0 && !dom.guessInput.disabled) {
      triggerSearchForCurrentInput();
    } else {
      closeSuggestionsDropdown();
    }
  });

  dom.redFeedbackSettingToggle.addEventListener("click", () => {
    state.redFeedbackEnabled = !state.redFeedbackEnabled;
    if (state.redFeedbackEnabled) {
      state.usedRedFeedbackInRound = true;
    }
    dom.redFeedbackSettingToggle.classList.toggle("on", state.redFeedbackEnabled);
    updateSettingsStatusPills();
    updateSearchBarProximityFeedback(dom.guessInput.value);
  });

  dom.hintsSettingToggle.addEventListener("click", () => {
    state.hintsEnabled = !state.hintsEnabled;
    dom.hintsSettingToggle.classList.toggle("on", state.hintsEnabled);
    updateHintsPanelVisibility();
    playClickSfx();
  });

  const sfxToggle = document.getElementById("sfx-setting-toggle");
  if (sfxToggle) {
    sfxToggle.classList.toggle("on", state.sfxEnabled);
    sfxToggle.addEventListener("click", () => {
      setSfxEnabled(!state.sfxEnabled);
      sfxToggle.classList.toggle("on", state.sfxEnabled);
      if (state.sfxEnabled) playClickSfx();
    });
  }

  if (dom.easySearchStatusPill) dom.easySearchStatusPill.addEventListener("click", () => toggleDrawer(true));
  if (dom.redFeedbackStatusPill) dom.redFeedbackStatusPill.addEventListener("click", () => toggleDrawer(true));
  if (dom.menuToggleBtn) dom.menuToggleBtn.addEventListener("click", () => toggleDrawer(true));
  if (dom.drawerApplyBtn) {
    dom.drawerApplyBtn.addEventListener("click", () => toggleDrawer(false));
  }
}
