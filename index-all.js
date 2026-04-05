const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = 7001;
const TMDB_KEY = process.env.TMDB_KEY;

const cache = new Map();
const imdbCache = new Map();

// 📺 PROVIDERS
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
  hidive: 430,
  mgm: 268,
  acorn: 87,
  shudder: 99,
  britbox: 151,
  itvx: 584,
  channel4: 583,
};

// 🎬 GENRES
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
  { id: "trending_movies", type: "movie", name: "🔥 Trending", trending: true },
  { id: "trending_series", type: "series", name: "🔥 Trending", trending: true },

  { id: "popular_movies", type: "movie", name: "⭐ Popular", source: "popular" },
  { id: "popular_series", type: "series", name: "⭐ Popular", source: "popular" },

  { id: "top_movies", type: "movie", name: "🏆 Top Rated", source: "top_rated" },
  { id: "top_series", type: "series", name: "🏆 Top Rated", source: "top_rated" },

  { id: "now_movies", type: "movie", name: "🎬 Now Playing", source: "now_playing" },

  { id: "anime_movies", type: "movie", name: "🎌 Anime", anime: true },
  { id: "anime_series", type: "series", name: "🎌 Anime", anime: true },

  { id: "airing_series", type: "series", name: "📺 Airing Today", source: "airing_today" },
  { id: "ontheair_series", type: "series", name: "📡 On The Air", source: "on_the_air" },

  ...Object.entries(PROVIDERS).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: `${key.charAt(0).toUpperCase() + key.slice(1)}`, provider: id },
    ...(key === "mgm" ? [] : [{ id: `${key}_series`, type: "series", name: `${key.charAt(0).toUpperCase() + key.slice(1)}`, provider: id }])
  ])),

  ...Object.entries(GENRES).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie", name: `🎭 ${key.charAt(0).toUpperCase() + key.slice(1)}`, genre: id },
    { id: `${key}_series`, type: "series", name: `🎭 ${key.charAt(0).toUpperCase() + key.slice(1)}`, genre: id }
  ]))
];

// 🧠 BUILDER
const builder = new addonBuilder({
  id: "org.kris.ultra.max.all",
  version: "1.0.2",
  name: "Ultra MAX All",
  description: "All content, No filters",
  types: ["movie", "series"],
  resources: ["catalog", "meta"],
  catalogs: RULES.map(r => ({
    type: r.type,
    id: r.id,
    name: r.name,
    extra: [{ name: "skip", isRequired: false }]
  }))
});

// ⭐ TMDB → IMDb
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
builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    const rule = RULES.find(r => r.id === id);
    if (!rule) return { metas: [] };

    const tmdbType = type === "series" ? "tv" : "movie";
    const skip = extra?.skip || 0;
    const page = Math.floor(skip / 20) + 1;

    let url;

    if (rule.trending) {
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
    }
    else if (rule.provider) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US&sort_by=popularity.desc&page=${page}`;
    }
    else if (rule.genre) {
      let genre = rule.genre;
      if (type === "series" && rule.genre === 28) genre = 10759;
      if (type === "series" && rule.genre === 878) genre = 10765;
      if (type === "series" && rule.genre === 27) genre = 10765;
      if (type === "series" && rule.genre === 53) genre = 9648;
      if (type === "series" && rule.genre === 14) genre = 10765;
      if (type === "series" && rule.genre === 80) genre = 80;
      if (type === "series" && rule.genre === 10749) genre = 10749;
      if (type === "series" && rule.genre === 16) genre = 16;
      if (type === "series" && rule.genre === 10751) genre = 10751;
      if (type === "series" && rule.genre === 9648) genre = 9648;
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}`;
    }
    else if (rule.anime) {
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
    }
    else {
      url = `https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}&page=${page}`;
    }

    const data = await fetchCached(url);
    const seen = new Set();

    let results = (data.results || []).filter(i => {
      if (!i.poster_path) return false;
      return true;
    });

    if (results.length < 10 && type === "series" && rule.genre === 28) {
      const fallback = await fetchCached(
        `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_genres=10759&sort_by=popularity.desc&page=${page}`
      );
      results = (fallback.results || []).filter(i => {
        if (!i.poster_path) return false;
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
        .slice(0, 20)
        .map(async (i) => {
          const imdb = await getImdbId(i.id, type);
          if (!imdb) return null;
          return {
            id: imdb,
            type,
            name: i.title || i.name,
            poster: `https://image.tmdb.org/t/p/w500${i.poster_path}`,
            background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
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
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const trailer = (d.videos?.results || []).find(
      v => v.type === "Trailer" && v.site === "YouTube"
    );

    const meta = {
      id,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      cast,
      genres: (d.genres || []).map(g => g.name),
      runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
      trailer: trailer ? { source: "yt", id: trailer.key } : null
    };

    // 📺 Fetch episodes for series
    if (type === "series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const videos = [];

      await Promise.all(
        seasons.map(async (season) => {
          try {
            const seasonRes = await axios.get(
              `https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`
            );
            const episodes = seasonRes.data.episodes || [];
            episodes.forEach(ep => {
              videos.push({
                id: `${id}:${season.season_number}:${ep.episode_number}`,
                title: ep.name || `Episode ${ep.episode_number}`,
                season: season.season_number,
                episode: ep.episode_number,
                overview: ep.overview || "",
                thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
                released: ep.air_date ? new Date(ep.air_date).toISOString() : null
              });
            });
          } catch {
            // skip failed seasons
          }
        })
      );

      videos.sort((a, b) => {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
      });

      meta.videos = videos;
    }

    return { meta };

  } catch (e) {
    console.log("❌ meta", id, e.message);
    return { meta: { id, type } };
  }
});
// 🌐 SERVER
serveHTTP(builder.getInterface(), {
  port: PORT,
  host: "0.0.0.0"
});
