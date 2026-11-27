# AGC HTML Site — Optimized for Cloudflare Pages (Free Tier)

Versi HTML + optimasi trafik: Edge Cache, Stale-While-Revalidate, KV opsional, beban CPU lebih ringan.

## Fitur Optimasi Trafik

| Fitur | Keterangan |
|-------|------------|
| **Edge Cache** | `caches.default` + cache key stabil |
| **SWR** | `stale-while-revalidate` — user tetap dapat response saat refresh |
| **KV Cache** | Opsional binding `AGC2_CACHE` — cache global search/detail/list |
| **Fallback error** | Jika API luar error, serve stale dari edge cache |
| **Search hemat** | Hingga 8 variasi query dijalankan paralel (default 6) |
| **Fallback provider** | Detail video mencoba DoodStream, lalu LuluStream jika tidak ditemukan |
| **CPU hemat** | Relevance tanpa Levenshtein berat |
| **TTL panjang** | List 6j, Search 24j, Video 7 hari (+ SWR lebih lama) |

## Struktur
```
├── _worker.js
├── src/
│   ├── agc.js
│   ├── assets.js
│   ├── cache.js      # Edge + KV helpers
│   ├── config.js
│   ├── helpers.js
│   └── html.js
└── README.md
```

## Deploy cepat (Wrangler)

```bash
npx wrangler login
npx wrangler pages deploy . --project-name=agc-html
```

## Aktifkan KV (sangat disarankan untuk trafik besar)

1. Dashboard Cloudflare → **Workers & Pages** → **KV** → Create namespace, misal `AGC2_CACHE`
2. Buka project Pages → **Settings** → **Functions** → **KV namespace bindings**
3. Tambah binding:
   - Variable name: `AGC2_CACHE`
   - KV namespace: `AGC2_CACHE` (namespace yang sudah dibuat)
4. **Retry deployment**

Tanpa KV pun tetap jalan (hanya Edge Cache). Dengan KV, cache search/detail bertahan lintas PoP dan lebih tahan spike.

## Environment Variables

| Variable | Default | Keterangan |
|----------|---------|------------|
| `SITE_NAME` | wajib diisi | Nama situs |
| `SITE_TAGLINE` | wajib diisi | Tagline situs |
| `LANGUAGE` | `id` | Bahasa untuk metadata dan saran pencarian |
| `SITE_URL` | (kosong) | URL kanonis; jika kosong, gunakan `BASE_URL` |
| `BASE_URL` | (kosong) | Fallback URL kanonis |
| `API_ACCESS_KEY` | (kosong) | Kunci akses opsional |
| `ALLOWED_ORIGIN` | `*` | Origin CORS yang diizinkan |
| `DOOD_API_KEY` | (kosong) | API DoodStream — simpan sebagai secret |
| `LULU_API_KEY` | (kosong) | API LuluStream — simpan sebagai secret |
| `CACHE_LIST` | `21600` | TTL cache daftar (detik) |
| `CACHE_LIST_SWR` | `86400` | Stale-while-revalidate daftar (detik) |
| `CACHE_SEARCH` | `86400` | TTL cache pencarian (detik) |
| `CACHE_SEARCH_SWR` | `604800` | Stale-while-revalidate pencarian (detik) |
| `CACHE_VIDEO` | `604800` | TTL cache detail video (detik) |
| `CACHE_VIDEO_SWR` | `2592000` | Stale-while-revalidate detail video (detik) |
| `KV_TTL_LIST` | `21600` | TTL daftar di KV (detik) |
| `KV_TTL_SEARCH` | `86400` | TTL pencarian di KV (detik) |
| `KV_TTL_VIDEO` | `604800` | TTL detail video di KV (detik) |
| `PER_PAGE` | `20` | Item per halaman; dibatasi 5–30 |
| `SEARCH_PER_PAGE` | `50` | Hasil pencarian per halaman; dibatasi 10–50 |
| `MAX_SEARCH_VARIATIONS` | `6` | Jumlah variasi pencarian; maksimal 8 |
| `API_TIMEOUT_MS` | `8000` | Timeout request ke API luar (ms) |

Atur `SITE_NAME` dan `SITE_TAGLINE` di `.env` untuk development lokal, lalu jalankan `npx wrangler pages dev .`:

```env
SITE_NAME=Nama situs
SITE_TAGLINE=Tagline situs
SITE_URL=https://example.com
# Alternatif SITE_URL jika memakai nama variabel ini:
# BASE_URL=https://example.com
DOOD_API_KEY=isi_kredensial_dood
LULU_API_KEY=isi_kredensial_lulu
```

Wrangler memuat `.env` untuk development lokal. `SITE_URL` dipakai lebih dahulu; `BASE_URL` menjadi fallback. Untuk production, atur nilai konfigurasi di Cloudflare Pages → Settings → Variables and Secrets, dan simpan API key sebagai **Secrets**. File `.env` lokal tidak mengatur production. Jangan commit file `.env`.

## Tips Free Tier

1. Aktifkan **Bot Fight Mode** (Security → Bots) — gratis
2. Bind **KV** seperti di atas
3. Jangan set `PER_PAGE` terlalu besar (≤ 24)
4. Cek `/api/stats` → `"kv_enabled": true` jika KV sudah terhubung
5. Purge cache manual hanya jika perlu (Dashboard → Caching)

## Endpoint

| Path | Output |
|------|--------|
| `/` atau `/page/{n}` | HTML beranda dan paginasi |
| `/f/{query}` | HTML hasil pencarian/kategori |
| `/search?q={query}` | URL pencarian lama; diarahkan ke `/f/{query}` |
| `/e/{id}` | HTML detail; URL lama `/e/{slug}-{id}` diarahkan ke format ini |
| `/categories` | Daftar kategori |
| `/ajax/suggest?q={query}` | JSON saran pencarian |
| `/api/latest?limit={n}` | JSON video terbaru (maksimal 30) |
| `/api/stats` | JSON status worker dan cache |
| `/sitemap.xml` | Index sitemap XML |
| `/sitemap/pages.xml` | Sitemap halaman |
| `/sitemap/searches.xml` | Sitemap pencarian |
| `/tos`, `/disclaimer` | Halaman ketentuan layanan dan disclaimer |
