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

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false }, { status: 503 });
  }

  const url = new URL(request.url);
  const username = String(url.searchParams.get("username") || "").trim();
  if (!username) {
    return Response.json({ error: "Missing username" }, { status: 400 });
  }
  const usernameLower = username.toLowerCase();
  const token = extractBearerToken(request);

  try {
    await env.DB.prepare(TABLE_SQL).run();
    const row = await env.DB
      .prepare("SELECT username, password_hash, total_won, best_streak, points, best_timed, avatar_id, stats_json FROM players WHERE username_lower = ?")
      .bind(usernameLower)
      .first();

    if (!row) {
      return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    if (row.password_hash) {
      if (!token) {
        return Response.json({ error: "Authentication required" }, { status: 401 });
      }
      const valid = await verifySessionToken(token, usernameLower, env);
      if (!valid) {
        return Response.json({ error: "Invalid or expired session token" }, { status: 401 });
      }
    }

    let parsedStats = {};
    try { parsedStats = JSON.parse(row.stats_json || "{}"); } catch (e) { }
    return Response.json(
      { ok: true, username: row.username, stats: parsedStats },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ error: "Fetch failed" }, { status: 500 });
  }
}

function mergeMonotonicStats(cloud, incoming) {
  if (!cloud || typeof cloud !== "object") return incoming;
  const cloudWon = Number(cloud.totalWon) || 0;
  const incWon = Number(incoming.totalWon) || 0;
  const isIncomingStale = incWon < cloudWon;

  // מונע מטאב ישן בדפדפן (למשל Safari עם 3 ניחושים) לדרוס התקדמות חדשה יותר מהאפליקציה (100+ ניחושים)
  const base = isIncomingStale ? { ...incoming, ...cloud } : { ...cloud, ...incoming };

  const unionArr = (a, b) => Array.from(new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]));
  const mergeWonSongs = (primary, secondary) => {
    const map = new Map();
    for (const s of [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]) {
      if (s && s.trackId && !map.has(String(s.trackId))) map.set(String(s.trackId), s);
    }
    return Array.from(map.values()).slice(0, 60);
  };

  return {
    ...base,
    totalWon: Math.max(cloudWon, incWon),
    totalHeard: Math.max(Number(cloud.totalHeard) || 0, Number(incoming.totalHeard) || 0),
    bestStreak: Math.max(Number(cloud.bestStreak) || 0, Number(incoming.bestStreak) || 0),
    bestTimedScore: Math.max(Number(cloud.bestTimedScore) || 0, Number(incoming.bestTimedScore) || 0),
    bestMarathonScore: Math.max(Number(cloud.bestMarathonScore) || 0, Number(incoming.bestMarathonScore) || 0),
    bestReverseStreak: Math.max(Number(cloud.bestReverseStreak) || 0, Number(incoming.bestReverseStreak) || 0),
    bestTimelineScore: Math.max(Number(cloud.bestTimelineScore) || 0, Number(incoming.bestTimelineScore) || 0),
    totalPointsEarned: Math.max(Number(cloud.totalPointsEarned) || 0, Number(incoming.totalPointsEarned) || 0),
    earnedPoints: Math.max(Number(cloud.earnedPoints) || 0, Number(incoming.earnedPoints) || 0),
    promoPointsReceived: Math.max(Number(cloud.promoPointsReceived) || 0, Number(incoming.promoPointsReceived) || 0),
    dailyLoginStreak: Math.max(Number(cloud.dailyLoginStreak) || 0, Number(incoming.dailyLoginStreak) || 0),
    ownedItems: unionArr(cloud.ownedItems, incoming.ownedItems),
    redeemedCodes: unionArr(cloud.redeemedCodes, incoming.redeemedCodes),
    wonSongs: isIncomingStale
      ? mergeWonSongs(cloud.wonSongs, incoming.wonSongs)
      : mergeWonSongs(incoming.wonSongs, cloud.wonSongs),
    customAvatarData: incoming.customAvatarData || cloud.customAvatarData || "",
    customBackgroundData: incoming.customBackgroundData || cloud.customBackgroundData || ""
  };
}

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
      .prepare("SELECT password_hash, stats_json FROM players WHERE username_lower = ?")
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

    let existingStats = null;
    if (existing?.stats_json) {
      try { existingStats = JSON.parse(existing.stats_json); } catch (e) { }
    }
    const mergedStats = mergeMonotonicStats(existingStats, compactStats);

    const safeWon = Math.min(50000, Math.max(0, Math.round(Number(mergedStats.totalWon) || 0)));
    const safeStreak = Math.min(5000, Math.max(0, Math.round(Number(mergedStats.bestStreak) || 0)));
    const safePoints = Math.min(1000000, Math.max(0, Number(mergedStats.points) || 0));
    const safeTimed = Math.min(500, Math.max(0, Math.round(Number(mergedStats.bestTimedScore) || 0)));

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
        String(mergedStats.equippedAvatar || "default"),
        JSON.stringify(mergedStats),
        new Date().toISOString()
      )
      .run();

    return Response.json({ ok: true, stats: mergedStats });
  } catch (err) {
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
