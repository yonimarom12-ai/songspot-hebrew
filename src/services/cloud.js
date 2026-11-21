import { loadAccountsMap } from "./storage.js?v=20261121f";

// לקוח ענן אחיד: עובד אוטומטית מול Cloudflare D1 (/api/auth, /api/sync, /api/leaderboard)
// עם גיבוי מקומי אוטומטי אם בסיס הנתונים D1 עדיין לא חובר ב-Cloudflare Dashboard
const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");
let cloudAvailable = isHttp;

export async function cloudAuthRequest(action, { username, password, email = "", stats = null }) {
  if (!cloudAvailable) return { fallback: true };
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, username, password, email, stats })
    });
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      cloudAvailable = false;
      return { fallback: true };
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || "שגיאה באימות החשבון" };
    }
    return { ok: true, username: data.username, stats: data.stats || null };
  } catch (e) {
    return { fallback: true };
  }
}

export async function syncAccountToCloud(username, stats) {
  if (!cloudAvailable || !username || !stats) return false;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, stats })
    });
    if (res.status === 404 || res.status === 503) {
      cloudAvailable = false;
      return false;
    }
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function loadAccountFromCloud() {
  return null;
}

export async function fetchGlobalLeaderboard(limit = 25) {
  if (cloudAvailable) {
    try {
      const res = await fetch(`/api/leaderboard?limit=${limit}`);
      if (res.ok) {
        const data = await res.json();
        if (data.configured && Array.isArray(data.rows)) {
          return { source: "cloud", rows: data.rows };
        }
      } else if (res.status === 404 || res.status === 503) {
        cloudAvailable = false;
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
      bestTimed: acc.stats?.bestTimedScore || 0
    }))
    .sort((a, b) => (b.totalWon - a.totalWon) || (b.bestStreak - a.bestStreak) || (b.points - a.points))
    .slice(0, limit);

  return { source: "local", rows: localRows };
}
