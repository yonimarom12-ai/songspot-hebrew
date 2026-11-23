import { state } from "../state.js?v=20261123b";
import { saveUserStats } from "../services/storage.js?v=20261123b";
import { syncAccountToCloud } from "../services/cloud.js?v=20261123b";
import { awardPoints, updatePointsDisplay, launchCrystalRewardAnimation } from "./economy.js?v=20261123b";
import { applyEquippedCosmetics } from "./shop.js?v=20261123b";
import { launchWinConfetti } from "./confetti.js?v=20261123b";
import { playCrystalSfx, playWinSfx, playWrongSfx } from "./sfx.js?v=20261123b";

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
  },
  // 17 קודים חדשים (קריסטלים + פריטים בלעדיים שניתן להשיג רק דרך קודים!)
  { id: "songspot50", hash: "15c99b1b18ce2bc6a60501d931c6c36e4c810f63fe3c3d0d135ab618a7a41d50", crystals: 50, label: "+50 קריסטלים 💎" },
  { id: "israel2026", hash: "2bbdefdc404b5a98bf07241e056ee49848d96736eda0f5ffa1de5e0e7bec0e27", crystals: 120, label: "+120 קריסטלים 🇮🇱💎" },
  { id: "beats150", hash: "4bb04e6b9bf9dd95bfccbfc0628be818e885cf3c59ccf03ffefbe1f987235107", crystals: 150, label: "+150 קריסטלים 🎧💎" },
  { id: "studio200", hash: "e0565a536c3e9c2e0067e3bb53926c317fec32e878a65127cafe0b31c78176c4", crystals: 200, label: "+200 קריסטלים 🎙️💎" },
  { id: "hitmaker300", hash: "f11f34cfe395914f85a8fa78e61125e1234e5914b095b55117ef21df64f7cb7a", crystals: 300, label: "+300 קריסטלים 💿💎" },
  { id: "vipgold500", hash: "c245a6a4c8cffadec1c6198874d430b65da467ff87f89e37770c80bfe1992e77", crystals: 500, label: "+500 קריסטלים VIP 💎" },
  { id: "legend750", hash: "8fcdf6adaabcd3b4807ab9e912e959e70a335b4e5c3cc09710873df6862e4344", crystals: 750, label: "+750 קריסטלים אגדיים 💎" },
  // 3 ערכות נושא בלעדיות לקודים בלבד
  { id: "galaxyvip", hash: "b5569be7e7cd0c274fd6dd5e8489c736b9547521997bebe8317c353a82ba716a", crystals: 100, unlockItem: { type: "theme", id: "galaxy_nebula", equip: true }, label: "ערכת נושא בלעדית: גלקסיה קוסמית 🌌 + 100💎" },
  { id: "crimsonvip", hash: "fdd0d343c7abe6f1d8136fb45d9179d80b7249c5e6ebed3e00c2c32262e18263", crystals: 100, unlockItem: { type: "theme", id: "crimson_vip", equip: true }, label: "ערכת נושא בלעדית: אדום VIP 🔥 + 100💎" },
  { id: "arcticvip", hash: "e29540ac6efe8c1f04b9acfad6cdc38d5317b9def909553461625dcd6aeaeaf1", crystals: 100, unlockItem: { type: "theme", id: "arctic_ice", equip: true }, label: "ערכת נושא בלעדית: קרח ארקטי ❄️ + 100💎" },
  // 4 תמונות פרופיל בלעדיות לקודים בלבד
  { id: "alienmask", hash: "b24aa014ceaa0bbcff8ad87d1ca7134b0c6855e41702bdea235f8ca6a9b44f88", crystals: 50, unlockItem: { type: "avatar", id: "alien", equip: true }, label: "אווטאר בלעדי: 👽 חייזר + 50💎" },
  { id: "diamondface", hash: "0150f9a50cee96b61d9a4f979661d3773e5d537cae38e2441e09383a3b161ef5", crystals: 75, unlockItem: { type: "avatar", id: "diamond", equip: true }, label: "אווטאר בלעדי: 💎 יהלום VIP + 75💎" },
  { id: "dragonking", hash: "7a5864cd5c66b3a8f007020fbc143e16a17f9e3a5e10df8da3f8c458086d2641", crystals: 75, unlockItem: { type: "avatar", id: "dragon", equip: true }, label: "אווטאר בלעדי: 🐉 מלך הדרקונים + 75💎" },
  { id: "ghostmode", hash: "4ba2da17903cdcaaa32c1d134aea14d4f9a0e8acb8b0a9f6e20676748b68483a", crystals: 50, unlockItem: { type: "avatar", id: "ghost", equip: true }, label: "אווטאר בלעדי: 👻 מצב רוח + 50💎" },
  // 3 רקעים בלעדיים לקודים בלבד
  { id: "aurorabg", hash: "5a292a23f5d4c112861902e952e985895fdf1ad563158f2e7f7ffe9b5c3274c2", crystals: 50, unlockItem: { type: "background", id: "aurora", equip: true }, label: "רקע בלעדי: זוהר צפוני 🌌 + 50💎" },
  { id: "matrixbg", hash: "c2e632db6ccfa99db71275ad1893363eaec3240676331f29d956560e42a5fd19", crystals: 50, unlockItem: { type: "background", id: "matrix", equip: true }, label: "רקע בלעדי: מטריקס 🟩 + 50💎" },
  { id: "velvetbg", hash: "48a03c75ec139ea3fefc35c1a3a01b9f60ac6544cb5eab9aa28dd9699efba701", crystals: 50, unlockItem: { type: "background", id: "velvet", equip: true }, label: "רקע בלעדי: קטיפה מלכותית 🍷 + 50💎" }
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
