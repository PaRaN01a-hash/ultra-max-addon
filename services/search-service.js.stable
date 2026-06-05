const { fetchCached } = require("./api-helpers");

async function handleSearch(params) {
  const {
    catalogId,
    type,
    extra,
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
    omdbKey,
    TMDB_KEY,
    resultsToMetas,
    handleCatalog
  } = params;

  const q = String(extra.search).replace(/\.json$/, "").trim();
  const tmdbType = type === "series" ? "tv" : "movie";

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

module.exports = {
  handleSearch
};
