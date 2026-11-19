import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js";
import { dom, PLAY_SVG, SPOTIFY_SVG } from "../dom.js";
import { state } from "../state.js";
import { saveUserStats } from "../services/storage.js";
import { stopGalleryPreview, updateGalleryCardsPlayState, toggleGallerySongPreview } from "./gallery.js";
import { formatPoints, getPointsBalance } from "./economy.js";
import { renderShop, clearShopPreview } from "./shop.js";

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

  renderProfileFavorites();
  setFavoritesEditMode(false);

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

function renderProfileFavorites() {
  const favs = state.userStats?.favorites || { song: "", album: "", artist: "" };
  const pairs = [
    ["fav-song-display", favs.song],
    ["fav-album-display", favs.album],
    ["fav-artist-display", favs.artist]
  ];
  pairs.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const trimmed = (val || "").trim();
    el.textContent = trimmed || "לא נבחר עדיין";
    el.classList.toggle("is-empty", !trimmed);
  });
}

function setFavoritesEditMode(isEditing) {
  const view = document.getElementById("profile-favorites-view");
  const form = document.getElementById("profile-favorites-form");
  const editBtn = document.getElementById("edit-profile-btn");
  const savedMsg = document.getElementById("fav-saved-msg");
  if (!view || !form) return;

  if (isEditing) {
    const favs = state.userStats?.favorites || { song: "", album: "", artist: "" };
    const songIn = document.getElementById("fav-song-input");
    const albumIn = document.getElementById("fav-album-input");
    const artistIn = document.getElementById("fav-artist-input");
    if (songIn) songIn.value = favs.song || "";
    if (albumIn) albumIn.value = favs.album || "";
    if (artistIn) artistIn.value = favs.artist || "";
    if (savedMsg) savedMsg.textContent = "";
  }

  view.style.display = isEditing ? "none" : "flex";
  form.style.display = isEditing ? "flex" : "none";
  if (editBtn) editBtn.style.display = isEditing ? "none" : "inline-flex";
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
    const peekBanner = document.getElementById("shop-peek-banner");
    if (peekBanner) peekBanner.classList.remove("visible");
    renderShop();
  } else {
    clearShopPreview();
  }
  if (dom.shopModalBackdrop) {
    dom.shopModalBackdrop.classList.toggle("open", isOpen);
  }
  updateBottomNavActiveTab(isOpen ? "shop" : "game");
}

export function toggleProfileModal(isOpen) {
  if (isOpen) {
    clearShopPreview();
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

  const editProfileBtn = document.getElementById("edit-profile-btn");
  const cancelProfileEditBtn = document.getElementById("cancel-profile-edit-btn");
  const favForm = document.getElementById("profile-favorites-form");

  if (editProfileBtn) {
    editProfileBtn.addEventListener("click", () => {
      if (!state.currentUser) return;
      setFavoritesEditMode(true);
    });
  }
  if (cancelProfileEditBtn) {
    cancelProfileEditBtn.addEventListener("click", () => setFavoritesEditMode(false));
  }
  if (favForm) {
    favForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.currentUser || !state.userStats) return;
      state.userStats.favorites = {
        song: (document.getElementById("fav-song-input")?.value || "").trim().slice(0, 60),
        album: (document.getElementById("fav-album-input")?.value || "").trim().slice(0, 60),
        artist: (document.getElementById("fav-artist-input")?.value || "").trim().slice(0, 60)
      };
      saveUserStats();
      renderProfileFavorites();
      setFavoritesEditMode(false);
      const savedMsg = document.getElementById("fav-saved-msg");
      if (savedMsg) {
        savedMsg.textContent = "✓ הפרופיל נשמר בהצלחה";
        setTimeout(() => { if (savedMsg) savedMsg.textContent = ""; }, 2600);
      }
    });
  }
}
