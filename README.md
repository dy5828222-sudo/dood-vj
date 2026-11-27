# AGC HTML Site — Optimized for Cloudflare Pages (Free Tier)

Versi HTML + optimasi trafik: Edge Cache, Stale-While-Revalidate, KV opsional, beban CPU lebih ringan.

## Fitur Optimasi Trafik

| Fitur | Keterangan |
|-------|------------|
| **Edge Cache** | `caches.default` + cache key stabil |
| **SWR** | `stale-while-revalidate` — user tetap dapat response saat refresh |
| **KV Cache** | Opsional binding `AGC2_CACHE` — cache global search/detail/list |
| **Fallback error** | Jika API luar error, serve stale dari edge cache |
| **Subrequest hemat** | Max 3 search variation, Dood dulu baru Lulu |
| **CPU hemat** | Relevance tanpa Levenshtein berat |
| **TTL panjang** | List 6j, Search 24j, Video 7 hari (+ SWR lebih lama) |

## Struktur
```
├── _worker.js
├── src/
│   ├── agc.js
│   ├── cache.js      # Edge + KV helpers
│   ├── config.js
│   └── helpers.js
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

## Environment Variables (opsional)

| Variable | Default | Keterangan |
|----------|---------|------------|
| `SITE_NAME` | Simontok 2026 | Nama situs |
| `API_ACCESS_KEY` | (kosong) | Kunci akses |
| `DOOD_API_KEY` | (kosong) | API Doodstream — set sebagai secret |
| `LULU_API_KEY` | (kosong) | API Lulustream — set sebagai secret |
| `CACHE_LIST` | 21600 | TTL list (detik) |
| `CACHE_SEARCH` | 86400 | TTL search |
| `CACHE_VIDEO` | 604800 | TTL detail video |
| `PER_PAGE` | 20 | Item per halaman |
| `MAX_SEARCH_VARIATIONS` | 3 | Max parallel search query |
| `API_TIMEOUT_MS` | 8000 | Timeout fetch API luar |

## Tips Free Tier

1. Aktifkan **Bot Fight Mode** (Security → Bots) — gratis
2. Bind **KV** seperti di atas
3. Jangan set `PER_PAGE` terlalu besar (≤ 24)
4. Cek `/api/stats` → `"kv_enabled": true` jika KV sudah terhubung
5. Purge cache manual hanya jika perlu (Dashboard → Caching)

## Endpoint

| Path | Output |
|------|--------|
| `/` | HTML beranda |
| `/f/{query}` | HTML search |
| `/e/{id}` | HTML detail (URL lama `/e/{slug}-{id}` di-301) |
| `/categories` | Daftar kategori (item → `/f/{slug}`)
| `/f/{query}` | Search / kategori |
| `/ajax/suggest?q=` | JSON |
| `/api/stats` | JSON status |
| `/sitemap.xml` | XML |
