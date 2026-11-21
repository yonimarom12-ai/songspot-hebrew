// Cloudflare Pages Function: סנכרון סטטיסטיקות, קריסטלים, מועדפים וערכות נושא בענן (D1)
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

  const compactStats = {
    ...stats,
    // לא שומרים Base64 כבד בטבלה הראשית כדי לשמור על מהירות סנכרון
    customAvatarData: "",
    customBackgroundData: ""
  };

  try {
    await env.DB
      .prepare(
        `UPDATE players
         SET total_won = ?, best_streak = ?, points = ?, best_timed = ?, avatar_id = ?, stats_json = ?, updated_at = ?
         WHERE username_lower = ?`
      )
      .bind(
        Number(stats.totalWon) || 0,
        Number(stats.bestStreak) || 0,
        Number(stats.points) || 0,
        Number(stats.bestTimedScore) || 0,
        String(stats.equippedAvatar || "default"),
        JSON.stringify(compactStats),
        new Date().toISOString(),
        username.toLowerCase()
      )
      .run();

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: "Sync failed" }, { status: 500 });
  }
}
