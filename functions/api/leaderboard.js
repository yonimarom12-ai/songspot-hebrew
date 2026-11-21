// Cloudflare Pages Function: דירוג עולמי חי מתוך Cloudflare D1
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.DB) {
    return Response.json({ configured: false, rows: [] }, { status: 503 });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.round(rawLimit))) : 25;

  try {
    const { results } = await env.DB
      .prepare(
        `SELECT username, total_won, best_streak, points, best_timed, avatar_id
         FROM players
         ORDER BY total_won DESC, best_streak DESC, points DESC
         LIMIT ?`
      )
      .bind(limit)
      .all();

    return Response.json(
      {
        configured: true,
        rows: (results || []).map(r => ({
          username: r.username,
          totalWon: r.total_won || 0,
          bestStreak: r.best_streak || 0,
          points: r.points || 0,
          bestTimed: r.best_timed || 0,
          avatarId: r.avatar_id || "default"
        }))
      },
      {
        headers: { "Cache-Control": "public, max-age=15" }
      }
    );
  } catch (err) {
    return Response.json({ configured: false, rows: [] }, { status: 500 });
  }
}
