// Cloudflare Pages Function: חיפוש מהיר ב-Deezer (שירים, אלבומים ואמנים עם תמונות אמיתיות · אותו דומיין · 0 בעיות CORS באייפון)
const ALLOWED_TYPES = new Set(["track", "album", "artist"]);

export async function onRequestGet(context) {
  const { request } = context;
  const incomingUrl = new URL(request.url);
  const q = (incomingUrl.searchParams.get("q") || "").trim();
  const rawType = (incomingUrl.searchParams.get("type") || "track").trim();
  const type = ALLOWED_TYPES.has(rawType) ? rawType : "track";
  const rawLimit = Number(incomingUrl.searchParams.get("limit") || 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(35, Math.max(1, Math.round(rawLimit))) : 25;

  if (!q || q.length > 120) {
    return Response.json({ data: [] }, { status: 400 });
  }

  const upstream = `https://api.deezer.com/search/${type}?q=${encodeURIComponent(q)}&limit=${limit}`;

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    if (!res.ok) {
      return Response.json({ data: [] }, { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=600, s-maxage=1800");
    return new Response(res.body, { status: 200, headers });
  } catch (e) {
    return Response.json({ data: [] }, { status: 502 });
  }
}
