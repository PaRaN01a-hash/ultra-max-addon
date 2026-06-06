async function handleCatalogSearch(params) {
  const {
    catalogId,
    extra,
    tmdbType,
    type,
    language,
    rpdbKey,
    tpKey,
    TMDB_KEY,
    fetchCached,
    resultsToMetas
  } = params;

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

  const searchUrl =
    `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(rawSearch)}&page=1&include_adult=false`;

  const searchData = await fetchCached(searchUrl);

  let results = Array.isArray(searchData?.results)
    ? searchData.results
    : [];

  if ((!results || results.length === 0) && type === "movie") {
    const collectionUrl =
      `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_KEY}&query=${encodeURIComponent(rawSearch)}&page=1&include_adult=false`;

    const collectionData = await fetchCached(collectionUrl);

    const collections = Array.isArray(collectionData?.results)
      ? collectionData.results
      : [];

    for (const c of collections.slice(0, 3)) {
      if (!c?.id) continue;

      try {
        const col = await fetchCached(
          `https://api.themoviedb.org/3/collection/${c.id}?api_key=${TMDB_KEY}`
        );

        if (Array.isArray(col?.parts)) {
          results.push(...col.parts);
        }
      } catch (e) {
        console.log(
          "SEARCH COLLECTION FALLBACK ERROR:",
          c.id,
          e.message
        );
      }
    }
  }

  results = results
    .filter(r => r && !r.adult && (r.title || r.name || r.original_title || r.original_name))
    .map(r => ({ ...r, __ultraSearchScore: scoreResult(r) }))
    .sort((a, b) => (b.__ultraSearchScore || 0) - (a.__ultraSearchScore || 0))
    .slice(0, 20);

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

module.exports = {
  handleCatalogSearch
};
