import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js";
import { dom, PLAY_SVG, SPOTIFY_SVG } from "../dom.js";
import { state } from "../state.js";
import { stopGalleryPreview, updateGalleryCardsPlayState, toggleGallerySongPreview } from "./gallery.js";
import { formatPoints, getPointsBalance } from "./economy.js";

export function updateStreakDisplay() {
  const s = state.userStats.currentStreak || 0;
  dom.streakCountEl.textContent = s;
  dom.streakBadge.classList.toggle("active-streak", s > 0);
  dom.streakBadge.classList.toggle("zero-streak", s === 0);
  if (dom.profileBtnLabel) {
    dom.profileBtnLabel.textContent = state.currentUser ? state.currentUser : "אורח";
  }
}

// Profile & Stats Modal Rendering
export function renderStatBars(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  const maxCount = Math.max(1, ...items.map(i => i.count));

  items.forEach(({ label, count, color }) => {
    const pct = Math.round((count / maxCount) * 100);
    const row = document.createElement("div");
    row.className = "stat-bar-row";
    row.innerHTML = `
      <span class="stat-bar-label" ${color ? `style="color:${color}"` : ""}>${label}</span>
      <div class="stat-bar-track">
        <div class="stat-bar-fill" style="width:${count > 0 ? Math.max(8, pct) : 0}%; ${color ? `background:${color}` : ""}"></div>
      </div>
      <span class="stat-bar-count">${count}</span>
    `;
    container.appendChild(row);
  });
}

export function renderProfileStatsModal() {
  const isGuest = !state.currentUser;
  dom.authCard.style.display = isGuest ? "flex" : "none";
  dom.loggedUserBar.style.display = isGuest ? "none" : "flex";
  if (dom.loggedUsernameDisplay) dom.loggedUsernameDisplay.textContent = state.currentUser || "";
  dom.statsLockWrapper.classList.toggle("guest-locked", isGuest);

  const heard = state.userStats.totalHeard || 0;
  const won = state.userStats.totalWon || 0;
  const rate = heard > 0 ? Math.round((won / heard) * 100) : 0;

  document.getElementById("stat-heard").textContent = heard;
  document.getElementById("stat-won").textContent = won;
  document.getElementById("stat-rate").textContent = `${rate}%`;
  document.getElementById("stat-best-streak").textContent = `${state.userStats.bestStreak || 0}🔥`;
  if (dom.statPoints) dom.statPoints.textContent = formatPoints(getPointsBalance());
  if (dom.statTotalPoints) dom.statTotalPoints.textContent = formatPoints(state.userStats.totalPointsEarned || getPointsBalance());

  renderStatBars("stats-by-level", DIFFICULTY_ORDER.map(lvl => ({
    label: DIFFICULTIES[lvl].label,
    count: state.userStats.byLevel?.[lvl] || 0,
    color: DIFFICULTIES[lvl].color
  })));

  renderStatBars("stats-by-speed", DURATIONS.map(dur => ({
    label: `${dur} שניות`,
    count: state.userStats.bySpeed?.[String(dur)] || 0
  })));

  const galleryGrid = document.getElementById("won-gallery-grid");
  galleryGrid.innerHTML = "";
  const wonList = state.userStats.wonSongs || [];

  if (wonList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-gallery-msg";
    empty.textContent = "עדיין לא זיהית שירים. נחש שיר נכון והוא יופיע כאן בגלריה להאזנה!";
    galleryGrid.appendChild(empty);
  } else {
    wonList.forEach(item => {
      const itemId = item.trackId || `${item.title}_${item.artist}`;
      const card = document.createElement("div");
      card.className = "gallery-item";
      card.dataset.trackId = itemId;
      card.title = `לחץ להשמעת "${item.title}" ולהצגת קישור ל-Spotify`;

      const mainRow = document.createElement("div");
      mainRow.className = "gallery-item-main";

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "gallery-thumb-wrapper";

      const img = document.createElement("img");
      img.className = "gallery-thumb";
      img.src = item.artwork || "";
      img.alt = item.title;

      const overlay = document.createElement("div");
      overlay.className = "gallery-play-overlay";
      overlay.innerHTML = `<svg viewBox="0 0 24 24">${PLAY_SVG}</svg>`;

      thumbWrap.append(img, overlay);

      const meta = document.createElement("div");
      meta.className = "gallery-meta";

      const tSpan = document.createElement("span");
      tSpan.className = "gallery-song-title";
      tSpan.textContent = item.title;

      const aSpan = document.createElement("span");
      aSpan.className = "gallery-song-artist";
      aSpan.textContent = item.artist;

      const badges = document.createElement("div");
      badges.className = "gallery-badges";

      const timePill = document.createElement("span");
      timePill.className = "gallery-time-pill";
      timePill.textContent = `${item.timeSec}s`;

      const lvlDiff = DIFFICULTIES[item.level];
      const lvlPill = document.createElement("span");
      lvlPill.style.fontSize = "10px";
      lvlPill.style.fontWeight = "700";
      lvlPill.style.color = lvlDiff ? lvlDiff.color : "#1ed760";
      lvlPill.textContent = lvlDiff ? lvlDiff.label : "";

      badges.append(timePill, lvlPill);
      meta.append(tSpan, aSpan, badges);
      mainRow.append(thumbWrap, meta);

      const spotifyLink = document.createElement("a");
      spotifyLink.className = "gallery-spotify-link";
      spotifyLink.href = `https://open.spotify.com/search/${encodeURIComponent(item.title + " " + item.artist)}`;
      spotifyLink.target = "_blank";
      spotifyLink.rel = "noopener noreferrer";
      spotifyLink.innerHTML = `<svg viewBox="0 0 24 24">${SPOTIFY_SVG}</svg><span>נגן ב-Spotify</span>`;
      spotifyLink.addEventListener("click", (e) => e.stopPropagation());

      card.append(mainRow, spotifyLink);
      card.addEventListener("click", () => toggleGallerySongPreview(item));
      galleryGrid.appendChild(card);
    });
    updateGalleryCardsPlayState();
  }
}

export function updateBottomNavActiveTab(activeTab = "game") {
  if (dom.profileBtn) dom.profileBtn.classList.toggle("active", activeTab === "profile");
  if (dom.navGameBtn) dom.navGameBtn.classList.toggle("active", activeTab === "game");
  if (dom.navShopBtn) dom.navShopBtn.classList.toggle("active", activeTab === "shop");
}

export function toggleShopModal(isOpen) {
  if (isOpen) {
    if (dom.profileModalBackdrop?.classList.contains("open")) {
      stopGalleryPreview();
      dom.profileModalBackdrop.classList.remove("open");
    }
    if (dom.shopPointsBalance) {
      dom.shopPointsBalance.textContent = formatPoints(getPointsBalance());
    }
  }
  if (dom.shopModalBackdrop) {
    dom.shopModalBackdrop.classList.toggle("open", isOpen);
  }
  updateBottomNavActiveTab(isOpen ? "shop" : "game");
}

export function toggleProfileModal(isOpen) {
  if (isOpen) {
    if (dom.shopModalBackdrop?.classList.contains("open")) {
      dom.shopModalBackdrop.classList.remove("open");
    }
    renderProfileStatsModal();
  } else {
    stopGalleryPreview();
  }
  dom.profileModalBackdrop.classList.toggle("open", isOpen);
  updateBottomNavActiveTab(isOpen ? "profile" : "game");
}

export function initProfileListeners() {
  dom.profileBtn.addEventListener("click", () => {
    const isAlreadyOpen = dom.profileModalBackdrop.classList.contains("open");
    toggleProfileModal(!isAlreadyOpen);
  });
  if (dom.navGameBtn) {
    dom.navGameBtn.addEventListener("click", () => {
      toggleProfileModal(false);
      toggleShopModal(false);
      updateBottomNavActiveTab("game");
    });
  }
  if (dom.navShopBtn) {
    dom.navShopBtn.addEventListener("click", () => {
      const isAlreadyOpen = dom.shopModalBackdrop?.classList.contains("open");
      toggleShopModal(!isAlreadyOpen);
    });
  }
  if (dom.shopCloseBtn) {
    dom.shopCloseBtn.addEventListener("click", () => toggleShopModal(false));
  }
  if (dom.shopModalBackdrop) {
    dom.shopModalBackdrop.addEventListener("click", (e) => {
      if (e.target === dom.shopModalBackdrop) toggleShopModal(false);
    });
  }
  dom.streakBadge.addEventListener("click", () => toggleProfileModal(true));
  if (dom.pointsBadge) dom.pointsBadge.addEventListener("click", () => toggleShopModal(true));
  dom.profileCloseBtn.addEventListener("click", () => toggleProfileModal(false));
  dom.profileModalBackdrop.addEventListener("click", (e) => {
    if (e.target === dom.profileModalBackdrop) toggleProfileModal(false);
  });
}
