import { SHOP_AVATARS, SHOP_BACKGROUNDS, findAvatar, findBackground } from "../data/shop.js";
import { state } from "../state.js";
import { saveUserStats } from "../services/storage.js";
import { canAfford, spendPoints, formatPoints, getPointsBalance } from "./economy.js";

let activeShopTab = "avatars";

function getOwnedItems() {
  if (!state.userStats) return [];
  if (!Array.isArray(state.userStats.ownedItems)) state.userStats.ownedItems = [];
  return state.userStats.ownedItems;
}

function itemKey(type, id) {
  return `${type}:${id}`;
}

function isOwned(type, item) {
  return item.price === 0 || getOwnedItems().includes(itemKey(type, item.id));
}

function getEquipped(type) {
  if (!state.userStats) return "default";
  return type === "avatar"
    ? (state.userStats.equippedAvatar || "default")
    : (state.userStats.equippedBackground || "default");
}

function setShopMessage(text, kind = "") {
  const el = document.getElementById("shop-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `shop-msg ${kind}`;
}

// מחיל את הרקע ותמונת הפרופיל שנבחרו על הממשק
export function applyEquippedCosmetics() {
  const bg = findBackground(getEquipped("background"));
  if (bg.id === "default") {
    document.body.style.background = "";
  } else {
    document.body.style.background = bg.css;
    document.body.style.backgroundAttachment = "fixed";
  }

  const avatar = findAvatar(getEquipped("avatar"));
  const navAvatar = document.getElementById("nav-avatar");
  const navIcon = document.getElementById("nav-profile-icon");
  if (navAvatar) {
    navAvatar.textContent = avatar.emoji;
    navAvatar.style.background = avatar.bg;
    navAvatar.style.display = "inline-flex";
  }
  if (navIcon) navIcon.style.display = "none";

  const modalAvatar = document.getElementById("profile-modal-avatar");
  if (modalAvatar) {
    modalAvatar.textContent = avatar.emoji;
    modalAvatar.style.background = avatar.bg;
  }
}

function handleItemClick(type, item) {
  const owned = isOwned(type, item);

  if (!owned) {
    if (!state.currentUser) {
      setShopMessage("🔒 התחבר או הירשם בפרופיל כדי לקנות פריטים", "error");
      return;
    }
    if (!canAfford(item.price)) {
      const missing = formatPoints(item.price - getPointsBalance());
      setShopMessage(`חסרים לך ${missing} קריסטלים לפריט הזה`, "error");
      return;
    }
    if (!spendPoints(item.price)) {
      setShopMessage("הרכישה נכשלה, נסה שוב", "error");
      return;
    }
    getOwnedItems().push(itemKey(type, item.id));
    setShopMessage(`✓ רכשת את "${item.name}"!`, "success");
  } else {
    setShopMessage(`✓ "${item.name}" הופעל`, "success");
  }

  if (type === "avatar") state.userStats.equippedAvatar = item.id;
  else state.userStats.equippedBackground = item.id;

  saveUserStats();
  applyEquippedCosmetics();
  renderShop();
}

function buildCard(type, item) {
  const owned = isOwned(type, item);
  const equipped = getEquipped(type) === item.id;

  const card = document.createElement("button");
  card.type = "button";
  card.className = `shop-item ${equipped ? "equipped" : ""}`;

  const preview = document.createElement("div");
  if (type === "avatar") {
    preview.className = "shop-avatar-preview";
    preview.style.background = item.bg;
    preview.textContent = item.emoji;
  } else {
    preview.className = "shop-bg-preview";
    preview.style.background = item.css;
  }

  const name = document.createElement("span");
  name.className = "shop-item-name";
  name.textContent = item.name;

  const action = document.createElement("span");
  action.className = "shop-item-action";
  if (equipped) {
    action.textContent = "בשימוש";
    action.classList.add("is-equipped");
  } else if (owned) {
    action.textContent = "הפעל";
    action.classList.add("is-owned");
  } else {
    action.textContent = `💎 ${item.price}`;
  }

  card.append(preview, name, action);
  card.addEventListener("click", () => handleItemClick(type, item));
  return card;
}

export function renderShop() {
  const balanceEl = document.getElementById("shop-points-balance");
  if (balanceEl) balanceEl.textContent = formatPoints(getPointsBalance());

  document.querySelectorAll(".shop-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.shopTab === activeShopTab);
  });

  const grid = document.getElementById("shop-grid");
  if (!grid) return;
  grid.innerHTML = "";
  grid.className = `shop-grid ${activeShopTab === "avatars" ? "avatars" : "backgrounds"}`;

  const type = activeShopTab === "avatars" ? "avatar" : "background";
  const items = activeShopTab === "avatars" ? SHOP_AVATARS : SHOP_BACKGROUNDS;
  items.forEach(item => grid.appendChild(buildCard(type, item)));
}

export function initShopListeners() {
  document.querySelectorAll(".shop-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      activeShopTab = tab.dataset.shopTab;
      setShopMessage("");
      renderShop();
    });
  });
}
