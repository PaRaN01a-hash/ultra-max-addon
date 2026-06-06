async function handleRelatedContent(params) {
  const {
    catalogId,
    tmdbId,
    tmdbType,
    page,
    type,
    filterLang,
    language,
    rpdbKey,
    tpKey,
    excludeUnreleased,
    fanartKey,
    omdbKey,
    TMDB_KEY,
    fetchCached,
    resultsToMetas
  } = params;

  if (catalogId === "similar_movie" || catalogId === "similar_series") {
    if (!tmdbId) return { metas: [] };

    const data = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/similar?api_key=${TMDB_KEY}&page=${page}`
    );

    return {
      metas: await resultsToMetas(
        data.results || [],
        type,
        filterLang,
        language,
        rpdbKey,
        tpKey,
        excludeUnreleased,
        fanartKey,
        omdbKey
      )
    };
  }

  if (catalogId === "recommended_movie" || catalogId === "recommended_series") {
    if (!tmdbId) return { metas: [] };

    const data = await fetchCached(
      `https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&page=${page}`
    );

    return {
      metas: await resultsToMetas(
        data.results || [],
        type,
        filterLang,
        language,
        rpdbKey,
        tpKey,
        excludeUnreleased,
        fanartKey,
        omdbKey
      )
    };
  }

  if (catalogId === "collection_movie") {
    if (!tmdbId) return { metas: [] };

    const data = await fetchCached(
      `https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_KEY}`
    );

    return {
      metas: await resultsToMetas(
        data.parts || [],
        "movie",
        filterLang,
        language,
        rpdbKey,
        tpKey,
        excludeUnreleased
      )
    };
  }

  return null;
}

module.exports = {
  handleRelatedContent
};
