/**
 * Vidpro Layout (presisi) — templates for AGC Cloudflare Pages
 */
import { APP_CSS, APP_JS } from "./assets.js";

export function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225'%3E%3Crect fill='%2322222c' width='100%25' height='100%25'/%3E%3Cpath d='M180 95 L230 125 L180 155 Z' fill='%23555'/%3E%3C/svg%3E";
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const FOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M2 6a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>`;

const PLAY_SVG = `<svg class="custom-play-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="76" height="76"><circle cx="256" cy="256" r="248" fill="#000" opacity=".55"/><path d="M195 131 L372 238 Q395 256 372 274 L195 381 Q160 400 160 360 V152 Q160 112 195 131Z" fill="#fff"/></svg>`;

/** Render trusted ad markup configured by the site operator; keep placeholder when unset. */
function adSlot(variant = "in-article", label = "Advertisement", content = "") {
  const cls =
    variant === "header"
      ? "ad-slot ad-slot--header"
      : variant === "floating"
        ? "ad-slot ad-slot--floating"
        : "ad-slot ad-slot--in-article";
  const inner = String(content || "").trim() || `<!-- Pasang kode iklan di sini (${escapeHtml(variant)}) -->`;
  return `<div class="${cls}" data-ad="${escapeHtml(variant)}" aria-label="Advertisement">
  <div class="ad-slot-inner">
    <span class="ad-slot-label">${escapeHtml(label)}</span>
    ${inner}
  </div>
</div>`;
}

/**
 * Build JSON-LD script tag(s). Accepts object or array of objects.
 */
function jsonLdScript(data) {
  if (!data) return "";
  const list = Array.isArray(data) ? data : [data];
  return list
    .filter(Boolean)
    .map(
      (obj) =>
        `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`
    )
    .join("\n  ");
}

/**
 * Full on-page SEO layout.
 * Extra optional fields for maximum SEO:
 * - image: absolute URL preferred (og/twitter)
 * - imageWidth / imageHeight
 * - ogType: "website" | "video.other" | "article" ...
 * - keywords: string or string[]
 * - jsonLd: object | object[] (structured data)
 * - publishedTime / modifiedTime (ISO)
 * - author
 * - noIndexPage: force robots if needed (prefer robots string)
 */
export function layout({
  title,
  description,
  canonical,
  robots,
  siteName,
  tagline,
  body,
  base,
  activeNav = "home",
  image = "",
  imageWidth = 0,
  imageHeight = 0,
  ogType = "website",
  keywords = "",
  jsonLd = null,
  publishedTime = "",
  modifiedTime = "",
  author = "",
  ads = {},
}) {
  const safeTitle = escapeHtml(title || siteName);
  const safeDesc = escapeHtml(description || "");
  const safeCanonical = escapeHtml(canonical || base || "");
  const safeRobots = escapeHtml(robots || "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  const safeSite = escapeHtml(siteName || "AGC");
  const safeTagline = escapeHtml(tagline || "");
  const parts = (siteName || "AGC").split(/\s+/);
  const logoWord = escapeHtml(parts[0] || "AGC");
  const logoRest = escapeHtml(parts.slice(1).join(" "));
  const year = new Date().getFullYear();

  const cats = ["Video Viral", "Video TikTok", "Video Indo", "Video Asupan", "Video Lokal", "Video Jepang", "Twitter"];

  const appleIconUrl = `${base || ""}/apple-touch-icon.png`;
  const defaultImage = appleIconUrl;
  const ogImage = image && String(image).trim() ? String(image).trim() : defaultImage;
  const safeOgImage = escapeHtml(ogImage);
  const isLargeImage = image && String(image).trim() && image !== defaultImage;
  const imgW = imageWidth > 0 ? imageWidth : isLargeImage ? 1280 : 180;
  const imgH = imageHeight > 0 ? imageHeight : isLargeImage ? 720 : 180;
  const twitterCard = isLargeImage ? "summary_large_image" : "summary";
  const safeOgType = escapeHtml(ogType || "website");

  let keywordsStr = "";
  if (Array.isArray(keywords)) {
    keywordsStr = keywords.filter(Boolean).map(String).join(", ");
  } else if (keywords) {
    keywordsStr = String(keywords);
  }
  const safeKeywords = escapeHtml(keywordsStr);
  const safeAuthor = escapeHtml(author || siteName || "");

  // Default WebSite + Organization schema when none provided
  const defaultJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteName || "AGC",
      url: base || safeCanonical,
      description: description || tagline || "",
      inLanguage: "id-ID",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${base || ""}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteName || "AGC",
      url: base || safeCanonical,
      logo: {
        "@type": "ImageObject",
        url: appleIconUrl,
        width: 180,
        height: 180,
      },
    },
  ];

  const schemaScripts = jsonLdScript(jsonLd || defaultJsonLd);

  return `<!DOCTYPE html>
<html lang="id" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}">
  ${safeKeywords ? `<meta name="keywords" content="${safeKeywords}">` : ""}
  <meta name="robots" content="${safeRobots}">
  <meta name="googlebot" content="${safeRobots}">
  <meta name="bingbot" content="${safeRobots}">
  <meta name="language" content="Indonesian">
  <meta http-equiv="content-language" content="id-ID">
  <meta name="author" content="${safeAuthor}">
  <meta name="publisher" content="${safeSite}">
  <meta name="copyright" content="© ${year} ${safeSite}">
  <meta name="rating" content="general">
  <meta name="revisit-after" content="1 days">
  <meta name="distribution" content="global">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <meta name="theme-color" content="#0f0f14" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#e91e8c" media="(prefers-color-scheme: light)">
  <meta name="color-scheme" content="dark light">
  <meta name="application-name" content="${safeSite}">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${safeSite}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="format-detection" content="telephone=no">
  <meta name="msapplication-TileColor" content="#e91e8c">
  <meta name="msapplication-config" content="/browserconfig.xml">

  <!-- Canonical & Hreflang -->
  <link rel="canonical" href="${safeCanonical}">
  <link rel="alternate" hreflang="id" href="${safeCanonical}">
  <link rel="alternate" hreflang="x-default" href="${safeCanonical}">

  <!-- Favicon & Icons -->
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <!-- Open Graph -->
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDesc}">
  <meta property="og:type" content="${safeOgType}">
  <meta property="og:locale" content="id_ID">
  <meta property="og:site_name" content="${safeSite}">
  <meta property="og:url" content="${safeCanonical}">
  <meta property="og:image" content="${safeOgImage}">
  <meta property="og:image:secure_url" content="${safeOgImage}">
  <meta property="og:image:width" content="${imgW}">
  <meta property="og:image:height" content="${imgH}">
  <meta property="og:image:alt" content="${safeTitle}">
  <meta property="og:image:type" content="image/jpeg">
  ${publishedTime ? `<meta property="article:published_time" content="${escapeHtml(publishedTime)}">` : ""}
  ${modifiedTime ? `<meta property="article:modified_time" content="${escapeHtml(modifiedTime)}">` : ""}
  ${safeAuthor ? `<meta property="article:author" content="${safeAuthor}">` : ""}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDesc}">
  <meta name="twitter:image" content="${safeOgImage}">
  <meta name="twitter:image:alt" content="${safeTitle}">
  <meta name="twitter:site" content="@${escapeHtml((siteName || "site").replace(/\s+/g, "").toLowerCase())}">

  <!-- Critical CSS (hashed, long-cache) — non-blocking -->
  <style>${APP_CSS}</style>

  <!-- Image CDN + icon font (async, tidak blokir first paint) -->
  <link rel="dns-prefetch" href="https://wsrv.nl">
  <link rel="preconnect" href="https://wsrv.nl" crossorigin>
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"></noscript>

  <!-- Structured Data (JSON-LD) -->
  ${schemaScripts}

</head>
<body class="dark-theme" itemscope itemtype="https://schema.org/WebPage">
  <header class="gmr-header" role="banner">
    <div class="container">
      <div class="gmr-navbar">
        <div class="nav-left">
          <button type="button" class="icon-btn" id="mobile-menu-btn" aria-label="Menu" onclick="toggleDrawer(true)">
            <span class="material-symbols-outlined">menu</span>
          </button>
          <a class="gmr-logo" href="/" itemprop="url">
            <span class="logo-badge">${logoWord}</span>
            ${logoRest ? `<span>${logoRest}</span>` : ""}
          </a>
          <nav class="desktop-nav" aria-label="Menu utama" itemscope itemtype="https://schema.org/SiteNavigationElement">
            <a href="/" class="${activeNav === "home" ? "active" : ""}" itemprop="url"><span itemprop="name"><span class="material-symbols-outlined" style="font-size:18px">home</span> Beranda</span></a>
            <div class="dropdown-container">
              <button type="button" class="${activeNav === "categories" ? "active" : ""}" aria-haspopup="true" aria-expanded="false" aria-controls="nav-cat-menu" onclick="toggleDropdown('nav-cat-menu', event)">
                <span class="material-symbols-outlined" style="font-size:18px">grid_view</span> Kategori
                <span class="material-symbols-outlined" style="font-size:16px">expand_more</span>
              </button>
              <div class="dropdown-menu" id="nav-cat-menu" role="menu" aria-label="Daftar kategori">
                ${cats.map((c) => `<a href="/f/${encodeURIComponent(c.toLowerCase())}" role="menuitem" itemprop="url"><span itemprop="name">${FOLDER_SVG} ${escapeHtml(c)}</span></a>`).join("")}
                <a href="/categories" class="dropdown-all" role="menuitem" itemprop="url"><span itemprop="name"><span class="material-symbols-outlined" style="font-size:16px">apps</span> Semua Kategori</span></a>
              </div>
            </div>
          </nav>
        </div>
        <div class="nav-right">
          <form class="search-box" action="/search" method="get" role="search" itemprop="potentialAction" itemscope itemtype="https://schema.org/SearchAction">
            <meta itemprop="target" content="${escapeHtml(base || "")}/search?q={search_term_string}">
            <input type="search" name="q" placeholder="Cari video..." required minlength="2" aria-label="Cari video" itemprop="query-input">
            <button type="submit" aria-label="Cari"><span class="material-symbols-outlined">search</span></button>
          </form>
          <button type="button" class="icon-btn" onclick="toggleTheme()" aria-label="Mode gelap/terang">
            <span class="material-symbols-outlined" id="theme-icon">light_mode</span>
          </button>
        </div>
      </div>
    </div>
  </header>

  <div class="ad-header-wrap">
    ${adSlot("header", "Ads — Header", ads.header)}
  </div>

  <div class="mobile-overlay" id="mobile-overlay" onclick="toggleDrawer(false)"></div>
  <aside class="mobile-drawer" id="mobile-drawer" aria-label="Menu mobile">
    <div class="drawer-header">
      <a class="gmr-logo" href="/"><span class="logo-badge">${logoWord}</span></a>
      <button type="button" class="icon-btn" onclick="toggleDrawer(false)" aria-label="Tutup"><span class="material-symbols-outlined">close</span></button>
    </div>
    <nav class="drawer-nav" aria-label="Menu mobile">
      <a href="/" onclick="toggleDrawer(false)"><span class="material-symbols-outlined">home</span> Beranda</a>
      <a href="/categories" onclick="toggleDrawer(false)"><span class="material-symbols-outlined">grid_view</span> Semua Kategori</a>
      <a href="/p/disclaimer" onclick="toggleDrawer(false)"><span class="material-symbols-outlined">info</span> Disclaimer</a>
      <a href="/p/term-of-services" onclick="toggleDrawer(false)"><span class="material-symbols-outlined">gavel</span> TOS</a>
      <div class="drawer-section-label" style="padding:12px 16px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--muted-color)">Kategori</div>
      ${cats.map((c) => `<a href="/f/${encodeURIComponent(c.toLowerCase())}" onclick="toggleDrawer(false)">${FOLDER_SVG} ${escapeHtml(c)}</a>`).join("")}
    </nav>
  </aside>

  <main>
    ${body}
  </main>

  <footer role="contentinfo" class="site-footer">
    <div class="container">
      <div class="footer-top-grid">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="font-family:'Outfit',sans-serif;font-size:18px;font-weight:700;color:var(--text-color);">
              ${logoWord} ${logoRest ? `<span style="color:var(--primary-color)">${logoRest}</span>` : ""}
            </span>
          </div>
          <p style="font-size:12.5px;line-height:1.65;margin:0 0 12px;max-width:460px;color:var(--muted-color);">
            ${safeTagline || "Streaming video viral Full HD. Nonton dan unduh dengan mudah."}
          </p>
        </div>
        <div>
          <h3 class="footer-col-title">Kategori</h3>
          <ul class="footer-menu-list">
            ${cats.slice(0, 5).map((c) => `<li><a href="/f/${c.toLowerCase()}" class="footer-link-btn">${FOLDER_SVG}<span>${escapeHtml(c)}</span></a></li>`).join("")}
          </ul>
        </div>
        <div>
          <h3 class="footer-col-title">Navigasi</h3>
          <ul class="footer-menu-list">
            <li><a href="/" class="footer-link-btn"><span class="material-symbols-outlined" style="font-size:15px;color:var(--primary-color)">home</span><span>Beranda</span></a></li>
            <li><a href="/categories" class="footer-link-btn"><span class="material-symbols-outlined" style="font-size:15px;color:var(--primary-color)">grid_view</span><span>Kategori</span></a></li>
            <li><a href="/p/disclaimer" class="footer-link-btn"><span class="material-symbols-outlined" style="font-size:15px;color:var(--primary-color)">info</span><span>Disclaimer</span></a></li>
            <li><a href="/p/term-of-services" class="footer-link-btn"><span class="material-symbols-outlined" style="font-size:15px;color:var(--primary-color)">gavel</span><span>TOS</span></a></li>
          </ul>
        </div>
      </div>
      <div class="footer-seo-strip">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Populer:</span>
        <div class="footer-seo-tags">
          <a href="/f/viral" class="footer-tag-chip">Viral</a>
          <a href="/f/tiktok" class="footer-tag-chip">TikTok</a>
          <a href="/f/indo" class="footer-tag-chip">Indo</a>
          <a href="/f/asupan" class="footer-tag-chip">Asupan</a>
          <a href="/f/live" class="footer-tag-chip">Live</a>
        </div>
      </div>
      <div class="footer-bottom-bar">
        &copy; ${year} <strong>${safeSite}</strong>
      </div>
    </div>
  </footer>

  <div class="ad-floating-root is-hidden" id="ad-floating-root" aria-hidden="true">
    <div class="ad-floating-backdrop" id="ad-floating-backdrop"></div>
    <div class="ad-floating-box">
      <button type="button" class="ad-floating-close" id="ad-floating-close" aria-label="Tutup iklan">&times;</button>
      ${adSlot("floating", "Ads — Floating", ads.floating)}
    </div>
  </div>

  <button type="button" class="scroll-top" id="scroll-top" onclick="window.scrollTo({top:0,behavior:'smooth'})" aria-label="Kembali ke atas">
    <span class="material-symbols-outlined">keyboard_arrow_up</span>
  </button>

  <script>${APP_JS}</script>
</body>
</html>`;
}

export function videoCard(v, opts = {}) {
  const title = escapeHtml(v.title || "Video");
  const hasRawImageFields =
    Object.prototype.hasOwnProperty.call(v, "single_img_raw") ||
    Object.prototype.hasOwnProperty.call(v, "splash_img_raw");
  const singleRaw = hasRawImageFields ? v.single_img_raw || "" : v.single_img || "";
  const splashRaw = hasRawImageFields ? v.splash_img_raw || "" : v.splash_img || "";
  const thumbRaw = v.single_img || v.single_img_raw || v.splash_img || v.splash_img_raw || v.thumb || v.thumbnail || "";
  const fallbackRaw = singleRaw && splashRaw && singleRaw !== splashRaw ? v.splash_img || splashRaw : "";
  const thumb = escapeHtml(thumbRaw);
  const fallbackThumb = escapeHtml(fallbackRaw);
  const srcset = escapeHtml(v.card_srcset || "");
  // Mobile-first sizes: ~half width on phone (2-col), ~1/3 tablet, fixed desktop tile
  const sizes = "(max-width: 480px) 50vw, (max-width: 768px) 33vw, 240px";
  const dur = escapeHtml(v.duration || "");
  const size = escapeHtml(v.size || "");
  const href = escapeHtml(v.permalink || v.short_permalink || "#");
  const views = escapeHtml(v.views || "");
  const eager = Boolean(opts.eager);
  const onErr = `this.removeAttribute('data-src');this.removeAttribute('data-srcset');this.removeAttribute('srcset');if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback')}else{this.onerror=null;this.src=${JSON.stringify(PLACEHOLDER)};this.classList.add('is-error')}`;
  const fallbackAttr = fallbackThumb ? ` data-fallback="${fallbackThumb}"` : "";

  let imgTag;
  if (!thumb) {
    imgTag = `<img src="${PLACEHOLDER}" alt="${title}" width="320" height="180" decoding="async" class="is-error">`;
  } else if (eager) {
    imgTag = `<img src="${thumb}"${srcset ? ` srcset="${srcset}" sizes="${sizes}"` : ""}${fallbackAttr} alt="${title}" width="320" height="180" fetchpriority="high" decoding="async" class="lazy-img is-loaded" onerror="${escapeHtml(onErr)}">`;
  } else {
    imgTag = `<img class="lazy-img" src="${PIXEL}" data-src="${thumb}"${srcset ? ` data-srcset="${srcset}" data-sizes="${sizes}"` : ""}${fallbackAttr} alt="${title}" width="320" height="180" loading="lazy" decoding="async" onerror="${escapeHtml(onErr)}">`;
  }

  const metaLeft = views ? `${views} views` : size || "";
  const metaRight = dur || "";

  return `<article class="video-card">
  <a class="thumb-wrapper" href="${href}">
    ${imgTag}
    <span class="play-badge" aria-hidden="true"><span class="material-symbols-outlined">play_circle</span></span>
    ${dur ? `<span class="badge-label right"><span class="material-symbols-outlined">schedule</span>${dur}</span>` : ""}
  </a>
  <div class="card-body">
    <h2 class="card-title"><a href="${href}">${title}</a></h2>
    <div class="card-meta">
      <span>${metaLeft}</span>
      <span>${metaRight && !dur ? metaRight : size && metaLeft !== size ? size : ""}</span>
    </div>
  </div>
</article>`;
}

export function renderVideoGrid(items) {
  if (!items || !items.length) return "";
  return `<div class="video-grid-5">${items
    .map((v, i) => videoCard(v, { eager: i < 5 }))
    .join("")}</div>`;
}

export function renderPagination(links) {
  if (!links || !links.length) return "";
  return `<nav class="pagination" aria-label="Pagination">${links
    .map((l) =>
      l.active
        ? `<span class="active">${escapeHtml(l.label)}</span>`
        : `<a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`
    )
    .join("")}</nav>`;
}

export function renderCategories(cats, active = "") {
  if (!cats || !cats.length) return "";
  return `<div class="category-pill-bar" role="navigation" aria-label="Kategori">${cats
    .map((c) => {
      const isActive =
        (c.slug || "") === String(active).toLowerCase().replace(/\s+/g, "-") ||
        c.name === active;
      return `<a href="${escapeHtml(c.url)}" class="cat-pill${isActive ? " active" : ""}">${FOLDER_SVG}<span>${escapeHtml(c.name)}</span></a>`;
    })
    .join("")}</div>`;
}

export function pageHead(title, meta = "") {
  return `<div class="section-header-wrap">
  <h1 class="section-header">${escapeHtml(title)}</h1>
  ${meta ? `<span class="api-status-badge">${meta}</span>` : ""}
</div>`;
}

export function emptyState(title, message) {
  return `<div class="empty-state">
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <p style="margin-top:16px"><a href="/">← Kembali ke beranda</a></p>
</div>`;
}

export function catalogSection({ title, meta, pills, grid, pagination, ads = {} }) {
  return `<section class="main-section" aria-label="${escapeHtml(title || "Katalog video")}">
  <div class="container">
    ${pills || ""}
    ${pageHead(title, meta)}
    ${adSlot("in-article", "Ads — In Article", ads.article)}
    <div class="video-catalog" role="list">
      ${grid || ""}
    </div>
    ${adSlot("in-article", "Ads — In Article", ads.article)}
    ${pagination || ""}
  </div>
</section>`;
}

export function detailSection({
  breadcrumb,
  title,
  metaLine,
  thumb,
  splashImg,
  coverSrcset = "",
  watchUrl,
  embedUrl,
  downloadUrl,
  downloadLabel,
  synopsis,
  keywords,
  relatedGrid,
  ads = {},
}) {
  const safeTitle = escapeHtml(title);
  // Prioritas thumbnail: splash_img (diminta user) → thumb → kosong
  const coverSrc = splashImg || thumb || "";
  const safeCover = escapeHtml(coverSrc);
  const safeCoverSrcset = escapeHtml(coverSrcset || "");
  const coverSizes = "100vw";
  const safeEmbed = escapeHtml(embedUrl || watchUrl || "");
  const playerId = "vp-player-" + Math.random().toString(36).slice(2, 9);

  const coverOnErr = `this.onerror=null;this.src='${PLACEHOLDER}';this.removeAttribute('srcset');this.classList.add('is-error')`;
  const srcsetAttr = safeCoverSrcset ? ` srcset="${safeCoverSrcset}" sizes="${coverSizes}"` : "";
  const playCover = safeCover
    ? `<div class="custom-cover-overlay" id="${playerId}-cover" role="button" tabindex="0" aria-label="Putar video" data-embed="${safeEmbed}" data-player="${playerId}" onclick="playEmbed(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();playEmbed(this);}">
        <img class="custom-cover-img" src="${safeCover}"${srcsetAttr} alt="${safeTitle}" width="640" height="360" fetchpriority="high" decoding="async" onerror="${coverOnErr}">
        <div class="custom-play-center">${PLAY_SVG}</div>
      </div>`
    : `<div class="custom-cover-overlay" id="${playerId}-cover" role="button" tabindex="0" aria-label="Putar video" data-embed="${safeEmbed}" data-player="${playerId}" onclick="playEmbed(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();playEmbed(this);}">
        <div class="custom-play-center">${PLAY_SVG}</div>
      </div>`;

  const kw = (keywords || [])
    .map((k) => `<a href="/f/${escapeHtml(String(k).toLowerCase().replace(/\s+/g, "-"))}" class="synopsis-keyword-link">${escapeHtml(k)}</a>`)
    .join("");

  return `<article class="detail-section" itemscope itemtype="https://schema.org/VideoObject">
  <div class="container">
    ${breadcrumb || ""}
    <div class="player-box">
      <div class="iframe-container" id="${playerId}">
        ${playCover}
      </div>
      <div class="player-toolbar">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button type="button" class="btn-action" data-embed="${safeEmbed}" data-player="${playerId}" onclick="playEmbed(this)" aria-label="Putar video">
            <span class="material-symbols-outlined" style="font-size:16px">play_arrow</span>
            <span>Putar Video</span>
          </button>
          <a class="btn-subtle" href="${escapeHtml(downloadUrl || "#")}" target="_blank" rel="noopener">
            <span class="material-symbols-outlined" style="font-size:16px">download</span>
            <span>${escapeHtml(downloadLabel || "Download")}</span>
          </a>
          ${safeEmbed ? `<a class="btn-subtle" href="${safeEmbed}" target="_blank" rel="noopener">
            <span class="material-symbols-outlined" style="font-size:16px">open_in_new</span>
            <span>Buka Tab Baru</span>
          </a>` : ""}
        </div>
      </div>
    </div>
    <h1 class="detail-title-main" itemprop="name">${safeTitle}</h1>
    <p class="detail-meta-line">${metaLine || ""}</p>
    ${safeCover ? `<meta itemprop="thumbnailUrl" content="${safeCover}">` : ""}
    ${safeEmbed ? `<meta itemprop="embedUrl" content="${safeEmbed}">` : ""}
    ${adSlot("in-article", "Ads — In Article", ads.article)}
    ${synopsis
      ? `<div class="synopsis-box">
      <h2 class="synopsis-title">Sinopsis &amp; Deskripsi Video</h2>
      <div class="synopsis-content" itemprop="description">${synopsis}</div>
      ${kw ? `<div class="synopsis-keywords"><span class="synopsis-keywords-label">Kata Kunci:</span> ${kw}</div>` : ""}
    </div>`
      : ""}
    ${adSlot("in-article", "Ads — In Article", ads.article)}
    ${relatedGrid
      ? `<section class="related-section" aria-label="Video terkait">
           <div class="section-header-wrap" style="margin-top:28px"><h2 class="section-header">Video Terkait</h2></div>
           <div class="related-grid">${relatedGrid}</div>
         </section>`
      : ""}
  </div>
</article>`;
}
