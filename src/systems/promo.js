import { state } from "../state.js?v=20261122u";
import { saveUserStats } from "../services/storage.js?v=20261122u";
import { syncAccountToCloud } from "../services/cloud.js?v=20261122u";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261122u";
import { applyEquippedCosmetics } from "./shop.js?v=20261122u";
import { launchWinConfetti } from "./confetti.js?v=20261122u";
import { playCrystalSfx, playWinSfx, playWrongSfx } from "./sfx.js?v=20261122u";

// טבלת קודים סודיים מוצפנים (SHA-256) כדי שלא יהיה ניתן לקרוא את הקודים ישירות מהקוד
const PROMO_CATALOG = [
  {
    id: "welcome100",
    hash: "7b591def2aad676c952b816c2d90bc23390485993e90f826b5c4b21ac9ab74b6",
    crystals: 100,
    label: "+100 קריסטלים 💎"
  },
  {
    id: "music2026",
    hash: "4756363cdcf8e9063e142afd2e2dac04e83dcb997be02e9ddec011a9ea56dbea",
    crystals: 250,
    label: "+250 קריסטלים 💎"
  },
  {
    id: "spotifyvip",
    hash: "dae6560adaef4f39c1fd59996796a207b290a3e87d3dd6ba6c8c74a8aeb00837",
    crystals: 50,
    unlockItem: { type: "theme", id: "spotify", equip: true },
    label: "ערכת הנושא קלאסי ספוטיפיי + 50 קריסטלים 💎"
  },
  {
    id: "kingcrown",
    hash: "80373114ce854d95810c3f0a9a780e835b1aea170d8c362e4eddeeaeb5db79e9",
    crystals: 100,
    unlockItem: { type: "avatar", id: "crown", equip: true },
    label: "תמונת פרופיל 👑 כתר + 100 קריסטלים 💎"
  },
  {
    id: "royalgold",
    hash: "fff1d55a9b91ee37a96cfddaf06f4114cfd0ca3458146585d60e160ba2f78c46",
    crystals: 0,
    unlockItem: { type: "theme", id: "royal_gold", equip: true },
    label: "ערכת הנושא זהב מלכותי 👑"
  },
  {
    id: "yonivip",
    hash: "f0e6a50bad0b830feb9c98f43fdb066520512960897e0c5aa8088945fdb06921",
    crystals: 2500,
    label: "+2,500 קריסטלים VIP 💎"
  },
  {
    id: "test10k",
    hash: "eaeb1f3a1a200133157c049bc07224a181e0e331f0f0786bb40e3b861f81afef",
    crystals: 10000,
    label: "+10,000 קריסטלים לבדיקות 💎"
  }
];

async function hashPromoCode(normalizedCode) {
  const data = new TextEncoder().encode(`guess_promo_v1:${normalizedCode}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function setPromoMessage(text, kind = "") {
  const el = document.getElementById("promo-msg");
  if (!el) return;
  el.textContent = text;
  el.className = `auth-msg ${kind}`;
}

export function togglePromoModal(isOpen) {
  const backdrop = document.getElementById("promo-modal-backdrop");
  if (!backdrop) return;
  if (isOpen) {
    setPromoMessage("");
    const input = document.getElementById("promo-code-input");
    if (input) {
      input.value = "";
      setTimeout(() => input.focus(), 120);
    }
  }
  backdrop.classList.toggle("open", isOpen);
}

async function redeemCode(rawInput) {
  const normalized = (rawInput || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) {
    setPromoMessage("הזן קוד תחילה", "error");
    return;
  }

  if (!state.currentUser || !state.userStats) {
    setPromoMessage("🔒 יש להתחבר לחשבון בפרופיל כדי לממש קודים", "error");
    playWrongSfx();
    return;
  }

  let digest = "";
  try {
    digest = await hashPromoCode(normalized);
  } catch (e) {
    setPromoMessage("שגיאה בבדיקת הקוד, נסה שוב", "error");
    return;
  }

  const matched = PROMO_CATALOG.find(item => item.hash === digest);
  if (!matched) {
    setPromoMessage("❌ קוד לא תקין או לא קיים", "error");
    playWrongSfx();
    return;
  }

  if (!Array.isArray(state.userStats.redeemedCodes)) {
    state.userStats.redeemedCodes = [];
  }
  if (state.userStats.redeemedCodes.includes(matched.id)) {
    setPromoMessage("כבר מימשת את הקוד הזה בחשבון שלך", "error");
    playWrongSfx();
    return;
  }

  state.userStats.redeemedCodes.push(matched.id);

  if (matched.crystals > 0) {
    awardPoints(matched.crystals, { persist: false, isPromo: true });
  }

  if (matched.unlockItem) {
    if (!Array.isArray(state.userStats.ownedItems)) state.userStats.ownedItems = [];
    const key = `${matched.unlockItem.type}:${matched.unlockItem.id}`;
    if (!state.userStats.ownedItems.includes(key)) {
      state.userStats.ownedItems.push(key);
    }
    if (matched.unlockItem.equip) {
      if (matched.unlockItem.type === "avatar") {
        state.userStats.equippedAvatar = matched.unlockItem.id;
      } else if (matched.unlockItem.type === "theme") {
        state.userStats.equippedTheme = matched.unlockItem.id;
        state.userStats.equippedBackground = "default";
      } else if (matched.unlockItem.type === "background") {
        state.userStats.equippedBackground = matched.unlockItem.id;
      }
    }
  }

  saveUserStats();
  syncAccountToCloud(state.currentUser, state.userStats);
  updatePointsDisplay(matched.crystals > 0);
  applyEquippedCosmetics();

  const input = document.getElementById("promo-code-input");
  if (input) input.value = "";

  setPromoMessage(`🎉 הקוד מומש בהצלחה! קיבלת: ${matched.label}`, "success");
  launchWinConfetti();
  playWinSfx();
  if (matched.crystals > 0) {
    playCrystalSfx();
    launchCrystalRewardAnimation(matched.crystals);
  }
}

export function initPromoListeners() {
  const openBtn = document.getElementById("open-promo-modal-btn");
  const closeBtn = document.getElementById("promo-close-btn");
  const backdrop = document.getElementById("promo-modal-backdrop");
  const form = document.getElementById("promo-code-form");

  if (openBtn) openBtn.addEventListener("click", () => togglePromoModal(true));
  if (closeBtn) closeBtn.addEventListener("click", () => togglePromoModal(false));
  if (backdrop) {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) togglePromoModal(false);
    });
  }
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("promo-code-input");
      redeemCode(input?.value || "");
    });
  }
}
