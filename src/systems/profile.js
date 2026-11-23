import { ARTISTS_DB } from "../data/artists.js?v=20261123aa";
import { FREE_PROFILE_BANNERS, findProfileBanner } from "../data/shop.js?v=20261123aa";
import { DIFFICULTIES, DIFFICULTY_ORDER, DURATIONS } from "../data/config.js?v=20261123aa";
import { dom, PLAY_SVG, SPOTIFY_SVG } from "../dom.js?v=20261123aa";
import { state } from "../state.js?v=20261123aa";
import { saveUserStats } from "../services/storage.js?v=20261123aa";
import { fetchItunesData } from "../services/itunes.js?v=20261123aa";
import { cleanTrackTitle, normalizeHebrew } from "../utils/text.js?v=20261123aa";
import { stopGalleryPreview, updateGalleryCardsPlayState, toggleGallerySongPreview } from "./gallery.js?v=20261123aa";
import { formatPoints, getPointsBalance, getStreakMultiplier } from "./economy.js?v=20261123aa";
import { renderShop, clearShopPreview } from "./shop.js?v=20261123aa";
import { renderQuestsAndBadgesModal, renderQuestsModal } from "./quests.js?v=20261123aa";

export function updateStreakDisplay() {
  const s = state.userStats.currentStreak || 0;
  const hasShield = (state.userStats?.powerups?.streakFreeze || 0) > 0;
  dom.streakCountEl.textContent = s;
  dom.streakBadge.classList.toggle("active-streak", s > 0);
  dom.streakBadge.classList.toggle("zero-streak", s === 0);
  dom.streakBadge.classList.toggle("has-streak-shield", hasShield);
  const homeStreakEl = document.getElementById("home-streak-count");
  if (homeStreakEl) homeStreakEl.textContent = s;
  const homeStreakBtn = document.getElementById("home-streak-btn");
  if (homeStreakBtn) homeStreakBtn.classList.toggle("has-streak-shield", hasShield);
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

  // עדכון כרטיס ה-Hero המחודש + רקע הפרופיל החינמי
  const heroWon = document.getElementById("hero-stat-won");
  const heroStreak = document.getElementById("hero-stat-streak");
  const heroPts = document.getElementById("hero-stat-points");
  if (heroWon) heroWon.textContent = String(won);
  if (heroStreak) heroStreak.textContent = String(state.userStats.bestStreak || 0);
  if (heroPts) heroPts.textContent = formatPoints(getPointsBalance());
  const bannerObj = findProfileBanner(state.userStats?.profileBanner || "default");
  if (dom.loggedUserBar) {
    dom.loggedUserBar.style.background = bannerObj.css;
  }
  renderProfileBannerPicker();

  document.getElementById("stat-heard").textContent = heard;
  document.getElementById("stat-won").textContent = won;
  document.getElementById("stat-rate").textContent = `${rate}%`;
  const bestStreakEl = document.getElementById("stat-best-streak");
  if (bestStreakEl) {
    bestStreakEl.innerHTML = `${state.userStats.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/ui-final-flame.png" alt="" />`;
  }
  const bestMarathonEl = document.getElementById("stat-best-marathon");
  if (bestMarathonEl) {
    const bm = state.userStats.bestMarathonScore || 0;
    bestMarathonEl.textContent = `${bm.toLocaleString("he-IL")} נק'`;
  }
  const bestTimedEl = document.getElementById("stat-best-timed");
  if (bestTimedEl) {
    const bt = state.userStats.bestTimedScore || 0;
    bestTimedEl.textContent = `${bt} ${bt === 1 ? "שיר" : "שירים"}`;
  }
  if (dom.statPoints) dom.statPoints.textContent = formatPoints(getPointsBalance());
  if (dom.statTotalPoints) dom.statTotalPoints.textContent = formatPoints(state.userStats.totalPointsEarned || getPointsBalance());

  renderProfileFavorites();
  setFavoritesEditMode(false);
  renderQuestsAndBadgesModal();

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
      const shownSec = item.exactTimeSec ?? item.timeSec;
      timePill.textContent = `${shownSec}`;

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

const FAV_FIELD_CONFIG = {
  song: { inputId: "fav-song-input", listId: "fav-song-suggestions", labelHe: "שיר מועדף" },
  album: { inputId: "fav-album-input", listId: "fav-album-suggestions", labelHe: "אלבום מועדף" },
  artist: { inputId: "fav-artist-input", listId: "fav-artist-suggestions", labelHe: "זמר/ת מועדף/ת" }
};

const pendingFavoriteSelection = { song: "", album: "", artist: "" };
const pendingFavoriteImages = { song: "", album: "", artist: "" };
const favSearchTimers = { song: null, album: null, artist: null };
let favSavedTimer = null;

function upgradeArtUrl(url) {
  if (!url) return "";
  return String(url).replace("100x100bb", "200x200bb").replace("60x60bb", "200x200bb");
}

function closeFavDropdown(field) {
  const list = document.getElementById(FAV_FIELD_CONFIG[field].listId);
  if (list) {
    list.style.display = "none";
    list.innerHTML = "";
  }
}

function closeAllFavDropdowns() {
  Object.keys(FAV_FIELD_CONFIG).forEach(closeFavDropdown);
}

function setFavFormError(text = "") {
  const errEl = document.getElementById("fav-form-error");
  if (errEl) errEl.textContent = text;
}

function syncFavInputVisual(field) {
  const input = document.getElementById(FAV_FIELD_CONFIG[field].inputId);
  if (!input) return;
  const val = input.value.trim();
  const isPicked = Boolean(val && val === pendingFavoriteSelection[field]);
  input.classList.toggle("is-selected", isPicked);
  input.classList.toggle("is-unpicked", Boolean(val && !isPicked));
}

function renderFavSuggestions(field, items, queryAtCall) {
  const cfg = FAV_FIELD_CONFIG[field];
  const input = document.getElementById(cfg.inputId);
  const list = document.getElementById(cfg.listId);
  if (!input || !list || input.value.trim() !== queryAtCall) return;

  list.innerHTML = "";
  if (!items || items.length === 0) {
    list.style.display = "none";
    return;
  }

  items.forEach(item => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "fav-suggestion-row";

    if (item.artwork) {
      const thumb = document.createElement("img");
      thumb.className = `fav-suggestion-thumb${field === "artist" ? " is-round" : ""}`;
      thumb.src = item.artwork;
      thumb.alt = "";
      row.appendChild(thumb);
    }

    const textWrap = document.createElement("span");
    textWrap.className = "fav-suggestion-text";

    const mainSpan = document.createElement("span");
    mainSpan.className = "fav-suggestion-title";
    mainSpan.textContent = item.primary;
    textWrap.appendChild(mainSpan);

    if (item.secondary) {
      const subSpan = document.createElement("span");
      subSpan.className = "fav-suggestion-sub";
      subSpan.textContent = item.secondary;
      textWrap.appendChild(subSpan);
    }
    row.appendChild(textWrap);

    row.addEventListener("mousedown", (e) => e.preventDefault());
    row.addEventListener("click", () => {
      pendingFavoriteSelection[field] = item.displayValue;
      pendingFavoriteImages[field] = item.artwork || "";
      input.value = item.displayValue;
      syncFavInputVisual(field);
      setFavFormError("");
      closeFavDropdown(field);
    });

    list.appendChild(row);
  });

  list.style.display = "block";
}

function renderFavStatusRow(field, message) {
  const cfg = FAV_FIELD_CONFIG[field];
  const list = document.getElementById(cfg.listId);
  if (!list) return;
  list.innerHTML = "";
  const div = document.createElement("div");
  div.className = "suggestion-row fav-status-row";
  div.style.opacity = "0.75";
  div.style.justifyContent = "center";
  div.style.pointerEvents = "none";
  div.textContent = message;
  list.appendChild(div);
  list.style.display = "block";
}

function getLocalFavoriteMatches(field, normalizedQuery) {
  if (!normalizedQuery) return [];
  const words = normalizedQuery.split(/\s+/).filter(Boolean);
  const results = [];
  const seen = new Set();

  if (field === "artist") {
    for (const a of ARTISTS_DB) {
      const norm = normalizeHebrew(a.name);
      if (norm.includes(normalizedQuery) || (words.length >= 2 && words.every(w => norm.includes(w)))) {
        if (!seen.has(norm)) {
          seen.add(norm);
          const sampleArt = state.artistCatalogCache?.[a.name]?.[0]?.artwork || "";
          results.push({ primary: a.name, secondary: "אמן ישראלי", displayValue: a.name, artwork: sampleArt });
        }
      }
      if (results.length >= 12) break;
    }
  } else if (field === "song") {
    for (const s of state.discoveredSongsMap.values()) {
      const normTitle = normalizeHebrew(s.title);
      const normArtist = normalizeHebrew(s.artist);
      const combined = `${normTitle} ${normArtist}`;
      if (
        normTitle.includes(normalizedQuery) ||
        normArtist.includes(normalizedQuery) ||
        (words.length >= 2 && words.every(w => combined.includes(w)))
      ) {
        const displayValue = `${s.title} - ${s.artist}`;
        const key = normalizeHebrew(displayValue);
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ primary: s.title, secondary: s.artist, displayValue, artwork: s.artwork || "" });
        }
      }
      if (results.length >= 12) break;
    }
  }
  return results;
}

async function fetchDeezerFavoriteResults(field, query) {
  const typeMap = { song: "track", album: "album", artist: "artist" };
  const dzType = typeMap[field] || "track";
  const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");

  // 1. עדיפות ראשונה: Proxy מאותו דומיין ב-Cloudflare (/api/deezer) -> 0 בעיות CORS באייפון!
  if (isHttp) {
    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 4500) : null;
      const res = await fetch(`/api/deezer?type=${dzType}&limit=25&q=${encodeURIComponent(query)}`, controller ? { signal: controller.signal } : undefined);
      if (timer) clearTimeout(timer);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data)) return json.data;
      }
    } catch (e) { }
  }

  // 2. גיבוי JSONP ישיר ל-Deezer (אם רץ מקומית)
  return await new Promise((resolve) => {
    const cb = "dzCb_" + Math.random().toString(36).slice(2, 10);
    const script = document.createElement("script");
    const timer = setTimeout(() => { cleanup(); resolve([]); }, 4500);
    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (script.parentNode) script.parentNode.removeChild(script);
    }
    window[cb] = (data) => { cleanup(); resolve(Array.isArray(data?.data) ? data.data : []); };
    script.onerror = () => { cleanup(); resolve([]); };
    script.src = `https://api.deezer.com/search/${dzType}?q=${encodeURIComponent(query)}&limit=25&output=jsonp&callback=${cb}`;
    document.head.appendChild(script);
  });
}

function triggerFavoriteSearch(field) {
  const cfg = FAV_FIELD_CONFIG[field];
  const input = document.getElementById(cfg.inputId);
  if (!input) return;

  const val = input.value.trim();
  clearTimeout(favSearchTimers[field]);

  if (val !== pendingFavoriteSelection[field]) {
    pendingFavoriteSelection[field] = "";
    pendingFavoriteImages[field] = "";
  }
  syncFavInputVisual(field);

  if (val.length < 1) {
    closeFavDropdown(field);
    return;
  }

  const normalizedVal = normalizeHebrew(val);
  const localMatches = getLocalFavoriteMatches(field, normalizedVal);
  if (localMatches.length > 0) {
    renderFavSuggestions(field, localMatches, val);
  } else if (val.length >= 2) {
    renderFavStatusRow(field, "מחפש...");
  }

  if (val.length < 2) return;

  favSearchTimers[field] = setTimeout(() => {
    const enc = encodeURIComponent(val);
    const combined = [...localMatches];
    const seen = new Set(combined.map(c => normalizeHebrew(c.displayValue)));
    let pendingSources = 3;

    const pushUnique = (item) => {
      if (!item) return;
      const key = normalizeHebrew(item.displayValue);
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
      }
    };

    const commitResults = () => {
      if (input.value.trim() !== val) return;
      if (combined.length > 0) {
        renderFavSuggestions(field, combined.slice(0, 24), val);
      } else if (pendingSources <= 0) {
        renderFavStatusRow(field, "לא נמצאו תוצאות — נסה מילה אחרת");
      }
    };

    const appendDeezerList = (dzList) => {
      if (field === "song") {
        for (const r of dzList) {
          const title = cleanTrackTitle(r.title || "");
          const artist = (r.artist?.name || "").trim();
          if (!title || !artist) continue;
          pushUnique({
            primary: title,
            secondary: artist,
            displayValue: `${title} - ${artist}`,
            artwork: r.album?.cover_medium || r.album?.cover_small || ""
          });
        }
      } else if (field === "album") {
        for (const r of dzList) {
          const title = (r.title || "").trim();
          const artist = (r.artist?.name || "").trim();
          if (!title) continue;
          pushUnique({
            primary: title,
            secondary: artist,
            displayValue: artist ? `${title} - ${artist}` : title,
            artwork: r.cover_medium || r.cover_small || ""
          });
        }
      } else if (field === "artist") {
        for (const r of dzList) {
          const nm = (r.name || "").trim();
          if (!nm) continue;
          pushUnique({
            primary: nm,
            secondary: r.nb_fan ? `${Number(r.nb_fan).toLocaleString("he-IL")} מאזינים` : "אמן",
            displayValue: nm,
            artwork: r.picture_medium || r.picture_small || ""
          });
        }
      }
    };

    const appendItunesList = (itList) => {
      if (field === "song") {
        for (const r of itList) {
          const title = cleanTrackTitle(r.trackName || "");
          const artist = (r.artistName || "").trim();
          if (!title || !artist) continue;
          pushUnique({
            primary: title,
            secondary: artist,
            displayValue: `${title} - ${artist}`,
            artwork: upgradeArtUrl(r.artworkUrl100)
          });
        }
      } else if (field === "album") {
        for (const r of itList) {
          const albumName = (r.collectionName || "").trim();
          const artistName = (r.artistName || "").trim();
          if (!albumName) continue;
          pushUnique({
            primary: albumName,
            secondary: artistName,
            displayValue: artistName ? `${albumName} - ${artistName}` : albumName,
            artwork: upgradeArtUrl(r.artworkUrl100)
          });
        }
      } else if (field === "artist") {
        for (const r of itList) {
          const nm = (r.artistName || "").trim();
          if (!nm) continue;
          pushUnique({
            primary: nm,
            secondary: r.primaryGenreName || "",
            displayValue: nm,
            artwork: upgradeArtUrl(r.artworkUrl100)
          });
        }
      }
    };

    // מריצים את 3 המקורות באופן עצמאי — Deezer מוצג מיד (~200ms) בלי להיחסם ע"י timeout של iTunes!
    fetchDeezerFavoriteResults(field, val)
      .then((dzList) => {
        if (Array.isArray(dzList) && dzList.length) appendDeezerList(dzList);
      })
      .catch(() => { })
      .finally(() => {
        pendingSources--;
        commitResults();
      });

    const itunesEntity = field === "album" ? "album" : "song";
    fetchItunesData(`https://itunes.apple.com/search?country=IL&media=music&entity=${itunesEntity}&limit=25&term=${enc}`, 4500)
      .then((res) => {
        if (Array.isArray(res?.results) && res.results.length) appendItunesList(res.results);
      })
      .catch(() => { })
      .finally(() => {
        pendingSources--;
        commitResults();
      });

    fetchItunesData(`https://itunes.apple.com/search?country=US&media=music&entity=${itunesEntity}&limit=15&term=${enc}`, 4500)
      .then((res) => {
        if (Array.isArray(res?.results) && res.results.length) appendItunesList(res.results);
      })
      .catch(() => { })
      .finally(() => {
        pendingSources--;
        commitResults();
      });
  }, 180);
}

function renderProfileBannerPicker() {
  const container = document.getElementById("profile-banner-picker");
  if (!container) return;
  const currentId = state.userStats?.profileBanner || "default";
  container.innerHTML = "";
  FREE_PROFILE_BANNERS.forEach(b => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `profile-banner-swatch${b.id === currentId ? " active" : ""}`;
    btn.style.background = b.css;
    btn.title = b.name;
    btn.textContent = b.name;
    btn.addEventListener("click", () => {
      if (!state.userStats) return;
      state.userStats.profileBanner = b.id;
      if (dom.loggedUserBar) dom.loggedUserBar.style.background = b.css;
      saveUserStats();
      renderProfileBannerPicker();
    });
    container.appendChild(btn);
  });
}

function renderProfileFavorites() {
  const favs = state.userStats?.favorites || {};
  const rows = [
    { textId: "fav-song-display", imgId: "fav-song-img", val: favs.song, img: favs.songImg },
    { textId: "fav-album-display", imgId: "fav-album-img", val: favs.album, img: favs.albumImg },
    { textId: "fav-artist-display", imgId: "fav-artist-img", val: favs.artist, img: favs.artistImg }
  ];
  rows.forEach(({ textId, imgId, val, img }) => {
    const el = document.getElementById(textId);
    const imgEl = document.getElementById(imgId);
    const trimmed = (val || "").trim();
    if (el) {
      el.textContent = trimmed || "לא נבחר עדיין";
      el.classList.toggle("is-empty", !trimmed);
    }
    if (imgEl) {
      if (trimmed && img) {
        imgEl.src = img;
        imgEl.style.display = "block";
      } else {
        imgEl.removeAttribute("src");
        imgEl.style.display = "none";
      }
    }
  });
}

function setFavoritesEditMode(isEditing) {
  const view = document.getElementById("profile-favorites-view");
  const form = document.getElementById("profile-favorites-form");
  const editBtn = document.getElementById("edit-profile-btn");
  const savedMsg = document.getElementById("fav-saved-msg");
  if (!view || !form) return;

  closeAllFavDropdowns();
  setFavFormError("");

  if (isEditing) {
    const favs = state.userStats?.favorites || { song: "", album: "", artist: "" };
    Object.keys(FAV_FIELD_CONFIG).forEach(field => {
      const existingVal = (favs[field] || "").trim();
      pendingFavoriteSelection[field] = existingVal;
      pendingFavoriteImages[field] = favs[`${field}Img`] || "";
      const input = document.getElementById(FAV_FIELD_CONFIG[field].inputId);
      if (input) input.value = existingVal;
      syncFavInputVisual(field);
    });
    if (savedMsg) savedMsg.textContent = "";
  }

  view.style.display = isEditing ? "none" : "flex";
  form.style.display = isEditing ? "flex" : "none";
  if (editBtn) editBtn.style.display = isEditing ? "none" : "inline-flex";
}

export function updateBottomNavActiveTab(activeTab = "game") {
  if (dom.profileBtn) dom.profileBtn.classList.toggle("active", activeTab === "profile");
  if (dom.navGameBtn) dom.navGameBtn.classList.toggle("active", activeTab === "game");
  const navModesBtn = document.getElementById("nav-modes-btn");
  if (navModesBtn) navModesBtn.classList.toggle("active", activeTab === "modes");
  const navLbBtn = document.getElementById("nav-leaderboard-btn");
  if (navLbBtn) navLbBtn.classList.toggle("active", activeTab === "leaderboard");
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

export function showProfileSubView(viewName = "main") {
  if (viewName !== "gallery") stopGalleryPreview();
  const views = {
    main: "profile-view-main",
    stats: "profile-view-stats",
    gallery: "profile-view-gallery",
    badges: "profile-view-badges"
  };
  Object.entries(views).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === viewName);
  });
}

export function toggleQuestsModal(isOpen) {
  const backdrop = document.getElementById("quests-modal-backdrop");
  if (!backdrop) return;
  if (isOpen) renderQuestsModal();
  backdrop.classList.toggle("open", isOpen);
}

export function toggleStreakModal(isOpen) {
  const backdrop = document.getElementById("streak-modal-backdrop");
  if (!backdrop) return;
  if (isOpen) {
    const curr = state.userStats?.currentStreak || 0;
    const best = state.userStats?.bestStreak || 0;
    const mult = getStreakMultiplier(curr);

    const currEl = document.getElementById("streak-modal-current");
    const multEl = document.getElementById("streak-modal-mult");
    const bestEl = document.getElementById("streak-modal-best");
    const hintEl = document.getElementById("streak-modal-hint");

    if (currEl) currEl.textContent = `${curr}🔥`;
    if (multEl) multEl.textContent = `×${mult}`;
    if (bestEl) bestEl.innerHTML = `${best}<img class="icon-3d-mini" src="assets/ui-final-trophy.png" alt="" />`;
    if (hintEl) {
      if (curr >= 10) {
        hintEl.textContent = "🔥 אתה במכפיל המקסימלי (×2 קריסטלים לכל זיהוי)!";
      } else if (curr >= 5) {
        hintEl.textContent = `עוד ${10 - curr} ניצחונות ברצף למכפיל ×2 קריסטלים!`;
      } else if (curr >= 3) {
        hintEl.textContent = `עוד ${5 - curr} ניצחונות ברצף למכפיל ×1.35 קריסטלים!`;
      } else {
        hintEl.textContent = `עוד ${3 - curr} ניצחונות ברצף כדי להפעיל מכפיל ×1.15 קריסטלים!`;
      }
    }
  }
  backdrop.classList.toggle("open", isOpen);
}

export function toggleProfileModal(isOpen) {
  if (isOpen) {
    clearShopPreview();
    if (dom.shopModalBackdrop?.classList.contains("open")) {
      dom.shopModalBackdrop.classList.remove("open");
    }
    showProfileSubView("main");
    renderProfileStatsModal();
  } else {
    stopGalleryPreview();
  }
  dom.profileModalBackdrop.classList.toggle("open", isOpen);
  updateBottomNavActiveTab(isOpen ? "profile" : "game");
}

export function initProfileListeners() {
  dom.profileBtn.addEventListener("click", () => {
    toggleProfileModal(true);
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
      toggleShopModal(true);
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
  dom.streakBadge.addEventListener("click", () => toggleStreakModal(true));
  const streakCloseBtn = document.getElementById("streak-close-btn");
  const streakBackdrop = document.getElementById("streak-modal-backdrop");
  if (streakCloseBtn) streakCloseBtn.addEventListener("click", () => toggleStreakModal(false));
  if (streakBackdrop) {
    streakBackdrop.addEventListener("click", (e) => {
      if (e.target === streakBackdrop) toggleStreakModal(false);
    });
  }

  const questsCloseBtn = document.getElementById("quests-close-btn");
  const questsBackdrop = document.getElementById("quests-modal-backdrop");
  if (questsCloseBtn) questsCloseBtn.addEventListener("click", () => toggleQuestsModal(false));
  if (questsBackdrop) {
    questsBackdrop.addEventListener("click", (e) => {
      if (e.target === questsBackdrop) toggleQuestsModal(false);
    });
  }

  const openStatsBtn = document.getElementById("open-profile-stats-btn");
  const openGalleryBtn = document.getElementById("open-profile-gallery-btn");
  const openBadgesBtn = document.getElementById("open-profile-badges-btn");
  if (openStatsBtn) openStatsBtn.addEventListener("click", () => showProfileSubView("stats"));
  if (openGalleryBtn) openGalleryBtn.addEventListener("click", () => showProfileSubView("gallery"));
  if (openBadgesBtn) openBadgesBtn.addEventListener("click", () => showProfileSubView("badges"));
  document.querySelectorAll("[data-profile-back]").forEach(btn => {
    btn.addEventListener("click", () => showProfileSubView("main"));
  });

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
  Object.keys(FAV_FIELD_CONFIG).forEach(field => {
    const input = document.getElementById(FAV_FIELD_CONFIG[field].inputId);
    if (input) {
      input.addEventListener("input", () => triggerFavoriteSearch(field));
      input.addEventListener("focus", () => {
        if (input.value.trim().length >= 1 && input.value.trim() !== pendingFavoriteSelection[field]) {
          triggerFavoriteSearch(field);
        }
      });
      input.addEventListener("blur", () => {
        setTimeout(() => closeFavDropdown(field), 160);
      });
    }
  });

  document.querySelectorAll("[data-clear-fav]").forEach(btn => {
    btn.addEventListener("click", () => {
      const field = btn.dataset.clearFav;
      if (!FAV_FIELD_CONFIG[field]) return;
      pendingFavoriteSelection[field] = "";
      const input = document.getElementById(FAV_FIELD_CONFIG[field].inputId);
      if (input) input.value = "";
      syncFavInputVisual(field);
      closeFavDropdown(field);
      setFavFormError("");
    });
  });

  if (favForm) {
    favForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!state.currentUser || !state.userStats) return;

      // מאמת שכל שדה שהוקלד בו טקסט נבחר מתוך רשימת החיפוש (שיר/אלבום/זמר קיים בלבד)
      for (const field of Object.keys(FAV_FIELD_CONFIG)) {
        const input = document.getElementById(FAV_FIELD_CONFIG[field].inputId);
        const raw = (input?.value || "").trim();
        if (raw && raw !== pendingFavoriteSelection[field]) {
          setFavFormError(`יש לבחור ${FAV_FIELD_CONFIG[field].labelHe} קיים מתוך רשימת החיפוש`);
          input?.focus();
          return;
        }
      }

      state.userStats.favorites = {
        song: pendingFavoriteSelection.song || "",
        album: pendingFavoriteSelection.album || "",
        artist: pendingFavoriteSelection.artist || "",
        songImg: pendingFavoriteSelection.song ? (pendingFavoriteImages.song || "") : "",
        albumImg: pendingFavoriteSelection.album ? (pendingFavoriteImages.album || "") : "",
        artistImg: pendingFavoriteSelection.artist ? (pendingFavoriteImages.artist || "") : ""
      };
      saveUserStats();
      renderProfileFavorites();
      setFavoritesEditMode(false);
      const savedMsg = document.getElementById("fav-saved-msg");
      if (savedMsg) {
        clearTimeout(favSavedTimer);
        savedMsg.textContent = "✓ הפרופיל נשמר בהצלחה";
        favSavedTimer = setTimeout(() => { if (savedMsg) savedMsg.textContent = ""; }, 2600);
      }
    });
  }
}
