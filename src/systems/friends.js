import { state } from "../state.js?v=20261122u";
import { SHOP_AVATARS } from "../data/shop.js?v=20261122u";
import { safeStorageGet, safeStorageSet, loadAccountsMap } from "../services/storage.js?v=20261122u";
import { syncAccountToCloud, getAuthHeaders } from "../services/cloud.js?v=20261122u";
import { playClickSfx, playWinSfx } from "./sfx.js?v=20261122u";
import { showGameToast } from "../utils/toast.js?v=20261122u";

const PUBLIC_BASE_URL = "https://guessthesonghebrew.pages.dev";
let activeViewedRelation = "friend";
let qrStream = null;
let qrScanRaf = null;
let qrScanActive = false;
let jsQrLoadPromise = null;
let showScreenFn = null;

const LOCAL_FRIENDS_KEY = "songspot_local_friends_v1";
const LOCAL_REQS_KEY = "songspot_local_friend_reqs_v1";
const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");

let currentFriendsList = [];
let incomingRequests = [];
let outgoingRequests = [];
let activeViewedFriend = null;
let listenersBound = false;

export function getPlayerFriendCode(username) {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return "";
  const str = `ss_id_v1:${clean}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let mixed = (h1 ^ (h2 >>> 3)) >>> 0;
  for (let i = 0; i < 6; i++) {
    code += alphabet[mixed % alphabet.length];
    mixed = Math.imul(mixed ^ (h2 + i * 31), 0x27d4eb2d) >>> 0;
  }
  return code;
}

function getAvatarEmoji(avatarId) {
  if (!avatarId || avatarId === "default") return "🎧";
  const found = SHOP_AVATARS.find(i => i.id === avatarId);
  return found?.emoji || "🎧";
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(safeStorageGet(key) || JSON.stringify(fallback));
  } catch (e) {
    return fallback;
  }
}

function setFriendsMsg(text, type = "") {
  const el = document.getElementById("friends-action-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `friends-action-msg${type ? ` ${type}` : ""}`;
}

function updateHomeFriendsDot(count) {
  const dot = document.getElementById("home-friends-dot");
  if (!dot) return;
  dot.classList.toggle("visible", count > 0);
  dot.textContent = count > 0 ? String(count) : "";
}

function showFriendsSubView(view) {
  const listView = document.getElementById("friends-list-view");
  const profileView = document.getElementById("friend-profile-view");
  if (listView) listView.style.display = view === "list" ? "flex" : "none";
  if (profileView) profileView.style.display = view === "profile" ? "flex" : "none";
}

function formatNum(val) {
  const n = Number(val) || 0;
  return Number.isInteger(n) ? n.toLocaleString("he-IL") : n.toFixed(1).replace(/\.0$/, "");
}

function buildProfileShareUrl(username) {
  const base = (typeof window !== "undefined" && window.location.protocol.startsWith("http"))
    ? window.location.origin
    : PUBLIC_BASE_URL;
  return `${base}/?profile=${encodeURIComponent(username)}`;
}

async function shareMyProfileLink(feedbackBtn, defaultLabel) {
  if (!state.currentUser) return;
  const url = buildProfileShareUrl(state.currentUser);
  const text = `🎵 בואו לראות את הפרופיל והשיאים שלי ב״נחש את השיר״ ולהוסיף אותי כחבר! 👇\n${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: `הפרופיל של ${state.currentUser} — נחש את השיר`, text, url });
      return;
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url).catch(() => { });
  }
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(waUrl, "_blank", "noopener,noreferrer");

  if (feedbackBtn) {
    feedbackBtn.textContent = "✓ הקישור הועתק!";
    setTimeout(() => { feedbackBtn.textContent = defaultLabel; }, 2000);
  }
  showGameToast("🔗 קישור הפרופיל הועתק לשיתוף!", "quest");
}

function setFriendProfileMsg(text, type = "") {
  const el = document.getElementById("fp-action-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `friends-action-msg${type ? ` ${type}` : ""}`;
}

function syncFriendProfileActionButtons() {
  const addBtn = document.getElementById("fp-add-friend-btn");
  const removeBtn = document.getElementById("fp-remove-friend-btn");
  if (removeBtn) {
    removeBtn.style.display = activeViewedRelation === "friend" ? "block" : "none";
  }
  if (!addBtn) return;

  if (activeViewedRelation === "friend" || activeViewedRelation === "self") {
    addBtn.style.display = "none";
    return;
  }

  addBtn.style.display = "block";
  if (!state.currentUser) {
    addBtn.disabled = false;
    addBtn.textContent = "🔒 התחבר בפרופיל כדי לשלוח בקשת חברות";
  } else if (activeViewedRelation === "outgoing") {
    addBtn.disabled = true;
    addBtn.textContent = "⏳ בקשת חברות נשלחה (ממתין לאישור)";
  } else if (activeViewedRelation === "incoming") {
    addBtn.disabled = false;
    addBtn.textContent = "✓ אשר בקשת חברות";
  } else {
    addBtn.disabled = false;
    addBtn.textContent = "➕ שלח בקשת חברות";
  }
}

function openFriendProfileView(friend, relation = "friend") {
  if (!friend) return;
  activeViewedFriend = friend;
  activeViewedRelation = relation;
  setFriendProfileMsg("");
  playClickSfx();

  const avEl = document.getElementById("fp-avatar");
  const nameEl = document.getElementById("fp-username");
  const idEl = document.getElementById("fp-id-badge");
  const heardEl = document.getElementById("fp-stat-heard");
  const wonEl = document.getElementById("fp-stat-won");
  const rateEl = document.getElementById("fp-stat-rate");
  const streakEl = document.getElementById("fp-stat-streak");
  const pointsEl = document.getElementById("fp-stat-points");
  const marathonEl = document.getElementById("fp-stat-marathon");
  const timedEl = document.getElementById("fp-stat-timed");
  const favsEl = document.getElementById("fp-favorites-list");

  const heard = friend.totalHeard || 0;
  const won = friend.totalWon || 0;
  const rate = heard > 0 ? Math.round((won / heard) * 100) : 0;

  if (avEl) {
    if (friend.avatarId === "custom" && friend.customAvatarData) {
      avEl.textContent = "";
      avEl.style.backgroundImage = `url("${friend.customAvatarData}")`;
      avEl.classList.add("has-custom-img");
    } else {
      avEl.style.backgroundImage = "";
      avEl.classList.remove("has-custom-img");
      avEl.textContent = getAvatarEmoji(friend.avatarId);
    }
  }
  if (nameEl) nameEl.textContent = friend.username;
  if (idEl) idEl.textContent = `ID: #${friend.friendCode || getPlayerFriendCode(friend.username)}`;
  if (heardEl) heardEl.textContent = formatNum(heard);
  if (wonEl) wonEl.textContent = formatNum(won);
  if (rateEl) rateEl.textContent = `${rate}%`;
  if (streakEl) {
    streakEl.innerHTML = `${friend.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/icon-flame.png" alt="" />`;
  }
  if (pointsEl) {
    pointsEl.innerHTML = `${formatNum(friend.points)}<img class="icon-3d-mini icon-3d-crystal" src="assets/icon-crystal.png" alt="" />`;
  }
  if (marathonEl) marathonEl.textContent = `${formatNum(friend.bestMarathon)} נק'`;
  if (timedEl) {
    const bt = friend.bestTimed || 0;
    timedEl.textContent = `${bt} ${bt === 1 ? "שיר" : "שירים"}`;
  }

  if (favsEl) {
    favsEl.innerHTML = "";
    const favItems = [
      { label: "🎵 שיר מועדף", val: friend.favorites?.song, img: friend.favorites?.songImg, round: false },
      { label: "💿 אלבום מועדף", val: friend.favorites?.album, img: friend.favorites?.albumImg, round: false },
      { label: "🎤 זמר/ת מועדף/ת", val: friend.favorites?.artist, img: friend.favorites?.artistImg, round: true }
    ].filter(x => x.val);

    if (favItems.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fp-fav-empty";
      empty.textContent = "השחקן עדיין לא בחר מועדפים בפרופיל.";
      favsEl.appendChild(empty);
    } else {
      favItems.forEach(item => {
        const row = document.createElement("div");
        row.className = "fp-fav-row";
        if (item.img) {
          const im = document.createElement("img");
          im.className = `fav-display-thumb${item.round ? " is-round" : ""}`;
          im.src = item.img;
          im.alt = "";
          row.appendChild(im);
        }
        const wrap = document.createElement("div");
        wrap.className = "fav-row-text";
        const l = document.createElement("span");
        l.className = "fp-fav-label";
        l.textContent = item.label;
        const v = document.createElement("strong");
        v.className = "fp-fav-val";
        v.textContent = item.val;
        wrap.append(l, v);
        row.appendChild(wrap);
        favsEl.appendChild(row);
      });
    }
  }

  syncFriendProfileActionButtons();
  showFriendsSubView("profile");
}

function renderIncomingAndOutgoing() {
  const incWrap = document.getElementById("friends-incoming-wrap");
  const incList = document.getElementById("friends-incoming-list");
  const outWrap = document.getElementById("friends-outgoing-wrap");
  const outList = document.getElementById("friends-outgoing-list");

  updateHomeFriendsDot(incomingRequests.length);

  if (incWrap && incList) {
    incList.innerHTML = "";
    incWrap.style.display = incomingRequests.length > 0 ? "flex" : "none";
    incomingRequests.forEach(req => {
      const row = document.createElement("div");
      row.className = "friend-req-row";

      const av = document.createElement("span");
      av.className = "friend-row-avatar small";
      av.textContent = getAvatarEmoji(req.avatarId);

      const info = document.createElement("div");
      info.className = "friend-row-info";
      const nm = document.createElement("span");
      nm.className = "friend-row-name";
      nm.textContent = req.username;
      const cd = document.createElement("span");
      cd.className = "friend-row-code";
      cd.textContent = `#${req.friendCode || getPlayerFriendCode(req.username)}`;
      info.append(nm, cd);

      const actions = document.createElement("div");
      actions.className = "friend-req-actions";

      const accBtn = document.createElement("button");
      accBtn.type = "button";
      accBtn.className = "freq-btn accept";
      accBtn.textContent = "✓ אשר";
      accBtn.addEventListener("click", () => respondToRequest("accept", req.usernameLower || req.username.toLowerCase()));

      const decBtn = document.createElement("button");
      decBtn.type = "button";
      decBtn.className = "freq-btn decline";
      decBtn.textContent = "✕";
      decBtn.title = "דחה בקשה";
      decBtn.addEventListener("click", () => respondToRequest("decline", req.usernameLower || req.username.toLowerCase()));

      actions.append(accBtn, decBtn);
      row.append(av, info, actions);
      incList.appendChild(row);
    });
  }

  if (outWrap && outList) {
    outList.innerHTML = "";
    outWrap.style.display = outgoingRequests.length > 0 ? "flex" : "none";
    outgoingRequests.forEach(req => {
      const row = document.createElement("div");
      row.className = "friend-req-row is-outgoing";

      const av = document.createElement("span");
      av.className = "friend-row-avatar small";
      av.textContent = getAvatarEmoji(req.avatarId);

      const info = document.createElement("div");
      info.className = "friend-row-info";
      const nm = document.createElement("span");
      nm.className = "friend-row-name";
      nm.textContent = req.username;
      const sub = document.createElement("span");
      sub.className = "friend-req-pending-tag";
      sub.textContent = "⏳ ממתין לאישור...";
      info.append(nm, sub);

      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "freq-btn decline";
      cancelBtn.textContent = "בטל";
      cancelBtn.addEventListener("click", () => cancelOutgoingRequest(req.usernameLower || req.username.toLowerCase()));

      row.append(av, info, cancelBtn);
      outList.appendChild(row);
    });
  }
}

function renderFriendsList() {
  const listEl = document.getElementById("friends-list");
  const countEl = document.getElementById("friends-count-badge");
  if (!listEl) return;

  if (countEl) countEl.textContent = String(currentFriendsList.length);
  renderIncomingAndOutgoing();
  listEl.innerHTML = "";

  if (!state.currentUser) {
    const guest = document.createElement("div");
    guest.className = "lb-empty";
    guest.textContent = "התחבר או הירשם בלשונית פרופיל כדי לקבל Player ID ולהוסיף חברים!";
    listEl.appendChild(guest);
    return;
  }

  if (currentFriendsList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "lb-empty";
    empty.textContent = "עדיין אין לך חברים מאושרים — שלח בקשת חברות עם ID של חבר למעלה!";
    listEl.appendChild(empty);
    return;
  }

  currentFriendsList.forEach(friend => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "friend-row-card";

    const av = document.createElement("span");
    av.className = "friend-row-avatar";
    av.textContent = getAvatarEmoji(friend.avatarId);

    const info = document.createElement("span");
    info.className = "friend-row-info";

    const nameRow = document.createElement("span");
    nameRow.className = "friend-row-name";
    nameRow.textContent = friend.username;

    const codeRow = document.createElement("span");
    codeRow.className = "friend-row-code";
    codeRow.textContent = `#${friend.friendCode || getPlayerFriendCode(friend.username)}`;

    info.append(nameRow, codeRow);

    const stats = document.createElement("span");
    stats.className = "friend-row-stats";
    stats.innerHTML = `${friend.totalWon || 0} 🎵 · ${friend.bestStreak || 0}<img class="icon-3d-mini icon-3d-flame" src="assets/icon-flame.png" alt="" />`;

    const arrow = document.createElement("span");
    arrow.className = "friend-row-arrow";
    arrow.textContent = "‹";

    card.append(av, info, stats, arrow);
    card.addEventListener("click", () => openFriendProfileView(friend));
    listEl.appendChild(card);
  });
}

function mapLocalAccount(acc) {
  const st = acc.stats || {};
  return {
    username: acc.username,
    usernameLower: acc.username.toLowerCase(),
    friendCode: getPlayerFriendCode(acc.username),
    totalWon: st.totalWon || 0,
    totalHeard: st.totalHeard || 0,
    bestStreak: st.bestStreak || 0,
    points: st.points || 0,
    bestTimed: st.bestTimedScore || 0,
    bestMarathon: st.bestMarathonScore || 0,
    avatarId: st.equippedAvatar || "default",
    favorites: st.favorites || {}
  };
}

function loadLocalFallbackState(username) {
  const meKey = username.toLowerCase();
  const accounts = loadAccountsMap();
  const byLower = {};
  Object.values(accounts).forEach(a => { byLower[a.username.toLowerCase()] = mapLocalAccount(a); });

  const fMap = loadJson(LOCAL_FRIENDS_KEY, {});
  const reqs = loadJson(LOCAL_REQS_KEY, []);

  currentFriendsList = (fMap[meKey] || []).map(k => byLower[k]).filter(Boolean);
  incomingRequests = reqs.filter(r => r.to === meKey).map(r => byLower[r.from]).filter(Boolean);
  outgoingRequests = reqs.filter(r => r.from === meKey).map(r => byLower[r.to]).filter(Boolean);
}

export async function refreshIncomingFriendsBadge() {
  if (!state.currentUser || !isHttp) return;
  try {
    const res = await fetch(`/api/friends?username=${encodeURIComponent(state.currentUser)}&_t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (data.configured && Array.isArray(data.incoming)) {
        updateHomeFriendsDot(data.incoming.length);
      }
    }
  } catch (e) { }
}

export async function loadFriendsScreen() {
  bindFriendsListenersOnce();
  showFriendsSubView("list");
  setFriendsMsg("");

  const myCodeEl = document.getElementById("my-player-id-code");
  const copyBtn = document.getElementById("copy-my-id-btn");
  const shareTools = document.getElementById("friends-share-tools");
  const addForm = document.getElementById("add-friend-form");

  if (!state.currentUser) {
    if (myCodeEl) myCodeEl.textContent = "התחבר כדי לקבל ID";
    if (copyBtn) copyBtn.style.display = "none";
    if (shareTools) shareTools.style.display = "none";
    if (addForm) addForm.style.display = "none";
    currentFriendsList = [];
    incomingRequests = [];
    outgoingRequests = [];
    renderFriendsList();
    return;
  }

  const myCode = getPlayerFriendCode(state.currentUser);
  if (myCodeEl) myCodeEl.textContent = `#${myCode}`;
  if (copyBtn) copyBtn.style.display = "inline-flex";
  if (shareTools) shareTools.style.display = "grid";
  if (addForm) addForm.style.display = "flex";

  if (state.userStats) {
    await syncAccountToCloud(state.currentUser, state.userStats).catch(() => false);
  }

  if (isHttp) {
    try {
      const res = await fetch(`/api/friends?username=${encodeURIComponent(state.currentUser)}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.configured) {
          currentFriendsList = Array.isArray(data.friends) ? data.friends : [];
          incomingRequests = Array.isArray(data.incoming) ? data.incoming : [];
          outgoingRequests = Array.isArray(data.outgoing) ? data.outgoing : [];
          renderFriendsList();
          return;
        }
      }
    } catch (e) { }
  }

  loadLocalFallbackState(state.currentUser);
  renderFriendsList();
}

async function handleSendRequestSubmit(e) {
  e.preventDefault();
  if (!state.currentUser) return;
  const input = document.getElementById("add-friend-input");
  const raw = String(input?.value || "").trim();
  if (!raw) {
    setFriendsMsg("נא להזין ID של חבר או שם משתמש", "error");
    return;
  }

  setFriendsMsg("שולח בקשת חברות...", "");

  if (isHttp) {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "request", username: state.currentUser, target: raw })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (input) input.value = "";
        if (data.status === "accepted") {
          playWinSfx();
          setFriendsMsg(`🎉 ${data.friend?.username || "השחקן"} ואתה עכשיו חברים!`, "success");
        } else {
          playClickSfx();
          setFriendsMsg(`✓ בקשת חברות נשלחה ל-${data.target?.username || raw}! ממתין לאישור.`, "success");
        }
        await loadFriendsScreen();
        return;
      }
      if (data.error) {
        setFriendsMsg(data.error, "error");
        return;
      }
    } catch (e) { }
  }

  // גיבוי מקומי
  const accounts = loadAccountsMap();
  const cleaned = raw.replace(/^#/, "").toUpperCase();
  const found = Object.values(accounts).find(
    a => a.username.toLowerCase() === raw.toLowerCase() || getPlayerFriendCode(a.username) === cleaned
  );
  if (!found) {
    setFriendsMsg("לא נמצא שחקן עם ה-ID או השם הזה.", "error");
    return;
  }
  const meKey = state.currentUser.toLowerCase();
  const targetKey = found.username.toLowerCase();
  if (targetKey === meKey) {
    setFriendsMsg("אי אפשר לשלוח בקשה לעצמך 😄", "error");
    return;
  }
  const reqs = loadJson(LOCAL_REQS_KEY, []);
  if (!reqs.some(r => r.from === meKey && r.to === targetKey)) {
    reqs.push({ from: meKey, to: targetKey });
    safeStorageSet(LOCAL_REQS_KEY, JSON.stringify(reqs));
  }
  if (input) input.value = "";
  setFriendsMsg(`✓ בקשת חברות נשלחה ל-${found.username}! ממתין לאישור.`, "success");
  loadLocalFallbackState(state.currentUser);
  renderFriendsList();
}

async function respondToRequest(action, fromLower) {
  if (!state.currentUser || !fromLower) return;
  if (isHttp) {
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action, username: state.currentUser, fromLower })
      });
    } catch (e) { }
  }
  const meKey = state.currentUser.toLowerCase();
  let reqs = loadJson(LOCAL_REQS_KEY, []);
  reqs = reqs.filter(r => !(r.from === fromLower && r.to === meKey));
  safeStorageSet(LOCAL_REQS_KEY, JSON.stringify(reqs));
  if (action === "accept") {
    playWinSfx();
    const fMap = loadJson(LOCAL_FRIENDS_KEY, {});
    fMap[meKey] = Array.from(new Set([...(fMap[meKey] || []), fromLower]));
    fMap[fromLower] = Array.from(new Set([...(fMap[fromLower] || []), meKey]));
    safeStorageSet(LOCAL_FRIENDS_KEY, JSON.stringify(fMap));
  } else {
    playClickSfx();
  }
  await loadFriendsScreen();
}

async function cancelOutgoingRequest(toLower) {
  if (!state.currentUser || !toLower) return;
  if (isHttp) {
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "cancel", username: state.currentUser, toLower })
      });
    } catch (e) { }
  }
  const meKey = state.currentUser.toLowerCase();
  const reqs = loadJson(LOCAL_REQS_KEY, []).filter(r => !(r.from === meKey && r.to === toLower));
  safeStorageSet(LOCAL_REQS_KEY, JSON.stringify(reqs));
  playClickSfx();
  await loadFriendsScreen();
}

async function handleRemoveActiveFriend() {
  if (!state.currentUser || !activeViewedFriend) return;
  const targetLower = activeViewedFriend.usernameLower || activeViewedFriend.username.toLowerCase();

  if (isHttp) {
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "remove", username: state.currentUser, targetLower })
      });
    } catch (e) { }
  }

  const fMap = loadJson(LOCAL_FRIENDS_KEY, {});
  const meKey = state.currentUser.toLowerCase();
  if (Array.isArray(fMap[meKey])) fMap[meKey] = fMap[meKey].filter(k => k !== targetLower);
  if (Array.isArray(fMap[targetLower])) fMap[targetLower] = fMap[targetLower].filter(k => k !== meKey);
  safeStorageSet(LOCAL_FRIENDS_KEY, JSON.stringify(fMap));

  activeViewedFriend = null;
  await loadFriendsScreen();
}

function bindFriendsListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const form = document.getElementById("add-friend-form");
  if (form) form.addEventListener("submit", handleSendRequestSubmit);

  const copyBtn = document.getElementById("copy-my-id-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      if (!state.currentUser) return;
      const code = `#${getPlayerFriendCode(state.currentUser)}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).catch(() => { });
      }
      copyBtn.textContent = "✓ הועתק!";
      setTimeout(() => { copyBtn.textContent = "📋 העתק ID"; }, 1800);
    });
  }

  const backToListBtn = document.getElementById("fp-back-list-btn");
  if (backToListBtn) {
    backToListBtn.addEventListener("click", () => showFriendsSubView("list"));
  }

  const removeBtn = document.getElementById("fp-remove-friend-btn");
  if (removeBtn) {
    removeBtn.addEventListener("click", handleRemoveActiveFriend);
  }

  const fpAddBtn = document.getElementById("fp-add-friend-btn");
  if (fpAddBtn) {
    fpAddBtn.addEventListener("click", handleAddFromProfileView);
  }

  const shareLinkBtn = document.getElementById("share-invite-link-btn");
  if (shareLinkBtn) {
    shareLinkBtn.addEventListener("click", () => shareMyProfileLink(shareLinkBtn, "🔗 שלח קישור"));
  }

  const showQrBtn = document.getElementById("show-my-qr-btn");
  if (showQrBtn) showQrBtn.addEventListener("click", openMyQrModal);

  const qrCloseBtn = document.getElementById("qr-close-btn");
  const qrBackdrop = document.getElementById("qr-modal-backdrop");
  if (qrCloseBtn) qrCloseBtn.addEventListener("click", () => qrBackdrop?.classList.remove("open"));
  if (qrBackdrop) {
    qrBackdrop.addEventListener("click", (e) => {
      if (e.target === qrBackdrop) qrBackdrop.classList.remove("open");
    });
  }

  const qrShareWaBtn = document.getElementById("qr-share-wa-btn");
  if (qrShareWaBtn) {
    qrShareWaBtn.addEventListener("click", () => shareMyProfileLink(qrShareWaBtn, "📤 שתף קישור לוואטסאפ"));
  }

  const scanQrBtn = document.getElementById("scan-qr-btn");
  if (scanQrBtn) scanQrBtn.addEventListener("click", openQrScannerModal);

  const scannerCloseBtn = document.getElementById("qr-scanner-close-btn");
  const scannerBackdrop = document.getElementById("qr-scanner-modal-backdrop");
  if (scannerCloseBtn) scannerCloseBtn.addEventListener("click", closeQrScannerModal);
  if (scannerBackdrop) {
    scannerBackdrop.addEventListener("click", (e) => {
      if (e.target === scannerBackdrop) closeQrScannerModal();
    });
  }
}

async function handleAddFromProfileView() {
  if (!activeViewedFriend) return;
  if (!state.currentUser) {
    const profileBtn = document.getElementById("profile-btn");
    if (profileBtn) profileBtn.click();
    return;
  }

  if (activeViewedRelation === "incoming") {
    await respondToRequest("accept", activeViewedFriend.usernameLower || activeViewedFriend.username.toLowerCase());
    activeViewedRelation = "friend";
    syncFriendProfileActionButtons();
    setFriendProfileMsg(`🎉 ${activeViewedFriend.username} ואתה עכשיו חברים!`, "success");
    return;
  }

  setFriendProfileMsg("שולח בקשת חברות...", "");
  if (isHttp) {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ action: "request", username: state.currentUser, target: activeViewedFriend.username })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (data.status === "accepted") {
          activeViewedRelation = "friend";
          playWinSfx();
          setFriendProfileMsg(`🎉 ${activeViewedFriend.username} ואתה עכשיו חברים!`, "success");
        } else {
          activeViewedRelation = "outgoing";
          playClickSfx();
          setFriendProfileMsg(`✓ בקשת חברות נשלחה ל-${activeViewedFriend.username}!`, "success");
        }
        syncFriendProfileActionButtons();
        return;
      }
      if (data.error) {
        setFriendProfileMsg(data.error, "error");
        return;
      }
    } catch (e) { }
  }
  setFriendProfileMsg("לא ניתן לשלוח בקשה כרגע — נסה שוב.", "error");
}

function openMyQrModal() {
  if (!state.currentUser) return;
  const backdrop = document.getElementById("qr-modal-backdrop");
  const img = document.getElementById("my-qr-img");
  const nameEl = document.getElementById("qr-username-label");
  const codeEl = document.getElementById("qr-code-badge");
  const url = buildProfileShareUrl(state.currentUser);
  if (img) {
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=6&data=${encodeURIComponent(url)}`;
  }
  if (nameEl) nameEl.textContent = state.currentUser;
  if (codeEl) codeEl.textContent = `ID: #${getPlayerFriendCode(state.currentUser)}`;
  if (backdrop) backdrop.classList.add("open");
}

function ensureJsQrLoaded() {
  if (typeof window !== "undefined" && typeof window.jsQR === "function") {
    return Promise.resolve(window.jsQR);
  }
  if (jsQrLoadPromise) return jsQrLoadPromise;
  jsQrLoadPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js";
    s.async = true;
    s.onload = () => resolve(typeof window.jsQR === "function" ? window.jsQR : null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return jsQrLoadPromise;
}

function extractTargetFromQrText(rawText) {
  const txt = String(rawText || "").trim();
  if (!txt) return "";
  try {
    const parsed = new URL(txt);
    const p = parsed.searchParams.get("profile");
    if (p) return p.trim();
  } catch (e) { }
  return txt;
}

export function closeQrScannerModal() {
  qrScanActive = false;
  if (qrScanRaf) {
    cancelAnimationFrame(qrScanRaf);
    qrScanRaf = null;
  }
  if (qrStream) {
    try { qrStream.getTracks().forEach(t => t.stop()); } catch (e) { }
    qrStream = null;
  }
  const video = document.getElementById("qr-scanner-video");
  if (video) video.srcObject = null;
  const backdrop = document.getElementById("qr-scanner-modal-backdrop");
  if (backdrop) backdrop.classList.remove("open");
}

async function openQrScannerModal() {
  const backdrop = document.getElementById("qr-scanner-modal-backdrop");
  const statusEl = document.getElementById("qr-scanner-status");
  const video = document.getElementById("qr-scanner-video");
  const canvas = document.getElementById("qr-scanner-canvas");
  if (!backdrop || !video || !canvas) return;

  backdrop.classList.add("open");
  if (statusEl) statusEl.textContent = "מפעיל מצלמה...";

  if (!navigator.mediaDevices?.getUserMedia) {
    if (statusEl) statusEl.textContent = "הדפדפן אינו תומך בגישה למצלמה במכשיר זה.";
    return;
  }

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = qrStream;
    await video.play();
  } catch (err) {
    if (statusEl) statusEl.textContent = "לא התקבלה הרשאת מצלמה — אשר גישה למצלמה בהגדרות הדפדפן.";
    return;
  }

  qrScanActive = true;
  if (statusEl) statusEl.textContent = "כוון את המצלמה אל קוד ה-QR של החבר...";

  let detector = null;
  if (typeof window.BarcodeDetector === "function") {
    try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; }
  }
  const jsQrFn = detector ? null : await ensureJsQrLoaded();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const onQrDetected = (rawValue) => {
    const target = extractTargetFromQrText(rawValue);
    if (!target) return;
    closeQrScannerModal();
    playWinSfx();
    openSharedProfileLookup(target);
  };

  const scanLoop = async () => {
    if (!qrScanActive) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        if (detector) {
          const codes = await detector.detect(video);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            onQrDetected(codes[0].rawValue);
            return;
          }
        } else if (jsQrFn && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = jsQrFn(imgData.data, imgData.width, imgData.height);
          if (decoded?.data) {
            onQrDetected(decoded.data);
            return;
          }
        }
      } catch (e) { }
    }
    qrScanRaf = requestAnimationFrame(scanLoop);
  };
  qrScanRaf = requestAnimationFrame(scanLoop);
}

async function openSharedProfileLookup(targetParam) {
  bindFriendsListenersOnce();
  if (!targetParam || !isHttp) return;
  try {
    const viewerQ = state.currentUser ? `&viewer=${encodeURIComponent(state.currentUser)}` : "";
    const res = await fetch(`/api/friends?profile=${encodeURIComponent(targetParam)}${viewerQ}&_t=${Date.now()}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.found && data.profile) {
      if (typeof showScreenFn === "function") showScreenFn("friends");
      openFriendProfileView(data.profile, data.relation || "none");
    } else {
      showGameToast("❌ הפרופיל שחיפשת לא נמצא", "error");
    }
  } catch (e) {
    showGameToast("שגיאה בטעינת הפרופיל", "error");
  }
}

export function initProfileShareButton() {
  const btn = document.getElementById("share-my-profile-btn");
  if (!btn) return;
  btn.addEventListener("click", () => shareMyProfileLink(btn, "📤 שתף"));
}

export function checkSharedProfileDeepLink(onShowScreen) {
  showScreenFn = onShowScreen || null;
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const profileParam = (params.get("profile") || "").trim();
  if (!profileParam) return;
  try {
    params.delete("profile");
    const nextUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
    window.history.replaceState({}, "", nextUrl);
  } catch (e) { }
  openSharedProfileLookup(profileParam);
}
