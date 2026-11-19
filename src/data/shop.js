// קטלוג פריטי החנות: תמונות פרופיל ורקעים למסך
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
  { id: "crown", name: "כתר", emoji: "👑", bg: "linear-gradient(135deg,#b88a00,#ffe259)", price: 350 }
];

export const SHOP_BACKGROUNDS = [
  { id: "default", name: "שחור קלאסי", css: "#000000", price: 0 },
  { id: "midnight", name: "חצות כחול", css: "linear-gradient(180deg,#0b1a33 0%,#000000 70%)", price: 60 },
  { id: "purple", name: "לילה סגול", css: "linear-gradient(180deg,#2a0b3d 0%,#07010c 75%)", price: 60 },
  { id: "forest", name: "יער", css: "linear-gradient(180deg,#06301c 0%,#010a05 75%)", price: 80 },
  { id: "sunset", name: "שקיעה", css: "linear-gradient(180deg,#3d0f1e 0%,#1a0712 45%,#000000 85%)", price: 100 },
  { id: "ocean", name: "אוקיינוס", css: "linear-gradient(160deg,#003b4d 0%,#001a24 50%,#000000 90%)", price: 100 },
  { id: "stripes", name: "פסים אלכסוניים", css: "repeating-linear-gradient(135deg,#0c0c0c 0 16px,#151515 16px 32px)", price: 120 },
  { id: "grid", name: "רשת ירוקה", css: "linear-gradient(rgba(29,185,84,0.09) 1px,transparent 1px) 0 0/26px 26px, linear-gradient(90deg,rgba(29,185,84,0.09) 1px,transparent 1px) 0 0/26px 26px, #040404", price: 150 },
  { id: "dots", name: "נקודות", css: "radial-gradient(rgba(255,255,255,0.08) 1.5px,transparent 1.6px) 0 0/18px 18px, #070707", price: 150 },
  { id: "stars", name: "שמי כוכבים", css: "radial-gradient(rgba(255,255,255,0.55) 1px,transparent 1.2px) 0 0/46px 46px, radial-gradient(rgba(255,255,255,0.3) 1px,transparent 1.2px) 23px 23px/46px 46px, linear-gradient(180deg,#0a0f2c 0%,#000000 85%)", price: 220 },
  { id: "neon", name: "נאון", css: "radial-gradient(circle at 15% 10%,rgba(255,0,153,0.28),transparent 45%), radial-gradient(circle at 85% 90%,rgba(0,229,255,0.24),transparent 45%), #050008", price: 260 },
  { id: "gold", name: "זהב יוקרתי", css: "radial-gradient(circle at 50% 0%,rgba(255,200,60,0.25),transparent 55%), linear-gradient(180deg,#1a1300 0%,#000000 80%)", price: 350 }
];

export function findAvatar(id) {
  return SHOP_AVATARS.find(a => a.id === id) || SHOP_AVATARS[0];
}

export function findBackground(id) {
  return SHOP_BACKGROUNDS.find(b => b.id === id) || SHOP_BACKGROUNDS[0];
}
