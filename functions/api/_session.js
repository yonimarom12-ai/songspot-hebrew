// עזר פנימי ל-Cloudflare Pages Functions (מתחיל ב-_ ולכן אינו חשוף כ-endpoint)
// יוצר ומאמת Session Token חתום ב-HMAC-SHA256 לכל שחקן מחובר

const DEFAULT_FALLBACK_SECRET = "songspot_hebrew_cf_hmac_secret_2026_v1";

function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getHmacKey(env) {
  const secret = String(env?.SESSION_SECRET || DEFAULT_FALLBACK_SECRET);
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(usernameLower, env) {
  const payloadObj = {
    u: String(usernameLower || "").trim().toLowerCase(),
    exp: Date.now() + 90 * 24 * 60 * 60 * 1000 // תקף ל-90 יום
  };
  const enc = new TextEncoder();
  const payloadB64 = toBase64Url(enc.encode(JSON.stringify(payloadObj)));
  const key = await getHmacKey(env);
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

export function extractBearerToken(request) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return "";
  return auth.slice(7).trim();
}

export async function verifySessionToken(token, expectedUsernameLower, env) {
  if (!token || typeof token !== "string" || !token.includes(".")) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await getHmacKey(env);
    const enc = new TextEncoder();
    const sigBytes = fromBase64Url(sigB64);
    const ok = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(payloadB64));
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (!payload || typeof payload.u !== "string" || typeof payload.exp !== "number") return false;
    if (Date.now() > payload.exp) return false;
    if (expectedUsernameLower && payload.u !== String(expectedUsernameLower).trim().toLowerCase()) return false;
    return true;
  } catch (e) {
    return false;
  }
}
