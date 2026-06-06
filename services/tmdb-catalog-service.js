function buildTmdbCatalogUrl({
  def,
  type,
  tmdbType,
  page,
  sortBy,
  ratingParam,
  TMDB_KEY
}) {
  let url = null;

  switch (def.handler) {
    case "tmdb_trending":
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
      break;

    case "tmdb_source":
      url = `https://api.themoviedb.org/3/${tmdbType}/${def.source}?api_key=${TMDB_KEY}&page=${page}`;
      break;

    case "tmdb_provider":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${def.provider}&watch_region=US&sort_by=popularity.desc&page=${page}${type === "movie" ? ratingParam : ""}`;
      break;

    case "tmdb_genre": {
      let genre = def.genre;

      if (type === "series") {
        if (genre === 28) genre = 10759;
        if ([878, 27, 14].includes(genre)) genre = 10765;
        if (genre === 53) genre = 9648;
      }

      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}${type === "movie" ? ratingParam : ""}`;
      break;
    }

    case "tmdb_keyword":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_keywords=${def.keyword}&sort_by=popularity.desc&page=${page}${ratingParam}`;
      if (def.lang) url += `&with_original_language=${def.lang}`;
      break;

    case "tmdb_company":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_companies=${encodeURIComponent(def.company)}&sort_by=${sortBy}&page=${page}${ratingParam}${def.excludeAnimation ? "&without_genres=16" : ""}`;
      break;

    case "tmdb_network":
      url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_networks=${def.networkId}&sort_by=${sortBy}&page=${page}`;
      break;

    case "tmdb_actor":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_cast=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;

    case "tmdb_director":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_crew=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;
  }

  return url;
}

module.exports = {
  buildTmdbCatalogUrl
};
