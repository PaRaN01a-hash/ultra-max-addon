# Ultra MAX

A free, customisable catalog addon for Stremio/Nuvio with 140+ curated catalogs.

Browse trending movies, the latest from every major streaming service, curated genre lists, themed collections, and much more — all without leaving Stremio or Nuvio.

---

## Get Started

### Option 1 — Build Your Own (Recommended)

Personalise your experience by choosing exactly which catalogs appear on your home screen and in what order.

**[max-streams.gleeze.com](https://max-streams.gleeze.com)**

1. Grab a free MDBList API key at [mdblist.com](https://mdblist.com/api) — takes 30 seconds
2. Go to the configure page and pick your catalogs
3. Generate your manifest and install in Stremio/Nuvio

### Option 2 — Quick Install

| Version | Install |
|---------|---------|
| Filtered (no anime/Bollywood) | `https://max-streams.gleeze.com/manifest.json` |
| All content | `https://max-streams-all.gleeze.com/manifest.json` |

---

## What's Included

| Category | Catalogs |
|----------|----------|
| 🔥 Trending & Popular | Trending, Popular, Top Rated, Trakt charts, IMDb Moviemeter |
| 🆕 New & Latest | Latest releases, Blu-ray drops, what's new on each streaming service |
| 📺 Streaming Services | Netflix, Amazon, Disney+, HBO, Apple TV+, Paramount+, Peacock, Hulu, MGM+, Acorn, Shudder, BritBox, ITVX, Channel 4, Crunchyroll, Hidive |
| 🎭 Genres | Action, Comedy, Horror, Sci-Fi, Thriller, Crime, Drama, Romance, Mystery, Fantasy, Family, Animated, Documentary and more |
| 🎬 Themed & Curated | Mindfuck, Plot Twists, Outer Space, Time Travel, Horror Classics, Superhero, Heist, Zombie, Road Trip, Dystopia and more |
| 🎥 Studios | Marvel, DC, A24, Blumhouse, Studio Ghibli, Pixar, DreamWorks |
| 📅 By Decade | Best of 2025, 2020s, 2010s, 2000s, 1990s, 1980s |
| 👶 Kids & Family | Trending kids movies and series |
| 🇬🇧 UK Specific | BBC Shows, UK content |

---

## Configure Page Features

- **Quick Start Presets** — Casual Viewer, Binge Watcher, or Everything
- **Search** — filter catalogs instantly
- **Select All / Clear All** per category
- **Custom order** — catalogs appear in Stremio/Nuvio in the order you select them
- **Save & Edit** — return anytime with your token to update your selection

---

## Requirements

- Stremio or Nuvio installed on your device
- A free [MDBList API key](https://mdblist.com/api) (required for curated lists)

---

## Self-Hosting

```bash
git clone https://github.com/PaRaN01a-hash/stremio-catalog-addon
cd stremio-catalog-addon
cp .env.example .env
# Add your TMDB_KEY and MDBLIST_KEY to .env
docker compose up -d
```

---

## Version History

- **v5.3** — New architecture, 140+ catalogs, custom configure page, presets, search, logo
- **v5.1** — Configure page, custom manifests, MDBList integration
- **v5.0** — Stable release, episode lists, metadata, filtering
- **v4.0** — Similar/recommended catalogs, collections

---

*Free and open source. Not affiliated with any streaming service.*
