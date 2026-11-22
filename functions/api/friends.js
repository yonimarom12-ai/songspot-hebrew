// Cloudflare Pages Function: מערכת חברים מאובטחת עם בקשות חברות ב-Cloudflare D1
import { extractBearerToken, verifySessionToken } from "./_session.js";

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

const REQUESTS_SQL = `
CREATE TABLE IF NOT EXISTS friend_requests (
  from_lower TEXT NOT NULL,
  to_lower TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (from_lower, to_lower)
);`;

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

const PROMO_CRYSTAL_VALUES = {
  welcome100: 100,
  music2026: 250,
  spotifyvip: 50,
  kingcrown: 100,
  royalgold: 0,
  yonivip: 2500,
  test10k: 10000
};

function computeFairEarnedPoints(row, stats) {
  if (Number.isFinite(Number(stats?.earnedPoints))) {
    return Math.max(0, Math.round(Number(stats.earnedPoints) * 100) / 100);
  }
  const baseTotal = Number.isFinite(Number(stats?.totalPointsEarned))
    ? Number(stats.totalPointsEarned)
    : (Number(row.points) || 0);
  const codes = Array.isArray(stats?.redeemedCodes) ? stats.redeemedCodes : [];
  const promoSum = Number.isFinite(Number(stats?.promoPointsReceived))
    ? Number(stats.promoPointsReceived)
    : codes.reduce((sum, id) => sum + (PROMO_CRYSTAL_VALUES[id] || 0), 0);
  return Math.max(0, Math.round((baseTotal - promoSum) * 100) / 100);
}

function mapPlayerRow(row) {
  let stats = {};
  try { stats = JSON.parse(row.stats_json || "{}"); } catch (e) { }
  const earnedPoints = computeFairEarnedPoints(row, stats);
  return {
    username: row.username,
    usernameLower: row.username_lower,
    friendCode: computeFriendCode(row.username_lower),
    totalWon: row.total_won || 0,
    totalHeard: Number(stats.totalHeard) || 0,
    bestStreak: row.best_streak || 0,
    points: earnedPoints,
    earnedPoints,
    bestTimed: row.best_timed || Number(stats.bestTimedScore) || 0,
    bestMarathon: Number(stats.bestMarathonScore) || 0,
    avatarId: row.avatar_id || stats.equippedAvatar || "default",
    customAvatarData: typeof stats.customAvatarData === "string" ? stats.customAvatarData : "",
    favorites: {
      song: stats.favorites?.song || "",
      album: stats.favorites?.album || "",
      artist: stats.favorites?.artist || "",
      songImg: stats.favorites?.songImg || "",
      albumImg: stats.favorites?.albumImg || "",
      artistImg: stats.favorites?.artistImg || ""
    },
    updatedAt: row.updated_at || ""
  };
}

async function ensureTables(db) {
  await db.prepare(PLAYERS_SQL).run();
  await db.prepare(FRIENDSHIPS_SQL).run();
  await db.prepare(REQUESTS_SQL).run();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false, friends: [], incoming: [], outgoing: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const profileQuery = String(url.searchParams.get("profile") || "").trim();
  const viewerLower = String(url.searchParams.get("viewer") || "").trim().toLowerCase();

  // צפייה בפרופיל ציבורי משותף (מקישור וואטסאפ או סריקת QR)
  if (profileQuery) {
    try {
      await ensureTables(env.DB);
      const targetLower = profileQuery.toLowerCase();
      const cleanedCode = profileQuery.replace(/^#/, "").toUpperCase();

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
        return Response.json({ configured: true, found: false, error: "הפרופיל לא נמצא." }, { status: 404 });
      }

      let relation = "none";
      if (viewerLower) {
        if (viewerLower === found.username_lower) {
          relation = "self";
        } else {
          const [isFriend, isOut, isIn] = await Promise.all([
            env.DB.prepare("SELECT 1 FROM friendships WHERE user_lower = ? AND friend_lower = ?").bind(viewerLower, found.username_lower).first(),
            env.DB.prepare("SELECT 1 FROM friend_requests WHERE from_lower = ? AND to_lower = ?").bind(viewerLower, found.username_lower).first(),
            env.DB.prepare("SELECT 1 FROM friend_requests WHERE from_lower = ? AND to_lower = ?").bind(found.username_lower, viewerLower).first()
          ]);
          if (isFriend) relation = "friend";
          else if (isOut) relation = "outgoing";
          else if (isIn) relation = "incoming";
        }
      }

      return Response.json({
        configured: true,
        found: true,
        profile: mapPlayerRow(found),
        relation
      });
    } catch (err) {
      return Response.json({ configured: false, found: false, error: "שגיאה בטעינת הפרופיל" }, { status: 500 });
    }
  }

  const username = String(url.searchParams.get("username") || "").trim();
  const userLower = username.toLowerCase();
  if (!userLower) {
    return Response.json({ error: "Missing username" }, { status: 400 });
  }

  try {
    await ensureTables(env.DB);

    const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
      env.DB
        .prepare(
          `SELECT p.username, p.username_lower, p.total_won, p.best_streak, p.points, p.best_timed, p.avatar_id, p.stats_json, p.updated_at
           FROM friendships f
           JOIN players p ON p.username_lower = f.friend_lower
           WHERE f.user_lower = ?
           ORDER BY p.total_won DESC, p.best_streak DESC`
        )
        .bind(userLower)
        .all(),
      env.DB
        .prepare(
          `SELECT p.username, p.username_lower, p.total_won, p.best_streak, p.points, p.best_timed, p.avatar_id, p.stats_json, p.updated_at
           FROM friend_requests r
           JOIN players p ON p.username_lower = r.from_lower
           WHERE r.to_lower = ?
           ORDER BY r.created_at DESC`
        )
        .bind(userLower)
        .all(),
      env.DB
        .prepare(
          `SELECT p.username, p.username_lower, p.total_won, p.best_streak, p.points, p.best_timed, p.avatar_id, p.stats_json, p.updated_at
           FROM friend_requests r
           JOIN players p ON p.username_lower = r.to_lower
           WHERE r.from_lower = ?
           ORDER BY r.created_at DESC`
        )
        .bind(userLower)
        .all()
    ]);

    return Response.json({
      configured: true,
      myCode: computeFriendCode(userLower),
      friends: (friendsRes.results || []).map(mapPlayerRow),
      incoming: (incomingRes.results || []).map(mapPlayerRow),
      outgoing: (outgoingRes.results || []).map(mapPlayerRow)
    });
  } catch (err) {
    return Response.json({ configured: false, friends: [], incoming: [], outgoing: [] }, { status: 500 });
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
    await ensureTables(env.DB);

    // אימות Session Token חתום לפעולות שינוי בחברים
    const token = extractBearerToken(request);
    const meRow = await env.DB
      .prepare("SELECT password_hash FROM players WHERE username_lower = ?")
      .bind(userLower)
      .first();
    if (token) {
      const valid = await verifySessionToken(token, userLower, env);
      if (!valid) {
        return Response.json({ error: "פג תוקף ההתחברות — התחבר מחדש בפרופיל." }, { status: 401 });
      }
    } else if (meRow && meRow.password_hash) {
      return Response.json({ error: "נדרשת התחברות מחדש בפרופיל לפעולה זו." }, { status: 401 });
    }

    if (action === "request" || action === "add") {
      const rawTarget = String(body?.target || "").trim();
      if (!rawTarget) {
        return Response.json({ error: "נא להזין ID של חבר או שם משתמש" }, { status: 400 });
      }
      const cleanedCode = rawTarget.replace(/^#/, "").toUpperCase();
      const targetLower = rawTarget.toLowerCase();

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
        return Response.json({ error: "אי אפשר לשלוח בקשה לעצמך 😄" }, { status: 400 });
      }

      // בדיקה אם כבר חברים
      const alreadyFriends = await env.DB
        .prepare("SELECT 1 FROM friendships WHERE user_lower = ? AND friend_lower = ?")
        .bind(userLower, found.username_lower)
        .first();
      if (alreadyFriends) {
        return Response.json({ error: `${found.username} כבר נמצא ברשימת החברים שלך.` }, { status: 409 });
      }

      // אם הצד השני כבר שלח לנו בקשה -> אישור הדדי מיידי!
      const reverseReq = await env.DB
        .prepare("SELECT 1 FROM friend_requests WHERE from_lower = ? AND to_lower = ?")
        .bind(found.username_lower, userLower)
        .first();
      if (reverseReq) {
        await env.DB.prepare("DELETE FROM friend_requests WHERE from_lower = ? AND to_lower = ?").bind(found.username_lower, userLower).run();
        await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_lower, friend_lower) VALUES (?, ?)").bind(userLower, found.username_lower).run();
        await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_lower, friend_lower) VALUES (?, ?)").bind(found.username_lower, userLower).run();
        return Response.json({ ok: true, status: "accepted", friend: mapPlayerRow(found) });
      }

      // בדיקה אם כבר שלחנו בקשה שממתינה לאישור
      const existingReq = await env.DB
        .prepare("SELECT 1 FROM friend_requests WHERE from_lower = ? AND to_lower = ?")
        .bind(userLower, found.username_lower)
        .first();
      if (existingReq) {
        return Response.json({ error: `כבר שלחת בקשת חברות ל-${found.username} (ממתין לאישור).` }, { status: 409 });
      }

      await env.DB
        .prepare("INSERT INTO friend_requests (from_lower, to_lower) VALUES (?, ?)")
        .bind(userLower, found.username_lower)
        .run();

      return Response.json({ ok: true, status: "pending", target: mapPlayerRow(found) });
    }

    if (action === "accept") {
      const fromLower = String(body?.fromLower || "").trim().toLowerCase();
      if (!fromLower) return Response.json({ error: "Missing fromLower" }, { status: 400 });
      await env.DB.prepare("DELETE FROM friend_requests WHERE (from_lower = ? AND to_lower = ?) OR (from_lower = ? AND to_lower = ?)")
        .bind(fromLower, userLower, userLower, fromLower)
        .run();
      await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_lower, friend_lower) VALUES (?, ?)").bind(userLower, fromLower).run();
      await env.DB.prepare("INSERT OR IGNORE INTO friendships (user_lower, friend_lower) VALUES (?, ?)").bind(fromLower, userLower).run();
      return Response.json({ ok: true });
    }

    if (action === "decline") {
      const fromLower = String(body?.fromLower || "").trim().toLowerCase();
      if (!fromLower) return Response.json({ error: "Missing fromLower" }, { status: 400 });
      await env.DB.prepare("DELETE FROM friend_requests WHERE from_lower = ? AND to_lower = ?").bind(fromLower, userLower).run();
      return Response.json({ ok: true });
    }

    if (action === "cancel") {
      const toLower = String(body?.toLower || "").trim().toLowerCase();
      if (!toLower) return Response.json({ error: "Missing toLower" }, { status: 400 });
      await env.DB.prepare("DELETE FROM friend_requests WHERE from_lower = ? AND to_lower = ?").bind(userLower, toLower).run();
      return Response.json({ ok: true });
    }

    if (action === "remove") {
      const targetLower = String(body?.targetLower || "").trim().toLowerCase();
      if (!targetLower) return Response.json({ error: "Missing target" }, { status: 400 });
      await env.DB
        .prepare("DELETE FROM friendships WHERE (user_lower = ? AND friend_lower = ?) OR (user_lower = ? AND friend_lower = ?)")
        .bind(userLower, targetLower, targetLower, userLower)
        .run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: "שגיאת שרת בניהול חברים" }, { status: 500 });
  }
}
