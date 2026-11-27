/**
 * Dual-layer cache:
 * 1. Cloudflare Edge Cache (caches.default) — gratis, per-PoP
 * 2. KV namespace (opsional) — global, lebih tahan, butuh binding AGC2_CACHE
 *
 * Pola: stale-while-revalidate
 * - max-age = periode "fresh"
 * - swr     = boleh serve stale sambil refresh di background
 */

function cacheControl(maxAge, swr = 0) {
  if (swr > 0) {
    return `public, max-age=${maxAge}, stale-while-revalidate=${swr}`;
  }
  return `public, max-age=${maxAge}`;
}

export function edgeHeaders(maxAge, swr, origin = "*") {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": cacheControl(maxAge, swr),
    "Access-Control-Allow-Origin": origin,
    "X-Content-Type-Options": "nosniff",
    "X-DNS-Prefetch-Control": "on",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "CDN-Cache-Control": cacheControl(maxAge, swr),
    "Vary": "Accept-Encoding",
  };
}

/** Light HTML minify — strip comments & excess whitespace between tags */
export function minifyHtml(html) {
  if (!html || typeof html !== "string") return html;
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
    .replace(/>\s{2,}</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Normalisasi URL agar cache key stabil (hilangkan trailing slash, sort query) */
export function stableCacheUrl(url) {
  const u = new URL(url);
  // hapus trailing slash kecuali root
  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }
  // sort query params
  const params = [...u.searchParams.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  u.search = "";
  for (const [k, v] of params) {
    if (v !== "") u.searchParams.append(k, v);
  }
  return u.toString();
}

export function makeCacheKey(requestUrl) {
  return new Request(stableCacheUrl(requestUrl), { method: "GET" });
}

/**
 * Baca dari Edge Cache.
 * @returns {Response|null}
 */
export async function edgeGet(cache, cacheKey) {
  try {
    return (await cache.match(cacheKey)) || null;
  } catch {
    return null;
  }
}

/**
 * Simpan ke Edge Cache (fire-and-forget via waitUntil di caller).
 */
export async function edgePut(cache, cacheKey, response, maxAge, swr, origin) {
  try {
    const headers = edgeHeaders(maxAge, swr, origin);
    // salin body
    const body = await response.clone().arrayBuffer();
    const toStore = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    await cache.put(cacheKey, toStore);
  } catch {
    // ignore cache write errors
  }
}

/** KV helpers — binding name: AGC2_CACHE */
export async function kvGet(env, key) {
  const kv = env.AGC2_CACHE;
  if (!kv) return null;
  try {
    const raw = await kv.get(key, { type: "json" });
    return raw || null;
  } catch {
    return null;
  }
}

export async function kvPut(env, key, value, ttlSeconds) {
  const kv = env.AGC2_CACHE;
  if (!kv) return;
  try {
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: Math.max(60, ttlSeconds || 3600),
    });
  } catch {
    // ignore
  }
}

/** Key helpers */
export function kvKeySearch(query, page) {
  const q = String(query || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  return `search:v1:${q}:p${page}`;
}

export function kvKeyVideo(id) {
  return `video:v1:${String(id || "").trim()}`;
}

export function kvKeyRelated(id) {
  return `related:v1:${String(id || "").trim()}`;
}

export function kvKeyList(page) {
  return `list:v1:p${page}`;
}
