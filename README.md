# Ultra MAX

> The ultimate self-hosted catalog addon for Stremio & Nuvio.

**ultramax.vip** · [Setup](https://ultramax.vip/setup.html) · [Quick Install](https://ultramax.vip/quick.html) · [Ko-fi](https://ko-fi.com/ultramaxaddon)

---

## What is Ultra MAX?

Ultra MAX is a free, self-hosted Stremio and Nuvio addon that gives you a fully customisable home screen with 240+ curated catalog rows — streaming services, genres, film collections, actors, directors, decades, studios, networks, anime, awards and more.

It's not a stream source. It's a discovery layer — beautiful, fast, and completely yours.

---

## Features

- **240+ catalog rows** — streaming services, genres, networks, film collections, actors, directors, decades, studios, anime, awards and themed lists
- **Quick Install** — pick your collections, download a JSON, import into Nuvio in 30 seconds. No API keys needed.
- **Full setup wizard** — 4-step configure page with auto-save, asset library and stream bridge
- **Nuvio Collections** — full support for cover images, focus GIFs and hero backdrops
- **Trakt integration** — sync your watchlist, favourites and collection
- **RPDB support** — rated poster images via your RPDB key
- **Multi-language** — 10 languages supported
- **Adult content filtering** — off by default, with per-user max age rating
- **Stream Bridge** — connect AIOStreams, Comet, StremThru or any Stremio stream addon
- **Live TV companion** — Ultra MAX TV addon with 560+ channels across 10 countries
- **Music companion** — MaxMusic addon with artist pages, albums and Last.fm discovery
- **Self-hosted images** — 1,300+ collection images served from our own server

---

## Quick Start

### Option 1 — Quick Install (Nuvio, 30 seconds)

1. Go to **[ultramax.vip/quick](https://ultramax.vip/quick)**
2. Pick which collections you want
3. Download the JSON file
4. Import into Nuvio → Collections

No account, no API keys, no configuration required.

### Option 2 — Full Setup

1. Go to **[ultramax.vip/setup](https://ultramax.vip/setup.html)**
2. Configure your catalogs, Trakt, RPDB, language and stream source
3. Generate your manifest URL
4. Install in Stremio or Nuvio

---

## Self-Hosting

### Requirements

- Node.js 18+
- Docker & Docker Compose (recommended)

### Docker (recommended)

```bash
git clone https://github.com/PaRaN01a-hash/stremio-catalog-addon
cd stremio-catalog-addon
cp .env.example .env
# Edit .env with your API keys
docker compose up -d
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_KEY` | Yes | TMDB API key from themoviedb.org |
| `MDBLIST_KEY` | No | MDBList API key for enhanced lists |
| `TRAKT_CLIENT_ID` | No | Trakt API key for Trakt catalogs |
| `RPDB_KEY` | No | RPDB key for rated posters |

### Manual (Node.js)

```bash
npm install
node index.js
```

The addon runs on port 7000 by default. Access the configure page at `http://localhost:7000/configure`.

---

## Companion Addons

| Addon | URL | Description |
|-------|-----|-------------|
| Ultra MAX TV | [tv.ultramax.vip](https://tv.ultramax.vip/manifest.json) | 560+ live TV channels, 10 countries |
| MaxMusic | [music.maxstreams.opik.net](https://music.maxstreams.opik.net/manifest.json) | Music videos, artist pages, Last.fm |

---

## Stream Sources (Hosted)

These are community-accessible stream addons hosted alongside Ultra MAX:

| Service | URL | Description |
|---------|-----|-------------|
| Ultra MAX Comet | [comet.maxbase.kozow.com](https://comet.maxbase.kozow.com) | Torrent/debrid search — bring your own key |
| AIOStreams | [streams.maxbase.kozow.com](https://streams.maxbase.kozow.com) | All-in-one stream aggregator |
| StremThru | [stremthru.maxbase.kozow.com](https://stremthru.maxbase.kozow.com) | Debrid proxy |

---

## Architecture

```
ultramax.vip
├── Landing page (nginx + Node.js)
├── /setup.html — Configure wizard
├── /quick.html — Quick Install collections picker
├── /assets — Image asset library
├── /c/:token/manifest.json — User manifests
├── /c/:token/catalog/:type/:id — Catalog routes
└── /images/ — Self-hosted collection images (1,300+)

Companion services
├── tv.ultramax.vip — Ultra MAX TV (IPTV-org sourced)
├── music.maxstreams.opik.net — MaxMusic
├── comet.maxbase.kozow.com — Ultra MAX Comet
├── streams.maxbase.kozow.com — AIOStreams
└── stremthru.maxbase.kozow.com — StremThru
```

---

## Links

- 🌐 **Home** — [ultramax.vip](https://ultramax.vip)
- ⚙️ **Setup** — [ultramax.vip/setup](https://ultramax.vip/setup.html)
- ⚡ **Quick Install** — [ultramax.vip/quick](https://ultramax.vip/quick.html)
- 📺 **TV** — [ultramax.vip/tv](https://ultramax.vip/tv.html)
- 🎵 **Music** — [ultramax.vip/music](https://ultramax.vip/music.html)
- 📋 **Changelog** — [ultramax.vip/changelog](https://ultramax.vip/changelog.html)
- 🟢 **Status** — [ultramax.vip/status](https://ultramax.vip/status.html)
- 💬 **Community** — [r/Ultra_Max](https://reddit.com/r/Ultra_Max)
- ☕ **Support** — [ko-fi.com/ultramaxaddon](https://ko-fi.com/ultramaxaddon)

---

## Contributing

Ultra MAX is solo-developed. Bug reports and suggestions welcome via [r/Ultra_Max](https://reddit.com/r/Ultra_Max).

---

## License

MIT
