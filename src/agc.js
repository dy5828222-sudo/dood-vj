import { formatBytes, formatDuration } from "./helpers.js";

const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
];

function randomUA() {
  return UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
}

async function httpGet(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let referer = "https://doodapi.co/";
  try {
    const host = new URL(url).hostname || "";
    if (host.includes("lulu")) referer = "https://api.lulustream.com/";
  } catch {
    /* keep default */
  }
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/javascript, */*; q=0.01",
        "User-Agent": randomUA(),
        Referer: referer,
      },
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isSuccessfulApiStatus(status) {
  if (status === undefined || status === null || status === "") return true;
  const numericStatus = Number(status);
  if (Number.isFinite(numericStatus)) return numericStatus === 200;
  return ["ok", "active", "success"].includes(String(status).trim().toLowerCase());
}

function getInfoRecord(data, fileId) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (!isSuccessfulApiStatus(data.status)) return null;

  const result = data.result;
  const records = (Array.isArray(result) ? result : [result]).filter(
    (record) => record && typeof record === "object" && !Array.isArray(record)
  );
  const recordId = (record) =>
    String(record.file_code || record.filecode || record.id || "").trim();
  const recordsWithIds = records.filter((item) => recordId(item));
  const record =
    records.find((item) => recordId(item) === fileId) ||
    (recordsWithIds.length === 0 ? records[0] : null);

  if (!record || !isSuccessfulApiStatus(record.status)) return null;
  const returnedId = recordId(record);
  if (returnedId && returnedId !== fileId) return null;
  return record;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function nonNegativeInteger(value) {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function stringValue(value, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

/**
 * Relevance ringan — hindari Levenshtein di setiap kata (hemat CPU free tier).
 * Prioritas: full phrase > semua kata match > partial match > prefix.
 */
function quickRelevance(title, keywords) {
  if (!title || !keywords.length) return 0;
  const t = title.toLowerCase().trim();
  const full = keywords.join(" ");
  let score = 0;

  // Full phrase match (paling relevan)
  if (t.includes(full)) {
    score += 100;
    if (t.startsWith(full)) score += 40;
  }

  let matched = 0;
  for (const kw of keywords) {
    if (!kw || kw.length < 2) continue;
    if (t.includes(kw)) {
      // Kata lebih panjang = lebih spesifik = skor lebih tinggi
      score += 10 + Math.min(8, kw.length);
      matched++;
      if (t.startsWith(kw)) score += 6;
      // Word-boundary-ish boost (spasi di sekitar)
      if (new RegExp(`(?:^|\\s)${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`).test(t)) {
        score += 4;
      }
    }
  }

  // Semua kata kunci ada di judul
  if (matched === keywords.length && keywords.length > 1) score += 40;
  else if (matched >= Math.max(1, keywords.length - 1) && keywords.length > 1) score += 15;

  // Rasio coverage (0–1) * 20
  if (keywords.length > 0) {
    score += Math.round((matched / keywords.length) * 20);
  }

  return score;
}

export class AGC {
  constructor(cfg) {
    this.cfg = cfg;
    this.doodKey = String(cfg.dood_api_key || "");
    this.luluKey = String(cfg.lulu_api_key || "");
    this.timeout = cfg.api_timeout_ms || 8000;
    // Default lebih longgar: cukup untuk full + tiap kata + bigram, tetap dibatasi
    this.maxVariations = Math.min(8, Math.max(3, cfg.max_search_variations || 6));
  }

  cleanTitle(title) {
    if (!title) return this._fallbackTitle("empty");
    const original = String(title);
    let t = original;

    // Deteksi judul yang sudah pernah di-clean (title-case, hanya huruf+spasi, cukup panjang).
    // Jika sudah bersih, jangan tambah kata / bersihkan lagi — biar konsisten di Detail.
    const alreadyClean =
      /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(t.trim()) &&
      t.trim().split(/\s+/).length >= 4 &&
      t === t.replace(/\b\w/g, (c) => c.toUpperCase());

    if (alreadyClean) {
      const seen = new Set();
      const unique = [];
      for (const w of t.trim().split(/\s+/)) {
        const wl = w.toLowerCase();
        if (w && !seen.has(wl)) {
          // Pastikan Title Case: huruf pertama kapital, sisanya kecil
          unique.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
          seen.add(wl);
        }
      }
      return unique.slice(0, 12).join(" ");
    }

    // Normalisasi kata-kata sensitif
    t = t.replace(/\bbocah\s+sd\b/gi, "Remaja");
    t = t.replace(/\bbocil\b/gi, "Ucil");
    t = t.replace(/\bbocah\b/gi, "Remaja");
    t = t.replace(/\bsd\b/gi, "Esdeh");

    // Pisahkan camelCase, buang karakter non-huruf (angka & spesial hilang)
    t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
    t = t.replace(/[^a-zA-Z\s]/g, " ");
    t = t.replace(/\s+/g, " ").trim();

    // Title Case
    t = t
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ""))
      .filter(Boolean)
      .join(" ");

    let words = t ? t.split(/\s+/).filter(Boolean) : [];

    // Filter kata terlalu pendek / tidak bermakna
    const stopShort = new Set(["a", "i", "u", "e", "o", "yg"]);
    words = words.filter((w) => w.length > 1 && !stopShort.has(w.toLowerCase()));

    // Jika setelah dibersihkan kosong / terlalu sedikit kata → pakai fallback SEO kuat
    if (words.length === 0) {
      return this._fallbackTitle(original);
    }

    // Minimal 5–7 kata agar SEO lebih bagus. Padding deterministik.
    const minWords = 6;
    if (words.length < minWords) {
      const need = minWords - words.length;
      words = words.concat(this._seoWords(need, original));
    }

    // Dedupe + batasi panjang + pastikan Title Case konsisten
    const seen = new Set();
    const unique = [];
    for (const w of words) {
      const wl = w.toLowerCase();
      if (w && !seen.has(wl)) {
        unique.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
        seen.add(wl);
      }
    }
    return unique.slice(0, 12).join(" ");
  }

  /**
   * Judul fallback kuat untuk kasus: hanya angka, hanya karakter spesial, atau kosong setelah clean.
   * Hasil selalu sama untuk input yang sama (deterministik).
   */
  _fallbackTitle(seed = "") {
    // Ambil 6–8 kata SEO yang berbeda-beda berdasarkan seed
    const base = this._seoWords(8, seed || "video");
    // Pastikan selalu diawali kata yang kuat
    const prefix = ["Video", "Viral", "Streaming"];
    const combined = [...prefix, ...base];
    const seen = new Set();
    const unique = [];
    for (const w of combined) {
      const wl = w.toLowerCase();
      if (w && !seen.has(wl)) {
        unique.push(w[0].toUpperCase() + w.slice(1).toLowerCase());
        seen.add(wl);
      }
    }
    return unique.slice(0, 8).join(" ");
  }

  /**
   * Pilih kata SEO secara deterministik berdasarkan seed.
   * Input yang sama → output yang sama → title & slug Detail tetap konsisten.
   */
  _seoWords(count = 5, seed = "") {
    // Pool kata SEO yang relevan (single word biar rapi saat di-join)
    const pool = [
      "Viral", "TikTok", "Streaming", "Full Hd", "Lulustream", "Terbaru",
      "Indo", "Simontok", "Doodstream", "Lulustream", "Asupan",
      "Video", "Nonton", "Trending", "Sotwe", "Nonton", "Gratis",
      "Update", "Baru", "Populer", "Fyp", "Skandal", "Dood",
      "Premium", "Videy", "No Sensor", "Durasi Panjang", "Full Album", "Quality",
    ];
    if (count <= 0) return [];

    // FNV-1a style hash dari seed
    let h = 2166136261;
    const s = String(seed || "default");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h = h >>> 0;

    // Urutkan pool secara stabil berdasarkan hash(word + seed)
    const scored = pool.map((w, idx) => {
      let wh = h;
      for (let i = 0; i < w.length; i++) {
        wh ^= w.charCodeAt(i);
        wh = Math.imul(wh, 16777619);
      }
      wh = (wh + idx * 2654435761) >>> 0;
      return { w, score: wh };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, Math.max(0, count)).map((x) => x.w);
  }

  /**
   * Bangun daftar query paralel:
   * 1) full phrase (paling relevan)
   * 2) setiap kata kunci tunggal (supaya hasil lebih banyak)
   * 3) bigram berurutan (konteks 2 kata)
   * Hasil di-dedupe + dibatasi maxVariations agar tetap hemat subrequest.
   */
  _buildQueryVariations(terms) {
    const variations = [];
    const full = terms.join(" ").trim();
    if (full) variations.push(full);

    // Tiap kata kunci dicari sendiri (paralel) — prioritas hasil banyak
    for (const t of terms) {
      if (t && t.length >= 2) variations.push(t);
    }

    // Bigram berurutan untuk menjaga relevansi multi-kata
    for (let i = 0; i < terms.length - 1; i++) {
      const bi = `${terms[i]} ${terms[i + 1]}`.trim();
      if (bi) variations.push(bi);
    }

    // Trigram pertama jika query panjang
    if (terms.length >= 3) {
      variations.push(`${terms[0]} ${terms[1]} ${terms[2]}`.trim());
    }

    const unique = [...new Set(variations.filter(Boolean))];
    // Full phrase selalu di posisi pertama; sisanya sampai maxVariations
    const max = Math.max(this.maxVariations, Math.min(8, terms.length + 2));
    return unique.slice(0, max);
  }

  _removeDuplicateTitles(items) {
    const seen = new Set();
    const unique = [];
    for (const item of items) {
      const t = (item.title || "").toLowerCase().trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      unique.push(item);
    }
    return unique;
  }

  async search(query = "", page = 1) {
    const cleanQuery = (query || "").trim();
    if (!cleanQuery) {
      return { items: [], total: 0, total_pages: 0, page, query: "" };
    }
    const p = Math.max(1, parseInt(page || 1, 10));
    const perPage = this.cfg.search_per_page || 24;
    const normalized = cleanQuery.toLowerCase();
    const terms = normalized.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return { items: [], total: 0, total_pages: 0, page: p, query: cleanQuery };
    }

    const variations = this._buildQueryVariations(terms);
    const urls = variations.map(
      (t) =>
        `https://doodapi.co/api/search/videos?key=${this.doodKey}&search_term=${encodeURIComponent(t)}`
    );

    // Semua kata kunci / variasi dicari secara paralel
    const responses = await Promise.all(urls.map((u) => httpGet(u, this.timeout)));
    const rawPool = new Map();

    // Minimal score: minimal 1 kata kunci harus match di judul
    // (single-term query: score biasanya >= 12)
    const minScore = terms.length === 1 ? 1 : 12;

    for (const data of responses) {
      if (!data || !Array.isArray(data.result)) continue;
      for (const item of data.result) {
        const fid = String(item.file_code || "").trim();
        if (!fid || rawPool.has(fid)) continue;
        const rawTitle = String(item.title || item.file_title || "").trim();
        const title = this.cleanTitle(rawTitle);
        const relevance = quickRelevance(title, terms);
        // Buang hasil yang tidak relevan sama sekali
        if (relevance < minScore) continue;

        const lengthRaw = item.length || item.file_length || 0;
        const uploaded = item.uploaded || "";
        const ts = uploaded ? Math.floor(new Date(uploaded).getTime() / 1000) || 0 : 0;

        rawPool.set(fid, {
          id: fid,
          file_code: fid,
          title,
          raw_title: rawTitle,
          duration: formatDuration(lengthRaw),
          length: formatDuration(lengthRaw),
          size: item.size ? formatBytes(parseInt(item.size, 10)) : "",
          views: String(item.views || "0"),
          thumb: item.single_img || item.splash_img || "",
          single_img: item.single_img || "",
          uploaded,
          uploaded_timestamp: ts,
          relevance,
          channel: "DoodStream",
          api_source: "DoodStream",
        });
      }
    }

    let allItems = this._removeDuplicateTitles(Array.from(rawPool.values()));
    // Sort: relevansi tertinggi dulu, lalu terbaru
    allItems.sort((a, b) => {
      if (b.relevance !== a.relevance) return b.relevance - a.relevance;
      return b.uploaded_timestamp - a.uploaded_timestamp;
    });

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage) || 1);
    const offset = (p - 1) * perPage;
    const pageItems = allItems.slice(offset, offset + perPage);

    return {
      items: pageItems,
      total,
      total_pages: totalPages,
      page: p,
      query: cleanQuery,
      variations, // debug / opsional: query yang di-hit paralel
    };
  }

  async getVideo(id = "") {
    const fid = String(id || "").trim();
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(fid)) return null;
    const dood = await this._fetchDood(fid);
    if (dood) return dood;
    return this._fetchLulu(fid);
  }

  async _fetchDood(fid) {
    if (!this.doodKey) return null;
    const params = new URLSearchParams({ key: this.doodKey, file_code: fid });
    const url = `https://doodapi.co/api/file/info?${params}`;
    const data = await httpGet(url, this.timeout);
    const item = getInfoRecord(data, fid);
    if (!item) return null;
    const rawTitle = firstString(item.title, item.file_title);
    if (!rawTitle) return null;
    const title = this.cleanTitle(rawTitle);
    const length = nonNegativeInteger(item.length ?? item.file_length);
    const size = nonNegativeInteger(item.size ?? item.file_size);
    const views = item.views ?? item.file_views;
    const singleImg = firstString(item.single_img);
    const splashImg = firstString(item.splash_img, singleImg);
    return {
      id: fid,
      file_code: fid,
      title,
      raw_title: rawTitle,
      duration: formatDuration(length),
      length: formatDuration(length),
      size: size ? formatBytes(size) : "",
      views: stringValue(views, "0"),
      thumb: singleImg || splashImg,
      single_img: singleImg,
      splash_img: splashImg,
      embed: `https://dodl.pages.dev/${fid}`,
      protected_embed: `https://dodl.pages.dev/${fid}`,
      download: `https://doodstream.com/d/${fid}`,
      protected_dl: `https://doodstream.com/d/${fid}`,
      watch_url: `https://dodl.pages.dev/${fid}`,
      download_url: `https://doodstream.com/d/${fid}`,
      api_source: "DoodStream",
      channel: "DoodStream",
      uploaded: item.uploaded || "",
    };
  }

  async _fetchLulu(fid) {
    if (!this.luluKey) return null;
    const params = new URLSearchParams({ key: this.luluKey, file_code: fid });
    const url = `https://api.lulustream.com/api/file/info?${params}`;
    const data = await httpGet(url, this.timeout);
    const item = getInfoRecord(data, fid);
    if (!item) return null;
    const rawTitle = firstString(item.file_title, item.title);
    if (!rawTitle) return null;
    const title = this.cleanTitle(rawTitle);
    const length = nonNegativeInteger(item.file_length ?? item.length);
    const size = nonNegativeInteger(item.file_size ?? item.size);
    const views = item.file_views ?? item.views;
    const playerImg = firstString(item.player_img, item.single_img);
    const splashImg = firstString(item.splash_img, playerImg);
    return {
      id: fid,
      file_code: fid,
      title,
      raw_title: rawTitle,
      duration: formatDuration(length),
      length: formatDuration(length),
      size: size ? formatBytes(size) : "",
      views: stringValue(views, "0"),
      thumb: playerImg || splashImg,
      single_img: playerImg,
      splash_img: splashImg,
      embed: `https://luvluv.pages.dev/${fid}`,
      protected_embed: `https://luvluv.pages.dev/${fid}`,
      download: `https://lulustream.com/d/${fid}`,
      protected_dl: `https://lulustream.com/d/${fid}`,
      watch_url: `https://luvluv.pages.dev/${fid}`,
      download_url: `https://lulustream.com/d/${fid}`,
      api_source: "lulustream",
      channel: "lulustream",
      uploaded: item.file_created || "",
    };
  }

  /**
   * Video terkait berdasarkan judul yang sedang diputar.
   * - Pakai 2 kata pertama judul sebagai keyword pencarian
   * - Maksimal `limit` (default 30)
   * - Jika hasil search < limit, lengkapi dengan latestVideos
   */
  async related(title, excludeId = "", limit = 30) {
    const max = Math.min(30, Math.max(1, limit || 30));
    const exclude = String(excludeId || "").trim();
    const seen = new Set(exclude ? [exclude] : []);
    const result = [];

    // 1. Keyword = 2 kata pertama dari judul
    const words = (title || "")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const keyword = words.slice(0, 2).join(" ").trim();

    // 2. Cari video relevan
    if (keyword) {
      try {
        const res = await this.search(keyword, 1);
        for (const v of res.items || []) {
          const id = String(v.id || v.file_code || "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          result.push(v);
          if (result.length >= max) return result.slice(0, max);
        }
      } catch {
        // lanjut ke fallback
      }
    }

    // 3. Jika masih kurang, isi dengan latestVideos
    if (result.length < max) {
      try {
        const need = max - result.length;
        // Ambil lebih banyak sedikit untuk antisipasi duplikat
        const latest = await this.latestVideos(1, Math.min(50, need + 10));
        for (const v of latest || []) {
          const id = String(v.id || v.file_code || "").trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          result.push(v);
          if (result.length >= max) break;
        }
      } catch {
        // biarkan hasil seadanya
      }
    }

    return result.slice(0, max);
  }

  /**
   * Normalisasi item dari Dood / Lulu ke format seragam.
   */
  _normalizeListItem(f, source = "doodapi") {
    const fid = String(f.file_code || f.filecode || f.id || "").trim();
    if (!fid) return null;

    const raw =
      f.title || f.file_title || f.file_name || f.name || "Video";
    const lengthRaw = f.length || f.file_length || f.duration || 0;
    const sizeRaw = f.size || f.file_size || 0;
    const views = f.views || f.file_views || f.viewed || "0";
    const thumb =
      f.single_img ||
      f.splash_img ||
      f.player_img ||
      f.thumbnail ||
      f.thumb ||
      "";

    const isLulu = source === "lulustream";
    return {
      id: fid,
      file_code: fid,
      title: this.cleanTitle(raw),
      raw_title: String(raw).trim(),
      duration: formatDuration(lengthRaw),
      length: formatDuration(lengthRaw),
      size: sizeRaw ? formatBytes(parseInt(sizeRaw, 10) || 0) : "",
      views: String(views || "0"),
      thumb,
      single_img: f.single_img || thumb,
      splash_img: f.splash_img || f.player_img || thumb,
      uploaded: f.uploaded || f.file_created || f.created || "",
      api_source: source,
      channel: isLulu ? "LuluStream" : "DoodStream",
      // URL konsisten dengan getVideo / _fetchDood / _fetchLulu
      embed: isLulu
        ? `https://luvluv.pages.dev/${fid}`
        : `https://dodl.pages.dev/${fid}`,
      protected_embed: isLulu
        ? `https://luvluv.pages.dev/${fid}`
        : `https://dodl.pages.dev/${fid}`,
      download: isLulu
        ? `https://lulustream.com/d/${fid}`
        : `https://doodstream.com/d/${fid}`,
      protected_dl: isLulu
        ? `https://lulustream.com/d/${fid}`
        : `https://doodstream.com/d/${fid}`,
      watch_url: isLulu
        ? `https://luvluv.pages.dev/${fid}`
        : `https://dodl.pages.dev/${fid}`,
      download_url: isLulu
        ? `https://lulustream.com/d/${fid}`
        : `https://doodstream.com/d/${fid}`,
    };
  }

  _extractFiles(data) {
    if (!data) return [];
    if (data.result && Array.isArray(data.result.files)) return data.result.files;
    if (Array.isArray(data.result)) return data.result;
    if (Array.isArray(data.files)) return data.files;
    if (Array.isArray(data)) return data;
    return [];
  }

  /**
   * Latest videos dari Dood + Lulu (paralel), dinormalisasi ke format sama.
   */
  async latestVideos(page = 1, perPage = 20) {
    const p = Math.max(1, parseInt(page || 1, 10) || 1);
    const pp = Math.min(50, Math.max(1, parseInt(perPage || 20, 10) || 20));

    const doodUrl = `https://doodapi.co/api/file/list?key=${this.doodKey}&page=${p}&per_page=${pp}`;
    const luluUrl = `https://api.lulustream.com/api/file/list?key=${this.luluKey}&page=${p}&per_page=${pp}`;

    const [doodData, luluData] = await Promise.all([
      httpGet(doodUrl, this.timeout),
      httpGet(luluUrl, this.timeout),
    ]);

    const seen = new Set();
    const items = [];

    for (const f of this._extractFiles(doodData)) {
      const item = this._normalizeListItem(f, "doodapi");
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    for (const f of this._extractFiles(luluData)) {
      const item = this._normalizeListItem(f, "lulustream");
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }

    return items;
  }

  /**
   * 15 (atau limit) data video terakhir dari Dood + Lulu.
   * Dipakai saat halaman diakses (beranda / API).
   */
  async recentVideos(limit = 15) {
    const max = Math.min(30, Math.max(1, parseInt(limit || 15, 10) || 15));
    // Ambil sedikit lebih banyak dari API agar setelah dedupe tetap cukup
    const pool = await this.latestVideos(1, Math.min(50, max + 15));
    return (pool || []).slice(0, max);
  }

  async getRandomPage() {
    // Halaman acak terbatas (1–20) agar tidak terlalu random & lebih cache-friendly
    const randPage = Math.floor(Math.random() * 20) + 1;
    return this.latestVideos(randPage, this.cfg.per_page || 20);
  }
}
