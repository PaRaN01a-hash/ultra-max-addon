const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const PORT = process.env.PORT || 7000;
const TMDB_KEY = process.env.TMDB_KEY;
const MDBLIST_KEY = process.env.MDBLIST_KEY || "5woimia0xf19uqr4rd7wl1960";
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";
const CONFIGS_FILE = path.join(__dirname, "configs.json");
// Pre-warm MDBList cache on startup
const PREWARM_LISTS = [
  '92337','91304','91303','91302','91300','91301',
  '86710','88307','88309','3087','3091'
];

setTimeout(async () => {
  console.log('Pre-warming MDBList cache...');
  for (const id of PREWARM_LISTS) {
    try {
      const url = `https://mdblist.com/api/lists/${id}/items/?apikey=${MDBLIST_KEY}&limit=20&type=movie`;
      await fetchCached(url);
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {}
  }
  console.log('Cache pre-warm complete');
}, 5000);
if (!TMDB_KEY) {
  console.error("TMDB_KEY missing - exiting");
  process.exit(1);
}

// ============================================================
// CONFIG STORAGE
// ============================================================

function loadConfigs() {
  try {
    if (fs.existsSync(CONFIGS_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIGS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("Error loading configs:", e.message);
  }
  return {};
}

function saveConfigs(configs) {
  try {
    fs.writeFileSync(CONFIGS_FILE, JSON.stringify(configs, null, 2));
  } catch (e) {
    console.error("Error saving configs:", e.message);
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "ultramax_salt").digest("hex");
}

function generateToken() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// ============================================================
// CACHES
// ============================================================

const cache = new Map();
const imdbCache = new Map();

// ============================================================
// CATALOG DEFINITIONS
// ============================================================

const PROVIDERS = {
  netflix: 8, amazon: 9, disney: 337, hulu: 15,
  hbo: 1899, apple: 350, paramount: 531, peacock: 386,
  mgm: 268, acorn: 87, shudder: 99, britbox: 151,
  itvx: 584, channel4: 583, crunchyroll: 283, hidive: 430
};

const GENRES = {
  action: 28, comedy: 35, horror: 27, scifi: 878,
  documentary: 99, romance: 10749, thriller: 53,
  crime: 80, animation: 16, family: 10751,
  fantasy: 14, mystery: 9648
};

// TMDB keyword/company based themes
const TMDB_THEMES = {
  theme_superhero:    { name: "Superhero",            keyword: 9715,  lang: "en", type: "movie" },
  theme_revenge:      { name: "Revenge",              keyword: 9748,  lang: "en", type: "movie" },
  theme_roadtrip:     { name: "Road Trip",            keyword: 7312,  lang: "en", type: "movie" },
  theme_heist:        { name: "Heist",                keyword: 10051, lang: "en", type: "movie" },
  theme_serialkiller: { name: "Serial Killer",        keyword: 10714, lang: "en", type: "movie" },
  theme_timeloop:     { name: "Time Loop",            keyword: 10854, lang: "en", type: "movie" },
  theme_postapoc:     { name: "Post Apocalyptic",     keyword: 4565,  lang: "en", type: "movie" },
  theme_dystopia:     { name: "Dystopia",             keyword: 4344,  lang: "en", type: "movie" },
  theme_truestory:    { name: "Based on True Story",  keyword: 10051, lang: "en", type: "movie" },
  theme_ai:           { name: "Artificial Intelligence", keyword: 310, lang: "en", type: "movie" },
  theme_zombie:       { name: "Zombie",               keyword: 12377, lang: "en", type: "movie" },
  studio_marvel:      { name: "Marvel",               company: 420,               type: "movie" },
  studio_dc:          { name: "DC Films",             company: 9993,              type: "movie" },
  studio_a24:         { name: "A24",                  company: 41077,             type: "movie" },
  studio_blumhouse:   { name: "Blumhouse",            company: 3172,              type: "movie" },
  studio_ghibli:      { name: "Studio Ghibli",        company: 10342,             type: "movie" },
};

// MDBList catalog definitions
const MDBLIST_CATALOGS = {
  mdb_87667:  { name: "Trakt Trending Movies",       type: "movie"  },
  mdb_88434:  { name: "Trakt Trending Series",       type: "series" },
  mdb_2236:   { name: "Top Movies This Week",        type: "movie"  },
  mdb_1198:   { name: "Most Popular (Top 20)",       type: "movie"  },
  mdb_69:     { name: "IMDb Moviemeter Top 100",     type: "movie"  },
  mdb_86934:  { name: "Latest Digital Release",      type: "movie"  },
  mdb_960:    { name: "Latest Releases",             type: "movie"  },
  mdb_2202:   { name: "Latest Blu-ray Releases",     type: "movie"  },
  mdb_1176:   { name: "Latest Certified Fresh",      type: "movie"  },
  mdb_86710:  { name: "Latest Airing Shows",         type: "series" },
  mdb_88307:  { name: "Trending Kids Movies",        type: "movie"  },
  mdb_88309:  { name: "Trending Kids Series",        type: "series" },
  mdb_13:     { name: "Top Kids Movies This Week",   type: "movie"  },
  mdb_88328:  { name: "Netflix Latest Movies",       type: "movie"  },
  mdb_86751:  { name: "Netflix Latest Series",       type: "series" },
  mdb_86755:  { name: "Amazon Latest Movies",        type: "movie"  },
  mdb_86753:  { name: "Amazon Latest Series",        type: "series" },
  mdb_88317:  { name: "Apple TV+ Latest Movies",     type: "movie"  },
  mdb_88319:  { name: "Apple TV+ Latest Series",     type: "series" },
  mdb_86759:  { name: "Disney+ Latest Movies",       type: "movie"  },
  mdb_86758:  { name: "Disney+ Latest Series",       type: "series" },
  mdb_89647:  { name: "HBO Latest Movies",           type: "movie"  },
  mdb_89649:  { name: "HBO Latest Series",           type: "series" },
  mdb_86762:  { name: "Paramount+ Latest Movies",    type: "movie"  },
  mdb_86761:  { name: "Paramount+ Latest Series",    type: "series" },
  mdb_88326:  { name: "Hulu Latest Movies",          type: "movie"  },
  mdb_88327:  { name: "Hulu Latest Series",          type: "series" },
  mdb_91211:  { name: "Action Movies",               type: "movie"  },
  mdb_91213:  { name: "Action Series",               type: "series" },
  mdb_91223:  { name: "Comedy Movies",               type: "movie"  },
  mdb_91224:  { name: "Comedy Series",               type: "series" },
  mdb_91215:  { name: "Horror Movies",               type: "movie"  },
  mdb_91217:  { name: "Horror Series",               type: "series" },
  mdb_91220:  { name: "Sci-Fi Movies",               type: "movie"  },
  mdb_91221:  { name: "Sci-Fi Series",               type: "series" },
  mdb_91893:  { name: "Thriller Movies",             type: "movie"  },
  mdb_91894:  { name: "Thriller Series",             type: "series" },
  mdb_3108:   { name: "Crime Movies",                type: "movie"  },
  mdb_3126:   { name: "Crime Series",                type: "series" },
  mdb_91296:  { name: "Drama Movies",                type: "movie"  },
  mdb_91297:  { name: "Drama Series",                type: "series" },
  mdb_116037: { name: "Animated Movies",             type: "movie"  },
  mdb_116038: { name: "Animated Series",             type: "series" },
  mdb_84677:  { name: "Top Documentaries",           type: "movie"  },
  mdb_84403:  { name: "Top Documentary Series",      type: "series" },
  mdb_8043:   { name: "History & War",               type: "movie"  },
  mdb_84487:  { name: "Top Nature",                  type: "series" },
  mdb_84401:  { name: "Top Reality TV",              type: "series" },
  mdb_83497:  { name: "Top Standup Comedy",          type: "movie"  },
  mdb_3892:   { name: "Must-See Mindfuck",           type: "movie"  },
  mdb_3923:   { name: "Crazy Plot Twists",           type: "movie"  },
  mdb_3920:   { name: "Outer Space",                 type: "movie"  },
  mdb_2909:   { name: "Time Travel",                 type: "movie"  },
  mdb_102554: { name: "Must-See Modern Horror",      type: "movie"  },
  mdb_2410:   { name: "Horror Classics",             type: "movie"  },
  mdb_3885:   { name: "100% Rotten Tomatoes",        type: "movie"  },
  mdb_4081:   { name: "Top 50 Parody Movies",        type: "movie"  },
  mdb_4390:   { name: "True Crime Documentaries",    type: "movie"  },
  mdb_2858:   { name: "Thrilling Movies",            type: "movie"  },
  mdb_136620: { name: "Seasonal",                    type: "movie"  },
  mdb_3918:   { name: "Pixar Collection",            type: "movie"  },
  mdb_3928:   { name: "DreamWorks Collection",       type: "movie"  },
  mdb_3087:   { name: "BBC Shows",                   type: "series" },
  mdb_3091:   { name: "UK Shows",                    type: "series" },
  mdb_92337:  { name: "Best of 2025",                type: "movie"  },
  mdb_91304:  { name: "Best of 2020s",               type: "movie"  },
  mdb_91303:  { name: "Best of 2010s",               type: "movie"  },
  mdb_91302:  { name: "Best of 2000s",               type: "movie"  },
  mdb_91300:  { name: "Best of 1990s",               type: "movie"  },
  mdb_91301:  { name: "Best of 1980s",               type: "movie"  },
};

// Base TMDB rules
let BASE_RULES = [
  { id: "trending_movies",  type: "movie",  name: "Trending",    trending: true },
  { id: "trending_series",  type: "series", name: "Trending",    trending: true },
  { id: "popular_movies",   type: "movie",  name: "Popular",     source: "popular" },
  { id: "popular_series",   type: "series", name: "Popular",     source: "popular" },
  { id: "top_movies",       type: "movie",  name: "Top Rated",   source: "top_rated" },
  { id: "top_series",       type: "series", name: "Top Rated",   source: "top_rated" },
  { id: "now_movies",       type: "movie",  name: "Now Playing", source: "now_playing" },
  { id: "airing_series",    type: "series", name: "Airing Today",source: "airing_today" },
  { id: "ontheair_series",  type: "series", name: "On The Air",  source: "on_the_air" },
  { id: "anime_movies",     type: "movie",  name: "Anime",       anime: true },
  { id: "anime_series",     type: "series", name: "Anime",       anime: true },
  { id: "bollywood_movies", type: "movie",  name: "Bollywood",   bollywood: true },
  { id: "bollywood_series", type: "series", name: "Bollywood",   bollywood: true },
];

// Add provider rules
BASE_RULES.push(
  ...Object.entries(PROVIDERS).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie",  name: key.charAt(0).toUpperCase() + key.slice(1), provider: id },
    ...(key === "mgm" ? [] : [{ id: `${key}_series`, type: "series", name: key.charAt(0).toUpperCase() + key.slice(1), provider: id }])
  ]))
);

// Add genre rules
BASE_RULES.push(
  ...Object.entries(GENRES).flatMap(([key, id]) => ([
    { id: `${key}_movies`, type: "movie",  name: key.charAt(0).toUpperCase() + key.slice(1), genre: id },
    { id: `${key}_series`, type: "series", name: key.charAt(0).toUpperCase() + key.slice(1), genre: id }
  ]))
);

const DYNAMIC_CATALOGS = [
  { type: "movie",  id: "similar_movie",      name: "More Like This" },
  { type: "series", id: "similar_series",     name: "More Like This" },
  { type: "movie",  id: "recommended_movie",  name: "Recommended"    },
  { type: "series", id: "recommended_series", name: "Recommended"    },
  { type: "movie",  id: "collection_movie",   name: "Collection"     }
];

// ============================================================
// HELPER: Build catalogs array from a list of selected IDs
// ============================================================

function buildCatalogsFromIds(selectedIds) {
  const catalogs = [];

  selectedIds.forEach(id => {
    // Base TMDB rule

    const rule = BASE_RULES.find(r => r.id === id);
    if (rule) {
      catalogs.push({
        type: rule.type,
        id: rule.id,
        name: rule.name,
        extra: [{ name: "skip", isRequired: false }]
      });
      return;
    }

    // MDBList catalog
    if (id.startsWith("mdb_")) {
      const mdb = MDBLIST_CATALOGS[id];
      if (mdb) {
        catalogs.push({
          type: mdb.type,
          id,
          name: mdb.name,
          extra: [{ name: "skip", isRequired: false }]
        });
      }
      return;
    }

    // TMDB theme/studio catalog
    if (id.startsWith("theme_") || id.startsWith("studio_")) {
      const theme = TMDB_THEMES[id];
      if (theme) {
        catalogs.push({
          type: theme.type,
          id,
          name: theme.name,
          extra: [{ name: "skip", isRequired: false }]
        });
      }
      return;
    }
  });

  // Always add dynamic catalogs
  DYNAMIC_CATALOGS.forEach(c => {
    catalogs.push({
      type: c.type,
      id: c.id,
      name: c.name,
      extra: [{ name: "tmdbId", isRequired: true }]
    });
  });

  return catalogs;
}

// ============================================================
// STATIC ADDON (filtered + unfiltered)
// ============================================================

let STATIC_RULES = BASE_RULES.filter(r =>
  FILTER_ENABLED
    ? !["crunchyroll", "hidive", "anime", "bollywood"].some(x => r.id.includes(x))
    : true
);

const builder = new addonBuilder({
  id: FILTER_ENABLED ? "org.kris.ultra.max.v5" : "org.kris.ultra.max.all.v5",
  version: "5.1.0",
  logo: "https://max-streams.gleeze.com/logo.svg",
  name: FILTER_ENABLED ? "Ultra MAX" : "Ultra MAX All",
  description: FILTER_ENABLED ? "Filtered content" : "All content including anime & Bollywood",
  types: ["movie", "series"],
  resources: ["catalog", "meta", "stream"],
  catalogs: [
    ...STATIC_RULES.map(r => ({
      type: r.type,
      id: r.id,
      name: r.name,
      extra: [{ name: "skip", isRequired: false }]
    })),
    ...DYNAMIC_CATALOGS.map(c => ({
      type: c.type,
      id: c.id,
      name: c.name,
      extra: [{ name: "tmdbId", isRequired: true }]
    }))
  ]
});

// ============================================================
// FETCH HELPERS
// ============================================================

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await axios.get(url, { timeout: 8000 });
  cache.set(url, res.data);
  setTimeout(() => cache.delete(url), 300000);
  return res.data;
}

async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);
  try {
    const t = type === "series" ? "tv" : "movie";
    const r = await axios.get(
      `https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`,
      { timeout: 5000 }
    );
    if (!r.data.imdb_id) return null;
    imdbCache.set(key, r.data.imdb_id);
    return r.data.imdb_id;
  } catch { return null; }
}

function isValidItem(i) {
  return true;
}

async function resultsToMetas(arr, type) {
  return (await Promise.all(
    arr.filter(isValidItem).slice(0, 20).map(async i => {
     const imdb = i.imdb_id || await getImdbId(i.id, type);
      if (!imdb) return null;
      return {
        id: imdb,
        type,
        name: i.title || i.name || i.original_title,
        poster: i.poster_path ? `https://image.tmdb.org/t/p/w500${i.poster_path}` : null,
        background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
      };
    })
  )).filter(Boolean);
}

// Fetch MDBList items and convert to metas
async function mdblistToMetas(listId, type, mdbKey) {
  const key = mdbKey || MDBLIST_KEY;
  const url = `https://mdblist.com/api/lists/${listId}/items/?apikey=${key}&limit=20&type=${type === "series" ? "show" : "movie"}`;
  try {
    const data = await fetchCached(url);
    const items = Array.isArray(data) ? data : (data.movies || data.shows || data.items || []);

    return (await Promise.all(
      items.slice(0, 20).map(async item => {
        const imdbId = item.imdb_id || item.imdbid;
        if (!imdbId) return null;

        const tmdbType = type === "series" ? "tv" : "movie";
        try {
          const find = await fetchCached(
            `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`
          );
          const result = find[`${tmdbType}_results`]?.[0];
          if (!result) return { id: imdbId, type, name: item.title };

          return {
            id: imdbId,
            type,
            name: item.title || result.title || result.name,
            poster: result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
            background: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null
          };
        } catch {
          return { id: imdbId, type, name: item.title };
        }
      })
    )).filter(Boolean);
  } catch (e) {
    console.log("mdblist error", listId, e.message);
    return [];
  }
}

// ============================================================
// CATALOG HANDLER (shared logic)
// ============================================================

async function handleCatalog(type, id, extra, mdbKey) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const page = Math.floor((extra?.skip || 0) / 20) + 1;
  const tmdbId = extra?.tmdbId;

  // Dynamic catalogs
  if (id === "similar_movie" || id === "similar_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/similar?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type) };
  }
  if (id === "recommended_movie" || id === "recommended_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type) };
  }
  if (id === "collection_movie") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_KEY}`);
    return { metas: await resultsToMetas(data.parts || [], "movie") };
  }

  // MDBList catalog
  if (id.startsWith("mdb_")) {
    const listId = id.replace("mdb_", "");
    const metas = await mdblistToMetas(listId, type, mdbKey);
    return { metas };
  }

  // TMDB theme/studio catalog
  if (id.startsWith("theme_") || id.startsWith("studio_")) {
    const theme = TMDB_THEMES[id];
    if (!theme) return { metas: [] };
    let url;
    if (theme.keyword) {
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_keywords=${theme.keyword}&sort_by=popularity.desc&page=${page}`;
      if (theme.lang) url += `&with_original_language=${theme.lang}`;
    } else if (theme.company) {
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_companies=${theme.company}&sort_by=popularity.desc&page=${page}`;
    }
    const data = await fetchCached(url);
    return { metas: await resultsToMetas(data.results || [], "movie") };
  }

  // Base TMDB rule
  const rule = BASE_RULES.find(r => r.id === id);
  if (!rule) return { metas: [] };

  let url;
  if (rule.trending)
    url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
  else if (rule.provider)
    url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US&sort_by=popularity.desc&page=${page}`;
  else if (rule.genre) {
    let genre = rule.genre;
    if (type === "series") {
      if (genre === 28) genre = 10759;
      if ([878, 27, 14].includes(genre)) genre = 10765;
      if (genre === 53) genre = 9648;
    }
    url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}`;
  }
  else if (rule.anime)
    url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
  else if (rule.bollywood)
    url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_original_language=hi&sort_by=popularity.desc&page=${page}`;
  else
    url = `https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}&page=${page}`;

  const data = await fetchCached(url);
  return { metas: await resultsToMetas(data.results || [], type) };
}

// ============================================================
// STATIC ADDON HANDLERS
// ============================================================

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  try {
    return await handleCatalog(type, id, extra, null);
  } catch (e) {
    console.log("catalog error", id, e.message);
    return { metas: [] };
  }
});

builder.defineStreamHandler(async () => {
  return { streams: [] };
});

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const tmdbType = type === "series" ? "tv" : "movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return { meta: { id, type } };

    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);

    const meta = {
      id, type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      genres: (d.genres || []).map(g => g.name),
      cast
    };

    if (type === "series" && d.next_episode_to_air) {
      const next = d.next_episode_to_air;
      meta.releaseInfo = `${d.first_air_date?.split("-")[0] || ""} · Next: S${next.season_number}E${next.episode_number} — ${next.air_date}`;
    }

    if (type === "series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const videos = [];
      for (const season of seasons) {
        try {
          const sr = await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          (sr.episodes || []).forEach(ep => {
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
        } catch { }
      }
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }

    return { meta };
  } catch (e) {
    console.log("meta error", id, e.message);
    return { meta: { id, type } };
  }
});

// ============================================================
// EXPRESS APP FOR CUSTOM ROUTES
// ============================================================

const addonInterface = builder.getInterface();
const app = express();
app.use(express.json());

// Serve configure page
app.get("/configure", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "configure.html"));
});

app.get("/configure/:token", (req, res) => {
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.join(__dirname, "configure.html"));
});
// Create new config
app.post("/c/create", (req, res) => {
  const { password, catalogs, mdblistKey } = req.body;
  if (!password || !catalogs || !catalogs.length) {
    return res.status(400).json({ error: "Password and catalogs are required" });
  }

  const configs = loadConfigs();
  let token = generateToken();
  while (configs[token]) token = generateToken();

  configs[token] = {
    passwordHash: hashPassword(password),
    catalogs,
    mdblistKey: mdblistKey || null,
    createdAt: new Date().toISOString()
  };

  saveConfigs(configs);
  res.json({ token });
});

// Update existing config
app.post("/c/:token/update", (req, res) => {
  const { token } = req.params;
  const { password, catalogs, mdblistKey } = req.body;
  const configs = loadConfigs();

  if (!configs[token]) {
    return res.status(404).json({ error: "Config not found" });
  }

  if (configs[token].passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  configs[token].catalogs = catalogs;
  configs[token].mdblistKey = mdblistKey || configs[token].mdblistKey || null;
  configs[token].updatedAt = new Date().toISOString();

  saveConfigs(configs);
  res.json({ token });
});

// Get config (for loading existing)
app.get("/c/:token/config", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error: "Not found" });
  res.json({ catalogs: configs[token].catalogs });
});

// Dynamic manifest
app.get("/c/:token/manifest.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];

  if (!config) {
    return res.status(404).json({ error: "Config not found" });
  }

  const catalogs = buildCatalogsFromIds(config.catalogs);

  const manifest = {
    id: `org.kris.ultramax.custom.${token}`,
    version: "5.1.0",
  logo: "https://max-streams.gleeze.com/logo.svg",
    name: "Ultra MAX",
    description: `Custom addon — ${config.catalogs.length} catalogs selected`,
    types: ["movie", "series"],
    resources: ["catalog", "meta", "stream"],
    catalogs
  };

  res.json(manifest);
});

// Dynamic catalog handler
app.get(["/c/:token/catalog/:type/:id.json", "/c/:token/catalog/:type/:id/:extra.json"], async (req, res) => {
  const { token, type, id } = req.params;
  const configs = loadConfigs();
  const config = configs[token];

  if (!config) return res.status(404).json({ metas: [] });

  try {
    let extra = {};
    if (req.params.extra) {
      try { extra = JSON.parse(decodeURIComponent(req.params.extra)); } catch { }
    }
    // Also check query string for skip
    if (req.query.skip) extra.skip = parseInt(req.query.skip);

    const mdbKey = config.mdblistKey || MDBLIST_KEY;
    const result = await handleCatalog(type, id, extra, mdbKey);
    res.json(result);
  } catch (e) {
    console.log("custom catalog error", id, e.message);
    res.json({ metas: [] });
  }
});

// Dynamic meta handler
app.get("/c/:token/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  try {
    const tmdbType = type === "series" ? "tv" : "movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return res.json({ meta: { id, type } });

    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);

    const meta = {
      id, type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      genres: (d.genres || []).map(g => g.name),
      cast
    };

    if (type === "series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const videos = [];
      for (const season of seasons) {
        try {
          const sr = await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          (sr.episodes || []).forEach(ep => {
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
        } catch { }
      }
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }

    res.json({ meta });
  } catch (e) {
    res.json({ meta: { id, type } });
  }
});

// Dynamic stream handler
app.get("/c/:token/stream/:type/:id.json", (req, res) => {
  res.json({ streams: [] });
});

// Pass everything else to the static addon
app.use((req, res, next) => {
  const url = req.url;

  if (url.includes("/manifest.json") && !url.startsWith("/c/")) {
    return res.json(addonInterface.manifest);
  }

  if (url.match(/\/catalog\//) && !url.startsWith("/c/")) {
    const match = url.match(/\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, type, id, extraStr] = match;
      let extra = {};
      if (extraStr) {
        try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { }
      }
      handleCatalog(type, id, extra, null)
        .then(result => {
          res.json(result);
        })
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }

  next();
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Ultra MAX v5.1 running on port ${PORT}`);
  console.log(`Configure page: http://localhost:${PORT}/configure`);
});

