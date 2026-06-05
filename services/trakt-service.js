const { fetchTrakt } = require("./api-helpers");
const { traktToMetas } = require("./metadata-service");

async function handleTraktCatalog(
  handler,
  type,
  traktUser,
  language,
  rpdbKey,
  tpKey,
  excludeUnreleased,
  traktClientId
) {
  switch (handler) {
    case "trakt_trending": {
      const path = type === "series" ? "/shows/trending" : "/movies/trending";
      const data = await fetchTrakt(`${path}?limit=50`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    case "trakt_popular": {
      const path = type === "series" ? "/shows/popular" : "/movies/popular";
      const data = await fetchTrakt(`${path}?limit=50&extended=full`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    case "trakt_anticipated": {
      const path = type === "series" ? "/shows/anticipated" : "/movies/anticipated";
      const data = await fetchTrakt(`${path}?limit=50`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    case "trakt_user_favorites": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/favorites/${t}?limit=50`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    case "trakt_user_watchlist": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/watchlist/${t}?limit=50`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    case "trakt_user_collection": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/collection/${t}`, traktClientId);
      return {
        metas: await traktToMetas(
          data, type, language, rpdbKey, tpKey, excludeUnreleased
        )
      };
    }

    default:
      return null;
  }
}

module.exports = {
  handleTraktCatalog
};
