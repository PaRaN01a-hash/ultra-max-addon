require('dotenv').config();

const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { CATALOG_DEFS } = require("./catalogs/catalog-defs");
const { QUICK_PICK_CATALOGS } = require("./catalogs/quick-picks");
const { DYNAMIC_CATALOGS } = require("./catalogs/dynamic-catalogs");
const { loadConfigs, saveConfigs } = require("./utils/config-store");
const { hashPassword, generateToken } = require("./utils/auth");
const { rateLimit } = require("./utils/rate-limit");
const { fetchCached, fetchTrakt } = require("./services/api-helpers");

const PORT = process.env.PORT || 7000;
const TMDB_KEY = process.env.TMDB_KEY;
const MDBLIST_KEYS = (process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "5woimia0xf19uqr4rd7wl1960").split(",").map(k => k.trim()).filter(Boolean);
const MDBLIST_KEY = MDBLIST_KEYS[0];
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const FILTER_ENABLED = process.env.FILTER_MODE !=="off";

if (!TMDB_KEY) { console.error("TMDB_KEY missing - exiting"); process.exit(1); }

const imdbCache = new Map();

function getStaticIds() {
  // MDB catalogs not in static manifest - only via custom configs
  return Object.keys(CATALOG_DEFS).filter(id => {
    if (!FILTER_ENABLED) return true;
    return !["crunchyroll","hidive","anime","bollywood"].some(x => id.includes(x));
  });
}

function buildManifestCatalogs(ids) {
  return ids.map(id => {
    const def = CATALOG_DEFS[id];
    if (!def) return null;
    return { type: def.type, id, name: def.name, extra: [{ name:"skip", isRequired: false }] };
  }).filter(Boolean);
}

const staticIds = getStaticIds();

const builder = new addonBuilder({
  id: FILTER_ENABLED ?"org.kris.ultra.max.v5" :"org.kris.ultra.max.all.v5",
  version:"7.0.0-beta",
  logo: "https://max-streams.gleeze.com/logo.svg",
  name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All",
  description:"Premium curated catalogs for Stremio and Nuvio. Fast discovery, cleaner collections, and smarter rows.",
  types: ["movie","series"],
  resources: ["catalog","meta","stream"],
  catalogs: [
    { type:"movie",  id:"ultramax_placeholder", name:"Ultra MAX", extra: [{ name:"skip", isRequired: false }] }
  ]
});

async function traktToMetas(arr, type, language, rpdbKey, tpKey, excludeUnreleased = false) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const tmdbResults = (await Promise.all(
    (arr || []).map(async item => {
      const entity = item.movie || item.show || item;
      const tmdbId = entity?.ids?.tmdb;
      if (!tmdbId) return null;
      try {
        return await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`);
      } catch(e) { return null; }
    })
  )).filter(Boolean);
  return await resultsToMetas(tmdbResults, type, FILTER_ENABLED, language, rpdbKey, tpKey, excludeUnreleased);
}

async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);
  // Cap at 15k entries — evict oldest 20% when full
  if (imdbCache.size > 15000) {
    const evict = [...imdbCache.keys()].slice(0, 3000);
    evict.forEach(k => imdbCache.delete(k));
  }
  try {
    const t = type ==="series" ?"tv" :"movie";
    const r = await axios.get(`https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`, { timeout: 5000 });
    imdbCache.set(key, r.data.imdb_id || null);
    return r.data.imdb_id || null;
  } catch { imdbCache.set(key, null); return null; }
}



const certCache = new Map();
const CERT_TTL = 7 * 24 * 60 * 60 * 1000;

function ratingAllowed(cert, maxRating) {
  if (!maxRating) return true;
  if (!cert) return false;

  const order = ["G", "PG", "PG-13", "R", "NC-17"];
  const certRank = order.indexOf(cert);
  const maxRank = order.indexOf(maxRating);

  if (certRank === -1) return false;
  if (maxRank === -1) return true;
  return certRank <= maxRank;
}

async function getMovieCertification(tmdbId) {
  if (!tmdbId) return null;

  const cached = certCache.get(tmdbId);
  if (cached && Date.now() - cached.time < CERT_TTL) {
    return cached.cert;
  }

  try {
    const data = await fetchCached(`https://api.themoviedb.org/3/movie/${tmdbId}/release_dates?api_key=${TMDB_KEY}`);
    const us = (data.results || []).find(r => r.iso_3166_1 === "US");
    const releases = us ? (us.release_dates || []) : [];
    const cert = releases.map(r => r.certification).find(Boolean) || null;

    certCache.set(tmdbId, { cert, time: Date.now() });
    return cert;
  } catch (e) {
    return null;
  }
}

async function filterByMaxRating(results, maxRating) {
  if (!maxRating || !Array.isArray(results)) return results;

  const limited = results.slice(0, 40);

  const checked = await Promise.all(limited.map(async item => {
const cert = await getMovieCertification(item.id);
    return ratingAllowed(cert, maxRating) ? item : null;
  }));

  return checked.filter(Boolean);
}




const imdbTmdbCache = new Map();

async function imdbToTmdbMovieId(imdbId) {
  if (!imdbId) return null;
  if (imdbTmdbCache.has(imdbId)) return imdbTmdbCache.get(imdbId);

  try {
    const data = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const id = data.movie_results && data.movie_results[0] ? data.movie_results[0].id : null;
    imdbTmdbCache.set(imdbId, id);
    return id;
  } catch (e) {
    return null;
  }
}

async function filterMetasByMaxRating(metas, maxRating) {
  if (!maxRating || !Array.isArray(metas)) return metas;

  const limited = metas.slice(0, 100);

  const checked = await Promise.all(limited.map(async meta => {
    const imdbId = meta.id;
    const tmdbId = await imdbToTmdbMovieId(imdbId);
    if (!tmdbId) return null;

    const cert = await getMovieCertification(tmdbId);
    if (!cert && (maxRating === "G" || maxRating === "PG")) return null;
    return ratingAllowed(cert, maxRating) ? meta : null;
  }));

  return checked.filter(Boolean);
}



async function getBestPoster({ type, tmdbId, imdbId, tmdbPosterPath, fanartKey = null, omdbKey = null }) {
  const tmdbPoster = tmdbPosterPath ? `https://image.tmdb.org/t/p/w500${tmdbPosterPath}` : null;

  if (fanartKey && tmdbId) {
    try {
      const media = type === "series" ? "tv" : "movies";
      const url = type === "series"
        ? `https://webservice.fanart.tv/v3/tv/${tmdbId}?api_key=${fanartKey}`
        : `https://webservice.fanart.tv/v3/movies/${tmdbId}?api_key=${fanartKey}`;

      const data = await fetchCached(url);
      const posters = type === "series" ? (data.tvposter || []) : (data.movieposter || []);
      const best = posters.find(p => p.url) || posters[0];
      if (best && best.url) return best.url;
    } catch(e) {
      console.log("Fanart poster fallback:", e.message);
    }
  }

  if (omdbKey && imdbId) {
    try {
      const data = await fetchCached(`https://www.omdbapi.com/?i=${imdbId}&apikey=${omdbKey}`);
      if (data && data.Poster && data.Poster !== "N/A") return data.Poster;
    } catch(e) {
      console.log("OMDb poster fallback:", e.message);
    }
  }

  return tmdbPoster;
}


async function resultsToMetas(arr, type, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, excludeUnreleased = false, fanartKey = null, omdbKey = null) {
  const today = new Date().toISOString().slice(0,10);
  return (await Promise.all(
    arr.filter(i => {
      if (!i.poster_path) return false;

      const title = i.title || i.name || i.original_title || i.original_name || "";
      if (!title.trim()) return false;

      const d = i.release_date || i.first_air_date || "";

      // Keep thin/ghost TMDB entries out of public rows.
      // These often show as clickable posters but fail metadata in Nuvio.
      if (!d) return false;

      if (excludeUnreleased && d > today) return false;

      // Even when unreleased filtering is off, block far-future placeholders.
      const futureLimit = new Date();
      futureLimit.setDate(futureLimit.getDate() + 120);
      const futureLimitStr = futureLimit.toISOString().slice(0,10);
      if (d > futureLimitStr) return false;

      // Very low signal entries are often placeholders/sparse records.
      if ((i.vote_count || 0) < 1 && !i.overview) return false;

      return true;
    }).map(async i => {
      const imdb = await getImdbId(i.id, type);
      if (!imdb) return null;
      const meta = {
        id: imdb, type,
        name: i.title || i.name || i.original_title,
        poster: tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdb}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdb}.jpg` : await getBestPoster({ type, tmdbId: i.id, imdbId: imdb, tmdbPosterPath: i.poster_path, fanartKey, omdbKey }),
        background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
      };
      if (language && language !== "en-US" && i.overview) meta.description = i.overview;
      return meta;
    })
  )).filter(Boolean);
}

async function mdblistToMetas(listId, type, mdbKey, rpdbKey = null, tpKey = null, maxRating = null, fanartKey = null, omdbKey = null) {
  const tryKeys = mdbKey ? [mdbKey] : MDBLIST_KEYS;
  let data = null;
  for (const key of tryKeys) {
    const url = `https://mdblist.com/api/lists/${listId}/items/?apikey=${key}&limit=100&type=${type ==="series" ?"show" :"movie"}`;
    try {
      const resp = await fetchCached(url);
      if (resp && !resp.error) { data = resp; break; }
    } catch(e) {}
  }
  if (!data) return [];
  try {
    const items = Array.isArray(data) ? data : (data.movies || data.shows || data.items || []);
    let metas = (await Promise.all(
      items.map(async item => {
        const imdbId = item.imdb_id || item.imdbid;
        if (!imdbId) return null;
        const tmdbType = type ==="series" ?"tv" :"movie";
        try {
          const find = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
          const result = find[`${tmdbType}_results`]?.[0];
          if (!result) return { id: imdbId, type, name: item.title };
          return {
            id: imdbId, type,
            name: item.title || result.title || result.name,
            poster: tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdbId}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg` : await getBestPoster({ type, tmdbId: result.id, imdbId: imdbId, tmdbPosterPath: result.poster_path, fanartKey, omdbKey }),
            background: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null
          };
        } catch { return { id: imdbId, type, name: item.title }; }
      })
    )).filter(Boolean);

      if (type === "movie" && maxRating) {
        metas = await filterMetasByMaxRating(metas, maxRating);
      }

      return metas;
  } catch (e) { console.log("mdblist error", listId, e.message); return []; }
}


async function geminiAiRecommendations({ type, googleAiKey, traktUser = null, language = "en-US" }) {
  if (!googleAiKey) return [];

  const mediaLabel = type === "series" ? "TV series" : "movies";
  const prompt = `
Return ONLY valid JSON.
Recommend 12 ${mediaLabel} for a streaming catalog.
${traktUser ? `If useful, personalise for Trakt user "${traktUser}".` : "Use broadly popular, high-quality choices."}

JSON shape:
{"items":[{"title":"The Matrix","year":1999},{"title":"Breaking Bad","year":2008}]}
No markdown. No explanation.
`;

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": googleAiKey
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!r.ok) {
    console.error("Gemini AI rows failed:", r.status, await r.text().catch(() => ""));
    return type === "series"
      ? [
          { title: "Breaking Bad", year: 2008 },
          { title: "Game of Thrones", year: 2011 },
          { title: "The Sopranos", year: 1999 },
          { title: "The Wire", year: 2002 },
          { title: "Stranger Things", year: 2016 },
          { title: "The Last of Us", year: 2023 }
        ]
      : [
          { title: "The Matrix", year: 1999 },
          { title: "Inception", year: 2010 },
          { title: "Interstellar", year: 2014 },
          { title: "The Dark Knight", year: 2008 },
          { title: "Mad Max: Fury Road", year: 2015 },
          { title: "Dune", year: 2021 }
        ];
  }

  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\\n") || "";

  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 12) : [];
  } catch (e) {
    console.error("Gemini JSON parse failed:", text.slice(0, 300));
    return [];
  }
}

async function tmdbResolveAiItems(items, type, language, rpdbKey, tpKey, excludeUnreleased, fanartKey = null, omdbKey = null) {
  const tmdbType = type === "series" ? "tv" : "movie";
  const found = [];

  for (const item of items || []) {
    const title = encodeURIComponent(item.title || "");
    if (!title) continue;

    try {
      const data = await fetchCached(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${title}&include_adult=false&page=1`);
      const result = (data.results || [])[0];
      if (result) found.push(result);
    } catch(e) {}
  }

  return resultsToMetas(found, type, FILTER_ENABLED, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey);
}

async function handleCatalog(catalogId, type, extra, mdbKey, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, traktUser = null, excludeUnreleased = false, maxRating = null, customCatalogs = [], googleAiKey = null, fanartKey = null, omdbKey = null) {
console.log(
  "HANDLECATALOG:",
  catalogId,
  "extra=",
  JSON.stringify(extra),
   "maxRating=",
  maxRating

);
  // FORCE SEARCH NO CACHE: only dedicated search catalogs should answer search requests.
  // Without this guard, Nuvio repeats the same search results under every catalog row.
if (extra && extra.search) {
const searchableCatalogs = new Set([
  "search_movies",
  "search_series",
  "popular_movies",
  "popular_series"
]);
  if (!searchableCatalogs.has(catalogId)) {
    return { metas: [] };
  }
}
  if (false && extra && extra.search && catalogId !== "search_movie" && catalogId !== "search_movies" && catalogId !== "search_series") {
    return { metas: [] };
  }

  if (extra && extra.search) {
    const q = String(extra.search).replace(/\.json$/, '').trim();
    const tmdbType = type === "series" ? "tv" : "movie";
    const language = arguments[5] || "en-US";
    const rpdbKey = arguments[6] || null;
    const tpKey = arguments[7] || null;

console.log("FORCED SEARCH NO CACHE:", catalogId, type, q);

// ACTOR SEARCH

if (q.includes(" ")) {
  try {
    const personData = await fetchCached(
      `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}`
    );

    const person = personData?.results?.[0];
console.log(
  "PERSON SEARCH:",
  q,
  person?.name,
  person?.known_for_department,
  person?.popularity
);
    if (
      person &&
      person.known_for_department === "Acting"
    ) {
      console.log("ACTOR SEARCH:", person.name, person.id);

      const actorData = await fetchCached(
        `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_cast=${person.id}&sort_by=popularity.desc&page=1`
      );

      return {
        metas: await resultsToMetas(
          actorData.results || [],
          "movie",
          false,
          language,
          rpdbKey,
          tpKey
        )
      };
    }
  } catch (e) {
    console.log("ACTOR SEARCH FAILED:", e.message);
  }
}


const genreCatalogs = {
  action: "action_movies",
  comedy: "comedy_movies",
  horror: "horror_movies",
  thriller: "thriller_movies",
  crime: "crime_movies",
  scifi: "scifi_movies",
  documentary: "documentary_movies",
  animation: "animation_movies",
  fantasy: "fantasy_movies",
  drama: "drama_movies",
  mystery: "mystery_movies",
  zombie: "theme_zombie",
  superhero: "theme_superhero"
};

const genreKey = q.toLowerCase().trim();

if (genreCatalogs[genreKey]) {
  console.log("GENRE SEARCH:", genreKey);

  return await handleCatalog(
    genreCatalogs[genreKey],
    "movie",
    {},
    mdbKey,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    traktUser,
    excludeUnreleased,
    maxRating,
    customCatalogs,
    googleAiKey,
    fanartKey,
    omdbKey
  );
}
 
   if (q) {
      const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1&language=${language}`;
              const r = await fetch(url);
        const data = await r.json();

        let results = data.results || [];

        results.sort((a, b) => {
          const at = String(a.title || a.name || "").toLowerCase();
          const bt = String(b.title || b.name || "").toLowerCase();
          const ql = q.toLowerCase();

          let ascore = Number(a.popularity || 0);
          let bscore = Number(b.popularity || 0);

          if (at === ql) ascore += 100000;
          if (bt === ql) bscore += 100000;

          if (at.startsWith(ql)) ascore += 50000;
          if (bt.startsWith(ql)) bscore += 50000;

          if (at.includes(ql)) ascore += 10000;
          if (bt.includes(ql)) bscore += 10000;

          return bscore - ascore;
        });

        console.log(
          results.slice(0,5).map(x => x.title || x.name)
        );

        console.log(
          "FORCED SEARCH RESULTS:",
          catalogId,
          "count=",
          results.length
        );

        return {
          metas: await resultsToMetas(
            results,
            type,
            false,
            language,
            rpdbKey,
            tpKey
          )
        };
    }
  }


  const skip = extra?.skip || 0;
  const page = Math.floor(skip / 20) + 1;
  const tmdbType = type ==="series" ?"tv" :"movie";
  const tmdbId = extra?.tmdbId;
  // 🔥 QUICK PICKS ENGINE
  if (catalogId === "ai_recommended_movies" || catalogId === "ai_recommended_series") {
    const items = await geminiAiRecommendations({ type, googleAiKey, traktUser, language });
    const metas = await tmdbResolveAiItems(items, type, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey);
    return { metas };
  }

  if (catalogId.startsWith("quick_")) {
    const providerMap = {
      netflix: 8,
      prime: 9,
      disney: 337,
      apple: 350
    };

    let url = null;

    if (catalogId === "quick_trending_movies") {
      url = `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&page=${page}`;
    }

    if (catalogId === "quick_trending_series") {
      url = `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_KEY}&page=${page}`;
    }

    const providerMatch = catalogId.match(/quick_(\w+)_/);
    const provider = providerMatch ? providerMatch[1] : null;

    if (provider && providerMap[provider]) {
      const p = providerMap[provider];
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${p}&watch_region=US&sort_by=popularity.desc&page=${page}`;
    }

    if (!url) return { metas: [] };

    const data = await fetchCached(url);
    let results = data.results || [];

    if (type === "movie" && maxRating) {
      results = await filterByMaxRating(results, maxRating);
    }

    const metas = await resultsToMetas(results, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey);
    return { metas: metas.slice(0, 20) };
  }

  const RATING_ORDER = ["G","PG","PG-13","R","NC-17"];
  const allowedRatings = maxRating ? RATING_ORDER.slice(0, RATING_ORDER.indexOf(maxRating) + 1) : [];
  const ratingParam = allowedRatings.length ? `&certification_country=US&certification=${allowedRatings.map(encodeURIComponent).join("%7C")}` : "";
  const sortBy = extra?.sort === "chronological" ? "primary_release_date.asc" : (extra?.sort === "release_date_desc" ? "primary_release_date.desc" : (extra?.sort === "top_rated" ? "vote_average.desc&vote_count.gte=200" : "popularity.desc"));

  if (catalogId ==="similar_movie" || catalogId ==="similar_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/similar?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey) };
  }
  if (catalogId ==="recommended_movie" || catalogId ==="recommended_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey) };
  }
  if (catalogId ==="collection_movie") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_KEY}`);
    return { metas: await resultsToMetas(data.parts || [], "movie", filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
  }

  const def = CATALOG_DEFS[catalogId];
  if (!def) return { metas: [] };

  if (def.handler ==="mdb") {
    const listId = catalogId.replace("mdb_","");
    return { metas: await mdblistToMetas(listId, type, mdbKey, rpdbKey, tpKey, maxRating, fanartKey, omdbKey) };
  }

  let url;
  switch(def.handler) {
    case"tmdb_trending":
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
      break;
    case"tmdb_source":
      url = `https://api.themoviedb.org/3/${tmdbType}/${def.source}?api_key=${TMDB_KEY}&page=${page}`;
      break;
    case"tmdb_provider":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${def.provider}&watch_region=US&sort_by=popularity.desc&page=${page}${type==="movie"?ratingParam:""}`;
      break;
    case"tmdb_genre": {
      let genre = def.genre;
      if (type ==="series") {
        if (genre === 28) genre = 10759;
        if ([878, 27, 14].includes(genre)) genre = 10765;
        if (genre === 53) genre = 9648;
      }
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}${type==="movie"?ratingParam:""}`;
      break;
    }
    case"tmdb_keyword":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_keywords=${def.keyword}&sort_by=popularity.desc&page=${page}${ratingParam}`;
      if (def.lang) url += `&with_original_language=${def.lang}`;
      break;
    case"tmdb_company":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_companies=${encodeURIComponent(def.company)}&sort_by=${sortBy}&page=${page}${ratingParam}${def.excludeAnimation?"&without_genres=16":""}`;
      break;
    case"tmdb_network":
      url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_networks=${def.networkId}&sort_by=${sortBy}&page=${page}`;
      break;
    case"tmdb_actor":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_cast=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;
    case"tmdb_director":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_crew=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;
    case"tmdb_collection": {
      let parts = (await fetchCached(`https://api.themoviedb.org/3/collection/${def.collectionId}?api_key=${TMDB_KEY}`)).parts || [];
      if(extra?.sort === "chronological") parts = parts.slice().sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      else if(extra?.sort === "release_date_desc") parts = parts.slice().sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      return { metas: await resultsToMetas(parts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey) };
    }
    case"tmdb_multi_collection": {
      let allParts = [];
      for(const cid of def.collectionIds) {
        try {
          const d = await fetchCached(`https://api.themoviedb.org/3/collection/${cid}?api_key=${TMDB_KEY}`);
          if(d.parts) allParts.push(...d.parts);
        } catch(e) {}
      }
      if(extra?.sort === "chronological") allParts = allParts.sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      else if(extra?.sort === "release_date_desc") allParts = allParts.sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      return { metas: await resultsToMetas(allParts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey) };
    }
    case"trakt_trending": {
      const path = type === "series" ? "/shows/trending" : "/movies/trending";
const data = await fetchTrakt(
  `${path}?limit=50`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_popular": {
      const path = type === "series" ? "/shows/popular" : "/movies/popular";
      const data = await fetchTrakt(
  `${path}?limit=50&extended=full`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_anticipated": {
      const path = type === "series" ? "/shows/anticipated" : "/movies/anticipated";
      const data = await fetchTrakt(
  `${path}?limit=50`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_favorites": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(
  `/users/${traktUser}/favorites/${t}?limit=50`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_watchlist": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(
  `/users/${traktUser}/watchlist/${t}?limit=50`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_collection": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(
  `/users/${traktUser}/collection/${t}`,
  TRAKT_CLIENT_ID
);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"tmdb_anime":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}${type==="movie"?ratingParam:""}`;
      break;
    case"tmdb_bollywood":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_original_language=hi&sort_by=popularity.desc&page=${page}${type==="movie"?ratingParam:""}`;
      break;
    case"tmdb_paramount":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=2616%7C2303&watch_region=US&sort_by=popularity.desc&page=${page}${type==="movie"?ratingParam:""}`;
      break;


    case "tmdb_ids": {
      const ids = Array.isArray(def.ids) ? def.ids : [];
      const results = [];

      for (const tmdbId of ids) {
        try {
          const item = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`);
          if(item && item.id) results.push(item);
        } catch(e) {
          console.log("tmdb_ids error", catalogId, tmdbId, e.message);
        }
      }

      return { metas: await resultsToMetas(results, type, false, language, rpdbKey, tpKey) };
    }

    case "tmdb_search": {
      const q = def.query || def.name;
      const data = await fetchCached(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&page=1&language=${language}`);
      return { metas: await resultsToMetas(data.results || [], type, false, language, rpdbKey, tpKey) };
    }

    case"search":
      console.log("SEARCH CASE HIT:", catalogId, extra?.search);
      if (!extra?.search) return { metas: [] };

      const rawSearch = String(extra.search || "").replace(/\.json$/, "").trim();

      const norm = (v) => String(v || "")
        .toLowerCase()
        .replace(/^the\s+/i, "")
        .replace(/&/g, "and")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

      const wanted = norm(rawSearch);

      const scoreResult = (r) => {
        const title = r.title || r.name || r.original_title || r.original_name || "";
        const original = r.original_title || r.original_name || "";
        const titleNorm = norm(title);
        const originalNorm = norm(original);

        let score = 0;

        if (titleNorm === wanted) score += 100000;
        if (originalNorm === wanted) score += 75000;
        if (titleNorm.startsWith(wanted)) score += 30000;
        if (titleNorm.includes(wanted)) score += 15000;

        score += Number(r.popularity || 0) * 100;
        score += Number(r.vote_count || 0) * 2;
        score += Number(r.vote_average || 0) * 10;

        const date = r.first_air_date || r.release_date || "";
        const year = Number(String(date).slice(0, 4));
        if (year >= 2020) score += 500;
        else if (year >= 2010) score += 250;

        return score;
      };

      const searchUrl = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(rawSearch)}&page=1&include_adult=false`;
      const searchData = await fetchCached(searchUrl);
      let results = Array.isArray(searchData?.results) ? searchData.results : [];

      if ((!results || results.length === 0) && type === "movie") {
        const collectionUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_KEY}&query=${encodeURIComponent(rawSearch)}&page=1&include_adult=false`;
        const collectionData = await fetchCached(collectionUrl);
        const collections = Array.isArray(collectionData?.results) ? collectionData.results : [];

        for (const c of collections.slice(0, 3)) {
          if (!c?.id) continue;

          try {
            const col = await fetchCached(`https://api.themoviedb.org/3/collection/${c.id}?api_key=${TMDB_KEY}`);
            if (Array.isArray(col?.parts)) results.push(...col.parts);
          } catch(e) {
            console.log("SEARCH COLLECTION FALLBACK ERROR:", c.id, e.message);
          }
        }
      }

      results = results
        .filter(r => r && !r.adult && (r.title || r.name || r.original_title || r.original_name))
        .map(r => ({ ...r, __ultraSearchScore: scoreResult(r) }))
        .sort((a, b) => (b.__ultraSearchScore || 0) - (a.__ultraSearchScore || 0))
        .slice(0, 20);

      return {
        metas: await resultsToMetas(results, type, false, language, rpdbKey, tpKey)
      };
    default:
      return { metas: [] };
  }


  if (language && language !== "en-US") url += `&language=${language}`;
  const startPage = Math.floor((extra?.skip || 0) / 100) * 5 + 1;
  const pages = await Promise.all(
    Array.from({length: 5}, (_, i) =>
      fetchCached(url.replace(`page=${page}`, `page=${startPage + i}`))
        .catch(() => ({ results: [] }))
    )
  );
  let allResults = pages.flatMap(d => d.results || []);
  if (type === "movie" && maxRating) {
      allResults = await filterByMaxRating(allResults, maxRating);
  }
  return { metas: await resultsToMetas(allResults, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased, fanartKey, omdbKey) };

}

function buildCatalogsFromIds(selectedIds, hiddenIds = []) {
  const hiddenSet = new Set(hiddenIds || []);
  const quickMap = new Map(QUICK_PICK_CATALOGS.map(c => [c.id, c]));

  return selectedIds.map(id => {
    const quick = quickMap.get(id);
    if (quick) {
      return {
        type: quick.type,
        id: quick.id,
        name: quick.name,
        extra: [{ name:"skip", isRequired: false }]
      };
    }

    const def = CATALOG_DEFS[id];
    if (!def) return null;
    return {
      type: def.type,
      id,
      name: def.name,
      showInHome: !hiddenSet.has(id),
      extra: [{ name:"skip", isRequired: false }]
    };
  }).filter(Boolean);
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log("SDK HANDLER:", id, extra);
  try { return await handleCatalog(id, type, extra, null); }
  catch (e) { console.log("catalog error", id, e.message); return { metas: [] }; }
});


// ===============================
// STREAM BRIDGE v1 - DEV ONLY
// ===============================
const STREAM_BRIDGE_TIMEOUT_MS = 8000;

function normaliseManifestUrl(url) {
  if (!url) return null;
  let u = String(url).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  // Support both:
  // https://host/config/manifest.json
  // https://host/configmanifest.json
  if (/manifest\.json(?:\?.*)?$/i.test(u) && !/\/manifest\.json(?:\?.*)?$/i.test(u)) {
    u = u.replace(/manifest\.json(?:\?.*)?$/i, "/manifest.json");
  }

  if (!/\/manifest\.json(?:\?.*)?$/i.test(u)) return null;
  return u;
}

function streamUrlFromManifest(manifestUrl, type, id) {
  return manifestUrl.replace(/\/manifest\.json(?:\?.*)?$/i, `/stream/${type}/${id}.json`);
}

async function fetchStreamAddonName(manifestUrl) {
  try {
    const m = await fetchCached(manifestUrl);
    return m && m.name ? String(m.name).trim() : "External";
  } catch (e) {
    return "External";
  }
}

async function fetchStreamsFromAddon(manifestUrl, type, id) {
  const cleanManifest = normaliseManifestUrl(manifestUrl);
  if (!cleanManifest) return [];

  const url = streamUrlFromManifest(cleanManifest, type, id);
  const addonName = await fetchStreamAddonName(cleanManifest);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_BRIDGE_TIMEOUT_MS);

  try {
    console.log("STREAM BRIDGE CALL", url);
    const resp = await fetch(url, { signal: controller.signal });
    console.log("STREAM BRIDGE STATUS", resp.status, url);
    if (!resp.ok) return [];

    const data = await resp.json();
    const streams = Array.isArray(data.streams) ? data.streams : [];

    return streams.map(stream => ({
      ...stream
    }));
  } catch (e) {
    console.log("STREAM BRIDGE ERROR", e.message, url);
    return [];
  } finally {
    clearTimeout(timer);
  }
}


function streamQualityScore(stream) {
  const nameText = String(stream.name || '').toLowerCase();
  const text = ((stream.name || '') + ' ' + (stream.title || '') + ' ' + (stream.description || '')).toLowerCase();
  const resolutionText = nameText || text;

  let score = 0;
  if (resolutionText.includes('2160') || resolutionText.includes('4k') || resolutionText.includes('uhd')) score += 4000;
  else if (resolutionText.includes('1080')) score += 3000;
  else if (resolutionText.includes('720')) score += 2000;
  else if (resolutionText.includes('480')) score += 1000;

  if (text.includes('remux')) score += 40;
  if (text.includes('hdr') || text.includes('dolby vision') || text.includes('dv')) score += 25;
  if (text.includes('bluray') || text.includes('blu-ray')) score += 20;
  if (text.includes('web-dl') || text.includes('webrip')) score += 10;

  if (text.includes('cam') || text.includes('ts') || text.includes('telesync')) score -= 500;
  if (text.includes('scr')) score -= 250;

  const size = stream.behaviorHints && stream.behaviorHints.videoSize ? Number(stream.behaviorHints.videoSize) : 0;
  if (size) score += Math.min(60, Math.floor(size / (1024 * 1024 * 1024)));

  return score;
}

function cleanStreamLabel(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();
}


function cleanTitle(t){
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isProbablySameTitle(a, b){
  const t1 = cleanTitle(a);
  const t2 = cleanTitle(b);

  if (!t1 || !t2) return true;

  // quick contain check
  if (t1.includes(t2) || t2.includes(t1)) return true;

  // basic word overlap
  const words1 = t1.split(' ');
  const words2 = t2.split(' ');

  const overlap = words1.filter(w => words2.includes(w)).length;

  return overlap >= Math.min(3, words2.length);
}

function sortAndLimitStreams(streams, limit = 30) {
  return streams
    .map(s => ({ ...s, _score: streamQualityScore(s) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...s }) => s);
}


function hardenStreamForNuvio(stream){
  const title = String(stream.title || stream.description || "");
  const name = String(stream.name || "");
  const filename = String(stream.behaviorHints?.filename || "");
  const size = Number(stream.behaviorHints?.videoSize || 0);

  const text = `${name}\n${title}\n${filename}`.toLowerCase();

  const fragile =
    text.includes("stremthru") ||
    text.includes("remux") ||
    size > 45 * 1024 * 1024 * 1024;

  return {
    ...stream,
    behaviorHints: {
      ...(stream.behaviorHints || {}),
      notWebReady: false,
      fragilePlayback: fragile
    },
    headers: {
      ...(stream.headers || {}),
      "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
      "Referer": "https://aiostreams.elfhosted.com/",
      "Origin": "https://aiostreams.elfhosted.com"
    },
    _ultraFragile: fragile
  };
}

function streamRankForNuvio(s){
  const text = String(`${s.name || ""}\n${s.title || ""}\n${s.description || ""}\n${s.behaviorHints?.filename || ""}`).toLowerCase();
  const size = Number(s.behaviorHints?.videoSize || 0);
  const gb = size / 1024 / 1024 / 1024;

  let score = 0;

  if (text.includes("1080p")) score += 100;
  if (text.includes("2160p") || text.includes("4k")) score += 85;
  if (text.includes("720p")) score += 65;

  if (gb >= 2 && gb <= 18) score += 80;
  else if (gb > 18 && gb <= 35) score += 45;
  else if (gb > 35 && gb <= 50) score += 10;
  else if (gb > 50) score -= 80;
  else if (gb > 0 && gb < 1) score -= 15;

  if (text.includes("remux")) score -= 60;
  if (text.includes("stremthru")) score -= 40;

  return score;
}

function sortNuvioFriendlyStreams(a, b){
  if (!!a._ultraFragile !== !!b._ultraFragile) return a._ultraFragile ? 1 : -1;
  return streamRankForNuvio(b) - streamRankForNuvio(a);
}

async function streamBridgeResponse(streamAddons, type, id) {
  const addons = (streamAddons || [])
    .map(normaliseManifestUrl)
    .filter(Boolean)
    .slice(0, 8);

  if (!addons.length) return { streams: [] };

  const results = await Promise.allSettled(
    addons.map(url => fetchStreamsFromAddon(url, type, id))
  );

  const streams = results.flatMap(r => r.status === "fulfilled" ? r.value : []);

  // Basic dedupe by URL/infoHash/title
  const seen = new Set();
  const deduped = [];
  for (const s of streams) {
    const key = s.url || s.infoHash || s.externalUrl || s.title || JSON.stringify(s).slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);

deduped.push(s);
  }

  const hardened = deduped
    .map(hardenStreamForNuvio)
    .sort(sortNuvioFriendlyStreams)
    .map(({ _ultraFragile, ...stream }) => stream);

  return { streams: hardened.slice(0, 30) };
}

builder.defineStreamHandler(async () => ({ streams: [] }));

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const tmdbType = type ==="series" ?"tv" :"movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return { meta: { id, type } };
    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    if (!d) return { meta: { id, type } };
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
    if (type ==="series" && d.next_episode_to_air) {
      const next = d.next_episode_to_air;
      meta.releaseInfo = `${d.first_air_date?.split("-")[0] ||""} - Next: S${next.season_number}E${next.episode_number} ${next.air_date}`;
    }
    if (type ==="series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const seasonData = await Promise.all(
        seasons.map(async season => {
          try {
            return await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          } catch { return null; }
        })
      );
      const videos = [];
      seasonData.forEach((sr, i) => {
        if (!sr) return;
        const season = seasons[i];
        (sr.episodes || []).forEach(ep => {
          videos.push({
            id: `${id}:${season.season_number}:${ep.episode_number}`,
            title: ep.name || `Episode ${ep.episode_number}`,
            season: season.season_number, episode: ep.episode_number,
            overview: ep.overview || "",
            thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
            released: ep.air_date ? new Date(ep.air_date).toISOString() : null
          });
        });
      });
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }
    return { meta };
  } catch (e) { return { meta: { id, type } }; }
});

const addonInterface = builder.getInterface();
const app = express();
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(200); next(); });
app.use(express.json());

// ================================
// ULTRA MAX STREAM WIZARD - PHASE 1
// Validate external Stremio manifest URLs
// ================================
app.post('/api/stream-wizard/check', async (req, res) => {
  try {
    const manifestUrl = String(req.body?.manifestUrl || '').trim();

    if (!manifestUrl) {
      return res.status(400).json({ ok:false, error:'Missing manifestUrl' });
    }

    if (!/^https?:\/\/.+\/manifest\.json(\?.*)?$/i.test(manifestUrl)) {
      return res.status(400).json({
        ok:false,
        error:'That does not look like a Stremio manifest URL. It should end with /manifest.json'
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const r = await fetch(manifestUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'UltraMAX-StreamWizard/1.0' },
      signal: controller.signal
    });

    clearTimeout(timeout);

    const raw = await r.text();

    if (!r.ok) {
      // Some providers, especially Torrentio-style hosted addons, block server-side checks.
      // Treat 403 as "unverified but addable" rather than invalid.
      if (r.status === 403) {
        const lower = manifestUrl.toLowerCase();
        const guessedName =
          lower.includes('torrentio') ? 'Torrentio' :
          lower.includes('comet') ? 'Comet' :
          lower.includes('aio') ? 'AIOStreams' :
          'Protected stream addon';

        return res.json({
          ok:true,
          protected:true,
          manifestUrl,
          id:null,
          name: guessedName,
          version:null,
          description:'This addon blocked Ultra MAX server-side checking with HTTP 403.',
          logo:null,
          resources:['stream'],
          types:['movie','series'],
          catalogCount:0,
          supportsStreams:true,
          warning:'This addon blocked verification with HTTP 403, but it may still work normally inside Nuvio/Stremio.'
        });
      }

      return res.status(400).json({
        ok:false,
        error:`Manifest returned HTTP ${r.status}`,
        preview: raw.slice(0, 300)
      });
    }

    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch (e) {
      return res.status(400).json({
        ok:false,
        error:'Manifest did not return valid JSON',
        preview: raw.slice(0, 300)
      });
    }

    const resources = Array.isArray(manifest.resources) ? manifest.resources : [];
    const types = Array.isArray(manifest.types) ? manifest.types : [];
    const catalogs = Array.isArray(manifest.catalogs) ? manifest.catalogs : [];

    const supportsStreams =
      resources.includes('stream') ||
      resources.some(x => typeof x === 'object' && x.name === 'stream');

    return res.json({
      ok:true,
      manifestUrl,
      id: manifest.id || null,
      name: manifest.name || 'Unnamed addon',
      version: manifest.version || null,
      description: manifest.description || null,
      logo: manifest.logo || manifest.icon || null,
      resources,
      types,
      catalogCount: catalogs.length,
      supportsStreams,
      warning: supportsStreams ? null : 'This addon does not appear to provide stream resources.'
    });

  } catch (err) {
    return res.status(500).json({
      ok:false,
      error: err.name === 'AbortError'
        ? 'Manifest check timed out'
        : String(err.message || err)
    });
  }
});


app.get("/health", (req, res) => { res.status(200).json({ ok: true, service: "ultra-max", timestamp: new Date().toISOString() }); });



app.get("/assets", (req, res) => {
  const fs = require("fs");
  const dir = "/app/images";

  let files = [];
  try {
    files = fs.readdirSync(dir)
      .filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f))
      .sort();
  } catch (e) {
    return res.status(500).send("Could not read image folder: " + e.message);
  }

  const cards = files.map(f => {
    const safeName = String(f).replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const url = "/images/" + encodeURIComponent(f);
    return '<div class="card">' +
      '<img src="' + url + '">' +
      '<div class="name">' + safeName + '</div>' +
      '<button type="button" data-url="' + url + '">Copy URL</button>' +
      '</div>';
  }).join("");

  res.send(`<!doctype html>
<html>
<head>
<title>Ultra MAX Asset Library</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{margin:0;background:#05070d;color:white;font-family:Arial;padding:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
.card{border:1px solid #333;border-radius:12px;padding:10px;background:#111}
.card img{width:100%;height:120px;object-fit:cover;border-radius:8px}
.name{font-size:12px;margin:8px 0;color:#ccc;word-break:break-all}
button{width:100%;padding:8px;border-radius:8px;background:#18ffff22;color:#18ffff;border:1px solid #18ffff66}
</style>
</head>
<body>
<h1>Ultra MAX Asset Library</h1>
<p>Tap Copy URL, then paste it into your Cover or GIF field.</p>
<div class="grid">${cards}</div>
<script>
document.querySelectorAll("button[data-url]").forEach(function(btn){
  btn.addEventListener("click", function(){
    var full = window.location.origin + btn.getAttribute("data-url");
    navigator.clipboard.writeText(full).then(function(){
      alert("Copied: " + full);
    });
  });
});
</script>
</body>
</html>`);
});



app.get("/configure", (req, res) => { res.setHeader("Cache-Control","public, max-age=300"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/configure/:token", (req, res) => { res.setHeader("Cache-Control","public, max-age=300"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/c/:token/configure", (req, res) => { res.redirect(`/configure/${req.params.token}`); });
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
app.get("/collections-builder", (req, res) => { res.sendFile(path.join(__dirname,"collections-builder.html")); });
app.use("/images", express.static(path.join(__dirname,"images"), { maxAge: '7d', etag: true }));
app.get("/collections.json", (req, res) => { res.sendFile(path.join(__dirname,"collections.json")); });

app.post("/api/ai/custom-row", async (req, res) => {
  try {
    const { prompt, count = 1, googleAiKey, traktUser = null, language: rowLanguage = "en-US" } = req.body || {};
    const watchRegion = (rowLanguage.split("-")[1] || "US").toUpperCase();
    const key = googleAiKey || process.env.GOOGLE_AI_KEY || process.env.GEMINI_KEY || null;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: "Missing prompt" });
    }

    
    if (!key) {
      // 🔁 Fallback: simple parser (no AI key needed)
      const lower = prompt.toLowerCase();

      const isSeries = lower.includes("series") || lower.includes("shows") || lower.includes("tv");
      const type = isSeries ? "series" : "movie";
      const tmdbType = isSeries ? "tv" : "movie";

      const genreMap = {
        action: "28",
        comedy: "35",
        drama: "18",
        horror: "27",
        scifi: "878",
        "sci-fi": "878",
        thriller: "53",
        romance: "10749",
        animation: "16",
        crime: "80"
      };

      let genre = "";
      for (const g in genreMap){
        if (lower.includes(g)){
          genre = genreMap[g];
          break;
        }
      }

      let rating = "";
      const ratingMatch = lower.match(/(?:rating\s*(?:on|of|above|over)?|above|over)\s*(\d+(\.\d+)?)/);
      if (ratingMatch) {
        rating = ratingMatch[1];
      }

      let yearFrom = "", yearTo = "";

      const fullDecadeMatch = lower.match(/(19\d{2}|20\d{2})s/);
      const shortDecadeMatch = lower.match(/\b(70|80|90|00|10|20)s\b/);

      if (fullDecadeMatch) {
        yearFrom = fullDecadeMatch[1];
        yearTo = String(Number(yearFrom) + 9);
      } else if (shortDecadeMatch) {
        const d = shortDecadeMatch[1];
        if (d === "70") yearFrom = "1970";
        if (d === "80") yearFrom = "1980";
        if (d === "90") yearFrom = "1990";
        if (d === "00") yearFrom = "2000";
        if (d === "10") yearFrom = "2010";
        if (d === "20") yearFrom = "2020";
        yearTo = String(Number(yearFrom) + 9);
      }

      return res.json({
        rows: [{
          name: prompt,
          type,
          source: "tmdb",
          withGenres: genre,
          voteAverageGte: rating,
          yearFrom,
          yearTo,
          watchRegion,
          language: rowLanguage
        }]
      });
    }


    const wanted = Math.max(1, Math.min(Number(count) || 1, 5));

    const aiPrompt = `
You are helping build custom Stremio/Nuvio homepage catalog rows.

Return ONLY valid JSON. No markdown.

Create ${wanted} custom catalog row objects for this idea:
"${prompt}"

Trakt username, optional context: ${traktUser || "none"}

Each object must use this exact shape:
{
  "name": "Short row title",
  "type": "movie" or "series",
  "source": "tmdb_discover",
  "tmdbType": "movie" or "tv",
  "sortBy": "popularity.desc",
  "withGenres": "",
  "withoutGenres": "",
  "yearFrom": "",
  "yearTo": "",
  "voteAverageGte": "",
  "withCast": "",
  "withCrew": "",
  "withCompanies": "",
  "withNetworks": "",
  "withWatchProviders": "",
  "watchRegion": "${watchRegion}",
  "language": "${rowLanguage}"
}

Rules:
- Use source "tmdb_discover".
- For movies use type "movie" and tmdbType "movie".
- For series use type "series" and tmdbType "tv".
- Prefer GB watch region.
- Use TMDB genre IDs where obvious.
- If the prompt asks for an actor, put their TMDB person ID in withCast if you know it, otherwise leave blank.
- If unsure, keep fields blank rather than inventing bad IDs.
- Return an array only.
`;

    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: aiPrompt }] }]
      })
    });

    const raw = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Gemini request failed", details: raw.slice(0, 500) });
    }

    const data = JSON.parse(raw);
    let text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || "";
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

    const rows = JSON.parse(text);

    if (!Array.isArray(rows)) {
      return res.status(500).json({ error: "AI did not return an array", raw: text.slice(0, 500) });
    }

    res.json({ rows: rows.slice(0, wanted) });
  } catch (err) {
    console.error("AI custom row route failed:", err);
    res.status(500).json({ error: err.message || "AI custom row route failed" });
  }
});


app.post("/c/create", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rateLimit(ip, 5, 60000)) return res.status(429).json({ error:"Too many requests." });
  const { password, catalogs, mdblistKey, language, rpdbKey, tpKey, fanartKey, omdbKey, traktUser, excludeUnreleased, maxRating, streamAddons, customCatalogs, googleAiKey, enableAiRecommended, hiddenCatalogs } = req.body;
  if (!password || !catalogs || !catalogs.length) return res.status(400).json({ error:"Password and catalogs required" });
  const configs = loadConfigs();
  let token = generateToken();
  while (configs[token]) token = generateToken();
  configs[token] = { passwordHash: hashPassword(password), catalogs, mdblistKey: mdblistKey || null, language: language || "en-US", rpdbKey: rpdbKey || null, tpKey: tpKey || null, fanartKey: fanartKey || null, omdbKey: omdbKey || null, traktUser: traktUser || null, excludeUnreleased: !!excludeUnreleased, maxRating: maxRating || null, streamAddons: Array.isArray(streamAddons) ? streamAddons.filter(Boolean) : [], customCatalogs: Array.isArray(customCatalogs) ? customCatalogs.filter(Boolean) : [], googleAiKey: googleAiKey || null, enableAiRecommended: !!enableAiRecommended, hiddenCatalogs: Array.isArray(hiddenCatalogs) ? hiddenCatalogs : [], createdAt: new Date().toISOString() };
  saveConfigs(configs);
  res.json({ token });
});

app.post("/c/:token/update", (req, res) => {
  const { token } = req.params;
  const { password, catalogs, mdblistKey, language, rpdbKey, tpKey, fanartKey, omdbKey, traktUser, excludeUnreleased, maxRating, streamAddons, customCatalogs, googleAiKey, enableAiRecommended, hiddenCatalogs } = req.body;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Config not found" });
  if (configs[token].passwordHash !== hashPassword(password)) return res.status(401).json({ error:"Incorrect password" });
  configs[token].catalogs = catalogs;
  configs[token].language = language || configs[token].language || "en-US";
  configs[token].rpdbKey = rpdbKey || configs[token].rpdbKey || null;
  configs[token].tpKey = tpKey || configs[token].tpKey || null;
  configs[token].fanartKey = fanartKey || configs[token].fanartKey || null;
  configs[token].omdbKey = omdbKey || configs[token].omdbKey || null;
  configs[token].mdblistKey = mdblistKey || configs[token].mdblistKey || null;
  configs[token].traktUser = traktUser !== undefined ? traktUser : configs[token].traktUser;
  configs[token].excludeUnreleased = excludeUnreleased !== undefined ? !!excludeUnreleased : (configs[token].excludeUnreleased || false);
  configs[token].maxRating = maxRating !== undefined ? maxRating : (configs[token].maxRating || null);
  configs[token].streamAddons = Array.isArray(streamAddons) ? streamAddons.filter(Boolean) : (configs[token].streamAddons || []);
  configs[token].customCatalogs = Array.isArray(customCatalogs) ? customCatalogs.filter(Boolean) : (configs[token].customCatalogs || []);
configs[token].googleAiKey = googleAiKey || configs[token].googleAiKey || null;
configs[token].enableAiRecommended = enableAiRecommended !== undefined ? !!enableAiRecommended : !!configs[token].enableAiRecommended;
  configs[token].hiddenCatalogs = Array.isArray(hiddenCatalogs) ? hiddenCatalogs : (configs[token].hiddenCatalogs || []);
  configs[token].updatedAt = new Date().toISOString();
  saveConfigs(configs);
  res.json({ token });
});

app.get("/c/:token/config", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Not found" });
  res.json({ catalogs: configs[token].catalogs, mdblistKey: configs[token].mdblistKey, language: configs[token].language, rpdbKey: configs[token].rpdbKey, tpKey: configs[token].tpKey, fanartKey: configs[token].fanartKey || null, omdbKey: configs[token].omdbKey || null, traktUser: configs[token].traktUser, excludeUnreleased: configs[token].excludeUnreleased || false, maxRating: configs[token].maxRating || null, streamAddons: configs[token].streamAddons || [], customCatalogs: configs[token].customCatalogs || [], googleAiKey: configs[token].googleAiKey || null, enableAiRecommended: !!configs[token].enableAiRecommended });
});


// DEV ONLY: safe config inspector. Redacts secrets but shows saved shape.
app.get("/debug/config/:token", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];

  if (!config) {
    return res.status(404).json({
      ok: false,
      error: "Config not found",
      token
    });
  }

  const redact = (value) => {
    if (!value) return null;
    const text = String(value);
    if (text.length <= 6) return "***";
    return `${text.slice(0, 3)}...${text.slice(-3)}`;
  };

  const catalogs = Array.isArray(config.catalogs) ? config.catalogs : [];
  const streamAddons = Array.isArray(config.streamAddons) ? config.streamAddons : [];
  const customCatalogs = Array.isArray(config.customCatalogs) ? config.customCatalogs : [];
  const collections = Array.isArray(config.collections) ? config.collections : [];
  const hiddenCatalogs = Array.isArray(config.hiddenCatalogs) ? config.hiddenCatalogs : [];

  res.json({
    ok: true,
    token,
    createdAt: config.createdAt || null,
    updatedAt: config.updatedAt || null,

    counts: {
      catalogs: catalogs.length,
      hiddenCatalogs: hiddenCatalogs.length,
      streamAddons: streamAddons.length,
      customCatalogs: customCatalogs.length,
      collections: collections.length
    },

    settings: {
      language: config.language || "en-US",
      excludeUnreleased: !!config.excludeUnreleased,
      maxRating: config.maxRating || null,
      enableAiRecommended: !!config.enableAiRecommended,
      traktUser: config.traktUser || null
    },

    keys: {
      mdblistKey: redact(config.mdblistKey),
      rpdbKey: redact(config.rpdbKey),
      tpKey: redact(config.tpKey),
      fanartKey: redact(config.fanartKey),
      omdbKey: redact(config.omdbKey),
      googleAiKey: redact(config.googleAiKey)
    },

    streamAddons: streamAddons.map((url, index) => ({
      index,
      url,
      enabled: !!url
    })),

    sample: {
      catalogs: catalogs.slice(0, 20),
      hiddenCatalogs: hiddenCatalogs.slice(0, 20),
      customCatalogs: customCatalogs.slice(0, 5).map(c => ({
        id: c.id || null,
        name: c.name || c.title || null,
        type: c.type || null
      })),
      collections: collections.slice(0, 5).map(c => ({
        id: c.id || c.slug || null,
        name: c.name || c.title || null,
        catalogs: Array.isArray(c.catalogs) ? c.catalogs.length : undefined
      }))
    }
  });
});

app.post("/c/:token/collections", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Not found" });
  const { collections, replace } = req.body;
  if (!Array.isArray(collections)) return res.status(400).json({ error:"Invalid collections" });

  const existing = Array.isArray(configs[token].collections) ? configs[token].collections : [];

  // Default behaviour is now SAFE MERGE, not wipe/replace.
  // Send { replace:true } only when we intentionally want to rebuild from scratch.
  if (replace === true) {
    configs[token].collections = collections;
  } else {
    const keyOf = (c) => String(c.id || c.slug || c.title || c.name || "").trim().toLowerCase();
    const merged = [...existing];
    const seen = new Map();

    merged.forEach((c, i) => {
      const k = keyOf(c);
      if (k) seen.set(k, i);
    });

    for (const incoming of collections) {
      const k = keyOf(incoming);
      if (k && seen.has(k)) {
        merged[seen.get(k)] = { ...merged[seen.get(k)], ...incoming };
      } else {
        if (k) seen.set(k, merged.length);
        merged.push(incoming);
      }
    }

    configs[token].collections = merged;
  }

  saveConfigs(configs);
  res.json({
    ok: true,
    mode: replace === true ? "replace" : "merge",
    before: existing.length,
    incoming: collections.length,
    after: configs[token].collections.length
  });
});

app.get("/c/:token/collections.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json([]);
  res.json(configs[token].collections || []);
});


app.get("/n/:token/manifest.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];
  if (!config) return res.status(404).json({ error:"Config not found" });
  // Track last access for expiry cleanup
  if (!config.lastAccessed || Date.now() - new Date(config.lastAccessed).getTime() > 24 * 60 * 60 * 1000) {
    configs[token].lastAccessed = new Date().toISOString();
    saveConfigs(configs);
  }
  const catalogs = buildCatalogsFromIds(
  config.enableAiRecommended
    ? Array.from(new Set([...(config.catalogs || []), "ai_recommended_movies", "ai_recommended_series"]))
    : (config.catalogs || []),
  config.hiddenCatalogs || []
)
    .map(c => ({
      type: c.type,
      id: c.id,
      name: c.name,
      extra: [{ name:"skip", isRequired:false }]
    }));

  res.json({
    id: "com.ultramax.nuvio." + token.toLowerCase(),
    version: "7.0.0-beta",
    name: "Ultra MAX",
    description: "Ultra MAX Nuvio compatible manifest",
    logo: "https://max-streams.gleeze.com/logo.svg",
    types: ["movie","series"],
    idPrefixes: ["tt", "tmdb"],
    resources: ["catalog","meta","stream"],
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
      adult: false,
      p2p: false
    },
    catalogs
  });
});


app.get("/cinemeta-clone/manifest.json", (req, res) => {
  console.log("CINEMETA CLONE HIT", new Date().toISOString(), req.headers["user-agent"]);
  res.json({
    id: "com.ultramax.cinemeta.clone",
    version: "1.0.0",
    description: "Cinemeta style test manifest",
    name: "Ultra MAX Cinemeta Clone",
    resources: ["catalog","meta","addon_catalog"],
    types: ["movie","series"],
    idPrefixes: ["tt"],
    catalogs: [
      {
        type: "movie",
        id: "top",
        name: "Popular",
        genres: ["Action","Comedy","Drama"],
        extra: [
          { name: "genre", options: ["Action","Comedy","Drama"] },
          { name: "search" },
          { name: "skip" }
        ],
        extraSupported: ["search","genre","skip"]
      }
    ],
    behaviorHints: {
      newEpisodeNotifications: true
    }
  });
});

app.get("/c/:token/manifest.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];
  if (!config) return res.status(404).json({ error:"Config not found" });
  // Track last access for expiry cleanup
  if (!config.lastAccessed || Date.now() - new Date(config.lastAccessed).getTime() > 24 * 60 * 60 * 1000) {
    configs[token].lastAccessed = new Date().toISOString();
    saveConfigs(configs);
  }
  const manifest = {
    id: "com.ultramax",
    version:"7.0.0-beta",
    name:"Ultra MAX",
    description: `Ultra MAX setup with ${config.catalogs.length} curated rows. Built for cleaner discovery and smoother browsing.`,
    logo: "https://max-streams.gleeze.com/logo.svg",
    types: ["movie","series"],
    idPrefixes: ["tt", "tmdb"],
    resources: ["catalog","meta","stream"],
    behaviorHints: {
      configurable: true,
      configurationRequired: false,
      adult: false,
      p2p: false
    },
    catalogs: buildCatalogsFromIds(
  config.enableAiRecommended
    ? Array.from(new Set([...(config.catalogs || []), "ai_recommended_movies", "ai_recommended_series"]))
    : (config.catalogs || []),
  config.hiddenCatalogs || []
)
       .map(c => ({
          type: c.type,
          id: c.id,
          name: c.name,
          extra: [{ name:"skip", isRequired:false }],
          extraSupported: ["skip"]
        }))
        .concat([
          {
            type: "movie",
            id: "search_movies",
            name: "Ultra MAX Search",
            extra: [{ name: "search", isRequired: true }],
            extraSupported: ["search"]
          },
          {
            type: "series",
            id: "search_series",
            name: "Ultra MAX Search",
            extra: [{ name: "search", isRequired: true }],
            extraSupported: ["search"]
          }
        ]),
  };
  res.json(manifest);
});


app.get("/c/:token/meta/:type/:id.json", async (req, res) => {
  const { token, type, id } = req.params;
  const configs = loadConfigs();
  const lang = configs[token]?.language || "en-US";
  try {
    const tmdbType = type === "series" ? "tv" : "movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    console.log("META DEBUG:", tmdbType, id, "result:", result?.id, "lang:", lang);
    if (!result) return res.json({ meta: { id, type } });
    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits&language=${lang}`);
    const castPeople = (d.credits?.cast || []).slice(0, 12).map(person => ({
      name: person.name,
      character: person.character || "",
      image: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
      profile: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null
    }));
    const cast = castPeople.map(person => person.name);
    const meta = {
      id,
      imdb_id: id,
      moviedb_id: tmdbId,
      type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      genres: (d.genres || []).map(g => g.name),
      cast,
      credits: castPeople,
      castImages: castPeople,
      people: castPeople
    };
    if (type ==="series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const seasonData = await Promise.all(
        seasons.map(async season => {
          try {
            return await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          } catch { return null; }
        })
      );
      const videos = [];
      seasonData.forEach((sr, i) => {
        if (!sr) return;
        const season = seasons[i];
        (sr.episodes || []).forEach(ep => {
          videos.push({
            id: `${id}:${season.season_number}:${ep.episode_number}`,
            title: ep.name || `Episode ${ep.episode_number}`,
            season: season.season_number, episode: ep.episode_number,
            overview: ep.overview || "",
            thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
            released: ep.air_date ? new Date(ep.air_date).toISOString() : null
          });
        });
      });
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }
    res.json({ meta });
  } catch (e) { res.json({ meta: { id, type } }); }
});


app.get("/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  try {
    const tmdbType = type ==="series" ?"tv" :"movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return res.json({ meta: { id, type } });
    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    if (!d) return res.json({ meta: { id, type } });
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const meta = { id, type, name: d.title || d.name, description: d.overview, poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null, background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null, releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null, imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null, genres: (d.genres || []).map(g => g.name), cast };
    res.json({ meta });
  } catch (e) { res.json({ meta: { id, type } }); }
});

app.get("/stream/:type/:id.json", async (req, res) => {
  // Dev fallback: no token config, no stream addons.
  res.json({ streams: [] });
});

app.get("/c/:token/stream/:type/:id.json", async (req, res) => {
  const { token, type, id } = req.params;
  const configs = loadConfigs();
  const config = configs[token];

  if (!config) return res.json({ streams: [] });

  const result = await streamBridgeResponse(config.streamAddons || [], type, id);
  res.json(result);
});



// ==========================
// TMDB PREVIEW ENDPOINT
// ==========================
const previewCache = new Map();

app.get('/preview/tmdb', async (req, res) => {
  try {
    const { type='movie', genre='', minRating='', yearFrom='', yearTo='', query='', person='' } = req.query;

    const cacheKey = `${type}_${genre}_${minRating}_${yearFrom}_${yearTo}_${query}_${person}`;
    const now = Date.now();

    // 15 min cache
    if(previewCache.has(cacheKey)){
      const cached = previewCache.get(cacheKey);
      if(now - cached.time < 15 * 60 * 1000){
        return res.json(cached.data);
      }
    }

    const tmdbType = type === 'series' ? 'tv' : type;

    const params = new URLSearchParams({
      api_key: process.env.TMDB_KEY,
      sort_by: 'popularity.desc',
      include_adult: 'false',
      page: '1'
    });

    if(genre) params.append('with_genres', genre);
    if(minRating) params.append('vote_average.gte', minRating);

    if(tmdbType === 'tv'){
      if(yearFrom) params.append('first_air_date.gte', yearFrom + '-01-01');
      if(yearTo) params.append('first_air_date.lte', yearTo + '-12-31');
    } else {
      if(yearFrom) params.append('primary_release_date.gte', yearFrom + '-01-01');
      if(yearTo) params.append('primary_release_date.lte', yearTo + '-12-31');
    }

    let url;
    let j;

    if(person){
      const personParams = new URLSearchParams({
        api_key: process.env.TMDB_KEY,
        query: person,
        include_adult: 'false',
        page: '1'
      });

      const pr = await fetch(`https://api.themoviedb.org/3/search/person?${personParams.toString()}`);
      const pj = await pr.json();
      const bestPerson = (pj.results || [])[0];

      if(bestPerson && bestPerson.id){
        params.append('with_cast', String(bestPerson.id));
        url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}`;
      } else {
        j = { results: [] };
      }
    }

    if(!j){
      if(query && tmdbType === 'movie'){
        // Franchise locking: try TMDB collections first for movie franchise searches.
        const collectionParams = new URLSearchParams({
          api_key: process.env.TMDB_KEY,
          query: query,
          include_adult: 'false',
          page: '1'
        });

        const cr = await fetch(`https://api.themoviedb.org/3/search/collection?${collectionParams.toString()}`);
        const cj = await cr.json();

        const q = String(query).toLowerCase().trim();
        const collection = (cj.results || []).find(c => {
          const name = String(c.name || '').toLowerCase();
          return name.includes(q) || q.includes(name.replace(' collection', '').trim());
        });

        if(collection && collection.id){
          const fr = await fetch(`https://api.themoviedb.org/3/collection/${collection.id}?api_key=${process.env.TMDB_KEY}`);
          const fj = await fr.json();
          let parts = fj.parts || [];

// Sort by release date (old → new)
parts = parts.sort((a,b)=>{
  const da = new Date(a.release_date || '1900-01-01');
  const db = new Date(b.release_date || '1900-01-01');
  return da - db;
});

j = { results: parts };
        }
      }

      if(!j){
        if(query){
          const searchType = tmdbType === 'tv' ? 'tv' : 'movie';
          const searchParams = new URLSearchParams({
            api_key: process.env.TMDB_KEY,
            query: query,
            include_adult: 'false',
            page: '1'
          });
          url = `https://api.themoviedb.org/3/search/${searchType}?${searchParams.toString()}`;
        } else {
          url = `https://api.themoviedb.org/3/discover/${tmdbType}?${params.toString()}`;
        }

        const r = await fetch(url);
        j = await r.json();
      }
    }

    let rawResults = (j.results || []);

    // If this is a search/franchise query, remove obvious keyword-noise results.
    if(query && !person){
      const q = String(query).toLowerCase().trim();
      const badWords = ['ninja', 'shocking', 'mockbuster', 'parody', 'ripoff', 'lady'];

      rawResults = rawResults.filter(x => {
        const title = String(x.title || x.name || '').toLowerCase();

        if(q && !title.includes(q)) return false;
        if(badWords.some(b => title.includes(b))) return false;
        if(!x.poster_path) return false;
        if(Number(x.vote_average || 0) <= 0) return false;

        return true;
      });
    }

    const results = rawResults.slice(0, 8).map(x => ({
      title: x.title || x.name,
      poster: x.poster_path ? `https://image.tmdb.org/t/p/w342${x.poster_path}` : null,
      rating: x.vote_average
    }));

    const payload = { results, collectionId: (typeof collection !== 'undefined' && collection && collection.id) ? collection.id : null };

    previewCache.set(cacheKey, {
      time: now,
      data: payload
    });

    res.json(payload);

  } catch(e){
    console.error("Preview error:", e);
    res.status(500).json({ error: "preview_failed" });
  }
});

app.use((req, res, next) => {
  const url = req.url;
  if (url.includes("/manifest.json") && !url.startsWith("/c/")) {
    const fullManifest = {
      id: FILTER_ENABLED ?"org.kris.ultra.max.v5" :"org.kris.ultra.max.all.v5",
      version:"7.0.0-beta",
  logo: "https://max-streams.gleeze.com/logo.svg",
      name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All",
      description: FILTER_ENABLED ?"Curated discovery with filtered rows and cleaner collections." :"Full Ultra MAX discovery with all available rows.",
      types: ["movie","series"],
      resources: ["catalog","meta","stream"],
      catalogs: [
        ...QUICK_PICK_CATALOGS,
        ...buildManifestCatalogs(staticIds),
        ...DYNAMIC_CATALOGS.map(c => ({ type: c.type, id: c.id, name: c.name, extra: [{ name:"tmdbId", isRequired: true }] })),
        { type:"movie", id:"search_movies", name:"Ultra MAX Search", extra:[{ name:"search", isRequired:true }], extraSupported:["search"] },
        { type:"series", id:"search_series", name:"Ultra MAX Search", extra:[{ name:"search", isRequired:true }], extraSupported:["search"] }
      ]
    };
    fullManifest.catalogs = (fullManifest.catalogs || [])
  .filter(c => c && c.id) // keep valid ones only
  .map(c => ({
    ...c,
    name: (c.name || "").trim()
  }));

    return res.json(fullManifest);
  }
  if (url.match(/\/catalog\//) && !url.startsWith("/c/")) {
    const match = url.match(/\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, type, id, extraStr] = match;
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split("&").forEach(p => { const [k,v] = p.split("="); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      handleCatalog(id, type, extra, null)
        .then(result => { res.setHeader("Cache-Control","public, max-age=300"); res.json(result); })
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
if (url.includes("/catalog/") && url.includes("/c/")) {
    const match = url.match(/\/c\/([^/]+)\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      let [, token, type, id, extraStr] = match;
console.log(
  "CUSTOM CATALOG:",
  token,
  id,
  "extraStr:",
  extraStr,
  "query:",
  req.query
);
      if (id === "search_movie") id = "search_movies";
      const configs = loadConfigs();
      const config = configs[token];
      if (!config) return res.json({ metas: [] });
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split('&').forEach(p => { const [k,v] = p.split('='); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      if (req.query.skip) extra.skip = parseInt(req.query.skip);
      if (req.query.search) extra.search = req.query.search;
      const hasAnime = config.catalogs.some(c => c.includes("anime") || c.includes("bollywood") || c.includes("crunchyroll") || c.includes("hidive"));
      handleCatalog(
        id,
        type,
        extra,
        config.mdblistKey || MDBLIST_KEY,
        !hasAnime,
        config.language || "en-US",
        config.rpdbKey || null,
        config.tpKey || null,
        config.traktUser || null,
        config.excludeUnreleased || false,
        config.maxRating || null,
        config.customCatalogs || [],
        config.googleAiKey || null,
        config.fanartKey || null,
        config.omdbKey || null
      )
        .then(result => { res.setHeader("Cache-Control","public, max-age=300"); res.json(result); })
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
  next();
});

// On startup: remove configs not accessed in 180 days
(function cleanupStaleConfigs() {
  try {
    const configs = loadConfigs();
    const now = Date.now();
    const EXPIRY_MS = 180 * 24 * 60 * 60 * 1000; // 180 days
    let removed = 0;
    for (const [token, config] of Object.entries(configs)) {
      const lastSeen = config.lastAccessed || config.updatedAt || config.createdAt;
      if (!lastSeen) continue;
      if (now - new Date(lastSeen).getTime() > EXPIRY_MS) {
        delete configs[token];
        removed++;
      }
    }
    if (removed > 0) {
      saveConfigs(configs);
      console.log(`Startup cleanup: removed ${removed} stale config(s) (180+ days inactive)`);
    }
  } catch(e) {
    console.error("Startup config cleanup failed:", e.message);
  }
})();

const PREWARM_LISTS = ['92337','91304','91303','91302','91300','91301','86710','88307','88309','3087','3091'];
setTimeout(async () => {
  console.log('Pre-warming MDBList cache...');
  for (const id of PREWARM_LISTS) {
    try {
      await fetchCached(`https://mdblist.com/api/lists/${id}/items/?apikey=${MDBLIST_KEY}&limit=20&type=movie`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {}
  }
  console.log('Cache pre-warm complete');
}, 5000);




app.listen(PORT,"0.0.0.0", () => {
  console.log(`Ultra MAX v7.0.0-beta running on port ${PORT}`);
  console.log(`Total catalog defs: ${Object.keys(CATALOG_DEFS).length}`);
  console.log(`Static catalogs: ${staticIds.length}`);
});
