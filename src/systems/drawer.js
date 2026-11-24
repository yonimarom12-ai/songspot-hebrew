import { GENRE_LABELS, DECADE_LABELS } from "../data/config.js?v=20261124i";
import { dom } from "../dom.js?v=20261124i";
import { state } from "../state.js?v=20261124i";
import {
  updateSettingsStatusPills,
  updateSearchBarProximityFeedback,
  updateHintsPanelVisibility
} from "./feedback.js?v=20261124i";
import { triggerSearchForCurrentInput, closeSuggestionsDropdown } from "./search.js?v=20261124i";
import { setSfxEnabled, playClickSfx } from "./sfx.js?v=20261124i";
import { saveUserStats } from "../services/storage.js?v=20261124i";

let settingsScreenHandler = null;

export function saveUserPreferences() {
  if (!state.userStats) return;
  state.userStats.preferences = {
    selectedGenres: Array.from(state.selectedGenres),
    selectedDecades: Array.from(state.selectedDecades),
    easySearch: Boolean(state.easySearchFiftyActive),
    redFeedback: Boolean(state.redFeedbackEnabled),
    hintsEnabled: Boolean(state.hintsEnabled),
    sfxEnabled: Boolean(state.sfxEnabled)
  };
  saveUserStats();
}

export function applyUserPreferencesFromStats() {
  const prefs = state.userStats?.preferences;
  if (!prefs || typeof prefs !== "object") return;

  state.selectedGenres.clear();
  (Array.isArray(prefs.selectedGenres) && prefs.selectedGenres.length ? prefs.selectedGenres : ["all"])
    .forEach(g => state.selectedGenres.add(g));

  state.selectedDecades.clear();
  (Array.isArray(prefs.selectedDecades) && prefs.selectedDecades.length ? prefs.selectedDecades : ["all"])
    .forEach(d => state.selectedDecades.add(d));

  state.easySearchFiftyActive = Boolean(prefs.easySearch);
  state.redFeedbackEnabled = Boolean(prefs.redFeedback);
  state.hintsEnabled = Boolean(prefs.hintsEnabled);
  setSfxEnabled(prefs.sfxEnabled !== undefined ? Boolean(prefs.sfxEnabled) : true);

  if (dom.easySearchSettingToggle) {
    dom.easySearchSettingToggle.classList.toggle("on", state.easySearchFiftyActive);
    dom.easySearchSettingToggle.setAttribute("aria-checked", String(Boolean(state.easySearchFiftyActive)));
  }
  if (dom.redFeedbackSettingToggle) {
    dom.redFeedbackSettingToggle.classList.toggle("on", state.redFeedbackEnabled);
    dom.redFeedbackSettingToggle.setAttribute("aria-checked", String(Boolean(state.redFeedbackEnabled)));
  }
  if (dom.hintsSettingToggle) {
    dom.hintsSettingToggle.classList.toggle("on", state.hintsEnabled);
    dom.hintsSettingToggle.setAttribute("aria-checked", String(Boolean(state.hintsEnabled)));
  }
  const sfxToggle = document.getElementById("sfx-setting-toggle");
  if (sfxToggle) {
    sfxToggle.classList.toggle("on", state.sfxEnabled);
    sfxToggle.setAttribute("aria-checked", String(Boolean(state.sfxEnabled)));
  }

  updateFilterPillsUI();
  updateSettingsStatusPills();
  updateHintsPanelVisibility();
}

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
  dom.genreOptionBtns.forEach(btn => {
    const sel = state.selectedGenres.has(btn.dataset.genre);
    btn.classList.toggle("selected", sel);
    btn.setAttribute("aria-pressed", String(sel));
  });
  dom.decadeOptionBtns.forEach(btn => {
    const sel = state.selectedDecades.has(btn.dataset.decade);
    btn.classList.toggle("selected", sel);
    btn.setAttribute("aria-pressed", String(sel));
  });

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
      saveUserPreferences();
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
    dom.easySearchSettingToggle.setAttribute("aria-checked", String(Boolean(state.easySearchFiftyActive)));
    updateSettingsStatusPills();
    saveUserPreferences();
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
    dom.redFeedbackSettingToggle.setAttribute("aria-checked", String(Boolean(state.redFeedbackEnabled)));
    updateSettingsStatusPills();
    updateSearchBarProximityFeedback(dom.guessInput.value);
    saveUserPreferences();
  });

  dom.hintsSettingToggle.addEventListener("click", () => {
    state.hintsEnabled = !state.hintsEnabled;
    dom.hintsSettingToggle.classList.toggle("on", state.hintsEnabled);
    dom.hintsSettingToggle.setAttribute("aria-checked", String(Boolean(state.hintsEnabled)));
    updateHintsPanelVisibility();
    saveUserPreferences();
    playClickSfx();
  });

  const sfxToggle = document.getElementById("sfx-setting-toggle");
  if (sfxToggle) {
    sfxToggle.classList.toggle("on", state.sfxEnabled);
    sfxToggle.setAttribute("aria-checked", String(Boolean(state.sfxEnabled)));
    sfxToggle.addEventListener("click", () => {
      setSfxEnabled(!state.sfxEnabled);
      sfxToggle.classList.toggle("on", state.sfxEnabled);
      sfxToggle.setAttribute("aria-checked", String(Boolean(state.sfxEnabled)));
      saveUserPreferences();
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
