const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const http = require("http");

const PORT = 7000;
const TMDB_KEY = process.env.TMDB_KEY;

// =========================
// 🎯 RULES (UNCHANGED)
// =========================
const RULES = [
  { id: "netflix_movies", type: "movie", name: "🔥 Netflix Movies", provider: 8 },
  { id: "netflix_series", type: "series", name: "🔥 Netflix Series", provider: 8 },

  { id: "prime_movies", type: "movie", name: "📦 Prime Movies", provider: 9 },
  { id: "prime_series", type: "series", name: "📦 Prime Series", provider: 9 },

  { id: "disney_movies", type: "movie", name: "🏰 Disney+ Movies", provider: 337 },
  { id: "disney_series", type: "series", name: "🏰 Disney+ Series", provider: 337 },

  { id: "apple_movies", type: "movie", name: "🍎 Apple TV+ Movies", provider: 350 },
  { id: "apple_series", type: "series", name: "🍎 Apple TV+ Series", provider: 350 },

  { id: "hbo_movies", type: "movie", name: "🎬 HBO Movies", provider: 384 },
  { id: "hbo_series", type: "series", name: "🎬 HBO Series", provider: 384 },

  { id: "hulu_movies", type: "movie", name: "📡 Hulu Movies", provider: 15 },
  { id: "hulu_series", type: "series", name: "📡 Hulu Series", provider: 15 },

  { id: "paramount_movies", type: "movie", name: "⭐ Paramount Movies", provider: 531 },
  { id: "paramount_series", type: "series", name: "⭐ Paramount Series", provider: 531 },

  { id: "trending_movies", type: "movie", name: "🔥 Trending Movies", source: "trending" },
  { id: "trending_series", type: "series", name: "🔥 Trending Series", source: "trending" },

  { id: "popular_movies", type: "movie", name: "⭐ Popular Movies", source: "popular" },
  { id: "popular_series", type: "series", name: "⭐ Popular Series", source: "popular" },

  { id: "top_movies", type: "movie", name: "🏆 Top Rated Movies", source: "top_rated" },
  { id: "top_series", type: "series", name: "🏆 Top Rated Series", source: "top_rated" },

  { id: "now_movies", type: "movie", name: "🎬 Now Playing", source: "now_playing" },
  { id: "airing_series", type: "series", name: "📺 Airing Today", source: "airing_today" },

  { id: "upcoming_movies", type: "movie", name: "🚀 Upcoming Movies", source: "upcoming" }
];

// =========================
// 🧠 BUILDER
// =========================
const builder = new addonBuilder({
  id: "org.kris.ultra.max.final.clean",
  version: "9.0.1",
  name: "Ultra MAX Clean+",
  description: "Clean streaming catalogs",
  types: ["movie", "series"],
  resources: ["catalog"],
  catalogs: RULES.map(r => ({
    type: r.type,
    id: r.id,
    name: r.name
  }))
});

// =========================
// 🎬 HANDLER (simplified for stability)
// =========================
builder.defineCatalogHandler(async ({ id }) => {
  const rule = RULES.find(r => r.id === id);
  if (!rule) return { metas: [] };

  const type = rule.type === "series" ? "tv" : "movie";

  let url = `https://api.themoviedb.org/3/${type}/popular?api_key=${TMDB_KEY}`;

  const res = await axios.get(url);

  return {
    metas: res.data.results.slice(0, 20).map(i => ({
      id: "tt" + i.id,
      type: rule.type,
      name: i.title || i.name,
      poster: i.poster_path
        ? `https://image.tmdb.org/t/p/w500${i.poster_path}`
        : null
    }))
  };
});

// =========================
// 🎯 SERVER
// =========================

const addonInterface = builder.getInterface();

const server = http.createServer((req, res) => {

  // 🌐 Landing page
  if (req.url === "/") {
    const manifestUrl = `http://${req.headers.host}/manifest.json`;

    res.writeHead(200, { "Content-Type": "text/html" });

    return res.end(`
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Ultra MAX</title>
        </head>
        <body style="background:#020617;color:white;display:flex;justify-content:center;align-items:center;height:100vh;font-family:Arial;">
          <div style="text-align:center;">
            <h1>ULTRA MAX</h1>
            <p>Clean catalogs • No junk</p>

            <button onclick="install()" style="padding:15px;margin:10px;">🚀 Install</button>
            <button onclick="copy()" style="padding:15px;margin:10px;">📋 Copy URL</button>
          </div>

          <script>
            const manifest = "${manifestUrl}";

            function install() {
              window.location.href =
                "stremio://" + manifest.replace("http://","").replace("https://","");
            }

            function copy() {
              navigator.clipboard.writeText(manifest);
              alert("Copied!");
            }
          </script>
        </body>
      </html>
    `);
  }

  // 🔥 IMPORTANT FIX
  addonInterface.get(req, res);

});

server.listen(PORT, () => {
  console.log("🚀 ULTRA MAX READY (NO 502)");
});
