import { GENRE_LABELS, DECADE_LABELS } from "../data/config.js?v=20261119k";
import { dom } from "../dom.js?v=20261119k";
import { state } from "../state.js?v=20261119k";
import {
  updateSettingsStatusPills,
  updateSearchBarProximityFeedback,
  updateHintsPanelVisibility
} from "./feedback.js?v=20261119k";
import { triggerSearchForCurrentInput, closeSuggestionsDropdown } from "./search.js?v=20261119k";
import { fetchRandomSong } from "./game.js?v=20261119k";

// Drawer & Multi-Select Filters Logic
export function toggleDrawer(isOpen) {
  dom.sideDrawer.classList.toggle("open", isOpen);
  dom.drawerBackdrop.classList.toggle("open", isOpen);
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
  });

  dom.easySearchStatusPill.addEventListener("click", () => toggleDrawer(true));
  dom.redFeedbackStatusPill.addEventListener("click", () => toggleDrawer(true));
  dom.menuToggleBtn.addEventListener("click", () => toggleDrawer(true));
  dom.activeGenrePill.addEventListener("click", () => toggleDrawer(true));
  dom.activeDecadePill.addEventListener("click", () => toggleDrawer(true));
  dom.drawerCloseBtn.addEventListener("click", () => toggleDrawer(false));
  dom.drawerBackdrop.addEventListener("click", () => toggleDrawer(false));
  dom.drawerApplyBtn.addEventListener("click", () => {
    toggleDrawer(false);
    const gameScreen = document.getElementById("screen-game");
    if (gameScreen?.classList.contains("active")) {
      fetchRandomSong();
    }
  });
}
