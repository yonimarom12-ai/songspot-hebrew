// Cloudflare Pages Function: הרשמה והתחברות מאובטחת מול Cloudflare D1 + חתימת Session Token
import { createSessionToken } from "./_session.js";

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS players (
  username TEXT PRIMARY KEY,
  username_lower TEXT UNIQUE NOT NULL,
  email TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  total_won INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  points REAL DEFAULT 0,
  best_timed INTEGER DEFAULT 0,
  avatar_id TEXT DEFAULT 'default',
  stats_json TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);`;

async function hashPassword(usernameLower, password) {
  const enc = new TextEncoder();
  const data = enc.encode(`guess_song_v1:${usernameLower}:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false, error: "D1 database not bound" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body?.action;
  const username = String(body?.username || "").trim();
  const usernameLower = username.toLowerCase();
  const password = String(body?.password || "");
  const email = String(body?.email || "").trim().toLowerCase();

  if (!username || password.length < 4) {
    return Response.json({ error: "שם משתמש או סיסמא לא תקינים" }, { status: 400 });
  }

  try {
    await env.DB.prepare(TABLE_SQL).run();
    const passHash = await hashPassword(usernameLower, password);

    if (action === "register") {
      const existing = await env.DB
        .prepare("SELECT username FROM players WHERE username_lower = ?")
        .bind(usernameLower)
        .first();

      if (existing) {
        return Response.json({ error: "שם המשתמש כבר תפוס, אנא בחר שם אחר." }, { status: 409 });
      }

      const rawStats = body?.stats && typeof body.stats === "object" ? body.stats : {};
      const sanitizeImg = (v, maxLen) => (typeof v === "string" && v.startsWith("data:image/") && v.length <= maxLen ? v : "");
      const stats = {
        ...rawStats,
        customAvatarData: sanitizeImg(rawStats.customAvatarData, 60000),
        customBackgroundData: sanitizeImg(rawStats.customBackgroundData, 120000)
      };
      await env.DB
        .prepare(
          `INSERT INTO players (username, username_lower, email, password_hash, total_won, best_streak, points, best_timed, avatar_id, stats_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          username,
          usernameLower,
          email,
          passHash,
          Number(stats.totalWon) || 0,
          Number(stats.bestStreak) || 0,
          Number(stats.points) || 0,
          Number(stats.bestTimedScore) || 0,
          String(stats.equippedAvatar || "default"),
          JSON.stringify(stats),
          new Date().toISOString()
        )
        .run();

      const token = await createSessionToken(usernameLower, env);
      return Response.json({ ok: true, username, stats, token });
    }

    if (action === "login") {
      const row = await env.DB
        .prepare("SELECT username, password_hash, stats_json FROM players WHERE username_lower = ?")
        .bind(usernameLower)
        .first();

      if (!row || row.password_hash !== passHash) {
        return Response.json({ error: "שם משתמש או סיסמא שגויים." }, { status: 401 });
      }

      let parsedStats = {};
      try { parsedStats = JSON.parse(row.stats_json || "{}"); } catch (e) { }
      const token = await createSessionToken(usernameLower, env);
      return Response.json({ ok: true, username: row.username, stats: parsedStats, token });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: "שגיאת שרת במסד הנתונים" }, { status: 500 });
  }
}
