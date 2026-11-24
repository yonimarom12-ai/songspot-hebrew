// קטלוג פריטי החנות: תמונות פרופיל ורקעים למסך
export const CUSTOM_AVATAR_PRICE = 1500;
export const CUSTOM_BACKGROUND_PRICE = 2000;

export const SHOP_POWERUPS = [
  {
    id: "streakFreeze",
    name: "מגן רצף",
    emoji: "🛡️",
    desc: "מציל אוטומטית את אש הרצף שלך בטעות אחת במשחק הרגיל!",
    price: 60
  },
  {
    id: "fiftyFifty",
    name: "50/50 למרתון",
    emoji: "🎯",
    desc: "מוחק 2 תשובות שגויות בשאלת 4 אופציות במרתון!",
    price: 45
  },
  {
    id: "extraTime",
    name: "+5 שניות למשחק בזמן",
    emoji: "⏸️",
    desc: "מוסיף +5 שניות לשעון במוד 60 שניות!",
    price: 40
  }
];

export const SHOP_AVATARS = [
  { id: "default", name: "אוזניות", emoji: "🎧", bg: "linear-gradient(135deg,#1db954,#0f6e31)", price: 0 },
  { id: "mic", name: "מיקרופון", emoji: "🎤", bg: "linear-gradient(135deg,#ff5f6d,#ffc371)", price: 40 },
  { id: "guitar", name: "גיטרה", emoji: "🎸", bg: "linear-gradient(135deg,#f7971e,#ffd200)", price: 40 },
  { id: "drums", name: "תופים", emoji: "🥁", bg: "linear-gradient(135deg,#8e2de2,#4a00e0)", price: 60 },
  { id: "piano", name: "פסנתר", emoji: "🎹", bg: "linear-gradient(135deg,#232526,#5c5c5c)", price: 60 },
  { id: "sax", name: "סקסופון", emoji: "🎷", bg: "linear-gradient(135deg,#c79081,#dfa579)", price: 80 },
  { id: "moon", name: "ירח", emoji: "🌙", bg: "linear-gradient(135deg,#141e30,#243b55)", price: 100 },
  { id: "rocket", name: "טיל", emoji: "🚀", bg: "linear-gradient(135deg,#00c6ff,#0072ff)", price: 150 },
  { id: "lion", name: "אריה", emoji: "🦁", bg: "linear-gradient(135deg,#f12711,#f5af19)", price: 180 },
  { id: "fire", name: "להבה", emoji: "🔥", bg: "linear-gradient(135deg,#ff416c,#ff4b2b)", price: 220 },
  { id: "unicorn", name: "חד-קרן", emoji: "🦄", bg: "linear-gradient(135deg,#f953c6,#b91d73)", price: 260 },
  { id: "crown", name: "כתר", emoji: "👑", bg: "linear-gradient(135deg,#b88a00,#ffe259)", price: 350 },
  // אווטארים בלעדיים שניתן להשיג רק דרך קודים סודיים!
  { id: "alien", name: "חייזר בלעדי", emoji: "👽", bg: "linear-gradient(135deg,#00f260,#0575e6)", price: 0, exclusive: true },
  { id: "diamond", name: "יהלום VIP", emoji: "💎", bg: "linear-gradient(135deg,#38ef7d,#11998e)", price: 0, exclusive: true },
  { id: "dragon", name: "מלך הדרקונים", emoji: "🐉", bg: "linear-gradient(135deg,#cb2d3e,#ef473a)", price: 0, exclusive: true },
  { id: "ghost", name: "מצב רוח", emoji: "👻", bg: "linear-gradient(135deg,#434343,#000000)", price: 0, exclusive: true }
];

export const SHOP_BACKGROUNDS = [
  { id: "default", name: "שחור קלאסי", desc: "מינימליסטי, נקי ועל-זמני", css: "radial-gradient(circle at 50% 0%, #1b1f2a 0%, #07080c 68%, #020204 100%)", price: 0 },
  { id: "midnight", name: "חצות כחול", desc: "כחול לילה עמוק ואווירת אולפן", css: "linear-gradient(165deg, #163770 0%, #0b1b3a 52%, #040814 100%)", price: 60 },
  { id: "purple", name: "לילה סגול", desc: "סגול ולווט עם עומק דרמטי", css: "linear-gradient(165deg, #4a1578 0%, #230938 54%, #080210 100%)", price: 60 },
  { id: "forest", name: "יער", desc: "ירוק אמרלד עמוק ומרגיע", css: "linear-gradient(165deg, #0c5934 0%, #062b19 54%, #020c07 100%)", price: 80 },
  { id: "sunset", name: "שקיעה", desc: "ארגמן חם וורוד בין ערביים", css: "linear-gradient(165deg, #6b1936 0%, #340c1f 52%, #0a0308 100%)", price: 100 },
  { id: "ocean", name: "אוקיינוס", desc: "טורקיז עמוק וגלי לילה", css: "linear-gradient(160deg, #006480 0%, #002f40 52%, #020c12 100%)", price: 100 },
  { id: "stripes", name: "פסים אלכסוניים", desc: "טקסטורת פסים מודרנית כהה", css: "repeating-linear-gradient(135deg, #14161f 0 16px, #212536 16px 32px)", price: 120 },
  { id: "grid", name: "רשת ירוקה", desc: "רשת סייבר ירוקה עדינה", css: "linear-gradient(rgba(29,185,84,0.18) 1px,transparent 1px) 0 0/26px 26px, linear-gradient(90deg,rgba(29,185,84,0.18) 1px,transparent 1px) 0 0/26px 26px, #07100a", price: 150 },
  { id: "dots", name: "נקודות", desc: "מרקם נקודות אלגנטי ומדויק", css: "radial-gradient(rgba(255,255,255,0.18) 1.6px,transparent 1.8px) 0 0/18px 18px, #0e1018", price: 150 },
  { id: "stars", name: "שמי כוכבים", desc: "שמי לילה זרועי כוכבים", css: "radial-gradient(rgba(255,255,255,0.7) 1.2px,transparent 1.4px) 0 0/46px 46px, radial-gradient(rgba(255,255,255,0.38) 1px,transparent 1.2px) 23px 23px/46px 46px, linear-gradient(180deg, #132152 0%, #050817 85%)", price: 220 },
  { id: "neon", name: "נאון", desc: "זוהר ורוד וציאן מועדוני", css: "radial-gradient(circle at 18% 12%, rgba(255,0,153,0.42), transparent 50%), radial-gradient(circle at 82% 88%, rgba(0,229,255,0.36), transparent 50%), #090212", price: 260 },
  { id: "gold", name: "זהב יוקרתי", desc: "אור זהב חם ויוקרתי", css: "radial-gradient(circle at 50% 0%, rgba(255,200,60,0.42), transparent 58%), linear-gradient(180deg, #2e2104 0%, #090600 85%)", price: 350 },
  // רקעים בלעדיים שניתן להשיג רק דרך קודים סודיים!
  { id: "aurora", name: "זוהר צפוני 🔐", desc: "אורות צפון ירוקים וכחולים", css: "radial-gradient(circle at 20% 0%,rgba(16,185,129,0.42),transparent 52%), radial-gradient(circle at 80% 10%,rgba(56,189,248,0.38),transparent 52%), linear-gradient(180deg,#051e30 0%,#02060a 85%)", price: 0, exclusive: true },
  { id: "matrix", name: "מטריקס 🔐", desc: "קווי מטריקס ירוקים זוהרים", css: "repeating-linear-gradient(90deg,rgba(34,197,94,0.16) 0 2px,transparent 2px 18px), linear-gradient(180deg,#04240c 0%,#000000 85%)", price: 0, exclusive: true },
  { id: "velvet", name: "קטיפה מלכותית 🔐", desc: "ארגמן עמוק ואלגנטי", css: "radial-gradient(circle at 50% 0%,rgba(225,29,72,0.44),transparent 58%), linear-gradient(180deg,#2c0818 0%,#060104 85%)", price: 0, exclusive: true }
];

export const SHOP_THEMES = [
  {
    id: "default",
    name: "קלאסי ספוטיפיי",
    desc: "שחור עדין + ירוק ספוטיפיי ואור במה רגוע",
    previewBg: "linear-gradient(135deg,#070b09 0%,#121212 58%,#1db954 100%)",
    accent: "#1ed760",
    price: 0
  },
  {
    id: "concert_purple",
    name: "במת הופעות",
    desc: "סגול ניאון + במת קונצרט צבעונית",
    previewBg: "linear-gradient(135deg,#1f0d47 0%,#7c3aed 55%,#ec4899 100%)",
    accent: "#c084fc",
    price: 350
  },
  {
    id: "cyberpunk",
    name: "סייברפאנק",
    desc: "ציאן חשמלי + מג'נטה",
    previewBg: "linear-gradient(135deg,#040714 0%,#00d4ff 55%,#ff007f 100%)",
    accent: "#00f5ff",
    price: 450
  },
  {
    id: "sunset",
    name: "שקיעת מיאמי",
    desc: "אלמוגים חמים + ורוד",
    previewBg: "linear-gradient(135deg,#150716 0%,#ff6b35 55%,#ff2e93 100%)",
    accent: "#ff9f68",
    price: 550
  },
  {
    id: "emerald",
    name: "אמרלד לוקס",
    desc: "יער עמוק + נגיעות זהב",
    previewBg: "linear-gradient(135deg,#04130d 0%,#10b981 60%,#facc15 100%)",
    accent: "#34d399",
    price: 650
  },
  {
    id: "royal_gold",
    name: "זהב מלכותי",
    desc: "אובסידיאן + זהב יוקרתי",
    previewBg: "linear-gradient(135deg,#090806 0%,#ca8a04 55%,#fde047 100%)",
    accent: "#fde047",
    price: 900
  },
  // ערכות נושא בלעדיות שניתן להשיג רק דרך קודים סודיים!
  {
    id: "galaxy_nebula",
    name: "גלקסיה קוסמית 🔐",
    desc: "ערפילית אינדיגו + כוכבים (בלעדי לקוד!)",
    previewBg: "linear-gradient(135deg,#09051f 0%,#4f46e5 52%,#38bdf8 100%)",
    accent: "#818cf8",
    price: 0,
    exclusive: true
  },
  {
    id: "crimson_vip",
    name: "אדום VIP 🔐",
    desc: "אובסידיאן + ארגמן יוקרתי (בלעדי לקוד!)",
    previewBg: "linear-gradient(135deg,#120306 0%,#dc2626 55%,#f97316 100%)",
    accent: "#f87171",
    price: 0,
    exclusive: true
  },
  {
    id: "arctic_ice",
    name: "קרח ארקטי 🔐",
    desc: "כחול קרחוני + תכלת זוהר (בלעדי לקוד!)",
    previewBg: "linear-gradient(135deg,#04101a 0%,#0284c7 55%,#bae6fd 100%)",
    accent: "#7dd3fc",
    price: 0,
    exclusive: true
  }
];

// 8 רקעים חינמיים לבחירה חופשית בעריכת הפרופיל
export const FREE_PROFILE_BANNERS = [
  { id: "default", name: "ספוטיפיי עדין", css: "linear-gradient(135deg, rgba(29,185,84,0.28) 0%, rgba(10,16,12,0.92) 70%)" },
  { id: "purple_night", name: "לילה סגול", css: "linear-gradient(135deg, rgba(139,92,246,0.34) 0%, rgba(15,8,34,0.94) 75%)" },
  { id: "ocean_wave", name: "אוקיינוס", css: "linear-gradient(135deg, rgba(14,165,233,0.32) 0%, rgba(6,20,34,0.94) 75%)" },
  { id: "warm_sunset", name: "שקיעה חמה", css: "linear-gradient(135deg, rgba(249,115,22,0.32) 0%, rgba(36,10,20,0.94) 75%)" },
  { id: "emerald_gold", name: "אמרלד וזהב", css: "linear-gradient(135deg, rgba(16,185,129,0.3) 0%, rgba(234,179,8,0.18) 55%, rgba(6,16,12,0.95) 100%)" },
  { id: "royal_amber", name: "זהב מלכותי", css: "linear-gradient(135deg, rgba(250,204,21,0.28) 0%, rgba(28,20,6,0.95) 75%)" },
  { id: "rose_velvet", name: "ורד קטיפה", css: "linear-gradient(135deg, rgba(236,72,153,0.32) 0%, rgba(26,8,20,0.94) 75%)" },
  { id: "minimal_dark", name: "פחם נקי", css: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(12,12,14,0.96) 80%)" }
];

export function findProfileBanner(id) {
  return FREE_PROFILE_BANNERS.find(b => b.id === id) || FREE_PROFILE_BANNERS[0];
}

export function findAvatar(id) {
  return SHOP_AVATARS.find(a => a.id === id) || SHOP_AVATARS[0];
}

export function findBackground(id) {
  return SHOP_BACKGROUNDS.find(b => b.id === id) || SHOP_BACKGROUNDS[0];
}

export function findTheme(id) {
  return SHOP_THEMES.find(t => t.id === id) || SHOP_THEMES[0];
}
