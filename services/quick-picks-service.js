async function handleQuickPicks(params) {
  const {
    catalogId,
    type,
    page,
    maxRating,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey,
    TMDB_KEY,
    fetchCached,
    filterByMaxRating,
    resultsToMetas
  } = params;

  const tmdbType = type === "series" ? "tv" : "movie";

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

  const metas = await resultsToMetas(
    results,
    type,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey
  );

  return { metas: metas.slice(0, 20) };
}

module.exports = {
  handleQuickPicks
};
