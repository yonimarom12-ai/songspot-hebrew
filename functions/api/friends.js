// Cloudflare Pages Function: מערכת חברים, Player ID ופרופיל חבר חי מתוך Cloudflare D1
const PLAYERS_SQL = `
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

const FRIENDSHIPS_SQL = `
CREATE TABLE IF NOT EXISTS friendships (
  user_lower TEXT NOT NULL,
  friend_lower TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_lower, friend_lower)
);`;

// קוד שחקן דטרמיניסטי ויציב בן 6 תווים (למשל A7F392) לכל שם משתמש
function computeFriendCode(usernameLower) {
  const str = `ss_id_v1:${String(usernameLower || "").trim().toLowerCase()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  let mixed = (h1 ^ (h2 >>> 3)) >>> 0;
  for (let i = 0; i < 6; i++) {
    code += alphabet[mixed % alphabet.length];
    mixed = Math.imul(mixed ^ (h2 + i * 31), 0x27d4eb2d) >>> 0;
  }
  return code;
}

function mapPlayerRow(row) {
  let stats = {};
  try { stats = JSON.parse(row.stats_json || "{}"); } catch (e) { }
  return {
    username: row.username,
    usernameLower: row.username_lower,
    friendCode: computeFriendCode(row.username_lower),
    totalWon: row.total_won || 0,
    totalHeard: Number(stats.totalHeard) || 0,
    bestStreak: row.best_streak || 0,
    points: row.points || 0,
    bestTimed: row.best_timed || Number(stats.bestTimedScore) || 0,
    bestMarathon: Number(stats.bestMarathonScore) || 0,
    avatarId: row.avatar_id || stats.equippedAvatar || "default",
    favorites: {
      song: stats.favorites?.song || "",
      album: stats.favorites?.album || "",
      artist: stats.favorites?.artist || ""
    },
    updatedAt: row.updated_at || ""
  };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false, friends: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();
  const userLower = username.toLowerCase();
  if (!userLower) {
    return Response.json({ error: "Missing username" }, { status: 400 });
  }

  try {
    await env.DB.prepare(PLAYERS_SQL).run();
    await env.DB.prepare(FRIENDSHIPS_SQL).run();

    const { results } = await env.DB
      .prepare(
        `SELECT p.username, p.username_lower, p.total_won, p.best_streak, p.points, p.best_timed, p.avatar_id, p.stats_json, p.updated_at
         FROM friendships f
         JOIN players p ON p.username_lower = f.friend_lower
         WHERE f.user_lower = ?
         ORDER BY p.total_won DESC, p.best_streak DESC`
      )
      .bind(userLower)
      .all();

    return Response.json({
      configured: true,
      myCode: computeFriendCode(userLower),
      friends: (results || []).map(mapPlayerRow)
    });
  } catch (err) {
    return Response.json({ configured: false, friends: [] }, { status: 500 });
  }
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
  const userLower = username.toLowerCase();

  if (!userLower) {
    return Response.json({ error: "יש להתחבר לחשבון קודם" }, { status: 400 });
  }

  try {
    await env.DB.prepare(PLAYERS_SQL).run();
    await env.DB.prepare(FRIENDSHIPS_SQL).run();

    if (action === "add") {
      const rawTarget = String(body?.target || "").trim();
      if (!rawTarget) {
        return Response.json({ error: "נא להזין ID של חבר או שם משתמש" }, { status: 400 });
      }
      const cleanedCode = rawTarget.replace(/^#/, "").toUpperCase();
      const targetLower = rawTarget.toLowerCase();

      // חיפוש לפי שם משתמש ישיר או לפי קוד ID בן 6 תווים
      let found = await env.DB
        .prepare("SELECT username, username_lower, total_won, best_streak, points, best_timed, avatar_id, stats_json, updated_at FROM players WHERE username_lower = ?")
        .bind(targetLower)
        .first();

      if (!found && cleanedCode.length === 6) {
        const { results: allPlayers } = await env.DB
          .prepare("SELECT username, username_lower, total_won, best_streak, points, best_timed, avatar_id, stats_json, updated_at FROM players LIMIT 500")
          .all();
        found = (allPlayers || []).find(p => computeFriendCode(p.username_lower) === cleanedCode) || null;
      }

      if (!found) {
        return Response.json({ error: "לא נמצא שחקן עם ה-ID או השם הזה." }, { status: 404 });
      }
      if (found.username_lower === userLower) {
        return Response.json({ error: "אי אפשר להוסיף את עצמך כחבר 😄" }, { status: 400 });
      }

      await env.DB
        .prepare("INSERT OR IGNORE INTO friendships (user_lower, friend_lower) VALUES (?, ?)")
        .bind(userLower, found.username_lower)
        .run();

      return Response.json({ ok: true, friend: mapPlayerRow(found) });
    }

    if (action === "remove") {
      const targetLower = String(body?.targetLower || "").trim().toLowerCase();
      if (!targetLower) return Response.json({ error: "Missing target" }, { status: 400 });
      await env.DB
        .prepare("DELETE FROM friendships WHERE user_lower = ? AND friend_lower = ?")
        .bind(userLower, targetLower)
        .run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: "שגיאת שרת בניהול חברים" }, { status: 500 });
  }
}
