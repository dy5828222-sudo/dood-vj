export function getConfig(env) {
  return {
    site_name: env.SITE_NAME || "Simontok 2026",
    site_tagline: env.SITE_TAGLINE || "Streaming Video Viral Indo TikTok Download Link",
    language: env.LANGUAGE || "id",
    // Canonical site origin (opsional). Isi di Codespaces/prod agar permalink tidak localhost.
    // Contoh: SITE_URL=https://stunning-orbit-6v594r4qpwqf7pv-8788.app.github.dev
    site_url: (env.SITE_URL || env.BASE_URL || "").replace(/\/+$/, ""),
    base_url: (env.SITE_URL || env.BASE_URL || "").replace(/\/+$/, ""),

    home_title: "%site_name% - Kumpulan Video Viral Durasi Panjang Full HD",
    home_description: "%site_name% kumpulan video viral Indo durasi panjang Full HD. Nonton mudah, sekali play langsung jalan.",
    home_robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",

    search_title: "Kumpulan %total% Video %query% | %site_name%",
    search_description: "Nonton dan download %total% kumpulan video %query% viral gratis terbaru. Kualitas Full HD terbaik.",
    search_robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    fafifu_search: "Nonton %total% Video Indonesia Viral Terbaru di %site_name%. Anda dapat menonton dan mengunduh kumpulan video %query% viral secara gratis dengan mudah dan cepat di %domain%.",

    download_title: "Video %title% Viral %size% | %site_name%",
    download_description: "Nonton dan download video viral %title% MP4 gratis. Ukuran %size%, durasi %duration% di %domain%.",
    download_robots: "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    fafifu_download: "Unduh atau nonton streaming video %title% gratis dalam format MP4 dengan resolusi terbaik di %domain%.",

    search_page_title: "Kumpulan %total% Video %query% Viral Terbaru",
    download_page_title: "Video %title% Lagi Viral",

    api_access_key: env.API_ACCESS_KEY || "",
    allowed_origin: env.ALLOWED_ORIGIN || "*",
    dood_api_key: env.DOOD_API_KEY || "",
    lulu_api_key: env.LULU_API_KEY || "",

    // TTL edge cache (detik) — lebih panjang untuk free tier
    // max-age = fresh period, swr = stale-while-revalidate
    cache_list: parseInt(env.CACHE_LIST || "21600", 10),        // 6 jam
    cache_list_swr: parseInt(env.CACHE_LIST_SWR || "86400", 10), // +24 jam stale
    cache_search: parseInt(env.CACHE_SEARCH || "86400", 10),      // 24 jam
    cache_search_swr: parseInt(env.CACHE_SEARCH_SWR || "604800", 10), // +7 hari stale
    cache_video: parseInt(env.CACHE_VIDEO || "604800", 10),        // 7 hari
    cache_video_swr: parseInt(env.CACHE_VIDEO_SWR || "2592000", 10), // +30 hari stale

    // KV TTL (detik) — data JSON di KV, lebih tahan daripada edge cache saja
    kv_ttl_list: parseInt(env.KV_TTL_LIST || "21600", 10),
    kv_ttl_search: parseInt(env.KV_TTL_SEARCH || "86400", 10),
    kv_ttl_video: parseInt(env.KV_TTL_VIDEO || "604800", 10),

    per_page: Math.min(30, Math.max(5, parseInt(env.PER_PAGE || "20", 10))),
    search_per_page: Math.min(50, Math.max(10, parseInt(env.SEARCH_PER_PAGE || "50", 10))),

    // Batasi parallel fetch ke API luar (hemat subrequest + CPU)
    max_search_variations: parseInt(env.MAX_SEARCH_VARIATIONS || "6", 10),
    api_timeout_ms: parseInt(env.API_TIMEOUT_MS || "8000", 10),

    badwords: ["bocah", "bocil", "anak kecil", "underage", "cp"],
    dmca_blocked_paths: [],
  };
}
