import { SHOP_AVATARS, SHOP_BACKGROUNDS, findAvatar, findBackground } from "../data/shop.js";
import { state } from "../state.js";
import { saveUserStats } from "../services/storage.js";
import { canAfford, spendPoints, formatPoints, getPointsBalance } from "./economy.js";

let activeShopTab = "avatars";
let previewSelection = null; // { type: "avatar" | "background", item }
let isPeeking = false;

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

function applyCosmeticsVisuals(bg, avatar) {
  if (bg.id === "default") {
    document.body.style.background = "";
  } else {
    document.body.style.background = bg.css;
    document.body.style.backgroundAttachment = "fixed";
  }

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

// מחיל את הרקע ותמונת הפרופיל שנרכשו והופעלו בפועל
export function applyEquippedCosmetics() {
  const bg = findBackground(getEquipped("background"));
  const avatar = findAvatar(getEquipped("avatar"));
  applyCosmeticsVisuals(bg, avatar);
}

// מחיל זמנית את הפריט שבתצוגה מקדימה (בלי לשמור ובלי לשלם)
function applyPreviewVisuals() {
  const bg = previewSelection?.type === "background"
    ? previewSelection.item
    : findBackground(getEquipped("background"));
  const avatar = previewSelection?.type === "avatar"
    ? previewSelection.item
    : findAvatar(getEquipped("avatar"));
  applyCosmeticsVisuals(bg, avatar);
}

function hidePeekBanner() {
  isPeeking = false;
  const banner = document.getElementById("shop-peek-banner");
  if (banner) {
    banner.classList.remove("visible");
    banner.innerHTML = "";
  }
}

export function clearShopPreview() {
  previewSelection = null;
  hidePeekBanner();
  applyEquippedCosmetics();
}

function enterPeekMode() {
  if (!previewSelection) return;
  isPeeking = true;
  applyPreviewVisuals();
  const backdrop = document.getElementById("shop-modal-backdrop");
  if (backdrop) backdrop.classList.remove("open");
  renderPeekBanner();
}

function exitPeekToShop() {
  hidePeekBanner();
  const backdrop = document.getElementById("shop-modal-backdrop");
  if (backdrop) backdrop.classList.add("open");
  renderShop();
}

function purchaseOrEquip(type, item) {
  const owned = isOwned(type, item);
  const wasPeeking = isPeeking;

  if (!owned) {
    if (!state.currentUser) {
      if (wasPeeking) exitPeekToShop();
      setShopMessage("🔒 התחבר או הירשם בפרופיל כדי לקנות פריטים", "error");
      return;
    }
    if (!canAfford(item.price)) {
      if (wasPeeking) exitPeekToShop();
      const missing = formatPoints(item.price - getPointsBalance());
      setShopMessage(`חסרים לך ${missing} קריסטלים לפריט הזה`, "error");
      return;
    }
    if (!spendPoints(item.price)) {
      if (wasPeeking) exitPeekToShop();
      setShopMessage("הרכישה נכשלה, נסה שוב", "error");
      return;
    }
    getOwnedItems().push(itemKey(type, item.id));
    setShopMessage(`✓ רכשת והפעלת את "${item.name}"!`, "success");
  } else {
    setShopMessage(`✓ "${item.name}" הופעל`, "success");
  }

  if (type === "avatar") state.userStats.equippedAvatar = item.id;
  else state.userStats.equippedBackground = item.id;

  saveUserStats();
  previewSelection = null;
  hidePeekBanner();
  applyEquippedCosmetics();

  if (wasPeeking) {
    const backdrop = document.getElementById("shop-modal-backdrop");
    if (backdrop) backdrop.classList.add("open");
  }
  renderShop();
}

function renderPeekBanner() {
  const banner = document.getElementById("shop-peek-banner");
  if (!banner) return;
  if (!isPeeking || !previewSelection) {
    banner.classList.remove("visible");
    banner.innerHTML = "";
    return;
  }

  const { type, item } = previewSelection;
  const owned = isOwned(type, item);
  const equipped = getEquipped(type) === item.id;

  banner.innerHTML = "";

  const label = document.createElement("div");
  label.className = "shop-peek-label";
  label.textContent = `👁️ תצוגה מקדימה: ${item.name}`;

  const actions = document.createElement("div");
  actions.className = "shop-peek-actions";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "shop-peek-btn secondary";
  backBtn.textContent = "חזור לחנות";
  backBtn.addEventListener("click", exitPeekToShop);

  actions.appendChild(backBtn);

  if (!equipped) {
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-peek-btn primary";
    buyBtn.textContent = owned ? "הפעל" : `קנה 💎 ${item.price}`;
    buyBtn.addEventListener("click", () => purchaseOrEquip(type, item));
    actions.appendChild(buyBtn);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "shop-peek-btn close";
  cancelBtn.setAttribute("aria-label", "בטל תצוגה מקדימה");
  cancelBtn.textContent = "✕";
  cancelBtn.addEventListener("click", () => {
    clearShopPreview();
    const gameBtn = document.getElementById("nav-game-btn");
    const shopBtn = document.getElementById("nav-shop-btn");
    if (gameBtn) gameBtn.classList.add("active");
    if (shopBtn) shopBtn.classList.remove("active");
  });
  actions.appendChild(cancelBtn);

  banner.append(label, actions);
  banner.classList.add("visible");
}

function renderPreviewPanel() {
  const panel = document.getElementById("shop-preview-panel");
  if (!panel) return;

  if (!previewSelection) {
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }

  const { type, item } = previewSelection;
  const owned = isOwned(type, item);
  const equipped = getEquipped(type) === item.id;
  const currentBg = type === "background" ? item : findBackground(getEquipped("background"));
  const currentAvatar = type === "avatar" ? item : findAvatar(getEquipped("avatar"));
  const displayName = state.currentUser || "אורח";

  panel.style.display = "flex";
  panel.innerHTML = "";

  // כותרת פאנל תצוגה מקדימה
  const header = document.createElement("div");
  header.className = "shop-preview-header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "shop-preview-title-wrap";

  const badge = document.createElement("span");
  badge.className = "shop-preview-badge";
  badge.textContent = "👁️ תצוגה מקדימה";

  const title = document.createElement("strong");
  title.className = "shop-preview-title";
  title.textContent = item.name;

  titleWrap.append(badge, title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "shop-preview-close";
  closeBtn.setAttribute("aria-label", "סגור תצוגה מקדימה");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    clearShopPreview();
    setShopMessage("");
    renderShop();
  });

  header.append(titleWrap, closeBtn);

  // תצוגת המוקאפ החיה (מראה את הרקע + האוואטר + שחקן מיני)
  const stage = document.createElement("div");
  stage.className = "shop-preview-stage";
  stage.style.background = currentBg.css;

  const mockProfile = document.createElement("div");
  mockProfile.className = "shop-preview-mock-user";

  const mockAv = document.createElement("span");
  mockAv.className = "shop-preview-mock-avatar";
  mockAv.style.background = currentAvatar.bg;
  mockAv.textContent = currentAvatar.emoji;

  const mockName = document.createElement("span");
  mockName.className = "shop-preview-mock-name";
  mockName.textContent = displayName;

  mockProfile.append(mockAv, mockName);

  const mockPlay = document.createElement("div");
  mockPlay.className = "shop-preview-mock-play";
  mockPlay.textContent = "▶";

  stage.append(mockProfile, mockPlay);

  // כפתורי פעולה: קנייה / הפעלה + הצצה על המסך האמיתי
  const actions = document.createElement("div");
  actions.className = "shop-preview-actions";

  const primaryBtn = document.createElement("button");
  primaryBtn.type = "button";
  primaryBtn.className = `shop-preview-btn primary ${equipped ? "is-equipped" : ""}`;
  if (equipped) {
    primaryBtn.textContent = "✓ בשימוש כעת";
    primaryBtn.disabled = true;
  } else if (owned) {
    primaryBtn.textContent = "הפעל פריט";
    primaryBtn.addEventListener("click", () => purchaseOrEquip(type, item));
  } else {
    primaryBtn.textContent = `קנה ב-💎 ${item.price}`;
    primaryBtn.addEventListener("click", () => purchaseOrEquip(type, item));
  }

  const peekBtn = document.createElement("button");
  peekBtn.type = "button";
  peekBtn.className = "shop-preview-btn peek";
  peekBtn.textContent = "👁️ הצץ במסך";
  peekBtn.addEventListener("click", enterPeekMode);

  actions.append(primaryBtn, peekBtn);
  panel.append(header, stage, actions);
}

function selectForPreview(type, item) {
  setShopMessage("");
  if (previewSelection && previewSelection.type === type && previewSelection.item.id === item.id) {
    // לחיצה שנייה על אותו פריט בבעלות מפעילה אותו ישירות לנוחות
    if (isOwned(type, item) && getEquipped(type) !== item.id) {
      purchaseOrEquip(type, item);
      return;
    }
    return;
  }

  previewSelection = { type, item };
  applyPreviewVisuals();
  renderShop();

  const panel = document.getElementById("shop-preview-panel");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function buildCard(type, item) {
  const owned = isOwned(type, item);
  const equipped = getEquipped(type) === item.id;
  const isPreviewed = previewSelection?.type === type && previewSelection?.item.id === item.id;

  const card = document.createElement("button");
  card.type = "button";
  card.className = `shop-item ${equipped ? "equipped" : ""} ${isPreviewed ? "previewing" : ""}`;

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
  } else if (isPreviewed) {
    action.textContent = "בתצוגה";
    action.classList.add("is-previewing");
  } else if (owned) {
    action.textContent = "הפעל";
    action.classList.add("is-owned");
  } else {
    action.textContent = `💎 ${item.price}`;
  }

  card.append(preview, name, action);
  card.addEventListener("click", () => selectForPreview(type, item));
  return card;
}

export function renderShop() {
  const balanceEl = document.getElementById("shop-points-balance");
  if (balanceEl) balanceEl.textContent = formatPoints(getPointsBalance());

  document.querySelectorAll(".shop-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.shopTab === activeShopTab);
  });

  renderPreviewPanel();

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
      clearShopPreview();
      setShopMessage("");
      renderShop();
    });
  });
}
