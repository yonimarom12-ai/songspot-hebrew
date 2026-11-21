import { loadAccountsMap } from "./storage.js?v=20261122b";

// לקוח ענן אחיד: עובד אוטומטית מול Cloudflare D1 (/api/auth, /api/sync, /api/leaderboard)
// עם גיבוי מקומי אוטומטי אם רץ מקומית או ללא חיבור ענן
const isHttp = typeof window !== "undefined" && window.location.protocol.startsWith("http");

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
    return { ok: true, username: data.username, stats: data.stats || null };
  } catch (e) {
    return { fallback: true };
  }
}

export async function syncAccountToCloud(username, stats) {
  if (!isHttp || !username || !stats) return false;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
