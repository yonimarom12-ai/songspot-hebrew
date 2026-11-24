// Cloudflare Pages Function: שיתוף ואתגור חברים בפלייליסטים אישיים מול Cloudflare D1
const PLAYLISTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS shared_playlists (
  id TEXT PRIMARY KEY,
  owner_username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  songs_json TEXT NOT NULL DEFAULT '[]',
  owner_best_hits INTEGER DEFAULT 0,
  owner_best_avg_sec REAL DEFAULT NULL,
  plays_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);`;

function generateShortId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "pl_";
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function sanitizeSongs(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const clean = [];
  for (const s of raw) {
    if (!s || !s.title || !s.previewUrl) continue;
    const key = String(s.trackId || `${s.title}_${s.artist || ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      trackId: s.trackId || key,
      title: String(s.title).slice(0, 120),
      artist: String(s.artist || "").slice(0, 120),
      artwork: typeof s.artwork === "string" && s.artwork.startsWith("http") ? s.artwork.slice(0, 350) : "",
      previewUrl: typeof s.previewUrl === "string" && s.previewUrl.startsWith("http") ? s.previewUrl.slice(0, 400) : ""
    });
    if (clean.length >= 50) break;
  }
  return clean;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ ok: false, error: "D1 database not bound" }, { status: 503 });
  }
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id || id.length > 32) {
    return Response.json({ ok: false, error: "Missing playlist id" }, { status: 400 });
  }

  try {
    await env.DB.prepare(PLAYLISTS_TABLE_SQL).run();
    const row = await env.DB
      .prepare("SELECT id, owner_username, name, songs_json, owner_best_hits, owner_best_avg_sec, plays_count FROM shared_playlists WHERE id = ?")
      .bind(id)
      .first();

    if (!row) {
      return Response.json({ ok: false, error: "הפלייליסט לא נמצא" }, { status: 404 });
    }

    let songs = [];
    try { songs = JSON.parse(row.songs_json || "[]"); } catch (e) { }

    return Response.json(
      {
        ok: true,
        playlist: {
          id: row.id,
          ownerName: row.owner_username || "שחקן",
          name: row.name,
          songs,
          ownerBestHits: Number(row.owner_best_hits) || 0,
          ownerBestAvgSec: Number.isFinite(Number(row.owner_best_avg_sec)) ? Number(row.owner_best_avg_sec) : null,
          playsCount: Number(row.plays_count) || 0
        }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json({ ok: false, error: "שגיאה בטעינת הפלייליסט" }, { status: 500 });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ ok: false, error: "D1 database not bound" }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body?.name || "").trim().slice(0, 48);
  const ownerName = String(body?.ownerName || "שחקן").trim().slice(0, 32);
  const songs = sanitizeSongs(body?.songs);
  const ownerBestHits = Math.max(0, Math.min(50, Math.round(Number(body?.ownerBestHits) || 0)));
  const rawAvg = Number(body?.ownerBestAvgSec);
  const ownerBestAvgSec = Number.isFinite(rawAvg) && rawAvg > 0 ? Math.round(rawAvg * 10) / 10 : null;

  if (!name || songs.length < 5) {
    return Response.json({ ok: false, error: "נדרש שם ולפחות 5 שירים כדי לשתף פלייליסט" }, { status: 400 });
  }

  const requestedId = typeof body?.shareId === "string" && /^pl_[a-z0-9]{6,16}$/i.test(body.shareId.trim())
    ? body.shareId.trim()
    : "";
  const id = requestedId || generateShortId();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(PLAYLISTS_TABLE_SQL).run();
    await env.DB
      .prepare(
        `INSERT INTO shared_playlists (id, owner_username, name, songs_json, owner_best_hits, owner_best_avg_sec, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           owner_username = excluded.owner_username,
           name = excluded.name,
           songs_json = excluded.songs_json,
           owner_best_hits = excluded.owner_best_hits,
           owner_best_avg_sec = excluded.owner_best_avg_sec,
           updated_at = excluded.updated_at`
      )
      .bind(id, ownerName, name, JSON.stringify(songs), ownerBestHits, ownerBestAvgSec, now, now)
      .run();

    const origin = new URL(request.url).origin;
    return Response.json({
      ok: true,
      id,
      shareUrl: `${origin}/?playlist=${encodeURIComponent(id)}`
    });
  } catch (err) {
    return Response.json({ ok: false, error: "שגיאה בשמירת הפלייליסט לשיתוף" }, { status: 500 });
  }
}
