const axios = require('axios');

const PREWARM_CATALOGS = [
  'trending_movies', 'trending_series',
  'popular_movies', 'popular_series',
  'top_movies', 'top_series',
  'now_movies', 'airing_series',
  'netflix_movies', 'netflix_series',
  'disney_movies', 'disney_series',
  'amazon_movies', 'amazon_series',
  'hbo_movies', 'hbo_series',
  'apple_movies', 'apple_series',
  'action_movies', 'comedy_movies', 'horror_movies', 'thriller_movies', 'scifi_movies',
  'action_series', 'comedy_series', 'drama_series',
  'studio_marvel', 'studio_dc',
  'trakt_trending_movies', 'trakt_trending_series',
  'trakt_popular_movies', 'trakt_popular_series'
];

const BASE_URL = 'https://max-streams.gleeze.com';
const INTERVAL_MS = 4 * 60 * 1000;

async function prewarm() {
  const start = Date.now();
  let hits = 0, misses = 0, errors = 0;
  for (const id of PREWARM_CATALOGS) {
    const type = id.includes('series') ? 'series' : 'movie';
    try {
      const res = await axios.get(`${BASE_URL}/catalog/${type}/${id}.json`, { timeout: 30000 });
      if (res.headers['x-cache-status'] === 'HIT') hits++; else misses++;
    } catch (e) { errors++; }
  }
  console.log(`[${new Date().toISOString()}] prewarm done in ${Math.round((Date.now()-start)/1000)}s — hits:${hits} misses:${misses} errors:${errors}`);
}

console.log('[prewarm] Starting cache pre-warmer, interval:', INTERVAL_MS/1000, 's');
prewarm();
setInterval(prewarm, INTERVAL_MS);
