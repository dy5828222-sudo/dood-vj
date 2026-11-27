import { getConfig } from "./src/config.js";
import { AGC } from "./src/agc.js";
import {
  slugify,
  searchPermalink,
  downloadPermalink,
  categoryPermalink,
  seoReplace,
  badwordRedirect,
  gibberishCheck,
  dmcaBlocked,
  getVideoCategory,
  getPaging,
  enrichVideo,
  proxyImage,
  IMG_OG,
  IMG_COVER,
} from "./src/helpers.js";
import {
  edgeHeaders,
  minifyHtml,
  makeCacheKey,
  edgeGet,
  edgePut,
  kvGet,
  kvPut,
  kvKeySearch,
  kvKeyVideo,
  kvKeyRelated,
  kvKeyList,
} from "./src/cache.js";
import {
  escapeHtml,
  layout,
  videoCard,
  renderVideoGrid,
  renderPagination,
  renderCategories,
  pageHead,
  emptyState,
  catalogSection,
  detailSection,
} from "./src/html.js";
import { APP_CSS, APP_JS, CSS_HASH, JS_HASH } from "./src/assets.js";

function buildCorsHeaders(allowedOrigin = "*", contentType = "text/html; charset=utf-8") {
  return {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "X-Content-Type-Options": "nosniff",
  };
}

function htmlResponse(html, status = 200, maxAge = 0, swr = 0, allowedOrigin = "*") {
  const headers =
    status === 200 && maxAge > 0
      ? edgeHeaders(maxAge, swr, allowedOrigin)
      : {
          ...buildCorsHeaders(allowedOrigin),
          "Cache-Control": "no-store",
        };
  const body = status === 200 ? minifyHtml(html) : html;
  return new Response(body, { status, headers });
}

function jsonResponse(payload, status = 200, maxAge = 0, allowedOrigin = "*") {
  const headers = buildCorsHeaders(allowedOrigin, "application/json; charset=utf-8");
  if (maxAge > 0 && status === 200) {
    headers["Cache-Control"] = `public, max-age=${maxAge}`;
  } else {
    headers["Cache-Control"] = "no-store";
  }
  return new Response(JSON.stringify(payload, null, 2), { status, headers });
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

function isAuthorized(request, expectedKey) {
  if (!expectedKey) return true;
  const headerKey = request.headers.get("X-API-Key") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const bearerKey = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (headerKey && timingSafeEqual(headerKey, expectedKey)) return true;
  if (bearerKey && timingSafeEqual(bearerKey, expectedKey)) return true;
  return false;
}

/**
 * Base URL untuk canonical / permalink.
 * Prioritas:
 * 1) env SITE_URL / BASE_URL (paling stabil di prod & Codespaces)
 * 2) X-Forwarded-Host + X-Forwarded-Proto (proxy / tunnel / Codespaces)
 * 3) Host header
 * 4) request URL (fallback localhost)
 */
function resolveBase(request, url, cfg = {}) {
  const configured = String(cfg.site_url || cfg.base_url || "").trim().replace(/\/+$/, "");
  if (configured) {
    try {
      const u = new URL(configured);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore invalid */
    }
  }

  const xfHostRaw =
    request.headers.get("X-Forwarded-Host") ||
    request.headers.get("X-Original-Host") ||
    request.headers.get("X-Forwarded-Server") ||
    "";
  const xfHost = xfHostRaw.split(",")[0].trim();

  const hostHeader = (request.headers.get("Host") || "").split(",")[0].trim();
  const host = xfHost || hostHeader || url.host;

  let xfProto = (
    request.headers.get("X-Forwarded-Proto") ||
    request.headers.get("X-Forwarded-Scheme") ||
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();

  // Codespaces / GitHub.dev / Cloudflare tunnel → HTTPS publik
  if (
    !xfProto &&
    host &&
    (/\.github\.dev$/i.test(host) ||
      /\.app\.github\.dev$/i.test(host) ||
      /\.trycloudflare\.com$/i.test(host) ||
      /\.workers\.dev$/i.test(host) ||
      /\.pages\.dev$/i.test(host))
  ) {
    xfProto = "https";
  }

  const proto = xfProto || url.protocol.replace(":", "") || "http";
  if (!host) return `${url.protocol}//${url.host}`;
  return `${proto}://${host}`;
}

/** —— Route validation helpers —— */
const MAX_PAGE = 500;
const MAX_PATH_LEN = 512;
const MAX_QUERY_LEN = 120;
const MAX_VIDEO_ID_LEN = 64;
// ID video: alphanumeric + underscore/dash, min 3
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{3,64}$/;
// Path aman: huruf, angka, slash, dash, underscore, titik (untuk static)
const SAFE_PATH_RE = /^\/[a-zA-Z0-9/_\-.%~]*$/;

function safeDecode(str) {
  try {
    return decodeURIComponent(String(str || ""));
  } catch {
    return null;
  }
}

/** Normalize path: collapse //, strip trailing slash (kecuali /) */
function normalizePath(pathname) {
  let p = String(pathname || "/");
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/");
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

function parsePage(value, fallback = 1) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 1) return fallback;
  return Math.min(n, MAX_PAGE);
}

function isValidVideoId(id) {
  const s = String(id || "").trim();
  return VIDEO_ID_RE.test(s);
}

function isValidSearchQuery(q) {
  const s = String(q || "").trim();
  if (!s || s.length > MAX_QUERY_LEN) return false;
  // Minimal 1 karakter alfanumerik
  if (!/[a-zA-Z0-9\u00C0-\u024F]/.test(s)) return false;
  return true;
}

/**
 * Validasi path global sebelum routing.
 * Return { ok, path, redirect, error }
 */
function validateRequestPath(pathname) {
  if (!pathname || typeof pathname !== "string") {
    return { ok: false, error: { status: 400, title: "Bad Request", message: "Path tidak valid." } };
  }
  if (pathname.length > MAX_PATH_LEN) {
    return { ok: false, error: { status: 414, title: "URI Too Long", message: "Path terlalu panjang." } };
  }
  // Path traversal
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0")) {
    return { ok: false, error: { status: 400, title: "Bad Request", message: "Path tidak diizinkan." } };
  }

  const normalized = normalizePath(pathname);

  // Redirect jika path berubah (trailing slash / double slash)
  if (normalized !== pathname && pathname !== "/") {
    return { ok: true, path: normalized, redirect: true };
  }

  // Karakter aneh di path (kecuali % untuk encoding yang sudah di-decode oleh URL parser)
  // URL.pathname sudah decoded; cek residual
  if (/[<>\"'`|]/.test(normalized)) {
    return { ok: false, error: { status: 400, title: "Bad Request", message: "Karakter path tidak valid." } };
  }

  return { ok: true, path: normalized, redirect: false };
}

function errorPage(cfg, base, title, message, status = 500) {
  return htmlResponse(
    layout({
      title,
      siteName: cfg.site_name,
      tagline: cfg.site_tagline,
      body: emptyState(title, message),
      base,
      ads: cfg.ads,
    }),
    status,
    0,
    0,
    cfg.allowed_origin
  );
}

/** Brand icons (pink play button) — base64 PNG */
const ICON_PNG_16 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAQElEQVR42mPg5xf5TwlmGJwGvJTrwYqJMgCXZlyGMODSDAOEDCFoADaDyDIA2ZCBMYBsL5AUiBRHI1US0tDLTABj1MmEQ+lZEgAAAABJRU5ErkJggg==";
const ICON_PNG_32 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAiElEQVR42u3XSw6AIAwEUG7AxrUn9qKeQuPCjbF2KDQdtZOwpY+ETymFIbVOW8RIwHsB67zcDneAVNgKgQFo4VYIBLAWRxAqQJr0yAhEF+CMG+BpwmusiGEABNIE0FajBUW4ASREAv4D6N6E4ceQ4iIKv4opHqPw55iiIaFoyWia0vwXfBcQmR03eqg3yq0vpQAAAABJRU5ErkJggg==";
const ICON_PNG_180 =
  "iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAADRUlEQVR42u3dQU4CURREUXbAxLErdqOuQkYOJSoN/V7VqeRugH8SAbvpy8XMzMzMzB7a9fr2JW0JaAEtAS0BLQEtoIEW0BLQEtAS0AIaaAEtAS0BLQEtoIEW0BLQEtAS0AIaaAEtAS0BLQH9kj7fPw7Jawn0WryQA10BGHCg4xHDDXQsYriBjobcDhvoUMitsOtBp0Nug10Nug1zA+pK0K2QG2BXgYY4H3YNaHA7UFeABrYHdTRoSPtgx4IGsxN1JGgge1HHgQaxG3UUaAChjgENHtQxoIGDOgY0aFDHgAYM6hjQZx3m96AGOgp0O2ygQ95q/DSogV75vvneoAZ63YfA3wxqoKNAt8EGevFXdP8Z1EBHgW6ADfTSf6AcMaiLQU87tKMGNdBRoFNhA73sWo1nDWqgo0AnwQZ60ZV0rxrUQEeB3o4a6CXXOZ8xqIGOAr0VNtBAR8EGesFtVZMGNdBRoDfABhroKNTVoDf8CZ2+dtRAh4GeCBtooKNgAw10FOxK0Fu+W928BtRAF4E+EzbQQEehBhpooIEGGugBoDddQQb0bNRAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBAAw000EADDTTQQAMNNNBuwXILFtBAAw000EAD7YdmgAYaZKD9WCPMQAM9HTLQQEdBBhroKMj1oD00KAuyp2ABHYUZaKBjIAPt0chRkD0aGegYyEADHQUZ6EWoQZ6LGejBoDdjBnoRapDnYgZ6EOgEyEAvRA3yXMxAnwg6DTLQS1HDPBfzGtCTUIM8FzPQLwKdDBno5ahBnosZ6CeBboEMdABqkOdiXgn6bNQwz8W8FvSZqEGeixnoB0C3Qgbary3BDDTUMJeChhrmONBQwxwHGmqY40BD3Y05EjTUvZhjQUPdiTkaNNR9mONBg90DuQo01B2Yq0BDnY+5DjTYuZCrQbfDTj7TatCNqNPPsx50C+yWcwQ6HHbb+QEdCrv13IAOwu2sgF6P25kAvRq41xzotci9lkALaKAFtAS0BLQEtIAGWkBLQEtAS0ALaKAFtAS0BLQEtIAGWkBLQEtAS0ALaKAFtAS0BLT0V9BmZmZmZnZ3N3JTaZbhBwfNAAAAAElFTkSuQmCC";

function brandFaviconSvg(siteName = "S") {
  const letter = String(siteName || "S").trim().charAt(0).toUpperCase() || "S";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4db8"/>
      <stop offset="100%" stop-color="#e91e8c"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="#0f0f14"/>
  <circle cx="32" cy="32" r="22" fill="url(#g)"/>
  <path d="M28 22 L44 32 L28 42 Z" fill="#fff"/>
  <text x="50" y="56" font-size="10" font-family="system-ui,sans-serif" font-weight="700" fill="#fff" opacity=".35">${letter}</text>
</svg>`;
}

function assetResponse(body, contentType, maxAge = 604800, extra = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${maxAge}, immutable`,
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

function b64ToUint8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    const cfg = getConfig(env);
    const origin = cfg.allowed_origin;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const base = resolveBase(request, url, cfg);

    // —— Global path validation ——
    const pathCheck = validateRequestPath(url.pathname);
    if (!pathCheck.ok) {
      const e = pathCheck.error;
      return errorPage(cfg, base, e.title, e.message, e.status);
    }
    if (pathCheck.redirect) {
      const dest = new URL(pathCheck.path + url.search, base);
      return Response.redirect(dest.toString(), 301);
    }
    const path = pathCheck.path;

    // —— Static CSS / JS (long cache + content-hash versioning via ?v=) ——
    // 1 year immutable — URL berubah saat konten berubah (hash di query)
    if (path === "/assets/app.css") {
      return assetResponse(APP_CSS, "text/css; charset=utf-8", 31536000, {
        ETag: `"${CSS_HASH}"`,
      });
    }
    if (path === "/assets/app.js") {
      return assetResponse(APP_JS, "application/javascript; charset=utf-8", 31536000, {
        ETag: `"${JS_HASH}"`,
      });
    }

    // —— Static brand assets (no auth, long cache) ——
    if (path === "/favicon.svg") {
      return assetResponse(brandFaviconSvg(cfg.site_name), "image/svg+xml; charset=utf-8");
    }
    if (path === "/favicon.ico") {
      // Prefer SVG; many browsers accept it. Also provide PNG fallback via link tags.
      return assetResponse(b64ToUint8(ICON_PNG_32), "image/png");
    }
    if (path === "/favicon-16.png") {
      return assetResponse(b64ToUint8(ICON_PNG_16), "image/png");
    }
    if (path === "/favicon-32.png") {
      return assetResponse(b64ToUint8(ICON_PNG_32), "image/png");
    }
    if (path === "/apple-touch-icon.png" || path === "/apple-touch-icon-precomposed.png") {
      return assetResponse(b64ToUint8(ICON_PNG_180), "image/png");
    }
    if (path === "/site.webmanifest") {
      const name = cfg.site_name || "AGC";
      const manifest = {
        name,
        short_name: String(name).split(/\s+/)[0] || "AGC",
        description: cfg.site_tagline || "",
        start_url: "/",
        display: "standalone",
        background_color: "#0f0f14",
        theme_color: "#e91e8c",
        lang: "id",
        icons: [
          { src: "/favicon-16.png", sizes: "16x16", type: "image/png" },
          { src: "/favicon-32.png", sizes: "32x32", type: "image/png" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
          { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      };
      return assetResponse(JSON.stringify(manifest, null, 2), "application/manifest+json; charset=utf-8");
    }
    if (path === "/browserconfig.xml") {
      const xml = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/apple-touch-icon.png"/>
      <TileColor>#e91e8c</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;
      return assetResponse(xml, "application/xml; charset=utf-8");
    }
    if (path === "/robots.txt") {
      const txt = `User-agent: *
Allow: /
Allow: /f/
Allow: /e/
Allow: /categories
Disallow: /ajax/
Disallow: /api/
Disallow: /clear
Disallow: /search
Disallow: /*/page/
Sitemap: ${base}/sitemap.xml
`;
      return assetResponse(txt, "text/plain; charset=utf-8", 86400);
    }

    // —— Sitemaps (public, no auth — required for Googlebot) ——
    if (path === "/sitemap.xml") {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap/pages.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap/searches.xml</loc></sitemap>
</sitemapindex>`;
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    if (path === "/sitemap/pages.xml") {
      const today = new Date().toISOString().slice(0, 10);
      const cats = ["Viral", "TikTok", "Indo", "Asupan", "SMA", "Live", "Twitter"];
      const staticUrls = [
        { loc: `${base}/`, priority: "1.0", changefreq: "hourly" },
        { loc: `${base}/categories`, priority: "0.8", changefreq: "daily" },
        ...cats.map((c) => ({
          loc: searchPermalink(c, base),
          priority: "0.7",
          changefreq: "daily",
        })),
        { loc: `${base}/p/disclaimer`, priority: "0.3", changefreq: "monthly" },
        { loc: `${base}/p/term-of-services`, priority: "0.3", changefreq: "monthly" },
      ];
      const urls = staticUrls
        .map(
          (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
        )
        .join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    if (path === "/sitemap/searches.xml") {
      const today = new Date().toISOString().slice(0, 10);
      const defaultKeywords = [
        "viral",
        "tiktok",
        "indo",
        "asupan",
        "sma",
        "live",
        "twitter",
        "mahasiswa",
        "jepang",
        "korea",
        "barat",
        "full hd",
        "terbaru",
      ];
      const urls = defaultKeywords
        .map(
          (q) => `  <url>
    <loc>${searchPermalink(q, base)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`
        )
        .join("\n");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
      return new Response(xml, {
        status: 200,
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }

    if (!isAuthorized(request, cfg.api_access_key)) {
      return errorPage(cfg, "", "Unauthorized", "API Key tidak valid atau tidak disertakan.", 401);
    }

    const agc = new AGC(cfg);

    const cache = caches.default;
    const cacheKey = makeCacheKey(url.toString());
    const isCacheable =
      request.method === "GET" &&
      path !== "/clear" &&
      !path.startsWith("/ajax/") &&
      path !== "/api/stats";

    if (isCacheable) {
      const cached = await edgeGet(cache, cacheKey);
      if (cached) {
        const res = new Response(cached.body, cached);
        res.headers.set("Access-Control-Allow-Origin", origin);
        res.headers.set("X-Cache", "HIT-EDGE");
        return res;
      }
    }

    let response;
    let maxAge = 0;
    let swr = 0;

    try {
      if (path === "/" || /^\/page\/\d+$/.test(path)) {
        // /page/0, /page/999999 → clamp; non-digit sudah tidak match regex → 404
        const pageParam = path.startsWith("/page/")
          ? path.split("/")[2]
          : url.searchParams.get("page") || "1";
        const page = parsePage(pageParam, 1);
        maxAge = cfg.cache_list;
        swr = cfg.cache_list_swr;

        let videos = null;
        const kvKey = kvKeyList(page);
        const kvData = await kvGet(env, kvKey);
        if (kvData && Array.isArray(kvData.videos)) {
          videos = kvData.videos;
        }

        if (!videos) {
          try {
            // Halaman 1: 15 data terakhir (recentVideos). Halaman lain: list biasa.
            videos =
              page === 1
                ? await agc.recentVideos(15)
                : await agc.latestVideos(page, cfg.per_page);
            ctx.waitUntil(kvPut(env, kvKey, { videos }, cfg.kv_ttl_list));
          } catch {
            videos = [];
          }
        }

        const enriched = (videos || []).map((v) => enrichVideo(v, base));
        let pageTitle = seoReplace(cfg.home_title, {
          site_name: cfg.site_name,
          domain: url.hostname,
        });
        if (page > 1) pageTitle += ` Halaman ${page}`;
        const metaDesc = seoReplace(cfg.home_description, {
          site_name: cfg.site_name,
          domain: url.hostname,
        });
        const canonical = base + (page > 1 ? `/page/${page}` : "/");
        const links = getPaging(page, Math.max(page + 1, 2), `${base}/`);

        const defaultCats = ["Viral", "TikTok", "Indo", "Asupan", "SMA", "Live", "Twitter"].map((c) => ({
          name: c,
          slug: c.toLowerCase(),
          url: categoryPermalink(c, base),
        }));
        const body = catalogSection({
          title: cfg.site_name,
          meta: cfg.site_tagline,
          pills: renderCategories(defaultCats, ""),
          grid: enriched.length ? renderVideoGrid(enriched) : emptyState("Belum ada video", "Coba lagi nanti."),
          pagination: renderPagination(links),
          ads: cfg.ads,
        });

        const homeJsonLd = page === 1
          ? {
              "@context": "https://schema.org",
              "@type": "CollectionPage",
              name: pageTitle,
              description: metaDesc,
              url: canonical,
              isPartOf: { "@type": "WebSite", name: cfg.site_name, url: base },
              inLanguage: "id-ID",
              mainEntity: {
                "@type": "ItemList",
                itemListElement: enriched.slice(0, 10).map((v, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: v.permalink || v.url || `${base}/e/${v.id || v.file_code || ""}`,
                  name: v.title || "Video",
                })),
              },
            }
          : null;

        response = htmlResponse(
          layout({
            title: pageTitle,
            description: metaDesc,
            canonical,
            robots: page > 1 ? "noindex, nofollow" : cfg.home_robots,
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
            keywords: ["video viral", "tiktok indo", "streaming video", "download mp4", cfg.site_name],
            jsonLd: homeJsonLd,
            author: cfg.site_name,
          }),
          200,
          maxAge,
          swr,
          origin
        );
      }

      else if (path.startsWith("/f/") || path === "/search") {
        let rawQuery = "";
        let page = parsePage(url.searchParams.get("page") || "1", 1);

        if (path === "/search") {
          // Canonical search URL is /f/{slug} — 301 from /search?q=
          rawQuery = (url.searchParams.get("q") || url.searchParams.get("s") || "").trim();
          if (!isValidSearchQuery(rawQuery)) {
            return errorPage(cfg, base, "Pencarian", "Masukkan kata kunci pencarian yang valid (1–120 karakter).", 400);
          }
          if (gibberishCheck(rawQuery)) {
            return errorPage(cfg, base, "Query tidak valid", "Kata kunci tidak valid.", 400);
          }
          const target =
            searchPermalink(rawQuery, base) + (page > 1 ? `/page/${page}` : "");
          return Response.redirect(target, 301);
        }

        // /f/ saja atau /f// → invalid
        if (path === "/f" || path === "/f/") {
          return errorPage(cfg, base, "Pencarian", "Masukkan kata kunci pencarian.", 400);
        }

        let sub = safeDecode(path.slice(3));
        if (sub === null) {
          return errorPage(cfg, base, "Bad Request", "URL encoding tidak valid.", 400);
        }
        sub = sub.replace(/^\/+|\/+$/g, "");
        const m = sub.match(/\/page\/(\d+)$/);
        if (m) {
          page = parsePage(m[1], 1);
          sub = sub.replace(/\/page\/\d+$/, "");
        }
        // Tolak nested path aneh: /f/foo/bar (selain /page/N)
        if (sub.includes("/")) {
          return errorPage(cfg, base, "Bad Request", "Format URL pencarian tidak valid.", 400);
        }
        rawQuery = sub.replace(/-/g, " ").trim();

        if (!isValidSearchQuery(rawQuery)) {
          return errorPage(cfg, base, "Pencarian", "Kata kunci pencarian tidak valid.", 400);
        }

        const redir = badwordRedirect(rawQuery, cfg, base);
        if (redir) return Response.redirect(redir, 302);

        if (gibberishCheck(rawQuery)) {
          return errorPage(cfg, base, "Query tidak valid", "Kata kunci tidak valid.", 400);
        }

        const can = searchPermalink(rawQuery, base) + (page > 1 ? `/page/${page}` : "");
        if (dmcaBlocked(can, cfg)) {
          return errorPage(cfg, base, "Blocked", "Konten diblokir (DMCA).", 451);
        }

        maxAge = cfg.cache_search;
        swr = cfg.cache_search_swr;

        let result = null;
        const sk = kvKeySearch(rawQuery, page);
        const kvSearch = await kvGet(env, sk);
        if (kvSearch && Array.isArray(kvSearch.items)) {
          result = kvSearch;
        }

        if (!result) {
          try {
            result = await agc.search(rawQuery, page);
            ctx.waitUntil(kvPut(env, sk, result, cfg.kv_ttl_search));
          } catch {
            result = { items: [], total: 0, total_pages: 1, page, query: rawQuery };
          }
        }

        const items = (result.items || []).map((v) => enrichVideo(v, base));
        const total = result.total || 0;
        const totalPages = result.total_pages || 1;
        const totalFmt = total.toLocaleString("id-ID");

        let pageTitle = seoReplace(cfg.search_title, {
          query: rawQuery,
          total: totalFmt,
          site_name: cfg.site_name,
        });
        if (page > 1) pageTitle += ` Halaman ${page}`;
        const metaDesc = seoReplace(cfg.search_description, {
          query: rawQuery,
          total: totalFmt,
          site_name: cfg.site_name,
        });
        const h1 = seoReplace(cfg.search_page_title, { query: rawQuery, total: totalFmt });
        const baseSearch = searchPermalink(rawQuery, base);
        const links = getPaging(page, totalPages, baseSearch);

        const body = catalogSection({
          title: h1,
          meta: `${totalFmt} hasil untuk "${rawQuery}"`,
          pills: "",
          grid: items.length ? renderVideoGrid(items) : emptyState("Tidak ada hasil", "Coba kata kunci lain."),
          pagination: renderPagination(links),
          ads: cfg.ads,
        });

        const searchJsonLd =
          page === 1
            ? {
                "@context": "https://schema.org",
                "@type": "CollectionPage",
                name: pageTitle,
                description: metaDesc,
                url: can,
                isPartOf: { "@type": "WebSite", name: cfg.site_name, url: base },
                inLanguage: "id-ID",
                about: rawQuery,
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: total,
                  itemListElement: items.slice(0, 10).map((v, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: v.permalink || v.url || `${base}/e/${v.id || v.file_code || ""}`,
                    name: v.title || "Video",
                  })),
                },
              }
            : null;

        response = htmlResponse(
          layout({
            title: pageTitle,
            description: metaDesc,
            canonical: can,
            robots: page > 1 ? "noindex, nofollow" : cfg.search_robots,
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
            keywords: [rawQuery, "video viral", "nonton", "download", cfg.site_name],
            jsonLd: searchJsonLd,
            author: cfg.site_name,
          }),
          200,
          maxAge,
          swr,
          origin
        );
      }

      else if (path.startsWith("/e/")) {
        if (path === "/e" || path === "/e/") {
          return errorPage(cfg, base, "Bad Request", "ID video wajib diisi.", 400);
        }

        let slugId = safeDecode(path.slice(3));
        if (slugId === null) {
          return errorPage(cfg, base, "Bad Request", "URL encoding tidak valid.", 400);
        }
        slugId = slugId.replace(/^\/+|\/+$/g, "");
        // Tolak nested path: /e/foo/bar
        if (!slugId || slugId.includes("/")) {
          return errorPage(cfg, base, "Bad Request", "Format URL video tidak valid.", 400);
        }
        if (slugId.length > MAX_PATH_LEN) {
          return errorPage(cfg, base, "Bad Request", "ID video terlalu panjang.", 400);
        }

        // URL lama /e/{slug}-{id}: ambil id setelah dash terakhir. Canonical baru: /e/{id}
        const lastDash = slugId.lastIndexOf("-");
        const maybeId = lastDash !== -1 ? slugId.slice(lastDash + 1) : slugId;
        const vid = maybeId.length >= 3 ? maybeId : slugId;

        if (!isValidVideoId(vid)) {
          return errorPage(cfg, base, "Bad Request", "Format ID video tidak valid.", 400);
        }

        if (dmcaBlocked(`${base}${path}`, cfg)) {
          return errorPage(cfg, base, "Blocked", "Konten diblokir (DMCA).", 451);
        }

        maxAge = cfg.cache_video;
        swr = cfg.cache_video_swr;

        let video = null;
        const vk = kvKeyVideo(vid);
        const kvVid = await kvGet(env, vk);
        if (kvVid && kvVid.id) {
          video = kvVid;
        }

        if (!video) {
          try {
            video = await agc.getVideo(vid);
            if (video) {
              ctx.waitUntil(kvPut(env, vk, video, cfg.kv_ttl_video));
            }
          } catch {
            video = null;
          }
        }

        if (!video) {
          return errorPage(cfg, base, "Video tidak ditemukan", "Video tidak ditemukan atau sedang tidak tersedia.", 404);
        }

        const expected = downloadPermalink(video.title, video.id || vid, base);
        // Canonical: /e/{id} — 301 dari /e/{slug}-{id} (URL lama)
        try {
          const expectedPath = new URL(expected).pathname.replace(/\/+$/, "") || expected;
          const currentPath = path.replace(/\/+$/, "") || path;
          if (currentPath !== expectedPath) {
            return Response.redirect(expected, 301);
          }
        } catch {
          // ignore URL parse errors — lanjut render
        }

        // Related: KV cache (TTL sama dengan detail video) → hemat subrequest
        let related = [];
        const rk = kvKeyRelated(vid);
        const kvRel = await kvGet(env, rk);
        if (kvRel && Array.isArray(kvRel) && kvRel.length > 0) {
          related = kvRel.map((v) => enrichVideo(v, base));
        } else {
          try {
            // Maks 30 video terkait (2 kata pertama judul + fallback latest)
            const relatedRaw = await agc.related(video.title, video.id, 30);
            if (relatedRaw && relatedRaw.length > 0) {
              ctx.waitUntil(kvPut(env, rk, relatedRaw, cfg.kv_ttl_video));
            }
            related = (relatedRaw || []).map((v) => enrichVideo(v, base));
          } catch {
            related = [];
          }
        }

        const category = getVideoCategory(video.title);
        const clean =
          video.title.replace(/\b(video|viral)\b/gi, "").replace(/\s+/g, " ").trim() ||
          video.title;

        const pageTitle = seoReplace(cfg.download_title, {
          title: clean,
          size: video.size || "HD",
          duration: video.duration || "",
          site_name: cfg.site_name,
          domain: url.hostname,
        });
        const metaDesc = seoReplace(cfg.download_description, {
          title: clean,
          size: video.size || "HD",
          duration: video.duration || "",
          site_name: cfg.site_name,
          domain: url.hostname,
        });
        const h1 = seoReplace(cfg.download_page_title, {
          title: clean,
          site_name: cfg.site_name,
          domain: url.hostname,
        });

        const enriched = enrichVideo(video, base);
        // Proxied thumbs from enrichVideo; OG uses dedicated size/fit
        const splashUrl = enriched.splash_img || "";
        const thumbUrl = splashUrl || enriched.single_img || enriched.thumb || "";
        const ogImage =
          proxyImage(enriched.splash_img_raw || enriched.single_img_raw || enriched.thumb_raw || "", IMG_OG) ||
          thumbUrl;
        const embedSrc =
          enriched.protected_embed ||
          enriched.embed ||
          enriched.watch_url ||
          "";
        const dlUrl = enriched.download_url || enriched.protected_dl || enriched.download || "#";
        const kwList = clean.split(/\s+/).filter((w) => w.length > 3).slice(0, 8);
        const durationIso = (() => {
          const d = String(enriched.duration || "").trim();
          if (!d) return undefined;
          // support "12:34" or "1:02:03"
          const parts = d.split(":").map((n) => parseInt(n, 10) || 0);
          let sec = 0;
          if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) sec = parts[0] * 60 + parts[1];
          else sec = parts[0] || 0;
          if (sec <= 0) return undefined;
          const h = Math.floor(sec / 3600);
          const m = Math.floor((sec % 3600) / 60);
          const s = sec % 60;
          return `PT${h ? h + "H" : ""}${m ? m + "M" : ""}${s ? s + "S" : h || m ? "" : "0S"}`;
        })();

        const videoJsonLd = {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: clean,
          description: metaDesc,
          thumbnailUrl: thumbUrl || undefined,
          uploadDate: new Date().toISOString().slice(0, 10),
          contentUrl: dlUrl !== "#" ? dlUrl : undefined,
          embedUrl: embedSrc || undefined,
          duration: durationIso,
          inLanguage: "id",
          isFamilyFriendly: true,
          publisher: {
            "@type": "Organization",
            name: cfg.site_name,
            logo: {
              "@type": "ImageObject",
              url: `${base}/apple-touch-icon.png`,
              width: 180,
              height: 180,
            },
          },
          potentialAction: {
            "@type": "WatchAction",
            target: expected,
          },
        };

        const breadcrumbJsonLd = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Beranda", item: base },
            {
              "@type": "ListItem",
              position: 2,
              name: category,
              item: categoryPermalink(category, base),
            },
            { "@type": "ListItem", position: 3, name: clean, item: expected },
          ],
        };

        // Cover default = mobile width (640); srcset upgrades tablet/desktop
        const coverDefault =
          proxyImage(enriched.image_raw || enriched.splash_img_raw || enriched.single_img_raw || "", {
            w: 640,
            q: 80,
          }) ||
          splashUrl ||
          thumbUrl;

        const body = detailSection({
          breadcrumb: `<nav class="breadcrumb-nav" aria-label="Breadcrumb"><a href="/">Beranda</a><span>/</span><a href="${escapeHtml(categoryPermalink(category, base))}">${escapeHtml(category)}</a><span>/</span><span>${escapeHtml(clean)}</span></nav>`,
          title: h1,
          metaLine: `${escapeHtml(enriched.duration || "")}${enriched.duration && enriched.size ? " · " : ""}${escapeHtml(enriched.size || "")} · ${escapeHtml(category)}`,
          thumb: enriched.single_img || enriched.thumb || "",
          splashImg: coverDefault,
          coverSrcset: enriched.cover_srcset || "",
          watchUrl: embedSrc || dlUrl,
          embedUrl: embedSrc,
          downloadUrl: dlUrl,
          downloadLabel: enriched.size ? `Download (${enriched.size})` : "Download Video",
          synopsis: `<p style="margin:0 0 8px 0">${escapeHtml(metaDesc)}</p>`,
          keywords: kwList,
          relatedGrid: related.length ? related.map((v) => videoCard(v)).join("") : "",
          ads: cfg.ads,
        });

        response = htmlResponse(
          layout({
            title: pageTitle,
            description: metaDesc,
            canonical: expected,
            robots: cfg.download_robots,
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
            image: ogImage,
            imageWidth: 1200,
            imageHeight: 630,
            ogType: "video.other",
            keywords: kwList,
            jsonLd: [videoJsonLd, breadcrumbJsonLd],
            author: cfg.site_name,
          }),
          200,
          maxAge,
          swr,
          origin
        );
      }

      else if (path === "/categories" || path.startsWith("/categories/")) {
        // URL lama kategori /categories/{slug} → /f/{slug}
        if (path.startsWith("/categories/") && path !== "/categories/") {
          let oldSlug = safeDecode(path.slice("/categories/".length));
          if (oldSlug === null) {
            return errorPage(cfg, base, "Bad Request", "URL encoding tidak valid.", 400);
          }
          oldSlug = oldSlug.replace(/^\/+|\/+$/g, "");
          if (oldSlug.includes("/") || oldSlug.includes("..")) {
            return errorPage(cfg, base, "Bad Request", "Format kategori tidak valid.", 400);
          }
          if (oldSlug) {
            // 301 categories → /f/
            return Response.redirect(`${base}/f/${encodeURIComponent(oldSlug)}`, 301);
          }
        }
        const slug = "";
        const page = parsePage(url.searchParams.get("page") || "1", 1);
        const cats = ["Viral", "TikTok", "Indo", "Asupan", "SMA", "Live", "Twitter"];
        const catList = cats.map((c) => ({
          name: c,
          slug: slugify(c),
          url: categoryPermalink(c, base),
        }));

        const name = slug
          ? slug.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          : "Semua Kategori";

        maxAge = cfg.cache_search;
        swr = cfg.cache_search_swr;

        let items = [];
        let total = 0;
        let totalPages = 1;

        if (slug) {
          const sk = kvKeySearch(name, page);
          const kvCat = await kvGet(env, sk);
          let result = kvCat;
          if (!result) {
            try {
              result = await agc.search(name, page);
              ctx.waitUntil(kvPut(env, sk, result, cfg.kv_ttl_search));
            } catch {
              result = { items: [], total: 0, total_pages: 1 };
            }
          }
          items = (result.items || []).map((v) => enrichVideo(v, base));
          total = result.total || 0;
          totalPages = result.total_pages || 1;
        }

        const links = getPaging(
          page,
          totalPages,
          slug ? categoryPermalink(name, base) : `${base}/categories`
        );

        const body = catalogSection({
          title: name,
          meta: slug ? `${total.toLocaleString("id-ID")} video` : "Pilih kategori",
          pills: renderCategories(catList, name),
          grid: items.length
            ? renderVideoGrid(items)
            : slug
              ? emptyState("Tidak ada video", "Coba kategori lain.")
              : "",
          pagination: renderPagination(links),
          ads: cfg.ads,
        });

        const catCanonical = slug ? categoryPermalink(name, base) : `${base}/categories`;
        const catDesc = slug
          ? `Kumpulan video kategori ${name} terbaru. Nonton dan download gratis Full HD di ${cfg.site_name}.`
          : `Daftar kategori video viral di ${cfg.site_name}. Pilih kategori favoritmu.`;

        response = htmlResponse(
          layout({
            title: `${name} - ${cfg.site_name}`,
            description: catDesc,
            canonical: catCanonical,
            robots: page > 1 ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
            keywords: [name, "video viral", "kategori", cfg.site_name],
            author: cfg.site_name,
            activeNav: "categories",
          }),
          200,
          maxAge,
          swr,
          origin
        );
      }

      else if (path === "/ajax/suggest") {
        const q = (url.searchParams.get("q") || "").trim();
        if (q.length < 2 || q.length > MAX_QUERY_LEN || !isValidSearchQuery(q) || gibberishCheck(q)) {
          return jsonResponse({ status: "ok", query: q.slice(0, MAX_QUERY_LEN), suggestions: [] }, 200, 0, origin);
        }
        try {
          const gUrl =
            "https://suggestqueries.google.com/complete/search?" +
            new URLSearchParams({
              output: "firefox",
              client: "firefox",
              hl: cfg.language || "id",
              q,
            }).toString();
          const gRes = await fetch(gUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
          const gData = await gRes.json();
          const suggestions =
            Array.isArray(gData) && Array.isArray(gData[1])
              ? gData[1].filter((s) => typeof s === "string").slice(0, 8)
              : [];
          response = jsonResponse({ status: "ok", query: q, suggestions }, 200, 86400, origin);
        } catch {
          response = jsonResponse({ status: "ok", query: q, suggestions: [] }, 200, 0, origin);
        }
      }

      else if (path === "/tos" || path === "/p/term-of-services") {
        const body = `<section class="main-section"><div class="container page-plain">
          ${pageHead("Ketentuan Layanan (TOS)")}
          <ul>
            <li>Konten hanya untuk pengguna 18+.</li>
            <li>Pengguna bertanggung jawab atas materi yang diunduh.</li>
            <li>Kami tidak menyimpan file video di server sendiri.</li>
            <li>Permintaan DMCA diproses sesuai prosedur.</li>
          </ul>
        </div></section>`;
        maxAge = 86400;
        swr = 604800;
        response = htmlResponse(
          layout({
            title: "Ketentuan Layanan - " + cfg.site_name,
            description: "Ketentuan layanan",
            canonical: `${base}/p/term-of-services`,
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
          }),
          200,
          maxAge,
          swr,
          origin
        );
      } else if (path === "/disclaimer" || path === "/p/disclaimer") {
        const body = `<section class="main-section"><div class="container page-plain">
          ${pageHead("Disclaimer")}
          <ul>
            <li>Situs ini merupakan agregator tautan. Kami tidak menghosting file video.</li>
            <li>Konten disediakan pihak ketiga. Penghapusan hak cipta dapat diajukan via DMCA.</li>
          </ul>
        </div></section>`;
        maxAge = 86400;
        swr = 604800;
        response = htmlResponse(
          layout({
            title: "Disclaimer - " + cfg.site_name,
            description: "Disclaimer",
            canonical: `${base}/p/disclaimer`,
            siteName: cfg.site_name,
            tagline: cfg.site_tagline,
            body,
            base,
            ads: cfg.ads,
          }),
          200,
          maxAge,
          swr,
          origin
        );
      } else if (path === "/api/latest") {
        // 15 video terakhir (Dood + Lulu, format normalisasi)
        const limit = Math.min(
          30,
          Math.max(1, parseInt(url.searchParams.get("limit") || "15", 10) || 15)
        );
        let items = [];
        const lk = `latest:v1:${limit}`;
        const kvLatest = await kvGet(env, lk);
        if (kvLatest && Array.isArray(kvLatest.items)) {
          items = kvLatest.items;
        } else {
          try {
            items = await agc.recentVideos(limit);
            ctx.waitUntil(kvPut(env, lk, { items }, cfg.kv_ttl_list));
          } catch {
            items = [];
          }
        }
        return jsonResponse(
          {
            status: "ok",
            limit,
            total: items.length,
            items: items.map((v) => enrichVideo(v, base)),
          },
          200,
          cfg.cache_list || 3600,
          origin
        );
      } else if (path === "/api/stats") {
        return jsonResponse(
          {
            status: "ok",
            runtime: "cloudflare-pages",
            mode: "html",
            kv_enabled: Boolean(env.AGC2_CACHE),
            auth_enabled: Boolean(cfg.api_access_key),
            edge_cache: true,
            swr: true,
          },
          200,
          0,
          origin
        );
      } else if (path === "/clear") {
        return jsonResponse(
          {
            status: "ok",
            message: "Edge cache dikelola via Cache-Control + SWR. KV di-expire otomatis via TTL.",
            tip: "Purge manual: Cloudflare Dashboard → Caching → Configuration → Purge Cache",
          },
          200,
          0,
          origin
        );
      } else {
        return errorPage(cfg, base, "404", "Halaman tidak ditemukan.", 404);
      }

      if (isCacheable && response && response.status === 200 && maxAge > 0) {
        ctx.waitUntil(edgePut(cache, cacheKey, response, maxAge, swr, origin));
      }

      if (response) {
        const out = new Response(response.body, response);
        out.headers.set("X-Cache", "MISS");
        return out;
      }

      return errorPage(cfg, base, "Error", "Tidak ada response.", 500);
    } catch (err) {
      if (isCacheable) {
        const stale = await edgeGet(cache, cacheKey);
        if (stale) {
          const res = new Response(stale.body, stale);
          res.headers.set("X-Cache", "STALE-ON-ERROR");
          res.headers.set("Access-Control-Allow-Origin", origin);
          return res;
        }
      }
      return errorPage(
        cfg,
        base,
        "Error",
        err?.message || "Internal Server Error. Silakan coba lagi.",
        500
      );
    }
  },
};
