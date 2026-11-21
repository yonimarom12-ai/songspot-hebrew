// Cloudflare Pages Function: דירוג עולמי חי מתוך Cloudflare D1
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
    return Response.json({ configured: false, rows: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.round(rawLimit))) : 25;

  try {
    await env.DB.prepare(TABLE_SQL).run();
    const { results } = await env.DB
      .prepare(
        `SELECT username, total_won, best_streak, points, best_timed, avatar_id, stats_json
         FROM players
         ORDER BY total_won DESC, best_streak DESC, points DESC
         LIMIT ?`
      )
      .bind(limit)
      .all();

    return Response.json(
      {
        configured: true,
        rows: (results || []).map(r => {
          let stats = {};
          try { stats = JSON.parse(r.stats_json || "{}"); } catch (e) { }
          return {
            username: r.username,
            totalWon: r.total_won || 0,
            bestStreak: r.best_streak || 0,
            points: r.points || 0,
            bestTimed: r.best_timed || Number(stats.bestTimedScore) || 0,
            bestMarathon: Number(stats.bestMarathonScore) || 0,
            avatarId: r.avatar_id || "default"
          };
        })
      },
      {
        headers: { "Cache-Control": "public, max-age=15" }
      }
    );
  } catch (err) {
    return Response.json({ configured: false, rows: [] }, { status: 500 });
  }
}
