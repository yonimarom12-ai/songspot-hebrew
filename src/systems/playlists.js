import { state } from "../state.js?v=20261124h";
import { saveUserStats } from "../services/storage.js?v=20261124h";
import { syncAccountToCloud } from "../services/cloud.js?v=20261124h";
import { ensureSeedCatalogLoaded } from "../services/itunes.js?v=20261124h";
import { normalizeHebrew } from "../utils/text.js?v=20261124h";
import { showGameToast } from "../utils/toast.js?v=20261124h";
import { startPlaylistGameSession } from "./game.js?v=20261124h";

export const MIN_PLAYLIST_SONGS = 5;
export const MAX_PLAYLIST_SONGS = 50;
export const MAX_PLAYLISTS = 15;

let onStartGameScreenCb = null;
let onNavigateScreenCb = null;
let editingPlaylistId = null;
let draftSongs = [];
let activeSharePlaylistId = null;
let activeChallengePayload = null;
let lastSummaryRun = null;

function getCustomPlaylists() {
  if (!Array.isArray(state.userStats.customPlaylists)) {
    state.userStats.customPlaylists = [];
  }
  return state.userStats.customPlaylists;
}

function persistPlaylists() {
  saveUserStats();
  if (state.currentUser) {
    syncAccountToCloud(state.currentUser, state.userStats);
  }
}

function makePlaylistId() {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function sanitizeSongItem(s) {
  if (!s || !s.trackId || !s.title || !s.artist || !s.previewUrl) return null;
  return {
    trackId: String(s.trackId),
    title: String(s.title).slice(0, 120),
    artist: String(s.artist).slice(0, 100),
    artwork: String(s.artwork || ""),
    previewUrl: String(s.previewUrl || "")
  };
}

function buildCollageHTML(songs) {
  const arts = [];
  for (const s of (songs || [])) {
    if (s?.artwork && !arts.includes(s.artwork)) {
      arts.push(s.artwork);
      if (arts.length >= 4) break;
    }
  }
  if (arts.length === 0) {
    return `<div class="pl-collage-2x2 is-empty">🎧</div>`;
  }
  const slots = [0, 1, 2, 3].map(i => {
    const src = arts[i % arts.length];
    return `<img src="${src}" alt="" loading="lazy" decoding="async" />`;
  }).join("");
  return `<div class="pl-collage-2x2">${slots}</div>`;
}

function formatBestRunLabel(bestRun) {
  if (!bestRun || !bestRun.total) return "טרם שוחק";
  const avg = Number(bestRun.avgSec || 0);
  const avgTxt = avg > 0 ? ` · ${avg.toFixed(1)}ש'` : "";
  return `🏆 שיא: ${bestRun.hits}/${bestRun.total}${avgTxt}`;
}

function showListView() {
  const listView = document.getElementById("playlists-list-view");
  const editorView = document.getElementById("playlists-editor-view");
  if (listView) listView.style.display = "flex";
  if (editorView) editorView.style.display = "none";
  editingPlaylistId = null;
  draftSongs = [];
}

function showEditorView() {
  const listView = document.getElementById("playlists-list-view");
  const editorView = document.getElementById("playlists-editor-view");
  if (listView) listView.style.display = "none";
  if (editorView) editorView.style.display = "flex";
}

export function renderPlaylistsScreen() {
  showListView();
  const listEl = document.getElementById("playlists-cards-list");
  const countEl = document.getElementById("playlists-count-pill");
  if (!listEl) return;

  const playlists = getCustomPlaylists();
  if (countEl) {
    countEl.textContent = `${playlists.length} / ${MAX_PLAYLISTS} פלייליסטים`;
  }

  listEl.innerHTML = "";
  if (playlists.length === 0) {
    const empty = document.createElement("div");
    empty.className = "pl-empty-state";
    empty.innerHTML = `
      <div class="pl-empty-icon">🎧</div>
      <h3 class="pl-empty-title">עדיין אין לך פלייליסטים</h3>
      <p class="pl-empty-sub">צור פלייליסט משלך מהשירים האהובים עליך (5–50 שירים), שחק בו ואתגר חברים עם קישור או QR!</p>
      <button type="button" class="setup-confirm-btn pl-empty-create-btn" id="pl-empty-create-btn">➕ צור פלייליסט ראשון</button>
    `;
    listEl.appendChild(empty);
    const btn = empty.querySelector("#pl-empty-create-btn");
    if (btn) btn.addEventListener("click", () => openPlaylistEditor(null));
    return;
  }

  playlists.forEach((pl) => {
    const card = document.createElement("div");
    card.className = "playlist-card";
    const songCount = Array.isArray(pl.songs) ? pl.songs.length : 0;
    const canPlay = songCount >= MIN_PLAYLIST_SONGS;

    card.innerHTML = `
      <div class="pl-card-top">
        ${buildCollageHTML(pl.songs)}
        <div class="pl-card-meta">
          <div class="pl-card-title"></div>
          <div class="pl-card-sub">${songCount} שירים · ${formatBestRunLabel(pl.bestRun)}</div>
        </div>
        <div class="pl-card-icon-actions">
          <button type="button" class="pl-icon-btn" data-pl-edit title="ערוך פלייליסט" aria-label="ערוך פלייליסט">✏️</button>
          <button type="button" class="pl-icon-btn" data-pl-share title="שתף עם חברים" aria-label="שתף עם חברים">📤</button>
          <button type="button" class="pl-icon-btn is-danger" data-pl-delete title="מחק פלייליסט" aria-label="מחק פלייליסט">🗑️</button>
        </div>
      </div>
      <div class="pl-card-play-row">
        <button type="button" class="pl-play-btn is-run" data-pl-run ${canPlay ? "" : "disabled"}>▶ ריצת פלייליסט (${songCount})</button>
        <button type="button" class="pl-play-btn is-shuffle" data-pl-shuffle ${canPlay ? "" : "disabled"}>🔀 ערבוב אינסופי</button>
      </div>
    `;

    const titleEl = card.querySelector(".pl-card-title");
    if (titleEl) titleEl.textContent = pl.title || "פלייליסט ללא שם";

    card.querySelector("[data-pl-run]")?.addEventListener("click", () => launchPlaylistGame(pl, "run"));
    card.querySelector("[data-pl-shuffle]")?.addEventListener("click", () => launchPlaylistGame(pl, "shuffle"));
    card.querySelector("[data-pl-edit]")?.addEventListener("click", () => openPlaylistEditor(pl.id));
    card.querySelector("[data-pl-share]")?.addEventListener("click", () => openSharePlaylistModal(pl));
    card.querySelector("[data-pl-delete]")?.addEventListener("click", () => deletePlaylist(pl.id));

    listEl.appendChild(card);
  });
}

function deletePlaylist(playlistId) {
  const playlists = getCustomPlaylists();
  const target = playlists.find(p => p.id === playlistId);
  if (!target) return;
  if (!window.confirm(`למחוק את הפלייליסט "${target.title}"?`)) return;
  state.userStats.customPlaylists = playlists.filter(p => p.id !== playlistId);
  persistPlaylists();
  showGameToast("🗑️ הפלייליסט נמחק", "info");
  renderPlaylistsScreen();
}

function launchPlaylistGame(playlist, mode = "run", meta = {}) {
  const validSongs = (playlist?.songs || []).map(sanitizeSongItem).filter(Boolean);
  if (validSongs.length < MIN_PLAYLIST_SONGS) {
    showGameToast(`נדרשים לפחות ${MIN_PLAYLIST_SONGS} שירים כדי לשחק בפלייליסט`, "info");
    return;
  }
  if (onStartGameScreenCb) onStartGameScreenCb();
  startPlaylistGameSession({ ...playlist, songs: validSongs }, mode, meta);
}

// ===== עורך פלייליסט (חיפוש מיידי + הוספה לפי אמן + ייבוא מהקטלוג) =====
async function openPlaylistEditor(playlistId = null) {
  const playlists = getCustomPlaylists();
  if (!playlistId && playlists.length >= MAX_PLAYLISTS) {
    showGameToast(`הגעת למקסימום של ${MAX_PLAYLISTS} פלייליסטים`, "info");
    return;
  }

  editingPlaylistId = playlistId;
  const existing = playlistId ? playlists.find(p => p.id === playlistId) : null;
  draftSongs = existing ? (existing.songs || []).map(sanitizeSongItem).filter(Boolean) : [];

  const headingEl = document.getElementById("pl-editor-heading");
  const nameInput = document.getElementById("pl-editor-name-input");
  const searchInput = document.getElementById("pl-editor-search-input");
  const artistPicker = document.getElementById("pl-editor-artist-panel");
  if (headingEl) headingEl.textContent = existing ? "עריכת פלייליסט" : "פלייליסט חדש";
  if (nameInput) nameInput.value = existing?.title || "";
  if (searchInput) searchInput.value = "";
  if (artistPicker) artistPicker.style.display = "none";

  showEditorView();
  renderDraftSongsList();
  renderEditorSearchResults("");

  await ensureSeedCatalogLoaded();
  renderEditorSearchResults(searchInput ? searchInput.value : "");
}

function isSongInDraft(trackId) {
  const idStr = String(trackId);
  return draftSongs.some(s => String(s.trackId) === idStr);
}

function toggleDraftSong(song) {
  const clean = sanitizeSongItem(song);
  if (!clean) return;
  if (isSongInDraft(clean.trackId)) {
    draftSongs = draftSongs.filter(s => String(s.trackId) !== clean.trackId);
  } else {
    if (draftSongs.length >= MAX_PLAYLIST_SONGS) {
      showGameToast(`ניתן להוסיף עד ${MAX_PLAYLIST_SONGS} שירים בפלייליסט`, "info");
      return;
    }
    draftSongs.push(clean);
  }
  renderDraftSongsList();
  const searchInput = document.getElementById("pl-editor-search-input");
  renderEditorSearchResults(searchInput ? searchInput.value : "");
}

function renderDraftSongsList() {
  const counterEl = document.getElementById("pl-editor-counter");
  const saveBtn = document.getElementById("pl-editor-save-btn");
  const listEl = document.getElementById("pl-editor-selected-list");

  const count = draftSongs.length;
  if (counterEl) {
    counterEl.textContent = `${count} / ${MAX_PLAYLIST_SONGS} שירים${count < MIN_PLAYLIST_SONGS ? ` (מינימום ${MIN_PLAYLIST_SONGS})` : " ✓"}`;
    counterEl.classList.toggle("is-valid", count >= MIN_PLAYLIST_SONGS);
  }
  if (saveBtn) {
    saveBtn.disabled = count < MIN_PLAYLIST_SONGS;
  }
  if (!listEl) return;

  listEl.innerHTML = "";
  if (count === 0) {
    listEl.innerHTML = `<div class="pl-selected-empty">חפשו שירים למעלה או ייבאו מהקטלוג שלכם כדי להוסיף לפלייליסט</div>`;
    return;
  }

  draftSongs.forEach((song) => {
    const row = document.createElement("div");
    row.className = "pl-selected-row";
    row.innerHTML = `
      <img class="pl-row-art" src="${song.artwork || ""}" alt="" loading="lazy" />
      <div class="pl-row-info">
        <div class="pl-row-title"></div>
        <div class="pl-row-artist"></div>
      </div>
      <button type="button" class="pl-row-remove-btn" aria-label="הסר שיר">✕</button>
    `;
    row.querySelector(".pl-row-title").textContent = song.title;
    row.querySelector(".pl-row-artist").textContent = song.artist;
    row.querySelector(".pl-row-remove-btn").addEventListener("click", () => toggleDraftSong(song));
    listEl.appendChild(row);
  });
}

function renderEditorSearchResults(rawQuery) {
  const resultsEl = document.getElementById("pl-editor-search-results");
  if (!resultsEl) return;

  const q = normalizeHebrew(rawQuery || "");
  const allSongs = Array.from(state.discoveredSongsMap.values())
    .filter(s => s && s.trackId && s.title && s.artist && s.previewUrl);

  resultsEl.innerHTML = "";
  if (!q) {
    resultsEl.style.display = "none";
    return;
  }
  resultsEl.style.display = "flex";

  const matches = [];
  for (const s of allSongs) {
    const nt = normalizeHebrew(s.title);
    const na = normalizeHebrew(s.artist);
    if (nt.includes(q) || na.includes(q) || `${nt} ${na}`.includes(q)) {
      matches.push(s);
      if (matches.length >= 25) break;
    }
  }

  if (matches.length === 0) {
    resultsEl.innerHTML = `<div class="pl-search-empty">לא נמצאו שירים תואמים ל-"${rawQuery}"</div>`;
    return;
  }

  matches.forEach((song) => {
    const added = isSongInDraft(song.trackId);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `pl-search-item${added ? " is-added" : ""}`;
    item.innerHTML = `
      <img class="pl-row-art" src="${song.artwork || ""}" alt="" loading="lazy" />
      <div class="pl-row-info">
        <div class="pl-row-title"></div>
        <div class="pl-row-artist"></div>
      </div>
      <span class="pl-add-pill">${added ? "✓ נוסף" : "+ הוסף"}</span>
    `;
    item.querySelector(".pl-row-title").textContent = song.title;
    item.querySelector(".pl-row-artist").textContent = song.artist;
    item.addEventListener("click", () => toggleDraftSong(song));
    resultsEl.appendChild(item);
  });
}

function toggleArtistQuickAddPanel() {
  const panel = document.getElementById("pl-editor-artist-panel");
  if (!panel) return;
  const willShow = panel.style.display === "none" || !panel.style.display;
  panel.style.display = willShow ? "flex" : "none";
  if (!willShow) return;

  const counts = new Map();
  for (const s of state.discoveredSongsMap.values()) {
    if (!s || !s.artist || !s.previewUrl) continue;
    if (!counts.has(s.artist)) counts.set(s.artist, []);
    counts.get(s.artist).push(s);
  }
  const topArtists = Array.from(counts.entries())
    .filter(([, arr]) => arr.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 40);

  panel.innerHTML = "";
  topArtists.forEach(([artistName, songs]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "pl-artist-chip";
    chip.textContent = `${artistName} (${songs.length})`;
    chip.addEventListener("click", () => {
      let addedCount = 0;
      for (const s of songs) {
        if (draftSongs.length >= MAX_PLAYLIST_SONGS) break;
        if (!isSongInDraft(s.trackId)) {
          const clean = sanitizeSongItem(s);
          if (clean) {
            draftSongs.push(clean);
            addedCount++;
            if (addedCount >= 8) break;
          }
        }
      }
      renderDraftSongsList();
      if (addedCount > 0) {
        showGameToast(`➕ נוספו ${addedCount} שירים של ${artistName}`, "quest");
      } else {
        showGameToast("השירים כבר נמצאים בפלייליסט או שהגעת למקסימום", "info");
      }
    });
    panel.appendChild(chip);
  });
}

function importSongsFromUserCatalog() {
  const won = Array.isArray(state.userStats.wonSongs) ? state.userStats.wonSongs : [];
  if (won.length === 0) {
    showGameToast("עדיין אין שירים בקטלוג שלך — זהה שירים במשחק כדי למלא אותו!", "info");
    return;
  }
  let added = 0;
  for (const w of won) {
    if (draftSongs.length >= MAX_PLAYLIST_SONGS) break;
    if (isSongInDraft(w.trackId)) continue;
    const clean = sanitizeSongItem(w);
    if (clean) {
      draftSongs.push(clean);
      added++;
      if (added >= 15) break;
    }
  }
  renderDraftSongsList();
  if (added > 0) {
    showGameToast(`✨ יובאו ${added} שירים מהקטלוג שלך!`, "quest");
  } else {
    showGameToast("כל שירי הקטלוג שלך כבר בפלייליסט", "info");
  }
}

function savePlaylistFromEditor() {
  const nameInput = document.getElementById("pl-editor-name-input");
  const title = (nameInput?.value || "").trim().slice(0, 48);
  if (!title) {
    showGameToast("הזן שם לפלייליסט לפני השמירה", "info");
    nameInput?.focus();
    return;
  }
  if (draftSongs.length < MIN_PLAYLIST_SONGS) {
    showGameToast(`יש לבחור לפחות ${MIN_PLAYLIST_SONGS} שירים`, "info");
    return;
  }

  const playlists = getCustomPlaylists();
  const now = Date.now();
  if (editingPlaylistId) {
    const idx = playlists.findIndex(p => p.id === editingPlaylistId);
    if (idx >= 0) {
      playlists[idx] = {
        ...playlists[idx],
        title,
        songs: draftSongs.slice(0, MAX_PLAYLIST_SONGS),
        updatedAt: now
      };
    }
  } else {
    playlists.unshift({
      id: makePlaylistId(),
      title,
      songs: draftSongs.slice(0, MAX_PLAYLIST_SONGS),
      createdAt: now,
      updatedAt: now,
      shareId: null,
      bestRun: null
    });
  }

  state.userStats.customPlaylists = playlists.slice(0, MAX_PLAYLISTS);
  persistPlaylists();
  showGameToast(`✅ הפלייליסט "${title}" נשמר!`, "quest");
  renderPlaylistsScreen();
}

// ===== שיתוף פלייליסט עם חברים (קישור קצר + QR מ-D1) =====
async function openSharePlaylistModal(playlist) {
  const backdrop = document.getElementById("playlist-share-modal-backdrop");
  const titleEl = document.getElementById("pl-share-title");
  const statusEl = document.getElementById("pl-share-status");
  const linkInput = document.getElementById("pl-share-url-input");
  const qrImg = document.getElementById("pl-share-qr-img");
  if (!backdrop) return;

  activeSharePlaylistId = playlist.id;
  if (titleEl) titleEl.textContent = playlist.title || "פלייליסט אישי";
  if (statusEl) statusEl.textContent = "יוצר קישור שיתוף בענן...";
  if (linkInput) linkInput.value = "";
  if (qrImg) qrImg.style.display = "none";

  backdrop.classList.add("open");

  try {
    const res = await fetch("/api/playlists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: playlist.shareId || undefined,
        owner: state.currentUser || "אורח",
        title: playlist.title,
        songs: playlist.songs,
        ownerBestHits: playlist.bestRun?.hits || 0,
        ownerBestAvgSec: playlist.bestRun?.avgSec || 0
      })
    });
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.id) {
      throw new Error(data?.error || "שגיאה ביצירת קישור");
    }

    const playlists = getCustomPlaylists();
    const target = playlists.find(p => p.id === playlist.id);
    if (target) {
      target.shareId = data.id;
      persistPlaylists();
    }

    const url = `${window.location.origin}/?playlist=${encodeURIComponent(data.id)}`;
    if (linkInput) linkInput.value = url;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
      qrImg.style.display = "block";
    }
    if (statusEl) statusEl.textContent = "הקישור מוכן! שלח לחברים שינסו לשבור את השיא שלך 🎯";
  } catch (e) {
    if (statusEl) statusEl.textContent = "לא הצלחנו ליצור קישור כרגע — נסה שוב בעוד רגע.";
  }
}

// ===== קליטת קישור אתגר מחבר (?playlist=pl_xxxx) =====
export async function checkSharedPlaylistDeepLink(onNavigateScreen) {
  onNavigateScreenCb = onNavigateScreen;
  const params = new URLSearchParams(window.location.search);
  const plId = (params.get("playlist") || "").trim();
  if (!plId) return false;

  try {
    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  } catch (e) { }

  try {
    const res = await fetch(`/api/playlists?id=${encodeURIComponent(plId)}`);
    const data = await res.json();
    if (!res.ok || !data?.ok || !data?.playlist) {
      showGameToast("הפלייליסט המשותף לא נמצא או שפג תוקפו", "info");
      return false;
    }
    openChallengeLandingModal(data.playlist);
    return true;
  } catch (e) {
    showGameToast("שגיאה בטעינת הפלייליסט המשותף", "info");
    return false;
  }
}

function openChallengeLandingModal(pl) {
  activeChallengePayload = pl;
  const backdrop = document.getElementById("playlist-challenge-modal-backdrop");
  const collageSlot = document.getElementById("pl-challenge-collage");
  const ownerEl = document.getElementById("pl-challenge-owner");
  const titleEl = document.getElementById("pl-challenge-title");
  const metaEl = document.getElementById("pl-challenge-meta");
  if (!backdrop) return;

  if (collageSlot) collageSlot.innerHTML = buildCollageHTML(pl.songs);
  if (ownerEl) ownerEl.textContent = `${pl.owner || "חבר"} מאתגר אותך בפלייליסט:`;
  if (titleEl) titleEl.textContent = pl.title || "פלייליסט אתגר";

  const count = Array.isArray(pl.songs) ? pl.songs.length : 0;
  const bestTxt = pl.ownerBestHits > 0
    ? ` · שיא היוצר: ${pl.ownerBestHits}/${count}${pl.ownerBestAvgSec ? ` (${Number(pl.ownerBestAvgSec).toFixed(1)}ש')` : ""}`
    : "";
  if (metaEl) metaEl.textContent = `${count} שירים${bestTxt}`;

  backdrop.classList.add("open");
}

function saveCopyOfSharedPlaylist(pl) {
  if (!pl || !Array.isArray(pl.songs)) return;
  const playlists = getCustomPlaylists();
  if (playlists.length >= MAX_PLAYLISTS) {
    showGameToast(`הגעת למקסימום של ${MAX_PLAYLISTS} פלייליסטים`, "info");
    return;
  }
  const cleanSongs = pl.songs.map(sanitizeSongItem).filter(Boolean).slice(0, MAX_PLAYLIST_SONGS);
  if (cleanSongs.length < MIN_PLAYLIST_SONGS) return;

  playlists.unshift({
    id: makePlaylistId(),
    title: String(pl.title || "פלייליסט מחבר").slice(0, 48),
    songs: cleanSongs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    shareId: null,
    bestRun: null
  });
  state.userStats.customPlaylists = playlists.slice(0, MAX_PLAYLISTS);
  persistPlaylists();
  showGameToast("💾 הפלייליסט נשמר אצלך ב-'הפלייליסטים שלי'!", "quest");
}

// ===== מסך סיכום ריצת פלייליסט =====
export function openPlaylistSummaryModal(run) {
  if (!run) return;
  lastSummaryRun = run;

  const total = run.queue?.length || run.results?.length || 0;
  const hits = (run.results || []).filter(r => r.won).length;
  const wonTimes = (run.results || []).filter(r => r.won && Number(r.solveSec) > 0).map(r => Number(r.solveSec));
  const avgSec = wonTimes.length > 0
    ? Math.round((wonTimes.reduce((a, b) => a + b, 0) / wonTimes.length) * 10) / 10
    : 0;

  // עדכון שיא אישי בפלייליסט המקומי (ואם שותף בענן — עדכון השיא בענן!)
  let isNewBest = false;
  if (!run.isSharedChallenge && run.playlistId) {
    const playlists = getCustomPlaylists();
    const target = playlists.find(p => p.id === run.playlistId);
    if (target) {
      const prev = target.bestRun;
      const better = !prev || hits > (prev.hits || 0) || (hits === (prev.hits || 0) && avgSec > 0 && (!prev.avgSec || avgSec < prev.avgSec));
      if (better) {
        target.bestRun = { hits, total, avgSec, date: Date.now() };
        isNewBest = true;
        persistPlaylists();
        if (target.shareId) {
          fetch("/api/playlists", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: target.shareId,
              owner: state.currentUser || "אורח",
              title: target.title,
              songs: target.songs,
              ownerBestHits: hits,
              ownerBestAvgSec: avgSec
            })
          }).catch(() => { });
        }
      }
    }
  }

  const backdrop = document.getElementById("playlist-summary-modal-backdrop");
  const titleEl = document.getElementById("pl-summary-title");
  const scoreEl = document.getElementById("pl-summary-score");
  const avgEl = document.getElementById("pl-summary-avg");
  const compareEl = document.getElementById("pl-summary-compare");
  const listEl = document.getElementById("pl-summary-list");
  const saveCopyBtn = document.getElementById("pl-summary-save-copy-btn");
  if (!backdrop) return;

  if (titleEl) titleEl.textContent = run.title || "סיכום פלייליסט";
  if (scoreEl) scoreEl.textContent = `${hits} / ${total}`;
  if (avgEl) avgEl.textContent = avgSec > 0 ? `${avgSec.toFixed(1)} שניות` : "—";

  if (compareEl) {
    if (run.isSharedChallenge && run.ownerBestHits > 0) {
      const beatOwner = hits > run.ownerBestHits || (hits === run.ownerBestHits && avgSec > 0 && run.ownerBestAvgSec > 0 && avgSec < run.ownerBestAvgSec);
      compareEl.textContent = beatOwner
        ? `🔥 ניצחת את השיא של ${run.ownerName || "היוצר"} (${run.ownerBestHits}/${total})!`
        : `🎯 שיא ${run.ownerName || "היוצר"}: ${run.ownerBestHits}/${total} — נסה שוב כדי לשבור אותו!`;
      compareEl.className = `pl-summary-compare ${beatOwner ? "is-win" : ""}`;
      compareEl.style.display = "block";
    } else if (isNewBest) {
      compareEl.textContent = "🏆 שיא אישי חדש בפלייליסט הזה!";
      compareEl.className = "pl-summary-compare is-win";
      compareEl.style.display = "block";
    } else {
      compareEl.style.display = "none";
    }
  }

  if (saveCopyBtn) {
    saveCopyBtn.style.display = run.isSharedChallenge ? "inline-flex" : "none";
  }

  if (listEl) {
    listEl.innerHTML = "";
    (run.results || []).forEach((r) => {
      const row = document.createElement("div");
      row.className = `pl-summary-row ${r.won ? "is-hit" : "is-miss"}`;
      row.innerHTML = `
        <img class="pl-row-art" src="${r.artwork || ""}" alt="" />
        <div class="pl-row-info">
          <div class="pl-row-title"></div>
          <div class="pl-row-artist"></div>
        </div>
        <span class="pl-summary-badge">${r.won ? `✓ ${Number(r.solveSec || 0).toFixed(1)}ש'` : "✕"}</span>
      `;
      row.querySelector(".pl-row-title").textContent = r.title;
      row.querySelector(".pl-row-artist").textContent = r.artist;
      listEl.appendChild(row);
    });
  }

  backdrop.classList.add("open");
}

// ===== אתחול מאזינים =====
export function initPlaylistListeners({ onStartGameScreen, onNavigateScreen }) {
  onStartGameScreenCb = onStartGameScreen;
  onNavigateScreenCb = onNavigateScreen;

  document.getElementById("playlists-back-btn")?.addEventListener("click", () => {
    if (onNavigateScreenCb) onNavigateScreenCb("home");
  });

  document.getElementById("playlists-new-btn")?.addEventListener("click", () => openPlaylistEditor(null));
  document.getElementById("pl-editor-cancel-btn")?.addEventListener("click", () => renderPlaylistsScreen());
  document.getElementById("pl-editor-save-btn")?.addEventListener("click", savePlaylistFromEditor);
  document.getElementById("pl-editor-artist-btn")?.addEventListener("click", toggleArtistQuickAddPanel);
  document.getElementById("pl-editor-import-catalog-btn")?.addEventListener("click", importSongsFromUserCatalog);

  document.getElementById("pl-editor-search-input")?.addEventListener("input", (e) => {
    renderEditorSearchResults(e.target.value);
  });

  // מודאל שיתוף
  const shareBackdrop = document.getElementById("playlist-share-modal-backdrop");
  document.getElementById("pl-share-close-btn")?.addEventListener("click", () => shareBackdrop?.classList.remove("open"));
  shareBackdrop?.addEventListener("click", (e) => { if (e.target === shareBackdrop) shareBackdrop.classList.remove("open"); });

  document.getElementById("pl-share-copy-btn")?.addEventListener("click", async () => {
    const val = document.getElementById("pl-share-url-input")?.value || "";
    if (!val) return;
    await navigator.clipboard?.writeText(val).catch(() => { });
    showGameToast("📋 קישור הפלייליסט הועתק!", "quest");
  });

  document.getElementById("pl-share-whatsapp-btn")?.addEventListener("click", () => {
    const val = document.getElementById("pl-share-url-input")?.value || "";
    const pl = getCustomPlaylists().find(p => p.id === activeSharePlaylistId);
    if (!val) return;
    const text = `🎧 בניתי פלייליסט ב-"נחש את השיר": "${pl?.title || "הפלייליסט שלי"}"!\nבוא נראה כמה שירים תצליח לזהות 👇\n${val}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  });

  // מודאל קבלת אתגר מחבר
  const challengeBackdrop = document.getElementById("playlist-challenge-modal-backdrop");
  document.getElementById("pl-challenge-close-btn")?.addEventListener("click", () => challengeBackdrop?.classList.remove("open"));
  challengeBackdrop?.addEventListener("click", (e) => { if (e.target === challengeBackdrop) challengeBackdrop.classList.remove("open"); });

  document.getElementById("pl-challenge-play-btn")?.addEventListener("click", () => {
    if (!activeChallengePayload) return;
    challengeBackdrop?.classList.remove("open");
    launchPlaylistGame(activeChallengePayload, "run", {
      isSharedChallenge: true,
      ownerName: activeChallengePayload.owner,
      ownerBestHits: activeChallengePayload.ownerBestHits || 0,
      ownerBestAvgSec: activeChallengePayload.ownerBestAvgSec || 0,
      sharedPayload: activeChallengePayload
    });
  });

  document.getElementById("pl-challenge-save-btn")?.addEventListener("click", () => {
    if (!activeChallengePayload) return;
    saveCopyOfSharedPlaylist(activeChallengePayload);
  });

  // מודאל סיכום ריצה
  const summaryBackdrop = document.getElementById("playlist-summary-modal-backdrop");
  const closeSummaryToList = () => {
    summaryBackdrop?.classList.remove("open");
    if (onNavigateScreenCb) onNavigateScreenCb("playlists");
  };
  document.getElementById("pl-summary-close-btn")?.addEventListener("click", closeSummaryToList);
  document.getElementById("pl-summary-back-btn")?.addEventListener("click", closeSummaryToList);

  document.getElementById("pl-summary-replay-btn")?.addEventListener("click", () => {
    if (!lastSummaryRun) return;
    summaryBackdrop?.classList.remove("open");
    launchPlaylistGame(
      { id: lastSummaryRun.playlistId, title: lastSummaryRun.title, songs: lastSummaryRun.originalSongs || lastSummaryRun.queue },
      "run",
      {
        isSharedChallenge: lastSummaryRun.isSharedChallenge,
        ownerName: lastSummaryRun.ownerName,
        ownerBestHits: lastSummaryRun.ownerBestHits,
        ownerBestAvgSec: lastSummaryRun.ownerBestAvgSec,
        sharedPayload: lastSummaryRun.sharedPayload
      }
    );
  });

  document.getElementById("pl-summary-save-copy-btn")?.addEventListener("click", () => {
    if (lastSummaryRun?.sharedPayload) {
      saveCopyOfSharedPlaylist(lastSummaryRun.sharedPayload);
    }
  });

  document.getElementById("pl-summary-share-btn")?.addEventListener("click", async () => {
    if (!lastSummaryRun) return;
    const total = lastSummaryRun.results?.length || 0;
    const hits = (lastSummaryRun.results || []).filter(r => r.won).length;
    const boxes = (lastSummaryRun.results || []).map(r => (r.won ? "🟩" : "🟥")).join("");
    const text = `🎧 פלייליסט "${lastSummaryRun.title}" — נחש את השיר\nזיהיתי ${hits}/${total} שירים!\n${boxes}\nhttps://guessthesonghebrew.pages.dev`;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { }
    }
    await navigator.clipboard?.writeText(text).catch(() => { });
    showGameToast("📋 התוצאה הועתקה לשיתוף!", "quest");
  });
}
