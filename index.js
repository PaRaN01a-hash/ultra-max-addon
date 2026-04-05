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
  crunchyroll: 283,
  hidive: 430
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

if (!FILTER_ENABLED) {
  RULES.push(
    { id: "anime_movies", type: "movie", name: "Anime", anime: true },
    { id: "anime_series", type: "series", name: "Anime", anime: true }
  );
}

RULES.push(
  ...Object.entries(PROVIDERS)
    .filter(([key]) => !FILTER_ENABLED ? true : !["crunchyroll", "hidive"].includes(key))
    .flatMap(([key, id]) => ([
      { id: `${key}_movies`, type: "movie", name: key, provider: id },
      ...(key === "mgm" ? [] : [{ id: `${key}_series`, type: "series", name: key, provider: id }])
    ]))
);

RULES.push(
  ...Object.entries(GENRES).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: key, genre: id },
    { id: `${key}_series`, type: "series", name: key, genre: id }
  ]))
);

const builder = new addonBuilder({
  id: FILTER_ENABLED ? "org.kris.ultra.max.v4" : "org.kris.ultra.max.all.v4",
  version: "4.0.0",
  name: FILTER_ENABLED ? "Ultra MAX" : "Ultra MAX ALL",
  description: "Full TMDB powered catalogs",
  types: ["movie", "series"],
  resources: ["catalog", "meta"],
  catalogs: [
    ...RULES.map(r => ({
      type: r.type,
      id: r.id,
      name: r.name,
      extra: [{ name: "skip", isRequired: false }]
    })),
    { type: "movie", id: "similar", name: "More Like This" },
    { type: "movie", id: "recommendations", name: "Recommended" },
    { type: "movie", id: "collection", name: "Collection" }
  ]
});

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await axios.get(url);
  cache.set(url, res.data);
  setTimeout(() => cache.delete(url), 300000);
  return res.data;
}

async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);

  try {
    const tmdbType = type === "series" ? "tv" : "movie";
    const res = await axios.get(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`
    );
    const imdb = res.data.imdb_id;
    imdbCache.set(key, imdb);
    return imdb;
  } catch {
    return null;
  }
}

function isValidItem(i) {
  if (!i.poster_path) return false;
  if (!FILTER_ENABLED) return true;

  if (i.original_language === "hi") return false;
  if (i.original_language === "ja" && i.genre_ids?.includes(16)) return false;

  return true;
}

builder.defineCatalogHandler(async ({ type, id }) => {
  try {
    const tmdbType = type === "series" ? "tv" : "movie";

    if (id.startsWith("similar_") || id.startsWith("recommendations_")) {
      const imdb = id.split("_")[1];

      const find = await fetchCached(
        `https://api.themoviedb.org/3/find/${imdb}?api_key=${TMDB_KEY}&external_source=imdb_id`
      );

      const result = find[`${tmdbType}_results`]?.[0];
      if (!result) return { metas: [] };

      const endpoint = id.startsWith("similar_") ? "similar" : "recommendations";

      const data = await fetchCached(
        `https://api.themoviedb.org/3/${tmdbType}/${result.id}/${endpoint}?api_key=${TMDB_KEY}`
      );

      return {
        metas: await Promise.all(
          (data.results || []).slice(0, 20).map(async (i) => {
            const imdb = await getImdbId(i.id, type);
            if (!imdb) return null;

            return {
              id: imdb,
              type,
              name: i.title || i.name,
              poster: `https://image.tmdb.org/t/p/w500${i.poster_path}`
            };
          })
        )
      };
    }

    if (id.startsWith("collection_")) {
      const collectionId = id.split("_")[1];

      const data = await fetchCached(
        `https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_KEY}`
      );

      return {
        metas: await Promise.all(
          (data.parts || []).map(async (i) => {
            const imdb = await getImdbId(i.id, "movie");
            if (!imdb) return null;

            return {
              id: imdb,
              type: "movie",
              name: i.title,
              poster: `https://image.tmdb.org/t/p/w500${i.poster_path}`
            };
          })
        )
      };
    }

    const rule = RULES.find(r => r.id === id);
    if (!rule) return { metas: [] };

    let url;

    if (rule.trending) {
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}`;
    } else if (rule.provider) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US`;
    } else if (rule.genre) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${rule.genre}`;
    } else if (rule.anime) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja`;
    } else {
      url = `https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}`;
    }

    const data = await fetchCached(url);

    return {
      metas: await Promise.all(
        (data.results || [])
          .filter(isValidItem)
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
      )
    };
  } catch (e) {
    console.log("catalog error", id, e.message);
    return { metas: [] };
  }
});

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const tmdbType = type === "series" ? "tv" : "movie";

    const find = await fetchCached(
      `https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`
    );

    const result = find[`${tmdbType}_results`]?.[0];
    if (!result) return { meta: { id, type } };

    const d = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${result.id}?api_key=${TMDB_KEY}`
    );

    const meta = {
      id,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      genres: (d.genres || []).map(g => g.name),

      links: [
        { name: "More Like This", category: "similar", url: `stremio:///catalog/${type}/similar_${id}.json` },
        { name: "Recommended", category: "recommendations", url: `stremio:///catalog/${type}/recommendations_${id}.json` }
      ]
    };

    if (d.belongs_to_collection) {
      meta.links.push({
        name: "Collection",
        category: "collection",
        url: `stremio:///catalog/movie/collection_${d.belongs_to_collection.id}.json`
      });
    }

    return { meta };
  } catch (e) {
    console.log("meta error", id, e.message);
    return { meta: { id, type } };
  }
});

serveHTTP(builder.getInterface(), {
  port: PORT,
  host: "0.0.0.0"
});
