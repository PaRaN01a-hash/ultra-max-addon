const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");
const axios = require("axios");

const PORT = process.env.PORT || 7000;
const TMDB_KEY = process.env.TMDB_KEY;
const FILTER_ENABLED = process.env.FILTER_MODE !== "off";

if (!TMDB_KEY) {
  console.error("TMDB_KEY missing - exiting");
  process.exit(1);
}

const cache = new Map();
const imdbCache = new Map();

const PROVIDERS = {
  netflix: 8, amazon: 9, disney: 337, hulu: 15,
  hbo: 1899, apple: 350, paramount: 531, peacock: 386,
  mgm: 268, acorn: 87, shudder: 99, britbox: 151,
  itvx: 584, channel4: 583, crunchyroll: 283, hidive: 430
};

const GENRES = {
  action: 28, comedy: 35, horror: 27, scifi: 878,
  documentary: 99, romance: 10749, thriller: 53,
  crime: 80, animation: 16, family: 10751,
  fantasy: 14, mystery: 9648
};

let RULES = [
  { id: "trending_movies", type: "movie", name: "Trending", trending: true },
  { id: "trending_series", type: "series", name: "Trending", trending: true },
  { id: "popular_movies", type: "movie", name: "Popular", source: "popular" },
  { id: "popular_series", type: "series", name: "Popular", source: "popular" },
  { id: "top_movies", type: "movie", name: "Top Rated", source: "top_rated" },
  { id: "top_series", type: "series", name: "Top Rated", source: "top_rated" },
  { id: "now_movies", type: "movie", name: "Now Playing", source: "now_playing" },
  { id: "airing_series", type: "series", name: "Airing Today", source: "airing_today" },
  { id: "ontheair_series", type: "series", name: "On The Air", source: "on_the_air" }
];

if (!FILTER_ENABLED) {
  RULES.push(
    { id: "anime_movies", type: "movie", name: "Anime", anime: true },
    { id: "anime_series", type: "series", name: "Anime", anime: true }
  );
}

RULES.push(
  ...Object.entries(PROVIDERS)
    .filter(([key]) => !FILTER_ENABLED ? true : !["crunchyroll","hidive"].includes(key))
    .flatMap(([key,id]) => ([
      { id: `${key}_movies`, type:"movie", name:key.charAt(0).toUpperCase()+key.slice(1), provider:id },
      ...(key==="mgm"?[]:[{ id: `${key}_series`, type:"series", name:key.charAt(0).toUpperCase()+key.slice(1), provider:id }])
    ]))
);

RULES.push(
  ...Object.entries(GENRES).flatMap(([key,id]) => ([
    { id: `${key}_movies`, type:"movie", name:key.charAt(0).toUpperCase()+key.slice(1), genre:id },
    { id: `${key}_series`, type:"series", name:key.charAt(0).toUpperCase()+key.slice(1), genre:id }
  ]))
);

const DYNAMIC = [
  { type:"movie", id:"similar_movie", name:"More Like This" },
  { type:"series", id:"similar_series", name:"More Like This" },
  { type:"movie", id:"recommended_movie", name:"Recommended" },
  { type:"series", id:"recommended_series", name:"Recommended" },
  { type:"movie", id:"collection_movie", name:"Collection" }
];

const builder = new addonBuilder({
  id: FILTER_ENABLED ? "org.kris.ultra.max.v5" : "org.kris.ultra.max.all.v5",
  version: "5.0.0",
  name: FILTER_ENABLED ? "Ultra MAX" : "Ultra MAX All",
  description: FILTER_ENABLED ? "Filtered content" : "All content",
  types: ["movie","series"],
  resources: ["catalog","meta","stream"],
  catalogs: [
    ...RULES.map(r => ({
      type:r.type,
      id:r.id,
      name:r.name,
      extra:[{name:"skip"}]
    })),
    ...DYNAMIC.map(c => ({
      type:c.type,
      id:c.id,
      name:c.name,
      extra:[{name:"tmdbId", isRequired:true}]
    }))
  ]
});

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await axios.get(url, { timeout: 5000 });
  cache.set(url, res.data);
  setTimeout(()=>cache.delete(url),300000);
  return res.data;
}

async function getImdbId(tmdbId,type){
  const key=`${type}-${tmdbId}`;
  if(imdbCache.has(key)) return imdbCache.get(key);
  try{
    const t=type==="series"?"tv":"movie";
    const r=await axios.get(`https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`,{timeout:5000});
    if(!r.data.imdb_id) return null;
    imdbCache.set(key,r.data.imdb_id);
    return r.data.imdb_id;
  }catch{return null;}
}

function isValidItem(i){
  if(!i.poster_path) return false;
  if(!FILTER_ENABLED) return true;
  if(i.original_language==="hi") return false;
  if(i.original_language==="ja" && i.genre_ids?.includes(16)) return false;
  const name=(i.title||i.name||"").toLowerCase();
  if(name.includes("anime")) return false;
  return true;
}

async function resultsToMetas(arr,type){
  return (await Promise.all(arr.filter(isValidItem).slice(0,20).map(async i=>{
    const imdb=await getImdbId(i.id,type);
    if(!imdb) return null;
    return {
      id:imdb,
      type,
      name:i.title||i.name,
      poster:`https://image.tmdb.org/t/p/w500${i.poster_path}`,
      background:i.backdrop_path?`https://image.tmdb.org/t/p/original${i.backdrop_path}`:null
    };
  }))).filter(Boolean);
}

builder.defineCatalogHandler(async ({type,id,extra})=>{
  try{
    const tmdbType=type==="series"?"tv":"movie";
    const page=Math.floor((extra?.skip||0)/20)+1;
    const tmdbId=extra?.tmdbId;

    if(id==="similar_movie"||id==="similar_series"){
      if(!tmdbId) return {metas:[]};
      const data=await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/similar?api_key=${TMDB_KEY}&page=${page}`);
      return {metas:await resultsToMetas(data.results||[],type)};
    }

    if(id==="recommended_movie"||id==="recommended_series"){
      if(!tmdbId) return {metas:[]};
      const data=await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&page=${page}`);
      return {metas:await resultsToMetas(data.results||[],type)};
    }

    if(id==="collection_movie"){
      if(!tmdbId) return {metas:[]};
      const data=await fetchCached(`https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_KEY}`);
      return {metas:await resultsToMetas(data.parts||[],"movie")};
    }

    const rule=RULES.find(r=>r.id===id);
    if(!rule) return {metas:[]};

    let url;

    if(rule.trending)
      url=`https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
    else if(rule.provider)
      url=`https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${rule.provider}&watch_region=US&sort_by=popularity.desc&page=${page}`;
    else if(rule.genre){
      let genre=rule.genre;
      if(type==="series"){
        if(genre===28) genre=10759;
        if([878,27,14].includes(genre)) genre=10765;
        if(genre===53) genre=9648;
      }
      url=`https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}`;
    }
    else if(rule.anime)
      url=`https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
    else
      url=`https://api.themoviedb.org/3/${tmdbType}/${rule.source}?api_key=${TMDB_KEY}&page=${page}`;

    const data=await fetchCached(url);
    return {metas:await resultsToMetas(data.results||[],type)};
  }catch(e){
    console.log("catalog error",id,e.message);
    return {metas:[]};
  }
});

builder.defineStreamHandler(async ({id,type})=>{
  return {
    streams:[{
      name:"Ultra MAX",
      title:"Use a stream addon for playback",
      externalUrl:`https://www.imdb.com/title/${id}`
    }]
  };
});

builder.defineMetaHandler(async ({type,id})=>{
  try{
    const tmdbType=type==="series"?"tv":"movie";

    const findRes=await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result=findRes[`${tmdbType}_results`]?.[0];
    if(!result) return {meta:{id,type}};

    const tmdbId=result.id;
    const d=await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits`);
    const cast=(d.credits?.cast||[]).slice(0,5).map(c=>c.name);

    const meta={
      id,
      type,
      name:d.title||d.name,
      description:d.overview,
      poster:d.poster_path?`https://image.tmdb.org/t/p/w500${d.poster_path}`:null,
      background:d.backdrop_path?`https://image.tmdb.org/t/p/original${d.backdrop_path}`:null,
      releaseInfo:d.release_date?d.release_date.split("-")[0]:d.first_air_date?d.first_air_date.split("-")[0]:null,
      imdbRating:d.vote_average?d.vote_average.toFixed(1):null,
      genres:(d.genres||[]).map(g=>g.name),
      cast
    };

    if(type==="series"){
      const seasons=(d.seasons||[]).filter(s=>s.season_number>0);
      const videos=[];

      for(const season of seasons){
        try{
          const sr=await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          (sr.episodes||[]).forEach(ep=>{
            videos.push({
              id:`${id}:${season.season_number}:${ep.episode_number}`,
              title:ep.name||`Episode ${ep.episode_number}`,
              season:season.season_number,
              episode:ep.episode_number,
              overview:ep.overview||"",
              thumbnail:ep.still_path?`https://image.tmdb.org/t/p/w300${ep.still_path}`:null,
              released:ep.air_date?new Date(ep.air_date).toISOString():null
            });
          });
        }catch{
          // skip
        }
      }

      videos.sort((a,b)=>a.season!==b.season?a.season-b.season:a.episode-b.episode);
      meta.videos=videos;
    }

    return {meta};
  }catch(e){
    console.log("meta error",id,e.message);
    return {meta:{id,type}};
  }
});

serveHTTP(builder.getInterface(),{
  port:PORT,
  host:"0.0.0.0"
});
