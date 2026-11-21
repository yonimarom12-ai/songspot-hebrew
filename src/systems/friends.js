import { state } from "../state.js?v=20261121w";
import { SHOP_ITEMS } from "../data/shop.js?v=20261121w";
import { safeStorageGet, safeStorageSet, loadAccountsMap } from "../services/storage.js?v=20261121w";
import { syncAccountToCloud } from "../services/cloud.js?v=20261121w";
import { playClickSfx } from "./sfx.js?v=20261121w";

const LOCAL_FRIENDS_KEY = "songspot_local_friends_v1";
const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");

let currentFriendsList = [];
let activeViewedFriend = null;
let listenersBound = false;

// אלגוריתם זהה לשרת (functions/api/friends.js) לחישוב Player ID יציב וייחודי בן 6 תווים
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
  const found = SHOP_ITEMS.find(i => i.id === avatarId && i.category === "avatar");
  return found?.emoji || "🎧";
}

function loadLocalFriendsMap() {
  try {
    return JSON.parse(safeStorageGet(LOCAL_FRIENDS_KEY) || "{}");
  } catch (e) {
    return {};
  }
}

function saveLocalFriendsMap(map) {
  safeStorageSet(LOCAL_FRIENDS_KEY, JSON.stringify(map));
}

function setFriendsMsg(text, type = "") {
  const el = document.getElementById("friends-action-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `friends-action-msg${type ? ` ${type}` : ""}`;
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

function openFriendProfileView(friend) {
  if (!friend) return;
  activeViewedFriend = friend;
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

  if (avEl) avEl.textContent = getAvatarEmoji(friend.avatarId);
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
      { label: "🎵 שיר מועדף", val: friend.favorites?.song },
      { label: "💿 אלבום מועדף", val: friend.favorites?.album },
      { label: "🎤 זמר/ת מועדף/ת", val: friend.favorites?.artist }
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
        const l = document.createElement("span");
        l.className = "fp-fav-label";
        l.textContent = item.label;
        const v = document.createElement("strong");
        v.className = "fp-fav-val";
        v.textContent = item.val;
        row.append(l, v);
        favsEl.appendChild(row);
      });
    }
  }

  showFriendsSubView("profile");
}

function renderFriendsList() {
  const listEl = document.getElementById("friends-list");
  const countEl = document.getElementById("friends-count-badge");
  if (!listEl) return;

  if (countEl) countEl.textContent = String(currentFriendsList.length);
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
    empty.textContent = "עדיין אין לך חברים ברשימה — שתף את ה-ID שלך או הזן ID של חבר למעלה!";
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

function getLocalFallbackFriends(username) {
  const map = loadLocalFriendsMap();
  const keys = map[username.toLowerCase()] || [];
  const accounts = loadAccountsMap();
  return keys
    .map(k => {
      const acc = Object.values(accounts).find(a => a.username.toLowerCase() === k);
      if (!acc) return null;
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
    })
    .filter(Boolean);
}

export async function loadFriendsScreen() {
  bindFriendsListenersOnce();
  showFriendsSubView("list");
  setFriendsMsg("");

  const myCodeEl = document.getElementById("my-player-id-code");
  const copyBtn = document.getElementById("copy-my-id-btn");
  const addForm = document.getElementById("add-friend-form");

  if (!state.currentUser) {
    if (myCodeEl) myCodeEl.textContent = "התחבר כדי לקבל ID";
    if (copyBtn) copyBtn.style.display = "none";
    if (addForm) addForm.style.display = "none";
    currentFriendsList = [];
    renderFriendsList();
    return;
  }

  const myCode = getPlayerFriendCode(state.currentUser);
  if (myCodeEl) myCodeEl.textContent = `#${myCode}`;
  if (copyBtn) copyBtn.style.display = "inline-flex";
  if (addForm) addForm.style.display = "flex";

  // וידוא שהשחקן עצמו מסונכרן ב-D1 כדי שחברים יוכלו למצוא אותו לפי ה-ID
  if (state.userStats) {
    await syncAccountToCloud(state.currentUser, state.userStats).catch(() => false);
  }

  if (isHttp) {
    try {
      const res = await fetch(`/api/friends?username=${encodeURIComponent(state.currentUser)}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.configured && Array.isArray(data.friends)) {
          currentFriendsList = data.friends;
          renderFriendsList();
          return;
        }
      }
    } catch (e) { }
  }

  currentFriendsList = getLocalFallbackFriends(state.currentUser);
  renderFriendsList();
}

async function handleAddFriendSubmit(e) {
  e.preventDefault();
  if (!state.currentUser) return;
  const input = document.getElementById("add-friend-input");
  const raw = String(input?.value || "").trim();
  if (!raw) {
    setFriendsMsg("נא להזין ID של חבר או שם משתמש", "error");
    return;
  }

  setFriendsMsg("מחפש שחקן...", "");

  if (isHttp) {
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", username: state.currentUser, target: raw })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok && data.friend) {
        if (input) input.value = "";
        setFriendsMsg(`✓ ${data.friend.username} נוסף לרשימת החברים!`, "success");
        await loadFriendsScreen();
        return;
      }
      if (res.status !== 404 && res.status !== 503) {
        setFriendsMsg(data.error || "שגיאה בהוספת חבר", "error");
        return;
      }
      if (res.status === 404 && data.error) {
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
  if (found.username.toLowerCase() === state.currentUser.toLowerCase()) {
    setFriendsMsg("אי אפשר להוסיף את עצמך כחבר 😄", "error");
    return;
  }
  const map = loadLocalFriendsMap();
  const meKey = state.currentUser.toLowerCase();
  const set = new Set(map[meKey] || []);
  set.add(found.username.toLowerCase());
  map[meKey] = Array.from(set);
  saveLocalFriendsMap(map);
  if (input) input.value = "";
  setFriendsMsg(`✓ ${found.username} נוסף לרשימת החברים!`, "success");
  currentFriendsList = getLocalFallbackFriends(state.currentUser);
  renderFriendsList();
}

async function handleRemoveActiveFriend() {
  if (!state.currentUser || !activeViewedFriend) return;
  const targetLower = activeViewedFriend.usernameLower || activeViewedFriend.username.toLowerCase();

  if (isHttp) {
    try {
      await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", username: state.currentUser, targetLower })
      });
    } catch (e) { }
  }

  const map = loadLocalFriendsMap();
  const meKey = state.currentUser.toLowerCase();
  if (Array.isArray(map[meKey])) {
    map[meKey] = map[meKey].filter(k => k !== targetLower);
    saveLocalFriendsMap(map);
  }

  activeViewedFriend = null;
  await loadFriendsScreen();
}

function bindFriendsListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  const form = document.getElementById("add-friend-form");
  if (form) form.addEventListener("submit", handleAddFriendSubmit);

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
}
