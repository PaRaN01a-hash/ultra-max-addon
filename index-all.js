const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = 7001;
const TMDB_KEY = process.env.TMDB_KEY;

const cache = new Map();
const imdbCache = new Map(); // ⭐ NEW

// 🎬 GENRES

const PROVIDERS = {
  netflix: 8,
  amazon: 9,
  disney: 337,
  hulu: 15,
  hbo: 1899,
  apple: 350,
  paramount: 531,
  peacock: 386,
  crunchyroll: 283,
  funimation: 269,
  hidive: 430,
  mgm: 268,
  acorn: 87,
  shudder: 99,
  britbox: 151,
  itvx: 584,
  channel4: 583,
};
const GENRES = {
  action: 28,
  comedy: 35,
  horror: 27,
  scifi: 878,
  documentary: 99,
  romance: 10749,
  thriller: 53,
  crime: 80,
  animation: 16,
  family: 10751,
  fantasy: 14,
  mystery: 9648
};
// 🧱 RULES
const RULES = [
  { id: "trending_movies", type: "movie", name: "🔥 Trending Movies", trending: true },
  { id: "trending_series", type: "series", name: "🔥 Trending Series", trending: true },

  { id: "popular_movies", type: "movie", name: "⭐ Popular Movies", source: "popular" },
  { id: "popular_series", type: "series", name: "⭐ Popular Series", source: "popular" },

  { id: "top_movies", type: "movie", name: "🏆 Top Movies", source: "top_rated" },
  { id: "top_series", type: "series", name: "🏆 Top Series", source: "top_rated" },

  { id: "now_movies", type: "movie", name: "🎬 Now Playing", source: "now_playing" },

  { id: "anime_movies", type: "movie", name: "🎌 Anime Movies", anime: true },
  { id: "anime_series", type: "series", name: "🎌 Anime Series", anime: true },

  { id: "airing_series", type: "series", name: "📺 Airing Today", source: "airing_today" },
  { id: "ontheair_series", type: "series", name: "📡 On The Air", source: "on_the_air" },

  ...Object.entries(PROVIDERS).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: `${key.toUpperCase()} Movies`, provider: id },
    ...(key === "mgm" ? [] : [{ id: `${key}_series`, type: "series", name: `${key.toUpperCase()} Series`, provider: id }])
  ])),

  ...Object.entries(GENRES).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: `🎭 ${key} Movies`, genre: id },
    { id: `${key}_series`, type: "series", name: `🎭 ${key} Series`, genre: id }
  ]))
];

// 🧠 BUILDER
const builder = new addonBuilder({
  id: "org.kris.ultra.max.all",
  version: "1.0.1",
  name: "Ultra MAX All",
  description: "All content, No filters",
  types: ["movie", "series"],
  resources: ["catalog", "meta"],
  catalogs: RULES.map(r => ({
    type: r.type,
    id: r.id,
    name: r.name
  }))
});

// ⭐ NEW: TMDB → IMDb
async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);

  try {
    const tmdbType = type === "series" ? "tv" : "movie";

    const res = await axios.get(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`
    );

    const imdb = res.data.imdb_id;
    if (!imdb) return null;

    imdbCache.set(key, imdb);
    return imdb;
  } catch {
    return null;
  }
}

// ⚡ CACHE
async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);

  const res = await axios.get(url, { timeout: 5000 });
  const data = res.data;

  cache.set(url, data);
  setTimeout(() => cache.delete(url), 300000);

  return data;
}
// 🎬 CATALOG HANDLER
builder.defineCatalogHandler(async ({ type, id }) => {
  try {
    const rule = RULES.find(r => r.id === id);
    if (!rule) return { metas: [] };

    const tmdbType = type === "series" ? "tv" : "movie";

    let url;

    if (rule.trending) {
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}`;
    }
    else if (rule.provider) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US&sort_by=popularity.desc`;
    }
    else if (rule.genre) {
  let genre = rule.genre;
  if (type === "series" && rule.genre === 28) genre = 10759;   // Action & Adventure
  if (type === "series" && rule.genre === 878) genre = 10765;  // Sci-Fi & Fantasy
  if (type === "series" && rule.genre === 27) genre = 10765;   // Sci-Fi & Fantasy (horror shares it)
  if (type === "series" && rule.genre === 53) genre = 9648;    // Thriller → Mystery/Thriller
  if (type === "series" && rule.genre === 14) genre = 10765;   // Fantasy → Sci-Fi & Fantasy
  if (type === "series" && rule.genre === 80) genre = 80;      // Crime (same on TV)
  if (type === "series" && rule.genre === 10749) genre = 10749; // Romance (same on TV)
  if (type === "series" && rule.genre === 16) genre = 16;      // Animation (same on TV)
  if (type === "series" && rule.genre === 10751) genre = 10751; // Family (same on TV)
  if (type === "series" && rule.genre === 9648) genre = 9648;  // Mystery (same on TV)
  url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc`;
}
else {
      url = `https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}`;
    } 

   const data = await fetchCached(url);
    const seen = new Set();

    // 🎯 FIX 2: single consolidated filter pass (no duplicate filtering)
        let results = (data.results || []).filter(i => {
        if (!i.poster_path) return false;
         return true;
      });
    // 🎯 FIX 3: fallback block is now cleanly outside the filter, with its own filter pass
    if (results.length < 10 && type === "series" && rule.genre === 28) {
      const fallback = await fetchCached(
        `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=10759&sort_by=popularity.desc`
      );
      results = (fallback.results || []).filter(i => {
        if (!i.poster_path) return false;
        if (i.original_language === "hi") return false;
        if (i.original_language === "ja" && i.genre_ids?.includes(16)) return false;
        const name = (i.title || i.name || "").toLowerCase();
        if (name.includes("anime")) return false;
        return true;
      });
    }

    const metas = (await Promise.all(
      results
        .filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        })
        .sort(() => Math.random() - 0.5)
        .slice(0, 20)
        .map(async (i) => {
          const imdb = await getImdbId(i.id, type);
          if (!imdb) return null;
        return {
  id: imdb,
  type,
  name: i.title || i.name,
  poster: `https://image.tmdb.org/t/p/w500${i.poster_path}`,
  background: i.backdrop_path ? `https://image.tmdb.org/t/p/w1280${i.backdrop_path}` : null
};
        })
    )).filter(Boolean);

    return { metas };

  } catch (e) {
    console.log("❌", id, e.message);
    return { metas: [] };
  }
});

// 📦 META
builder.defineMetaHandler(async ({ type, id }) => {
  return { meta: { id, type } };
});

// 🌐 SERVER
serveHTTP(builder.getInterface(), {
  port: PORT,
  host: "0.0.0.0"
});
