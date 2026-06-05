const axios = require("axios");
const { fetchCached } = require("./api-helpers");

const TMDB_KEY = process.env.TMDB_KEY;

const imdbCache = new Map();

const certCache = new Map();
const CERT_TTL = 7 * 24 * 60 * 60 * 1000;

const imdbTmdbCache = new Map();

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

  if (fanartKey && tmdbId) {                                                                                                                                  try {
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


module.exports = {
  getImdbId,
  getMovieCertification,
  filterByMaxRating,
  imdbToTmdbMovieId,
  filterMetasByMaxRating,
  getBestPoster
};
