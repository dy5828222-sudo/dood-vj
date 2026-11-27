export function slugify(str, delimiter = "-", options = {}) {
  const settings = {
    delimiter,
    limit: null,
    lowercase: true,
    replacements: [],
    transliterate: true,
    ...options,
  };

  let result = String(str || "");

  // Custom replacements
  for (const [pattern, replacement] of settings.replacements) {
    result = result.replace(pattern, replacement);
  }

  if (settings.transliterate) {
    const charMap = {
      // Latin & Simbol
      "©": "(c)", "Æ": "AE", "æ": "ae", "ß": "ss", "Þ": "TH", "þ": "th",
      "Ð": "D", "ð": "d", "Ø": "O", "ø": "o", "Ł": "L", "ł": "l", "ı": "i", "İ": "I",
      // Yunani
      "Α": "A", "Β": "B", "Γ": "G", "Δ": "D", "Ε": "E", "Ζ": "Z", "Η": "H", "Θ": "8",
      "Ι": "I", "Κ": "K", "Λ": "L", "Μ": "M", "Ν": "N", "Ξ": "3", "Ο": "O", "Π": "P",
      "Ρ": "R", "Σ": "S", "Τ": "T", "Υ": "Y", "Φ": "F", "Χ": "X", "Ψ": "PS", "Ω": "W",
      "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h", "θ": "8",
      "ι": "i", "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "3", "ο": "o", "π": "p",
      "ρ": "r", "σ": "s", "τ": "t", "υ": "y", "φ": "f", "χ": "x", "ψ": "ps", "ω": "w", "ς": "s",
      // Rusia & Ukraina (Sirilik)
      "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ё": "Yo", "Ж": "Zh",
      "З": "Z", "И": "I", "Й": "J", "К": "K", "Л": "L", "М": "M", "Н": "N", "О": "O",
      "П": "P", "Р": "R", "С": "S", "Т": "T", "У": "U", "Ф": "F", "Х": "H", "Ц": "C",
      "Ч": "Ch", "Ш": "Sh", "Щ": "Sh", "Ъ": "", "Ы": "Y", "Ь": "", "Э": "E", "Ю": "Yu",
      "Я": "Ya", "Є": "Ye", "І": "I", "Ї": "Yi", "Ґ": "G",
      "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "zh",
      "з": "z", "и": "i", "й": "j", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
      "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "c",
      "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
      "я": "ya", "є": "ye", "і": "i", "ї": "yi", "ґ": "g",
    };

    // Strip combining marks first (handles accented Latin / Greek / etc.)
    result = result.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Then transliterate remaining non-ASCII characters
    result = result.replace(/[^\u0000-\u007E]/g, (char) => charMap[char] || char);
  }

  // Ganti karakter non-huruf/angka dengan delimiter
  result = result.replace(/[^\p{L}\p{N}]+/gu, settings.delimiter);

  const escapedDelimiter = settings.delimiter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Hapus delimiter berulang
  result = result.replace(new RegExp(`(${escapedDelimiter}){2,}`, "g"), "$1");

  // Limit panjang
  if (settings.limit) {
    result = Array.from(result).slice(0, settings.limit).join("");
  }

  // Trim delimiter di awal & akhir
  result = result.replace(new RegExp(`^${escapedDelimiter}+|${escapedDelimiter}+$`, "g"), "");

  const finalSlug = settings.lowercase ? result.toLowerCase() : result;
  return finalSlug || "n-a";
}

export function siteUrl(path = "", base = "") {
  const cleanBase = (base || "").replace(/\/+$/, "");
  const cleanPath = (path || "").replace(/^\/+/, "");
  if (!cleanBase) return cleanPath ? `/${cleanPath}` : "/";
  return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
}

export function searchPermalink(query, base = "") {
  return siteUrl(`f/${slugify(query)}`, base);
}

/** Canonical detail URL: /e/{id} (tanpa slug judul) */
export function downloadPermalink(title, vid, base = "") {
  const id = String(vid || "").trim();
  return siteUrl(`e/${id}`, base);
}

export function downloadShort(vid, base = "") {
  return siteUrl(`e/${String(vid || "").trim()}`, base);
}

/** Kategori memakai path search /f/{slug} */
export function categoryPermalink(category, base = "") {
  return siteUrl(`f/${slugify(category)}`, base);
}

export function seoReplace(template, vars) {
  let out = template || "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`%${k}%`).join(String(v ?? ""));
  }
  return out;
}

export function formatBytes(n, precision = 1) {
  const num = Math.max(0, parseInt(n || 0, 10));
  if (num < 1024) return `${num} B`;
  if (num < 1048576) return `${(num / 1024).toFixed(precision).replace(/\.0$/, "")} KB`;
  if (num < 1073741824) return `${(num / 1048576).toFixed(precision).replace(/\.0$/, "")} MB`;
  return `${(num / 1073741824).toFixed(2)} GB`;
}

export function formatDuration(seconds) {
  const s = parseInt(seconds || 0, 10);
  if (isNaN(s) || s <= 0) return "00:00";
  const pad = (x) => String(x).padStart(2, "0");
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const rem = s % 3600;
    const m = Math.floor(rem / 60);
    const sec = rem % 60;
    return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  }
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${pad(m)}:${pad(sec)}`;
}

export function badwordRedirect(query, cfg, base = "") {
  const q = (query || "").toLowerCase().trim();
  if (!q) return null;
  const badwords = cfg.badwords || [];
  let hasBad = false;
  for (const bw of badwords) {
    const escaped = bw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(q)) {
      hasBad = true;
      break;
    }
  }
  if (!hasBad) return null;

  let words = q.split(/\s+/);
  const origLen = words.length;
  for (const bw of badwords) {
    const parts = bw.toLowerCase().split(/\s+/);
    words = words.filter((w) => !parts.includes(w));
  }
  if (words.length === 0) return siteUrl("", base);
  if (words.length !== origLen) return searchPermalink(words.join(" "), base);
  return null;
}

export function gibberishCheck(query) {
  const clean = (query || "").trim();
  if (clean.length > 80) return true;
  if (/[bcdfghjklmnpqrstvwxyz]{8,}/i.test(clean)) return true;
  return false;
}

export function dmcaBlocked(canonical, cfg) {
  const list = cfg.dmca_blocked_paths || [];
  const norm = (canonical || "").replace(/\/+$/, "");
  return list.some((u) => u.replace(/\/+$/, "") === norm);
}

export function getVideoCategory(title) {
  const t = (title || "").toLowerCase();
  const mapping = {
    tiktok: "TikTok",
    twitter: "Twitter",
    sma: "SMA",
    mahasiswa: "Mahasiswa",
    live: "Live",
    asupan: "Asupan",
    viral: "Viral",
    indo: "Indo",
    jepang: "Jepang",
    korea: "Korea",
    barat: "Barat",
  };
  for (const [kw, cat] of Object.entries(mapping)) {
    if (t.includes(kw)) return cat;
  }
  return "Viral";
}

export function getPaging(current, totalPages, baseUrl) {
  if (totalPages <= 1) return [];
  const items = [];
  const cleanBase = baseUrl.replace(/\/+$/, "");
  if (current > 1) {
    const prev = current - 1;
    const url = prev <= 1 ? baseUrl : `${cleanBase}/page/${prev}`;
    items.push({ label: "← Prev", url, active: false });
  }
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, current + 2);
  for (let i = start; i <= end; i++) {
    const url = i <= 1 ? baseUrl : `${cleanBase}/page/${i}`;
    items.push({ label: String(i), url, active: i === current });
  }
  if (current < totalPages) {
    items.push({ label: "Next →", url: `${cleanBase}/page/${current + 1}`, active: false });
  }
  return items;
}

/**
 * Mask external images via wsrv.nl (WebP, quality, responsive).
 * - Skips empty / data: / already-proxied URLs
 * - Default: webp, q=85, we (no upscale), sharp edge
 *
 * @param {string} url
 * @param {{ w?: number, h?: number, q?: number, fit?: string }} [opts]
 */
export function proxyImage(url, opts = {}) {
  if (!url || typeof url !== "string") return "";
  let src = url.trim();
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:")) return src;

  // Already going through wsrv / images.weserv
  if (/wsrv\.nl|images\.weserv\.nl/i.test(src)) return src;

  // Protocol-relative → https
  if (src.startsWith("//")) src = "https:" + src;
  // Bare host without scheme (rare)
  if (!/^https?:\/\//i.test(src)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(src)) src = "https://" + src;
    else return src; // relative / local — leave as-is
  }

  const w = opts.w > 0 ? Math.min(Math.floor(opts.w), 1920) : 0;
  const h = opts.h > 0 ? Math.min(Math.floor(opts.h), 1080) : 0;
  const q = opts.q > 0 ? Math.min(Math.max(Math.floor(opts.q), 40), 95) : 85;
  const fit = opts.fit || "";

  // wsrv.nl wants url without encoding issues; encodeURIComponent on full source
  const params = new URLSearchParams();
  params.set("url", src.replace(/^https?:\/\//i, ""));
  params.set("output", "webp");
  params.set("q", String(q));
  params.set("n", "-1");
  params.set("we", ""); // without enlargement
  if (w) params.set("w", String(w));
  if (h) params.set("h", String(h));
  if (fit) params.set("fit", fit);
  // mild sharpen for clearer thumbs after resize
  params.set("sharp", "1");

  // URLSearchParams encodes empty we as "we=" which wsrv accepts as flag
  return `https://wsrv.nl/?${params.toString()}`;
}

/** Common sizes */
export const IMG_CARD_MOBILE = { w: 320, q: 78 }; // mobile grid (~1x)
export const IMG_CARD = { w: 480, q: 82 }; // default card / tablet
export const IMG_CARD_2X = { w: 640, q: 80 }; // retina card
export const IMG_COVER_MOBILE = { w: 640, q: 80 }; // mobile detail cover
export const IMG_COVER = { w: 1280, q: 85 }; // desktop detail cover
export const IMG_COVER_MID = { w: 960, q: 82 }; // tablet detail
export const IMG_OG = { w: 1200, h: 630, q: 80, fit: "cover" }; // Open Graph

/**
 * Build srcset string from raw external URL (wsrv.nl variants).
 * @param {string} rawUrl
 * @param {number[]} widths e.g. [320, 480, 640]
 * @param {number} [q=80]
 */
export function proxySrcset(rawUrl, widths = [320, 480, 640], q = 80) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const src = rawUrl.trim();
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return "";
  const parts = [];
  for (const w of widths) {
    const u = proxyImage(src, { w, q });
    if (u) parts.push(`${u} ${w}w`);
  }
  return parts.join(", ");
}

export function enrichVideo(v, baseUrl) {
  const item = { ...v };
  const vid = item.id || item.file_code || "";
  const title = item.title || "";
  item.permalink = downloadPermalink(title, vid, baseUrl);
  item.short_permalink = downloadShort(vid, baseUrl);

  // Keep originals for srcset / OG
  const rawSplash = item.splash_img || "";
  const rawSingle = item.single_img || "";
  const rawThumb = item.thumb || item.thumbnail || "";
  const rawBest = rawSplash || rawSingle || rawThumb || "";

  item.splash_img_raw = rawSplash;
  item.single_img_raw = rawSingle;
  item.thumb_raw = rawThumb;
  item.image_raw = rawBest;

  // Default single URL (desktop/card) — mobile uses srcset from image_raw
  item.splash_img = proxyImage(rawSplash, IMG_COVER) || proxyImage(rawSingle, IMG_COVER) || "";
  item.single_img = proxyImage(rawSingle, IMG_CARD) || proxyImage(rawSplash, IMG_CARD) || "";
  item.thumb = proxyImage(rawThumb, IMG_CARD) || item.single_img || item.splash_img || "";

  // Prebuilt srcsets (optional consumers)
  item.card_srcset = proxySrcset(rawBest, [320, 480, 640], 80);
  item.cover_srcset = proxySrcset(rawBest, [640, 960, 1280], 82);

  return item;
}
