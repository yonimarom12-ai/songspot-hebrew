import { loadAccountsMap } from "./storage.js?v=20261120d";

// הגדרות ענן (Supabase) — כדי להפעיל שמירה בענן ודירוג עולמי אמיתי, הדבק כאן את ה-URL וה-Anon Key מהפרויקט החינמי שלך ב-Supabase
export const CLOUD_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};

export function isCloudConfigured() {
  return Boolean(CLOUD_CONFIG.supabaseUrl && CLOUD_CONFIG.supabaseAnonKey);
}

function getHeaders(extra = {}) {
  return {
    apikey: CLOUD_CONFIG.supabaseAnonKey,
    Authorization: `Bearer ${CLOUD_CONFIG.supabaseAnonKey}`,
    "Content-Type": "application/json",
    ...extra
  };
}

export async function syncAccountToCloud(username, stats) {
  if (!isCloudConfigured() || !username || !stats) return false;
  try {
    const payload = {
      username,
      total_won: stats.totalWon || 0,
      best_streak: stats.bestStreak || 0,
      points: stats.points || 0,
      best_timed: stats.bestTimedScore || 0,
      avatar_id: stats.equippedAvatar || "default",
      stats_json: {
        ...stats,
        // לא מעלים Base64 כבד בטבלת דירוג
        customAvatarData: "",
        customBackgroundData: ""
      },
      updated_at: new Date().toISOString()
    };
    const res = await fetch(`${CLOUD_CONFIG.supabaseUrl}/rest/v1/players?on_conflict=username`, {
      method: "POST",
      headers: getHeaders({ Prefer: "resolution=merge-duplicates" }),
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

export async function loadAccountFromCloud(username) {
  if (!isCloudConfigured() || !username) return null;
  try {
    const url = `${CLOUD_CONFIG.supabaseUrl}/rest/v1/players?username=eq.${encodeURIComponent(username)}&select=stats_json&limit=1`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.stats_json || null;
  } catch (e) {
    return null;
  }
}

export async function fetchGlobalLeaderboard(limit = 25) {
  if (isCloudConfigured()) {
    try {
      const url = `${CLOUD_CONFIG.supabaseUrl}/rest/v1/players?select=username,total_won,best_streak,points,best_timed&order=total_won.desc,best_streak.desc,points.desc&limit=${limit}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const rows = await res.json();
        return {
          source: "cloud",
          rows: rows.map(r => ({
            username: r.username,
            totalWon: r.total_won || 0,
            bestStreak: r.best_streak || 0,
            points: r.points || 0,
            bestTimed: r.best_timed || 0
          }))
        };
      }
    } catch (e) { }
  }

  // גיבוי מקומי חכם: מציג את כל החשבונות הקיימים במכשיר מדורגים לפי ביצועים
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
