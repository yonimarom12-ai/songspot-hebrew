// Cloudflare Pages Function: סנכרון מאובטח של סטטיסטיקות, קריסטלים, מועדפים וערכות נושא בענן (D1)
import { extractBearerToken, verifySessionToken } from "./_session.js";

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS players (
  username TEXT PRIMARY KEY,
  username_lower TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  total_won INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  points REAL DEFAULT 0,
  best_timed INTEGER DEFAULT 0,
  avatar_id TEXT DEFAULT 'default',
  stats_json TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);`;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = String(body?.username || "").trim();
  const stats = body?.stats;
  if (!username || !stats || typeof stats !== "object") {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const sanitizeImageData = (val, maxLen) => {
    if (typeof val !== "string") return "";
    if (!val.startsWith("data:image/")) return "";
    return val.length <= maxLen ? val : "";
  };

  const compactStats = {
    ...stats,
    customAvatarData: sanitizeImageData(stats.customAvatarData, 60000),
    customBackgroundData: sanitizeImageData(stats.customBackgroundData, 120000)
  };

  const usernameLower = username.toLowerCase();
  const token = extractBearerToken(request);

  try {
    await env.DB.prepare(TABLE_SQL).run();

    // אימות Session Token חתום עבור משתמשים רשומים (מונע זיוף ניקוד/קריסטלים ע"י צד שלישי)
    const existing = await env.DB
      .prepare("SELECT password_hash FROM players WHERE username_lower = ?")
      .bind(usernameLower)
      .first();

    if (token) {
      const valid = await verifySessionToken(token, usernameLower, env);
      if (!valid) {
        return Response.json({ error: "Invalid or expired session token" }, { status: 401 });
      }
    } else if (existing && existing.password_hash) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const safeWon = Math.min(50000, Math.max(0, Math.round(Number(stats.totalWon) || 0)));
    const safeStreak = Math.min(5000, Math.max(0, Math.round(Number(stats.bestStreak) || 0)));
    const safePoints = Math.min(1000000, Math.max(0, Number(stats.points) || 0));
    const safeTimed = Math.min(500, Math.max(0, Math.round(Number(stats.bestTimedScore) || 0)));

    await env.DB
      .prepare(
        `INSERT INTO players (username, username_lower, total_won, best_streak, points, best_timed, avatar_id, stats_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(username_lower) DO UPDATE SET
           total_won = excluded.total_won,
           best_streak = excluded.best_streak,
           points = excluded.points,
           best_timed = excluded.best_timed,
           avatar_id = excluded.avatar_id,
           stats_json = excluded.stats_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        username,
        usernameLower,
        safeWon,
        safeStreak,
        safePoints,
        safeTimed,
        String(stats.equippedAvatar || "default"),
        JSON.stringify(compactStats),
        new Date().toISOString()
      )
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
