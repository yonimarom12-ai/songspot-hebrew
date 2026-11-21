// Cloudflare Pages Function: Proxy פרטי ומהיר ל-iTunes API (אותו דומיין -> 0 בעיות CORS ב-iOS Safari)
const ALLOWED_ENTITIES = new Set(["song", "album", "musicArtist"]);

export async function onRequestGet(context) {
  const { request } = context;
  const incomingUrl = new URL(request.url);
  const term = (incomingUrl.searchParams.get("term") || "").trim();

  if (!term || term.length > 120) {
    return Response.json({ error: "Missing or invalid term" }, { status: 400 });
  }

  const rawEntity = incomingUrl.searchParams.get("entity") || "song";
  const entity = ALLOWED_ENTITIES.has(rawEntity) ? rawEntity : "song";
  const rawLimit = Number(incomingUrl.searchParams.get("limit") || 25);
  const limit = Number.isFinite(rawLimit) ? Math.min(60, Math.max(1, Math.round(rawLimit))) : 25;
  const country = /^[A-Z]{2}$/i.test(incomingUrl.searchParams.get("country") || "")
    ? incomingUrl.searchParams.get("country").toUpperCase()
    : "IL";

  const upstreamUrl = new URL("https://itunes.apple.com/search");
  upstreamUrl.searchParams.set("country", country);
  upstreamUrl.searchParams.set("media", "music");
  upstreamUrl.searchParams.set("entity", entity);
  upstreamUrl.searchParams.set("limit", String(limit));
  upstreamUrl.searchParams.set("term", term);

  try {
    const upstreamRes = await fetch(upstreamUrl.toString(), {
      headers: { Accept: "application/json" },
      cf: {
        cacheTtl: 1800,
        cacheEverything: true
      }
    });

    if (!upstreamRes.ok) {
      return Response.json(
        { error: "Upstream iTunes error", status: upstreamRes.status },
        { status: 502 }
      );
    }

    // מעביר את גוף התשובה כ-Stream ישיר (ללא טעינה כפולה לזיכרון)
    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=600, s-maxage=1800");
    return new Response(upstreamRes.body, {
      status: 200,
      headers
    });
  } catch (err) {
    return Response.json({ error: "Proxy fetch failed" }, { status: 502 });
  }
}
