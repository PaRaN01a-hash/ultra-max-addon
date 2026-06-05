const axios = require("axios");

const cache = new Map();

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);

  const res = await axios.get(url, { timeout: 5000 });

  cache.set(url, res.data);

  setTimeout(() => cache.delete(url), 300000);

  return res.data;
}

async function fetchTrakt(path, traktClientId) {
  if (!traktClientId) return [];

  const url = `https://api.trakt.tv${path}`;

  if (cache.has(url)) return cache.get(url);

  try {
    const res = await axios.get(url, {
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": traktClientId
      }
    });

    cache.set(url, res.data);
    setTimeout(() => cache.delete(url), 300000);

    return res.data;
  } catch (e) {
    console.error("Trakt fetch error:", e.message);
    return [];
  }
}

module.exports = {
  fetchCached,
  fetchTrakt
};
