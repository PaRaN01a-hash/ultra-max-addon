const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;
const TMDB_KEY = process.env.TMDB_KEY;
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";

if (!TMDB_KEY) {
  console.error("TMDB_KEY missing - exiting");
  process.exit(1);
}

const cache = new Map();
const imdbCache = new Map();

// PROVIDERS
const PROVIDERS = {
  netflix: 8,
  amazon: 9,
  disney: 337,
  hulu: 15,
  hbo: 1899,
  apple: 350,
  paramount: 531,
  peacock: 386,
  mgm: 268,
  acorn: 87,
  shudder: 99,
  britbox: 151,
  itvx: 584,
  channel4: 583,

  // only used in unfiltered mode
  crunchyroll: 283,
  hidive: 430
};

// GENRES
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

// RULES
let RULES = [
  { id: "trending_movies", type: "movie", name: "Trending", trending: true },
  { id: "trending_series", type: "series", name: "Trending", trending: true },

  { id: "popular_movies", type: "movie", name: "Popular", source: "popular" },
  { id: "popular_series", type: "series", name: "Popular", source: "popular" },

  { id: "top_movies", type: "movie", name: "Top Rated", source: "top_rated" },
  { id: "top_series", type: "series", name: "Top Rated", source: "top_rated" },

  { id: "now_movies", type: "movie", name: "Now Playing", source: "now_playing" },
  { id: "airing_series", type: "series", name: "Airing Today", source: "airing_today" },
  { id: "ontheair_series", type: "series", name: "On The Air", source: "on_the_air" }
];

// anime only if NOT filtered
if (!FILTER_ENABLED) {
  RULES.push(
    { id: "anime_movies", type: "movie", name: "Anime", anime: true },
    { id: "anime_series", type: "series", name: "Anime", anime: true }
  );
}

// providers
RULES.push(
  ...Object.entries(PROVIDERS).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: key, provider: id },
    ...(key === "mgm" ? [] : [{ id: `${key}_series`, type: "series", name: key, provider: id }])
  ]))
);

// genres
RULES.push(
  ...Object.entries(GENRES).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: key, genre: id },
    { id: `${key}_series`, type: "series", name: key, genre: id }
  ]))
);

// BUILDER
const builder = new addonBuilder({
  id: FILTER_ENABLED ? "org.kris.ultra.max.v3" : "org.kris.ultra.max.all.v3",
  version: "3.0.0",
  name: FILTER_ENABLED ? "Ultra MAX" : "Ultra MAX All",
  description: FILTER_ENABLED ? "Filtered content" : "All content",
  types: ["movie", "series"],
  resources: ["catalog", "meta"],
  catalogs: RULES.map(r => ({
    type: r.type,
    id: r.id,
    name: r.name,
    extra: [{ name: "skip", isRequired: false }]
  }))
});

// TMDB → IMDb
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

// CACHE
async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);

  const res = await axios.get(url, { timeout: 5000 });
  const data = res.data;

  cache.set(url, data);
  setTimeout(() => cache.delete(url), 300000);

  return data;
}

// FILTER
function isValidItem(i) {
  if (!i.poster_path) return false;

  if (!FILTER_ENABLED) return true;

  if (i.original_language === "hi") return false;
  if (i.original_language === "ja" && i.genre_ids?.includes(16)) return false;

  const name = (i.title || i.name || "").toLowerCase();
  if (name.includes("anime")) return false;

  return true;
}

// CATALOG
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const rule = RULES.find(r => r.id === id);
    if (!rule) return { metas: [] };

    const tmdbType = type === "series" ? "tv" : "movie";
    const page = Math.floor((extra?.skip || 0) / 20) + 1;

    let url;

    if (rule.trending) {
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
    } else if (rule.provider) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US&sort_by=popularity.desc&page=${page}`;
    } else if (rule.genre) {
      let genre = rule.genre;

      if (type === "series") {
        if (genre === 28) genre = 10759;
        if ([878, 27, 14].includes(genre)) genre = 10765;
        if (genre === 53) genre = 9648;
      }

      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}`;
    } else if (rule.anime) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
    } else {
      url = `https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}&page=${page}`;
    }

    const data = await fetchCached(url);
    const seen = new Set();

    const metas = (await Promise.all(
      (data.results || [])
        .filter(isValidItem)
        .filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        })
        .slice(0, 20)
        .map(async (i) => {
          const imdb = await getImdbId(i.id, type);
          if (!imdb) return null;
          return {
            id: imdb,
            type,
            name: i.title || i.name,
            poster: `https://image.tmdb.org/t/p/w500${i.poster_path}`,
            background: i.backdrop_path
              ? `https://image.tmdb.org/t/p/original${i.backdrop_path}`
              : null
          };
        })
    )).filter(Boolean);

    return { metas };
  } catch (e) {
    console.log("catalog error", id, e.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const tmdbType = type === "series" ? "tv" : "movie";

    const findRes = await axios.get(
      `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`
    );

    const results = findRes.data[`${tmdbType}_results`];
    if (!results || results.length === 0) return { meta: { id, type } };

    const tmdbId = results[0].id;

    const detailRes = await axios.get(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits,videos`
    );

    const d = detailRes.data;

    return {
      meta: {
        id,
        type,
        name: d.title || d.name,
        description: d.overview,
        poster: d.poster_path
          ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
          : null,
        background: d.backdrop_path
          ? `https://image.tmdb.org/t/p/original${d.backdrop_path}`
          : null
      }
    };
  } catch {
    return { meta: { id, type } };
  }
});
// SERVER
serveHTTP(builder.getInterface(), {
  port: PORT,
  host: "0.0.0.0"
});
