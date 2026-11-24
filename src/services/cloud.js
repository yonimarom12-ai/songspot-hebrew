import { loadAccountsMap, safeStorageGet, safeStorageSet, safeStorageRemove } from "./storage.js?v=20261124c";

// לקוח ענן אחיד: עובד אוטומטית מול Cloudflare D1 (/api/auth, /api/sync, /api/leaderboard)
// עם אימות Session Token חתום ב-HMAC-SHA256 וגיבוי מקומי אוטומטי
const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");
const SESSION_TOKEN_KEY = "songspot_session_token_v1";

export function getSessionToken() {
  return safeStorageGet(SESSION_TOKEN_KEY) || "";
}

export function setSessionToken(token) {
  if (token) safeStorageSet(SESSION_TOKEN_KEY, token);
  else safeStorageRemove(SESSION_TOKEN_KEY);
}

export function getAuthHeaders() {
  const token = getSessionToken();
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export async function cloudAuthRequest(action, { username, password, email = "", stats = null }) {
  if (!isHttp) return { fallback: true };
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, username, password, email, stats })
    });
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      return { fallback: true };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || "שגיאה באימות החשבון" };
    }
    if (data.token) setSessionToken(data.token);
    return { ok: true, username: data.username, stats: data.stats || null, token: data.token || "" };
  } catch (e) {
    return { fallback: true };
  }
}

export async function pullAccountFromCloud(username) {
  if (!isHttp || !username) return null;
  try {
    const res = await fetch(`/api/sync?username=${encodeURIComponent(username)}&_t=${Date.now()}`, {
      method: "GET",
      headers: getAuthHeaders(),
      cache: "no-store"
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (data?.ok && data.stats && typeof data.stats === "object") {
      return data.stats;
    }
    return null;
  } catch (e) {
    return null;
  }
}

export async function syncAccountToCloud(username, stats) {
  if (!isHttp || !username || !stats) return false;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({ username, stats })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function fetchGlobalLeaderboard(limit = 25) {
  if (isHttp) {
    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}&_t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.configured && Array.isArray(data.rows)) {
          return { source: "cloud", rows: data.rows };
        }
      }
    } catch (e) { }
  }

  // גיבוי מקומי: מציג את כל החשבונות הקיימים במכשיר מדורגים לפי ביצועים
  const accounts = loadAccountsMap();
  const localRows = Object.values(accounts)
    .map(acc => ({
      username: acc.username,
      totalWon: acc.stats?.totalWon || 0,
      bestStreak: acc.stats?.bestStreak || 0,
      points: acc.stats?.points || 0,
      bestTimed: acc.stats?.bestTimedScore || 0,
      bestMarathon: acc.stats?.bestMarathonScore || 0
    }))
    .sort((a, b) => (b.totalWon - a.totalWon) || (b.bestStreak - a.bestStreak) || (b.points - a.points))
    .slice(0, limit);

  return { source: "local", rows: localRows };
}
