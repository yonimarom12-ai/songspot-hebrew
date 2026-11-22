import {
  SHOP_AVATARS,
  SHOP_BACKGROUNDS,
  SHOP_THEMES,
  SHOP_POWERUPS,
  CUSTOM_AVATAR_PRICE,
  CUSTOM_BACKGROUND_PRICE,
  findAvatar,
  findBackground,
  findTheme
} from "../data/shop.js?v=20261122s";
import { state } from "../state.js?v=20261122s";
import { saveUserStats } from "../services/storage.js?v=20261122s";
import { syncAccountToCloud } from "../services/cloud.js?v=20261122s";
import { canAfford, spendPoints, formatPoints, getPointsBalance } from "./economy.js?v=20261122s";

let activeShopTab = "avatars";
let previewSelection = null; // { type: "avatar" | "background", item }
let isPeeking = false;
let pendingUploadType = null; // "avatar" | "background"

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
  if (type === "avatar") return state.userStats.equippedAvatar || "default";
  if (type === "theme") return state.userStats.equippedTheme || "default";
  return state.userStats.equippedBackground || "default";
}

function getCustomData(type) {
  if (!state.userStats) return "";
  return type === "avatar"
    ? (state.userStats.customAvatarData || "")
    : (state.userStats.customBackgroundData || "");
}

function buildCustomBackgroundCss(dataUrl) {
  return `linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.62)), url("${dataUrl}") center / cover no-repeat`;
}

function buildCustomItem(type, dataUrl) {
  if (type === "avatar") {
    return {
      id: "custom",
      name: "תמונת פרופיל אישית",
      emoji: "",
      bg: `url("${dataUrl}") center / cover no-repeat`,
      customDataUrl: dataUrl,
      price: CUSTOM_AVATAR_PRICE
    };
  }
  return {
    id: "custom",
    name: "רקע אישי מתמונה",
    css: buildCustomBackgroundCss(dataUrl),
    customDataUrl: dataUrl,
    price: CUSTOM_BACKGROUND_PRICE
  };
}

function resolveEquippedBg() {
  const id = getEquipped("background");
  const customData = getCustomData("background");
  if (id === "custom" && customData) {
    return buildCustomItem("background", customData);
  }
  return findBackground(id);
}

function resolveEquippedAvatar() {
  const id = getEquipped("avatar");
  const customData = getCustomData("avatar");
  if (id === "custom" && customData) {
    return buildCustomItem("avatar", customData);
  }
  return findAvatar(id);
}

function setCrystalLabel(el, prefix, price) {
  el.textContent = "";
  if (prefix) el.appendChild(document.createTextNode(`${prefix} `));
  const img = document.createElement("img");
  img.className = "icon-3d-mini icon-3d-crystal";
  img.src = "assets/icon-crystal.png";
  img.alt = "";
  el.append(img, document.createTextNode(` ${formatPoints(price)}`));
}

function setShopMessage(text, kind = "") {
  const el = document.getElementById("shop-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `shop-msg ${kind}`;
}

function applyAvatarToEl(el, avatar) {
  if (!el) return;
  if (avatar.customDataUrl) {
    el.textContent = "";
    el.style.background = `url("${avatar.customDataUrl}") center / cover no-repeat`;
  } else {
    el.textContent = avatar.emoji || "🎧";
    el.style.background = avatar.bg || "";
  }
}

function applyCosmeticsVisuals(bg, avatar, theme) {
  const activeTheme = theme || findTheme(getEquipped("theme"));
  if (activeTheme.id === "default") {
    delete document.body.dataset.theme;
  } else {
    document.body.dataset.theme = activeTheme.id;
  }

  const isCustomBg = bg.id !== "default";
  document.body.classList.toggle("has-custom-bg", isCustomBg);
  if (!isCustomBg) {
    document.body.style.background = "";
  } else {
    document.body.style.background = bg.css;
    document.body.style.backgroundAttachment = "fixed";
  }

  const navAvatar = document.getElementById("nav-avatar");
  const navIcon = document.getElementById("nav-profile-icon");
  if (navAvatar) {
    applyAvatarToEl(navAvatar, avatar);
    navAvatar.style.display = "inline-flex";
  }
  if (navIcon) navIcon.style.display = "none";

  const modalAvatar = document.getElementById("profile-modal-avatar");
  applyAvatarToEl(modalAvatar, avatar);
}

// מחיל את הרקע, ערכת הנושא ותמונת הפרופיל שנרכשו והופעלו בפועל
export function applyEquippedCosmetics() {
  applyCosmeticsVisuals(resolveEquippedBg(), resolveEquippedAvatar(), findTheme(getEquipped("theme")));
}

// מחיל זמנית את הפריט שבתצוגה מקדימה (בלי לשמור ובלי לשלם)
function applyPreviewVisuals() {
  const bg = previewSelection?.type === "background"
    ? previewSelection.item
    : (previewSelection?.type === "theme" ? findBackground("default") : resolveEquippedBg());
  const avatar = previewSelection?.type === "avatar"
    ? previewSelection.item
    : resolveEquippedAvatar();
  const theme = previewSelection?.type === "theme"
    ? previewSelection.item
    : findTheme(getEquipped("theme"));
  applyCosmeticsVisuals(bg, avatar, theme);
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

// דחיסה והקטנה חכמה של תמונה בצד הלקוח כדי שתשקול מעט ותסתנכרן בקלות גם בענן וגם בין מכשירים
function compressUploadedImage(file, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("קובץ התמונה לא תקין"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("שגיאה בעיבוד התמונה"));

        if (type === "avatar") {
          const size = 160;
          canvas.width = size;
          canvas.height = size;
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          let out = canvas.toDataURL("image/jpeg", 0.72);
          if (out.length > 45000) out = canvas.toDataURL("image/jpeg", 0.52);
          resolve(out);
        } else {
          const maxDim = 640;
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          let out = canvas.toDataURL("image/jpeg", 0.62);
          if (out.length > 90000) out = canvas.toDataURL("image/jpeg", 0.45);
          resolve(out);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function triggerCustomImageUpload(type) {
  const input = document.getElementById("shop-image-upload-input");
  if (!input) return;
  pendingUploadType = type;
  input.value = "";
  input.click();
}

let shopConfirmState = null;

function closeShopConfirmModal() {
  const backdrop = document.getElementById("shop-confirm-backdrop");
  if (backdrop) backdrop.classList.remove("open");
  shopConfirmState = null;
}

function openCosmeticConfirmModal({ type, item, onConfirm }) {
  const backdrop = document.getElementById("shop-confirm-backdrop");
  if (!backdrop) { onConfirm(); return; }
  const titleEl = document.getElementById("shop-confirm-title");
  const emojiEl = document.getElementById("shop-confirm-emoji");
  const descEl = document.getElementById("shop-confirm-desc");
  const qtyPicker = document.getElementById("shop-qty-picker");
  const errEl = document.getElementById("shop-confirm-error");
  const okBtn = document.getElementById("shop-confirm-ok-btn");

  const typeLabel = type === "avatar" ? "תמונת הפרופיל" : type === "theme" ? "ערכת הנושא" : "הרקע";
  if (titleEl) titleEl.textContent = "אישור רכישה";
  if (emojiEl) emojiEl.textContent = item.emoji || "💎";
  if (descEl) descEl.textContent = `האם אתה בטוח שברצונך לקנות את ${typeLabel} "${item.name}" ב-${formatPoints(item.price)} קריסטלים?`;
  if (qtyPicker) qtyPicker.style.display = "none";
  if (errEl) errEl.textContent = "";
  if (okBtn) {
    okBtn.textContent = `כן, קנה ב-${formatPoints(item.price)} 💎`;
    okBtn.disabled = false;
  }

  shopConfirmState = { mode: "cosmetic", onConfirm };
  backdrop.classList.add("open");
}

function openPowerupQuantityModal(item) {
  const backdrop = document.getElementById("shop-confirm-backdrop");
  if (!backdrop) return;
  const titleEl = document.getElementById("shop-confirm-title");
  const emojiEl = document.getElementById("shop-confirm-emoji");
  const descEl = document.getElementById("shop-confirm-desc");
  const qtyPicker = document.getElementById("shop-qty-picker");
  const qtyInput = document.getElementById("shop-qty-input");
  const errEl = document.getElementById("shop-confirm-error");
  const okBtn = document.getElementById("shop-confirm-ok-btn");

  if (titleEl) titleEl.textContent = `קניית ${item.name}`;
  if (emojiEl) emojiEl.textContent = item.emoji || "⚡";
  if (descEl) descEl.textContent = `${item.desc} (${formatPoints(item.price)} 💎 ליחידה)`;
  if (qtyPicker) qtyPicker.style.display = "flex";
  if (qtyInput) qtyInput.value = "1";
  if (errEl) errEl.textContent = "";
  if (okBtn) okBtn.textContent = "המשך לקנייה";

  shopConfirmState = { mode: "powerup-qty", item, qty: 1 };
  updatePowerupQtyTotalUI();
  backdrop.classList.add("open");
}

function updatePowerupQtyTotalUI() {
  if (!shopConfirmState || shopConfirmState.mode !== "powerup-qty") return;
  const qtyInput = document.getElementById("shop-qty-input");
  const totalEl = document.getElementById("shop-qty-total");
  const errEl = document.getElementById("shop-confirm-error");
  const okBtn = document.getElementById("shop-confirm-ok-btn");

  const raw = parseInt(qtyInput?.value || "1", 10);
  const qty = Number.isFinite(raw) ? Math.max(1, Math.min(99, raw)) : 1;
  shopConfirmState.qty = qty;

  const totalCost = Math.round(qty * shopConfirmState.item.price * 100) / 100;
  const balance = getPointsBalance();
  const affordable = canAfford(totalCost);

  if (totalEl) {
    totalEl.textContent = `סה"כ לתשלום: ${formatPoints(totalCost)} 💎 (יתרתך: ${formatPoints(balance)} 💎)`;
  }
  if (errEl) {
    errEl.textContent = affordable ? "" : `חסרים לך ${formatPoints(totalCost - balance)} קריסטלים לכמות זו`;
  }
  if (okBtn) {
    okBtn.disabled = !affordable;
  }
}

function purchaseOrEquip(type, item, skipConfirm = false) {
  const owned = isOwned(type, item);
  const wasPeeking = isPeeking;

  if (item.id === "custom" && !item.customDataUrl) {
    triggerCustomImageUpload(type);
    return;
  }

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
    if (!skipConfirm) {
      openCosmeticConfirmModal({
        type,
        item,
        onConfirm: () => purchaseOrEquip(type, item, true)
      });
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

  const prevCustomData = getCustomData(type);
  const prevEquipped = getEquipped(type);

  if (item.id === "custom" && item.customDataUrl) {
    if (type === "avatar") state.userStats.customAvatarData = item.customDataUrl;
    else state.userStats.customBackgroundData = item.customDataUrl;
  }

  if (type === "avatar") state.userStats.equippedAvatar = item.id;
  else if (type === "theme") {
    state.userStats.equippedTheme = item.id;
    // כשמפעילים ערכת נושא, מאפסים רקע ידני לברירת מחדל כדי שערכת הנושא תיראה במלואה
    if (item.id !== "default") state.userStats.equippedBackground = "default";
  } else state.userStats.equippedBackground = item.id;

  const savedOk = saveUserStats();
  if (savedOk && state.currentUser) {
    syncAccountToCloud(state.currentUser, state.userStats);
  }
  if (!savedOk && item.id === "custom") {
    // אם אין מקום ב-localStorage לתמונה, משחזרים מצב קודם בלי לאבד נתונים
    if (type === "avatar") {
      state.userStats.customAvatarData = prevCustomData;
      state.userStats.equippedAvatar = prevEquipped;
    } else {
      state.userStats.customBackgroundData = prevCustomData;
      state.userStats.equippedBackground = prevEquipped;
    }
    if (!owned) {
      state.userStats.points = Math.round(((state.userStats.points || 0) + item.price) * 100) / 100;
      const key = itemKey(type, item.id);
      state.userStats.ownedItems = getOwnedItems().filter(k => k !== key);
    }
    saveUserStats();
    if (wasPeeking) exitPeekToShop();
    setShopMessage("אין מספיק מקום אחסון בדפדפן לתמונה זו — נסה תמונה קטנה יותר", "error");
    renderShop();
    return;
  }

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
  const isNewCustomUpload = item.id === "custom" && item.customDataUrl !== getCustomData(type);
  const equipped = getEquipped(type) === item.id && !isNewCustomUpload;

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
    if (owned) {
      buyBtn.textContent = isNewCustomUpload ? "שמור והפעל" : "הפעל";
    } else {
      setCrystalLabel(buyBtn, "קנה", item.price);
    }
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
  const isNewCustomUpload = item.id === "custom" && item.customDataUrl !== getCustomData(type);
  const equipped = getEquipped(type) === item.id && !isNewCustomUpload;
  const currentBg = type === "background" ? item : resolveEquippedBg();
  const currentAvatar = type === "avatar" ? item : resolveEquippedAvatar();
  const displayName = state.currentUser || "אורח";

  panel.style.display = "flex";
  panel.innerHTML = "";

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

  const stage = document.createElement("div");
  stage.className = "shop-preview-stage";
  stage.style.background = type === "theme" ? item.previewBg : currentBg.css;

  const mockProfile = document.createElement("div");
  mockProfile.className = "shop-preview-mock-user";

  const mockAv = document.createElement("span");
  mockAv.className = "shop-preview-mock-avatar";
  applyAvatarToEl(mockAv, currentAvatar);

  const mockName = document.createElement("span");
  mockName.className = "shop-preview-mock-name";
  mockName.textContent = displayName;

  mockProfile.append(mockAv, mockName);

  const mockPlay = document.createElement("div");
  mockPlay.className = "shop-preview-mock-play";
  if (type === "theme" && item.accent) {
    mockPlay.style.background = item.accent;
  }
  mockPlay.textContent = "▶";

  stage.append(mockProfile, mockPlay);

  const actions = document.createElement("div");
  actions.className = "shop-preview-actions";

  const primaryBtn = document.createElement("button");
  primaryBtn.type = "button";
  primaryBtn.className = `shop-preview-btn primary ${equipped ? "is-equipped" : ""}`;
  if (equipped) {
    primaryBtn.textContent = "✓ בשימוש כעת";
    primaryBtn.disabled = true;
  } else if (owned) {
    primaryBtn.textContent = isNewCustomUpload ? "שמור והפעל תמונה" : "הפעל פריט";
    primaryBtn.addEventListener("click", () => purchaseOrEquip(type, item));
  } else {
    setCrystalLabel(primaryBtn, "קנה ב-", item.price);
    primaryBtn.addEventListener("click", () => purchaseOrEquip(type, item));
  }

  const peekBtn = document.createElement("button");
  peekBtn.type = "button";
  peekBtn.className = "shop-preview-btn peek";
  peekBtn.textContent = "👁️ הצץ במסך";
  peekBtn.addEventListener("click", enterPeekMode);

  actions.append(primaryBtn, peekBtn);

  if (item.id === "custom") {
    const changePhotoBtn = document.createElement("button");
    changePhotoBtn.type = "button";
    changePhotoBtn.className = "shop-preview-btn change-photo";
    changePhotoBtn.textContent = "📸 בחר תמונה אחרת";
    changePhotoBtn.addEventListener("click", () => triggerCustomImageUpload(type));
    actions.appendChild(changePhotoBtn);
  }

  panel.append(header, stage, actions);
}

function selectForPreview(type, item) {
  setShopMessage("");
  if (previewSelection && previewSelection.type === type && previewSelection.item.id === item.id) {
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

function buildCustomUploadCard(type) {
  const isAvatar = type === "avatar";
  const price = isAvatar ? CUSTOM_AVATAR_PRICE : CUSTOM_BACKGROUND_PRICE;
  const savedData = getCustomData(type);
  const owned = getOwnedItems().includes(itemKey(type, "custom"));
  const equipped = getEquipped(type) === "custom" && Boolean(savedData);
  const isPreviewed = previewSelection?.type === type && previewSelection?.item.id === "custom";

  const card = document.createElement("button");
  card.type = "button";
  card.className = `shop-item vip-custom ${equipped ? "equipped" : ""} ${isPreviewed ? "previewing" : ""}`;

  const vipBadge = document.createElement("span");
  vipBadge.className = "shop-vip-badge";
  vipBadge.textContent = "👑 VIP · העלאה אישית";

  const row = document.createElement("div");
  row.className = "shop-vip-row";

  const preview = document.createElement("div");
  if (isAvatar) {
    preview.className = "shop-avatar-preview";
    if (savedData) {
      preview.style.background = `url("${savedData}") center / cover no-repeat`;
    } else {
      preview.style.background = "linear-gradient(135deg,#f5af19,#8e2de2)";
      preview.textContent = "📸";
    }
  } else {
    preview.className = "shop-bg-preview shop-vip-bg-thumb";
    if (savedData) {
      preview.style.background = buildCustomBackgroundCss(savedData);
    } else {
      preview.style.background = "linear-gradient(135deg,#2a0b3d 0%,#b88a00 100%)";
      preview.textContent = "🖼️";
    }
  }

  const info = document.createElement("div");
  info.className = "shop-vip-info";

  const title = document.createElement("span");
  title.className = "shop-item-name";
  title.textContent = isAvatar ? "העלה תמונת פרופיל משלך" : "העלה תמונת רקע משלך";

  const sub = document.createElement("span");
  sub.className = "shop-vip-sub";
  sub.textContent = owned
    ? "פתוח בבעלותך · לחץ להפעלה או החלפת תמונה"
    : "בחר תמונה מהגלריה וצפה בתצוגה מקדימה לפני התשלום";

  info.append(title, sub);

  const action = document.createElement("span");
  action.className = "shop-item-action";
  if (equipped) {
    action.textContent = "בשימוש";
    action.classList.add("is-equipped");
  } else if (isPreviewed) {
    action.textContent = "בתצוגה";
    action.classList.add("is-previewing");
  } else if (owned) {
    action.textContent = savedData ? "הפעל / החלף" : "העלה תמונה";
    action.classList.add("is-owned");
  } else {
    setCrystalLabel(action, "", price);
  }

  row.append(preview, info, action);
  card.append(vipBadge, row);

  card.addEventListener("click", () => {
    setShopMessage("");
    if (owned && savedData) {
      selectForPreview(type, buildCustomItem(type, savedData));
    } else {
      triggerCustomImageUpload(type);
    }
  });

  return card;
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
  } else if (type === "theme") {
    preview.className = "shop-bg-preview shop-theme-preview";
    preview.style.background = item.previewBg;
    const dot = document.createElement("span");
    dot.className = "shop-theme-accent-dot";
    dot.style.background = item.accent;
    preview.appendChild(dot);
  } else {
    preview.className = "shop-bg-preview";
    preview.style.background = item.css;
  }

  const name = document.createElement("span");
  name.className = "shop-item-name";
  name.textContent = item.name;

  if (type === "theme" && item.desc) {
    const desc = document.createElement("span");
    desc.className = "shop-theme-desc";
    desc.textContent = item.desc;
    card.append(preview, name, desc);
  } else {
    card.append(preview, name);
  }

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
    setCrystalLabel(action, "", item.price);
  }

  card.appendChild(action);
  card.addEventListener("click", () => selectForPreview(type, item));
  return card;
}

function buildPowerupCard(item) {
  const count = state.userStats?.powerups?.[item.id] || 0;
  const card = document.createElement("div");
  card.className = "shop-item shop-powerup-card";

  const head = document.createElement("div");
  head.className = "shop-pu-head";
  const em = document.createElement("span");
  em.className = "shop-pu-emoji";
  em.textContent = item.emoji;
  const info = document.createElement("div");
  info.className = "shop-pu-info";
  const nm = document.createElement("strong");
  nm.className = "shop-item-name";
  nm.textContent = item.name;
  const desc = document.createElement("span");
  desc.className = "shop-vip-sub";
  desc.textContent = item.desc;
  info.append(nm, desc);
  head.append(em, info);

  const foot = document.createElement("div");
  foot.className = "shop-pu-foot";
  const qty = document.createElement("span");
  qty.className = "shop-pu-qty";
  qty.textContent = `ברשותך: ${count}`;

  const buyBtn = document.createElement("button");
  buyBtn.type = "button";
  buyBtn.className = "shop-item-action shop-pu-buy-btn";
  setCrystalLabel(buyBtn, "קנה · ", item.price);
  const openPuFlow = () => {
    if (!state.currentUser) {
      setShopMessage("יש להתחבר בפרופיל כדי לקנות עזרים.", "error");
      return;
    }
    setShopMessage("");
    openPowerupQuantityModal(item);
  };
  buyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPuFlow();
  });
  card.style.cursor = "pointer";
  card.addEventListener("click", openPuFlow);

  foot.append(qty, buyBtn);
  card.append(head, foot);
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

  if (activeShopTab === "powerups") {
    SHOP_POWERUPS.forEach(item => grid.appendChild(buildPowerupCard(item)));
    return;
  }

  if (activeShopTab === "themes") {
    SHOP_THEMES.forEach(item => grid.appendChild(buildCard("theme", item)));
    return;
  }

  const type = activeShopTab === "avatars" ? "avatar" : "background";
  grid.appendChild(buildCustomUploadCard(type));

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

  // מאזינים לחלון אישור רכישה + בחירת כמות לעזרים
  const confirmBackdrop = document.getElementById("shop-confirm-backdrop");
  const confirmClose = document.getElementById("shop-confirm-close-btn");
  const confirmCancel = document.getElementById("shop-confirm-cancel-btn");
  const confirmOk = document.getElementById("shop-confirm-ok-btn");
  const qtyInput = document.getElementById("shop-qty-input");
  const qtyMinus = document.getElementById("shop-qty-minus");
  const qtyPlus = document.getElementById("shop-qty-plus");

  if (confirmClose) confirmClose.addEventListener("click", closeShopConfirmModal);
  if (confirmCancel) confirmCancel.addEventListener("click", closeShopConfirmModal);
  if (confirmBackdrop) {
    confirmBackdrop.addEventListener("click", (e) => {
      if (e.target === confirmBackdrop) closeShopConfirmModal();
    });
  }
  if (qtyInput) {
    qtyInput.addEventListener("input", updatePowerupQtyTotalUI);
  }
  if (qtyMinus && qtyInput) {
    qtyMinus.addEventListener("click", () => {
      const v = Math.max(1, (parseInt(qtyInput.value || "1", 10) || 1) - 1);
      qtyInput.value = String(v);
      updatePowerupQtyTotalUI();
    });
  }
  if (qtyPlus && qtyInput) {
    qtyPlus.addEventListener("click", () => {
      const v = Math.min(99, (parseInt(qtyInput.value || "1", 10) || 1) + 1);
      qtyInput.value = String(v);
      updatePowerupQtyTotalUI();
    });
  }
  if (confirmOk) {
    confirmOk.addEventListener("click", () => {
      if (!shopConfirmState) return;

      if (shopConfirmState.mode === "cosmetic") {
        const fn = shopConfirmState.onConfirm;
        closeShopConfirmModal();
        if (fn) fn();
        return;
      }

      if (shopConfirmState.mode === "powerup-qty") {
        const { item, qty } = shopConfirmState;
        const totalCost = Math.round(qty * item.price * 100) / 100;
        if (!canAfford(totalCost)) {
          updatePowerupQtyTotalUI();
          return;
        }
        // שלב 2: אישור סופי לפני החיוב!
        const titleEl = document.getElementById("shop-confirm-title");
        const descEl = document.getElementById("shop-confirm-desc");
        const qtyPicker = document.getElementById("shop-qty-picker");
        const errEl = document.getElementById("shop-confirm-error");
        if (titleEl) titleEl.textContent = "אישור סופי לרכישה";
        if (descEl) descEl.textContent = `האם אתה בטוח שברצונך לקנות ${qty} × ${item.name} ב-${formatPoints(totalCost)} קריסטלים?`;
        if (qtyPicker) qtyPicker.style.display = "none";
        if (errEl) errEl.textContent = "";
        confirmOk.textContent = `כן, קנה ב-${formatPoints(totalCost)} 💎`;
        shopConfirmState = { mode: "powerup-final", item, qty, totalCost };
        return;
      }

      if (shopConfirmState.mode === "powerup-final") {
        const { item, qty, totalCost } = shopConfirmState;
        closeShopConfirmModal();
        if (!state.currentUser || !canAfford(totalCost) || !spendPoints(totalCost)) {
          setShopMessage("אין מספיק קריסטלים להשלמת הרכישה.", "error");
          return;
        }
        if (!state.userStats.powerups) {
          state.userStats.powerups = { streakFreeze: 0, fiftyFifty: 0, extraTime: 0 };
        }
        state.userStats.powerups[item.id] = (state.userStats.powerups[item.id] || 0) + qty;
        saveUserStats();
        syncAccountToCloud(state.currentUser, state.userStats);
        setShopMessage(`✓ רכשת ${qty} × ${item.emoji} ${item.name}! (ברשותך: ${state.userStats.powerups[item.id]})`, "success");
        renderShop();
      }
    });
  }

  const fileInput = document.getElementById("shop-image-upload-input");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      const type = pendingUploadType || (activeShopTab === "avatars" ? "avatar" : "background");
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setShopMessage("יש לבחור קובץ תמונה בלבד", "error");
        return;
      }

      try {
        setShopMessage("מעבד תמונה לתצוגה מקדימה...", "");
        const dataUrl = await compressUploadedImage(file, type);
        setShopMessage("");
        previewSelection = { type, item: buildCustomItem(type, dataUrl) };
        applyPreviewVisuals();
        renderShop();

        const panel = document.getElementById("shop-preview-panel");
        if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        setShopMessage(err?.message || "שגיאה בטעינת התמונה", "error");
      }
    });
  }
}
