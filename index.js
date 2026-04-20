const { addonBuilder } = require("stremio-addon-sdk");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");

const PORT = process.env.PORT || 7000;
const TMDB_KEY = process.env.TMDB_KEY;
const MDBLIST_KEYS = (process.env.MDBLIST_KEYS || process.env.MDBLIST_KEY || "5woimia0xf19uqr4rd7wl1960").split(",").map(k => k.trim()).filter(Boolean);
const MDBLIST_KEY = MDBLIST_KEYS[0];
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID;
const FILTER_ENABLED = process.env.FILTER_MODE !=="off";
const CONFIGS_FILE = path.join(__dirname,"configs.json");

if (!TMDB_KEY) { console.error("TMDB_KEY missing - exiting"); process.exit(1); }

const rateLimits = new Map();
function rateLimit(ip, max = 5, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimits.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count++;
  rateLimits.set(ip, record);
  return record.count > max;
}
function loadConfigs() {
  try {
    if (fs.existsSync(CONFIGS_FILE) && fs.statSync(CONFIGS_FILE).isFile()) {
      return JSON.parse(fs.readFileSync(CONFIGS_FILE,"utf8"));
    }
  } catch (e) {}
  return {};
}
function saveConfigs(c) { try { fs.writeFileSync(CONFIGS_FILE, JSON.stringify(c, null, 2)); } catch (e) {} }
function hashPassword(p) { return crypto.createHash("sha256").update(p +"ultramax_salt").digest("hex"); }
function generateToken() { return crypto.randomBytes(4).toString("hex").toUpperCase(); }
const cache = new Map();
const imdbCache = new Map();

const CATALOG_DEFS = {
  trending_movies:    { name:"Trending",        type:"movie",  handler:"tmdb_trending" },
  trending_series:    { name:"Trending",        type:"series", handler:"tmdb_trending" },
  popular_movies:     { name:"Popular",         type:"movie",  handler:"tmdb_source", source:"popular" },
  popular_series:     { name:"Popular",         type:"series", handler:"tmdb_source", source:"popular" },
  top_movies:         { name:"Top Rated",       type:"movie",  handler:"tmdb_source", source:"top_rated" },
  top_series:         { name:"Top Rated",       type:"series", handler:"tmdb_source", source:"top_rated" },
  now_movies:         { name:"Now Playing",            type:"movie",  handler:"tmdb_source", source:"now_playing" },
  airing_series:      { name:"Airing Today",           type:"series", handler:"tmdb_source", source:"airing_today" },
  ontheair_series:    { name:"On The Air",             type:"series", handler:"tmdb_source", source:"on_the_air" },
  anime_movies:       { name:"Anime",           type:"movie",  handler:"tmdb_anime" },
  anime_series:       { name:"Anime",           type:"series", handler:"tmdb_anime" },
  bollywood_movies:   { name:"Bollywood",       type:"movie",  handler:"tmdb_bollywood" },
  bollywood_series:   { name:"Bollywood",       type:"series", handler:"tmdb_bollywood" },
  paramount_movies:   { name:"Paramount",       type:"movie",  handler:"tmdb_paramount" },
  paramount_series:   { name:"Paramount",       type:"series", handler:"tmdb_paramount" },
  netflix_movies:     { name:"Netflix",         type:"movie",  handler:"tmdb_provider", provider: 8 },
  netflix_series:     { name:"Netflix",         type:"series", handler:"tmdb_provider", provider: 8 },
  amazon_movies:      { name:"Amazon",          type:"movie",  handler:"tmdb_provider", provider: 9 },
  amazon_series:      { name:"Amazon",          type:"series", handler:"tmdb_provider", provider: 9 },
  disney_movies:      { name:"Disney+",         type:"movie",  handler:"tmdb_provider", provider: 337 },
  disney_series:      { name:"Disney+",         type:"series", handler:"tmdb_provider", provider: 337 },
  hbo_movies:         { name:"HBO",             type:"movie",  handler:"tmdb_provider", provider: 1899 },
  hbo_series:         { name:"HBO",             type:"series", handler:"tmdb_provider", provider: 1899 },
  apple_movies:       { name:"Apple TV+",       type:"movie",  handler:"tmdb_provider", provider: 350 },
  apple_series:       { name:"Apple TV+",       type:"series", handler:"tmdb_provider", provider: 350 },
  peacock_movies:     { name:"Peacock",         type:"movie",  handler:"tmdb_provider", provider: 386 },
  peacock_series:     { name:"Peacock",         type:"series", handler:"tmdb_provider", provider: 386 },
  mgm_movies:         { name:"MGM+",            type:"movie",  handler:"tmdb_provider", provider: 268 },
  acorn_movies:       { name:"Acorn",           type:"movie",  handler:"tmdb_provider", provider: 87 },
  acorn_series:       { name:"Acorn",           type:"series", handler:"tmdb_provider", provider: 87 },
  shudder_movies:     { name:"Shudder",         type:"movie",  handler:"tmdb_provider", provider: 99 },
  shudder_series:     { name:"Shudder",         type:"series", handler:"tmdb_provider", provider: 99 },
  britbox_movies:     { name:"BritBox",         type:"movie",  handler:"tmdb_provider", provider: 151 },
  britbox_series:     { name:"BritBox",         type:"series", handler:"tmdb_provider", provider: 151 },
  itvx_movies:        { name:"ITVX",            type:"movie",  handler:"tmdb_provider", provider: 584 },
  itvx_series:        { name:"ITVX",            type:"series", handler:"tmdb_provider", provider: 584 },
  channel4_movies:    { name:"Channel 4",       type:"movie",  handler:"tmdb_provider", provider: 583 },
  channel4_series:    { name:"Channel 4",       type:"series", handler:"tmdb_provider", provider: 583 },
  crunchyroll_movies: { name:"Crunchyroll",     type:"movie",  handler:"tmdb_provider", provider: 283 },
  crunchyroll_series: { name:"Crunchyroll",     type:"series", handler:"tmdb_provider", provider: 283 },
  hidive_movies:      { name:"Hidive",          type:"movie",  handler:"tmdb_provider", provider: 430 },
  hidive_series:      { name:"Hidive",          type:"series", handler:"tmdb_provider", provider: 430 },
  hulu_movies:        { name:"Hulu",            type:"movie",  handler:"tmdb_provider", provider: 15 },
  hulu_series:        { name:"Hulu",            type:"series", handler:"tmdb_provider", provider: 15 },
  discovery_movies:   { name:"Discovery+",      type:"movie",  handler:"tmdb_provider", provider: 520 },
  discovery_series:   { name:"Discovery+",      type:"series", handler:"tmdb_provider", provider: 520 },
  natgeo_movies:      { name:"National Geographic", type:"movie",  handler:"tmdb_provider", provider: 1964 },
  natgeo_series:      { name:"National Geographic", type:"series", handler:"tmdb_provider", provider: 1964 },
  ae_movies:          { name:"A&E",             type:"movie",  handler:"tmdb_provider", provider: 156 },
  ae_series:          { name:"A&E",             type:"series", handler:"tmdb_provider", provider: 156 },
  animalplanet_movies:{ name:"Animal Planet",   type:"movie",  handler:"tmdb_provider", provider: 399 },
  animalplanet_series:{ name:"Animal Planet",   type:"series", handler:"tmdb_provider", provider: 399 },
  action_movies:      { name:"Action",          type:"movie",  handler:"tmdb_genre", genre: 28 },
  action_series:      { name:"Action",          type:"series", handler:"tmdb_genre", genre: 28 },
  comedy_movies:      { name:"Comedy",          type:"movie",  handler:"tmdb_genre", genre: 35 },
  comedy_series:      { name:"Comedy",          type:"series", handler:"tmdb_genre", genre: 35 },
  horror_movies:      { name:"Horror",          type:"movie",  handler:"tmdb_genre", genre: 27 },
  horror_series:      { name:"Horror",          type:"series", handler:"tmdb_genre", genre: 27 },
  scifi_movies:       { name:"Sci-Fi",          type:"movie",  handler:"tmdb_genre", genre: 878 },
  scifi_series:       { name:"Sci-Fi",          type:"series", handler:"tmdb_genre", genre: 878 },
  documentary_movies: { name:"Documentary",     type:"movie",  handler:"tmdb_genre", genre: 99 },
  documentary_series: { name:"Documentary",     type:"series", handler:"tmdb_genre", genre: 99 },
  romance_movies:     { name:"Romance",         type:"movie",  handler:"tmdb_genre", genre: 10749 },
  romance_series:     { name:"Romance",         type:"series", handler:"tmdb_genre", genre: 10749 },
  thriller_movies:    { name:"Thriller",        type:"movie",  handler:"tmdb_genre", genre: 53 },
  thriller_series:    { name:"Thriller",        type:"series", handler:"tmdb_genre", genre: 53 },
  crime_movies:       { name:"Crime",           type:"movie",  handler:"tmdb_genre", genre: 80 },
  crime_series:       { name:"Crime",           type:"series", handler:"tmdb_genre", genre: 80 },
  animation_movies:   { name:"Animated",        type:"movie",  handler:"tmdb_genre", genre: 16 },
  animation_series:   { name:"Animated",        type:"series", handler:"tmdb_genre", genre: 16 },
  family_movies:      { name:"Family",          type:"movie",  handler:"tmdb_genre", genre: 10751 },
  family_series:      { name:"Family",          type:"series", handler:"tmdb_genre", genre: 10751 },
  fantasy_movies:     { name:"Fantasy",         type:"movie",  handler:"tmdb_genre", genre: 14 },
  fantasy_series:     { name:"Fantasy",         type:"series", handler:"tmdb_genre", genre: 14 },
  mystery_movies:     { name:"Mystery",         type:"movie",  handler:"tmdb_genre", genre: 9648 },
  mystery_series:     { name:"Mystery",         type:"series", handler:"tmdb_genre", genre: 9648 },
  drama_movies:       { name:"Drama",           type:"movie",  handler:"tmdb_genre", genre: 18 },
  drama_series:       { name:"Drama",           type:"series", handler:"tmdb_genre", genre: 18 },
  theme_superhero:    { name:"Superhero",              type:"movie",  handler:"tmdb_keyword", keyword: 9715,  lang:"en" },
  theme_revenge:      { name:"Revenge",                type:"movie",  handler:"tmdb_keyword", keyword: 9748,  lang:"en" },
  theme_roadtrip:     { name:"Road Trip",              type:"movie",  handler:"tmdb_keyword", keyword: 7312,  lang:"en" },
  theme_heist:        { name:"Heist",                  type:"movie",  handler:"tmdb_keyword", keyword: 10051, lang:"en" },
  theme_serialkiller: { name:"Serial Killer",          type:"movie",  handler:"tmdb_keyword", keyword: 10714, lang:"en" },
  theme_timeloop:     { name:"Time Loop",              type:"movie",  handler:"tmdb_keyword", keyword: 10854, lang:"en" },
  theme_postapoc:     { name:"Post Apocalyptic",       type:"movie",  handler:"tmdb_keyword", keyword: 4565,  lang:"en" },
  theme_dystopia:     { name:"Dystopia",               type:"movie",  handler:"tmdb_keyword", keyword: 4344,  lang:"en" },
  theme_truestory:    { name:"Based on True Story",    type:"movie",  handler:"tmdb_keyword", keyword: 10051, lang:"en" },
  theme_ai:           { name:"Artificial Intelligence",type:"movie",  handler:"tmdb_keyword", keyword: 310,   lang:"en" },
  theme_zombie:       { name:"Zombie",                 type:"movie",  handler:"tmdb_keyword", keyword: 12377, lang:"en" },
  studio_marvel:      { name:"Marvel",                 type:"movie",  handler:"tmdb_company", company: 420 },
  studio_dc:          { name:"DC Films",               type:"movie",  handler:"tmdb_company", company: "429|128064|9993", excludeAnimation: true },
  studio_a24:         { name:"A24",                    type:"movie",  handler:"tmdb_company", company: 41077 },
  studio_blumhouse:   { name:"Blumhouse",              type:"movie",  handler:"tmdb_company", company: 3172 },
  studio_ghibli:      { name:"Studio Ghibli",          type:"movie",  handler:"tmdb_company", company: 10342 },
  studio_wb:          { name:"Warner Bros",              type:"movie",  handler:"tmdb_company", company: "174" },
  studio_universal:   { name:"Universal Pictures",        type:"movie",  handler:"tmdb_company", company: "33" },
  studio_sony:        { name:"Sony Pictures",             type:"movie",  handler:"tmdb_company", company: "34|5" },
  studio_paramount:   { name:"Paramount Pictures",        type:"movie",  handler:"tmdb_company", company: "4" },
  studio_20thcentury: { name:"20th Century",              type:"movie",  handler:"tmdb_company", company: "25" },
  studio_lionsgate:   { name:"Lionsgate",                 type:"movie",  handler:"tmdb_company", company: "1632" },
  studio_newline:     { name:"New Line Cinema",           type:"movie",  handler:"tmdb_company", company: "12" },
  studio_canalplus:   { name:"Canal+",                    type:"movie",  handler:"tmdb_company", company: "104" },
  network_abc:        { name:"ABC",                       type:"series", handler:"tmdb_network", networkId: 2 },
  network_cbs:        { name:"CBS",                       type:"series", handler:"tmdb_network", networkId: 16 },
  network_fox:        { name:"FOX",                       type:"series", handler:"tmdb_network", networkId: 19 },
  network_nbc:        { name:"NBC",                       type:"series", handler:"tmdb_network", networkId: 6 },
  starz_series:       { name:"Starz",                     type:"series", handler:"tmdb_network", networkId: 318 },
  network_nickelodeon:{ name:"Nickelodeon",              type:"series", handler:"tmdb_network", networkId: 13 },
  network_nickjr:     { name:"Nick Jr",                  type:"series", handler:"tmdb_network", networkId: 35 },
  startrek_coll:      { name:"Star Trek",                 type:"movie",  handler:"tmdb_multi_collection", collectionIds: [151, 115570, 115575] },
  director_nolan:     { name:"Christopher Nolan",      type:"movie",  handler:"tmdb_director", personId: 525 },
  director_scorsese:  { name:"Martin Scorsese",         type:"movie",  handler:"tmdb_director", personId: 1032 },
  director_spielberg: { name:"Steven Spielberg",        type:"movie",  handler:"tmdb_director", personId: 488 },
  director_villeneuve:{ name:"Denis Villeneuve",        type:"movie",  handler:"tmdb_director", personId: 137427 },
  director_fincher:   { name:"David Fincher",           type:"movie",  handler:"tmdb_director", personId: 7467 },
  director_kubrick:   { name:"Stanley Kubrick",         type:"movie",  handler:"tmdb_director", personId: 240 },
  director_hitchcock: { name:"Alfred Hitchcock",        type:"movie",  handler:"tmdb_director", personId: 2636 },
  director_anderson:  { name:"Wes Anderson",            type:"movie",  handler:"tmdb_director", personId: 5655 },
  actor_sandler:         { name:"Adam Sandler",               type:"movie",  handler:"tmdb_actor", personId: 19292 },
  actor_jolie:         { name:"Angelina Jolie",               type:"movie",  handler:"tmdb_actor", personId: 11701 },
  actor_pitt:         { name:"Brad Pitt",               type:"movie",  handler:"tmdb_actor", personId: 287 },
  actor_bale:         { name:"Christian Bale",               type:"movie",  handler:"tmdb_actor", personId: 3894 },
  actor_eastwood:         { name:"Clint Eastwood",               type:"movie",  handler:"tmdb_actor", personId: 190 },
  actor_denzel:         { name:"Denzel Washington",               type:"movie",  handler:"tmdb_actor", personId: 5292 },
  actor_carrey:         { name:"Jim Carrey",               type:"movie",  handler:"tmdb_actor", personId: 206 },
  actor_depp:         { name:"Johnny Depp",               type:"movie",  handler:"tmdb_actor", personId: 85 },
  actor_dicaprio:         { name:"Leonardo DiCaprio",               type:"movie",  handler:"tmdb_actor", personId: 6193 },
  actor_robbie:         { name:"Margot Robbie",               type:"movie",  handler:"tmdb_actor", personId: 234352 },
  actor_damon:         { name:"Matt Damon",               type:"movie",  handler:"tmdb_actor", personId: 1892 },
  actor_freeman:         { name:"Morgan Freeman",               type:"movie",  handler:"tmdb_actor", personId: 192 },
  actor_deniro:         { name:"Robert De Niro",               type:"movie",  handler:"tmdb_actor", personId: 380 },
  actor_rdj:         { name:"Robert Downey Jr",               type:"movie",  handler:"tmdb_actor", personId: 3223 },
  actor_gosling:         { name:"Ryan Gosling",               type:"movie",  handler:"tmdb_actor", personId: 30614 },
  actor_reynolds:         { name:"Ryan Reynolds",               type:"movie",  handler:"tmdb_actor", personId: 10859 },
  actor_rogen:         { name:"Seth Rogen",               type:"movie",  handler:"tmdb_actor", personId: 19274 },
  actor_cruise:         { name:"Tom Cruise",               type:"movie",  handler:"tmdb_actor", personId: 500 },
  actor_hanks:         { name:"Tom Hanks",               type:"movie",  handler:"tmdb_actor", personId: 31 },
  actor_ferrell:         { name:"Will Ferrell",               type:"movie",  handler:"tmdb_actor", personId: 23659 },
  actor_smith:         { name:"Will Smith",               type:"movie",  handler:"tmdb_actor", personId: 2888 },
  hp_collection:      { name:"Harry Potter",          type:"movie",  handler:"tmdb_collection", collectionId: 1241 },
  lotr_collection:    { name:"Lord of the Rings",       type:"movie",  handler:"tmdb_collection", collectionId: 119 },
  starwars_collection:{ name:"Star Wars",               type:"movie",  handler:"tmdb_collection", collectionId: 10 },
  bond_collection:    { name:"James Bond",              type:"movie",  handler:"tmdb_collection", collectionId: 645 },
  fastfurious_coll:   { name:"Fast & Furious",         type:"movie",  handler:"tmdb_collection", collectionId: 9485 },
  johnwick_coll:      { name:"John Wick",               type:"movie",  handler:"tmdb_collection", collectionId: 404609 },
  mi_collection:      { name:"Mission Impossible",      type:"movie",  handler:"tmdb_collection", collectionId: 87359 },
  indiana_collection: { name:"Indiana Jones",           type:"movie",  handler:"tmdb_collection", collectionId: 84 },
  jurassic_coll:      { name:"Jurassic Park",           type:"movie",  handler:"tmdb_collection", collectionId: 328 },
  hobbit_collection:  { name:"The Hobbit",              type:"movie",  handler:"tmdb_collection", collectionId: 121938 },
  avengers_coll:      { name:"The Avengers",            type:"movie",  handler:"tmdb_collection", collectionId: 86311 },
  xmen_collection:    { name:"X-Men",                   type:"movie",  handler:"tmdb_collection", collectionId: 748 },
  hungergames_coll:   { name:"Hunger Games",            type:"movie",  handler:"tmdb_collection", collectionId: 131635 },
  pirates_collection: { name:"Pirates of Caribbean",   type:"movie",  handler:"tmdb_collection", collectionId: 295 },
  shrek_collection:   { name:"Shrek",                  type:"movie",  handler:"tmdb_collection", collectionId: 2150 },
  iceage_collection:  { name:"Ice Age",                type:"movie",  handler:"tmdb_collection", collectionId: 8354 },
  httyd_collection:   { name:"How To Train Your Dragon",type:"movie",  handler:"tmdb_collection", collectionId: 89137 },
  madmax_collection:  { name:"Mad Max",                type:"movie",  handler:"tmdb_collection", collectionId: 8945 },
  bourne_collection:  { name:"The Bourne",             type:"movie",  handler:"tmdb_collection", collectionId: 31562 },
  oceans_collection:  { name:"Ocean's",              type:"movie",  handler:"tmdb_collection", collectionId: 304 },
  transformers_coll:  { name:"Transformers",           type:"movie",  handler:"tmdb_collection", collectionId: 8650 },
  captainamerica_coll:{ name:"Captain America",        type:"movie",  handler:"tmdb_collection", collectionId: 131295 },
  ironman_collection: { name:"Iron Man",               type:"movie",  handler:"tmdb_collection", collectionId: 131292 },
  gotg_collection:    { name:"Guardians of the Galaxy",type:"movie",  handler:"tmdb_collection", collectionId: 284433 },
  doctorstrange_coll: { name:"Doctor Strange",         type:"movie",  handler:"tmdb_collection", collectionId: 618529 },
  blackpanther_coll:  { name:"Black Panther",          type:"movie",  handler:"tmdb_collection", collectionId: 529892 },
  antman_collection:  { name:"Ant-Man",                type:"movie",  handler:"tmdb_collection", collectionId: 422834 },
  wonderwoman_coll:   { name:"Wonder Woman",           type:"movie",  handler:"tmdb_collection", collectionId: 468552 },
  aquaman_collection: { name:"Aquaman",                type:"movie",  handler:"tmdb_collection", collectionId: 573693 },
  planetapes_coll:    { name:"Planet of the Apes",     type:"movie",  handler:"tmdb_collection", collectionId: 1709 },
  kingsman_coll:      { name:"Kingsman",               type:"movie",  handler:"tmdb_collection", collectionId: 391860 },
  taken_collection:   { name:"Taken",                 type:"movie",  handler:"tmdb_collection", collectionId: 135483 },
  alien_collection:   { name:"Alien",                 type:"movie",  handler:"tmdb_collection", collectionId: 8091 },
  terminator_coll:    { name:"Terminator",            type:"movie",  handler:"tmdb_collection", collectionId: 528 },
  predator_coll:      { name:"Predator",              type:"movie",  handler:"tmdb_collection", collectionId: 399 },
  thor_collection:    { name:"Thor",                  type:"movie",  handler:"tmdb_collection", collectionId: 131296 },
  halloween_coll:     { name:"Halloween",             type:"movie",  handler:"tmdb_collection", collectionId: 91361 },
  nightmare_coll:     { name:"Nightmare on Elm Street",type:"movie", handler:"tmdb_collection", collectionId: 8581 },
  saw_collection:     { name:"Saw",                   type:"movie",  handler:"tmdb_collection", collectionId: 656 },
  scream_collection:  { name:"Scream",                type:"movie",  handler:"tmdb_collection", collectionId: 2602 },
  conjuring_coll:     { name:"The Conjuring",         type:"movie",  handler:"tmdb_collection", collectionId: 313086 },
  despicableme_coll:  { name:"Despicable Me",         type:"movie",  handler:"tmdb_collection", collectionId: 86066 },
  kungfupanda_coll:   { name:"Kung Fu Panda",         type:"movie",  handler:"tmdb_collection", collectionId: 77816 },
  incredibles_coll:   { name:"The Incredibles",       type:"movie",  handler:"tmdb_collection", collectionId: 468222 },
  deadpool_coll:      { name:"Deadpool",              type:"movie",  handler:"tmdb_collection", collectionId: 448150 },
  sherlock_coll:      { name:"Sherlock Holmes",       type:"movie",  handler:"tmdb_collection", collectionId: 102322 },
  findingnemo_coll:   { name:"Finding Nemo",          type:"movie",  handler:"tmdb_collection", collectionId: 137697 },
  toystory_coll:      { name:"Toy Story",             type:"movie",  handler:"tmdb_collection", collectionId: 10194 },
  backtofuture_coll:  { name:"Back to the Future",    type:"movie",  handler:"tmdb_collection", collectionId: 264 },
  matrix_collection:  { name:"The Matrix",            type:"movie",  handler:"tmdb_collection", collectionId: 2344 },
  diehard_collection: { name:"Die Hard",              type:"movie",  handler:"tmdb_collection", collectionId: 1570 },
  rambo_collection:   { name:"Rambo",                 type:"movie",  handler:"tmdb_collection", collectionId: 5039 },
  expendables_coll:   { name:"The Expendables",       type:"movie",  handler:"tmdb_collection", collectionId: 126125 },
  shrek2_collection:  { name:"Minions",               type:"movie",  handler:"tmdb_collection", collectionId: 544669 },
  dune_collection:    { name:"Dune",                   type:"movie",  handler:"tmdb_collection", collectionId: 726871 },
  godfather_collection:{ name:"The Godfather",         type:"movie",  handler:"tmdb_collection", collectionId: 230 },
  spiderman_collection:{ name:"Spider-Man",              type:"movie",  handler:"tmdb_multi_collection", collectionIds: [556, 531241, 573436] },
  avatar_collection:  { name:"Avatar",                   type:"movie",  handler:"tmdb_collection", collectionId: 87096 },
  scarymovie_coll:    { name:"Scary Movie",              type:"movie",  handler:"tmdb_collection", collectionId: 4246 },
  knivesout_coll:     { name:"Knives Out",               type:"movie",  handler:"tmdb_collection", collectionId: 722971 },
  mazerunner_coll:    { name:"Maze Runner",              type:"movie",  handler:"tmdb_collection", collectionId: 295130 },
  superman_collection:{ name:"Superman",               type:"movie",  handler:"tmdb_multi_collection", collectionIds: [8537, 209131, 1540907, 593251] },
  batman_collection:  { name:"Batman",                type:"movie",  handler:"tmdb_multi_collection", collectionIds: [120794, 263, 948485] },
  justiceleague_coll: { name:"Justice League",          type:"movie",  handler:"tmdb_collection", collectionId: 468550 },
  mdb_87667:  { name:"Trakt Trending",          type:"movie",  handler:"mdb" },
  mdb_88434:  { name:"Trakt Trending",          type:"series", handler:"mdb" },
  trakt_trending_movies:   { name:"Trakt Trending",    type:"movie",  handler:"trakt_trending" },
  trakt_trending_series:   { name:"Trakt Trending",    type:"series", handler:"trakt_trending" },
  trakt_popular_movies:    { name:"Trakt Popular",     type:"movie",  handler:"trakt_popular" },
  trakt_popular_series:    { name:"Trakt Popular",     type:"series", handler:"trakt_popular" },
  trakt_anticipated_movies:{ name:"Trakt Anticipated", type:"movie",  handler:"trakt_anticipated" },
  trakt_anticipated_series:{ name:"Trakt Anticipated", type:"series", handler:"trakt_anticipated" },
  trakt_fav_movies:        { name:"My Trakt Favorites",type:"movie",  handler:"trakt_user_favorites" },
  trakt_fav_series:        { name:"My Trakt Favorites",type:"series", handler:"trakt_user_favorites" },
  trakt_watchlist_movies:  { name:"My Trakt Watchlist",type:"movie",  handler:"trakt_user_watchlist" },
  trakt_watchlist_series:  { name:"My Trakt Watchlist",type:"series", handler:"trakt_user_watchlist" },
  trakt_collection_movies: { name:"My Trakt Collection",type:"movie", handler:"trakt_user_collection" },
  trakt_collection_series: { name:"My Trakt Collection",type:"series",handler:"trakt_user_collection" },
  mdb_2236:   { name:"Top Movies This Week",           type:"movie",  handler:"mdb" },
  mdb_1198:   { name:"Most Popular (Top 20)",          type:"movie",  handler:"mdb" },
  mdb_69:     { name:"IMDb Moviemeter Top 100",        type:"movie",  handler:"mdb" },
  mdb_86934:  { name:"Latest Digital Release",         type:"movie",  handler:"mdb" },
  mdb_960:    { name:"Latest Releases",                type:"movie",  handler:"mdb" },
  mdb_2202:   { name:"Latest Blu-ray Releases",        type:"movie",  handler:"mdb" },
  mdb_1176:   { name:"Latest Certified Fresh",         type:"movie",  handler:"mdb" },
  mdb_86710:  { name:"Latest Airing Shows",            type:"series", handler:"mdb" },
  mdb_88307:  { name:"Trending Kids",           type:"movie",  handler:"mdb" },
  mdb_88309:  { name:"Trending Kids",           type:"series", handler:"mdb" },
  mdb_13:     { name:"Top Kids Movies This Week",      type:"movie",  handler:"mdb" },
  mdb_88328:  { name:"Netflix Latest",          type:"movie",  handler:"mdb" },
  mdb_86751:  { name:"Netflix Latest",          type:"series", handler:"mdb" },
  mdb_86755:  { name:"Amazon Latest",           type:"movie",  handler:"mdb" },
  mdb_86753:  { name:"Amazon Latest",           type:"series", handler:"mdb" },
  mdb_88317:  { name:"Apple TV Plus Latest",    type:"movie",  handler:"mdb" },
  mdb_88319:  { name:"Apple TV Plus Latest",    type:"series", handler:"mdb" },
  mdb_86759:  { name:"Disney Plus Latest",      type:"movie",  handler:"mdb" },
  mdb_86758:  { name:"Disney Plus Latest",      type:"series", handler:"mdb" },
  mdb_89647:  { name:"HBO Latest",              type:"movie",  handler:"mdb" },
  mdb_89649:  { name:"HBO Latest",              type:"series", handler:"mdb" },
  mdb_86762:  { name:"Paramount Plus Latest",   type:"movie",  handler:"mdb" },
  mdb_86761:  { name:"Paramount Plus Latest",   type:"series", handler:"mdb" },
  mdb_88326:  { name:"Hulu Latest",             type:"movie",  handler:"mdb" },
  mdb_88327:  { name:"Hulu Latest",             type:"series", handler:"mdb" },
  mdb_84677:  { name:"Top Documentaries",              type:"movie",  handler:"mdb" },
  mdb_84403:  { name:"Documentary",         type:"series", handler:"mdb" },
  mdb_8043:   { name:"History & War",                type:"movie",  handler:"mdb" },
  mdb_84487:  { name:"Nature",                     type:"series", handler:"mdb" },
  mdb_84401:  { name:"Reality TV",                 type:"series", handler:"mdb" },
  mdb_83497:  { name:"Standup Comedy",             type:"movie",  handler:"mdb" },
  mdb_3892:   { name:"Must-See Mindfuck",              type:"movie",  handler:"mdb" },
  mdb_3923:   { name:"Crazy Plot Twists",              type:"movie",  handler:"mdb" },
  mdb_3920:   { name:"Outer Space",                    type:"movie",  handler:"mdb" },
  mdb_2909:   { name:"Time Travel",                    type:"movie",  handler:"mdb" },
  mdb_102554: { name:"Must-See Modern Horror",         type:"movie",  handler:"mdb" },
  mdb_2410:   { name:"Horror Classics",                type:"movie",  handler:"mdb" },
  mdb_3885:   { name:"100pct Rotten Tomatoes",         type:"movie",  handler:"mdb" },
  mdb_4081:   { name:"Top 50 Parody Movies",           type:"movie",  handler:"mdb" },
  mdb_4390:   { name:"True Crime Documentaries",       type:"movie",  handler:"mdb" },
  mdb_2858:   { name:"Thrilling Movies",               type:"movie",  handler:"mdb" },
  mdb_136620: { name:"Seasonal",                       type:"movie",  handler:"mdb" },
  mdb_3918:   { name:"Pixar Collection",               type:"movie",  handler:"mdb" },
  mdb_3928:   { name:"DreamWorks Collection",          type:"movie",  handler:"mdb" },
  mdb_3087:   { name:"BBC Shows",                      type:"series", handler:"mdb" },
  mdb_3091:   { name:"UK Shows",                       type:"series", handler:"mdb" },
  mdb_92337:  { name:"Best of 2025",                   type:"movie",  handler:"mdb" },
  mdb_91304:  { name:"Best of 2020s",                  type:"movie",  handler:"mdb" },
  mdb_91303:  { name:"Best of 2010s",                  type:"movie",  handler:"mdb" },
  mdb_91302:  { name:"Best of 2000s",                  type:"movie",  handler:"mdb" },
  mdb_91300:  { name:"Best of 1990s",                  type:"movie",  handler:"mdb" },
  mdb_91301:  { name:"Best of 1980s",                  type:"movie",  handler:"mdb" },
  search_movies: { name:"Ultra MAX", type:"movie",  handler:"search" },
  search_series: { name:"Ultra MAX", type:"series", handler:"search" },
};

const DYNAMIC_CATALOGS = [
  { type:"movie",  id:"similar_movie",      name:"More Like This" },
  { type:"series", id:"similar_series",     name:"More Like This" },
  { type:"movie",  id:"recommended_movie",  name:"Recommended"    },
  { type:"series", id:"recommended_series", name:"Recommended"    },
  { type:"movie",  id:"collection_movie",   name:"Collection"     }
];

function getStaticIds() {
  // MDB catalogs not in static manifest - only via custom configs
  return Object.keys(CATALOG_DEFS).filter(id => {
    if (!FILTER_ENABLED) return true;
    return !["crunchyroll","hidive","anime","bollywood"].some(x => id.includes(x));
  });
}

function buildManifestCatalogs(ids) {
  return ids.map(id => {
    const def = CATALOG_DEFS[id];
    if (!def) return null;
    return { type: def.type, id, name: def.name, extra: [{ name:"skip", isRequired: false }] };
  }).filter(Boolean);
}

const staticIds = getStaticIds();

const builder = new addonBuilder({
  id: FILTER_ENABLED ?"org.kris.ultra.max.v5" :"org.kris.ultra.max.all.v5",
  version:"5.5.0",
  logo: "https://max-streams.gleeze.com/logo.svg",
  name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All",
  description:"Dev build v5.3",
  types: ["movie","series"],
  resources: ["catalog","meta","stream"],
  catalogs: [
    { type:"movie",  id:"ultramax_placeholder", name:"Ultra MAX", extra: [{ name:"skip", isRequired: false }] }
  ]
});

async function fetchCached(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await axios.get(url, { timeout: 10000 });
  cache.set(url, res.data);
  setTimeout(() => cache.delete(url), 300000);
  return res.data;
}

async function fetchTrakt(path) {
  if (!TRAKT_CLIENT_ID) return [];
  const url = `https://api.trakt.tv${path}`;
  if (cache.has(url)) return cache.get(url);
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": TRAKT_CLIENT_ID
      }
    });
    cache.set(url, res.data);
    setTimeout(() => cache.delete(url), 300000);
    return res.data;
  } catch(e) {
    console.error("Trakt fetch error:", e.message);
    return [];
  }
}

async function traktToMetas(arr, type, language, rpdbKey, tpKey, excludeUnreleased = false) {
  const tmdbResults = [];
  for (const item of arr) {
    const entity = item.movie || item.show || item;
    const tmdbId = entity?.ids?.tmdb;
    if (!tmdbId) continue;
    try {
      const tmdbType = type === "series" ? "tv" : "movie";
      const tmdbData = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&language=${language}`);
      tmdbResults.push(tmdbData);
    } catch(e) {}
  }
  return await resultsToMetas(tmdbResults, type, FILTER_ENABLED, language, rpdbKey, tpKey, excludeUnreleased);
}

async function getImdbId(tmdbId, type) {
  const key = `${type}-${tmdbId}`;
  if (imdbCache.has(key)) return imdbCache.get(key);
  try {
    const t = type ==="series" ?"tv" :"movie";
    const r = await axios.get(`https://api.themoviedb.org/3/${t}/${tmdbId}/external_ids?api_key=${TMDB_KEY}`, { timeout: 5000 });
    if (!r.data.imdb_id) return null;
    imdbCache.set(key, r.data.imdb_id);
    return r.data.imdb_id;
  } catch { return null; }
}

async function resultsToMetas(arr, type, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, excludeUnreleased = false) {
  const today = new Date().toISOString().slice(0,10);
  return (await Promise.all(
    arr.filter(i => {
      if (!i.poster_path) return false;
      if (excludeUnreleased) {
        const d = i.release_date || i.first_air_date || "";
        if (!d || d > today) return false;
      }
      return true;
    }).map(async i => {
      const imdb = await getImdbId(i.id, type);
      if (!imdb) return null;
      const meta = {
        id: imdb, type,
        name: i.title || i.name || i.original_title,
        poster: tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdb}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdb}.jpg` : `https://image.tmdb.org/t/p/w500${i.poster_path}`,
        background: i.backdrop_path ? `https://image.tmdb.org/t/p/original${i.backdrop_path}` : null
      };
      if (language && language !== "en-US" && i.overview) meta.description = i.overview;
      return meta;
    })
  )).filter(Boolean);
}

async function mdblistToMetas(listId, type, mdbKey, rpdbKey = null, tpKey = null) {
  const tryKeys = mdbKey ? [mdbKey] : MDBLIST_KEYS;
  let data = null;
  for (const key of tryKeys) {
    const url = `https://mdblist.com/api/lists/${listId}/items/?apikey=${key}&limit=100&type=${type ==="series" ?"show" :"movie"}`;
    try {
      const resp = await fetchCached(url);
      if (resp && !resp.error) { data = resp; break; }
    } catch(e) {}
  }
  if (!data) return [];
  try {
    const items = Array.isArray(data) ? data : (data.movies || data.shows || data.items || []);
    return (await Promise.all(
      items.map(async item => {
        const imdbId = item.imdb_id || item.imdbid;
        if (!imdbId) return null;
        const tmdbType = type ==="series" ?"tv" :"movie";
        try {
          const find = await fetchCached(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_KEY}&external_source=imdb_id`);
          const result = find[`${tmdbType}_results`]?.[0];
          if (!result) return { id: imdbId, type, name: item.title };
          return {
            id: imdbId, type,
            name: item.title || result.title || result.name,
            poster: tpKey ? `https://api.top-streaming.stream/${tpKey}/imdb/poster-default/${imdbId}.jpg` : rpdbKey ? `https://api.ratingposterdb.com/${rpdbKey}/imdb/poster-default/${imdbId}.jpg` : result.poster_path ? `https://image.tmdb.org/t/p/w500${result.poster_path}` : null,
            background: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null
          };
        } catch { return { id: imdbId, type, name: item.title }; }
      })
    )).filter(Boolean);
  } catch (e) { console.log("mdblist error", listId, e.message); return []; }
}

async function handleCatalog(catalogId, type, extra, mdbKey, filterLang = FILTER_ENABLED, language = "en-US", rpdbKey = null, tpKey = null, traktUser = null, excludeUnreleased = false, maxRating = null) {
  const skip = extra?.skip || 0;
  const page = Math.floor(skip / 20) + 1;
  const tmdbType = type ==="series" ?"tv" :"movie";
  const tmdbId = extra?.tmdbId;
  const ratingParam = maxRating ? `&certification_country=US&certification.lte=${encodeURIComponent(maxRating)}` : "";
  const sortBy = extra?.sort === "chronological" ? "primary_release_date.asc" : (extra?.sort === "release_date_desc" ? "primary_release_date.desc" : (extra?.sort === "top_rated" ? "vote_average.desc&vote_count.gte=200" : "popularity.desc"));

  if (catalogId ==="similar_movie" || catalogId ==="similar_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/similar?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type, filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
  }
  if (catalogId ==="recommended_movie" || catalogId ==="recommended_series") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}/recommendations?api_key=${TMDB_KEY}&page=${page}`);
    return { metas: await resultsToMetas(data.results || [], type, filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
  }
  if (catalogId ==="collection_movie") {
    if (!tmdbId) return { metas: [] };
    const data = await fetchCached(`https://api.themoviedb.org/3/collection/${tmdbId}?api_key=${TMDB_KEY}`);
    return { metas: await resultsToMetas(data.parts || [], "movie", filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
  }

  const def = CATALOG_DEFS[catalogId];
  if (!def) return { metas: [] };

  if (def.handler ==="mdb") {
    const listId = catalogId.replace("mdb_","");
    return { metas: await mdblistToMetas(listId, type, mdbKey, rpdbKey, tpKey) };
  }

  let url;
  switch(def.handler) {
    case"tmdb_trending":
      url = `https://api.themoviedb.org/3/trending/${tmdbType}/week?api_key=${TMDB_KEY}&page=${page}`;
      break;
    case"tmdb_source":
      url = `https://api.themoviedb.org/3/${tmdbType}/${def.source}?api_key=${TMDB_KEY}&page=${page}`;
      break;
    case"tmdb_provider":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=${def.provider}&watch_region=US&sort_by=popularity.desc&page=${page}`;
      break;
    case"tmdb_genre": {
      let genre = def.genre;
      if (type ==="series") {
        if (genre === 28) genre = 10759;
        if ([878, 27, 14].includes(genre)) genre = 10765;
        if (genre === 53) genre = 9648;
      }
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=${genre}&sort_by=popularity.desc&page=${page}`;
      break;
    }
    case"tmdb_keyword":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_keywords=${def.keyword}&sort_by=popularity.desc&page=${page}`;
      if (def.lang) url += `&with_original_language=${def.lang}`;
      break;
    case"tmdb_company":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_companies=${encodeURIComponent(def.company)}&sort_by=${sortBy}&page=${page}${ratingParam}${def.excludeAnimation?"&without_genres=16":""}`;
      break;
    case"tmdb_network":
      url = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_KEY}&with_networks=${def.networkId}&sort_by=${sortBy}&page=${page}`;
      break;
    case"tmdb_director":
    case"tmdb_actor":
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_cast=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;
      url = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_KEY}&with_crew=${def.personId}&sort_by=${sortBy}&page=${page}${ratingParam}`;
      break;
    case"tmdb_collection": {
      let parts = (await fetchCached(`https://api.themoviedb.org/3/collection/${def.collectionId}?api_key=${TMDB_KEY}`)).parts || [];
      if(extra?.sort === "chronological") parts = parts.slice().sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      else if(extra?.sort === "release_date_desc") parts = parts.slice().sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      return { metas: await resultsToMetas(parts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"tmdb_multi_collection": {
      let allParts = [];
      for(const cid of def.collectionIds) {
        try {
          const d = await fetchCached(`https://api.themoviedb.org/3/collection/${cid}?api_key=${TMDB_KEY}`);
          if(d.parts) allParts.push(...d.parts);
        } catch(e) {}
      }
      if(extra?.sort === "chronological") allParts = allParts.sort((a,b) => (a.release_date||"").localeCompare(b.release_date||""));
      else if(extra?.sort === "release_date_desc") allParts = allParts.sort((a,b) => (b.release_date||"").localeCompare(a.release_date||""));
      return { metas: await resultsToMetas(allParts, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_trending": {
      const path = type === "series" ? "/shows/trending" : "/movies/trending";
      const data = await fetchTrakt(`${path}?limit=50`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_popular": {
      const path = type === "series" ? "/shows/popular" : "/movies/popular";
      const data = await fetchTrakt(`${path}?limit=50&extended=full`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_anticipated": {
      const path = type === "series" ? "/shows/anticipated" : "/movies/anticipated";
      const data = await fetchTrakt(`${path}?limit=50`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_favorites": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/favorites/${t}?limit=50`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_watchlist": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/watchlist/${t}?limit=50`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"trakt_user_collection": {
      if (!traktUser) return { metas: [] };
      const t = type === "series" ? "shows" : "movies";
      const data = await fetchTrakt(`/users/${traktUser}/collection/${t}`);
      return { metas: await traktToMetas(data, type, language, rpdbKey, tpKey, excludeUnreleased) };
    }
    case"tmdb_anime":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${page}`;
      break;
    case"tmdb_bollywood":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_original_language=hi&sort_by=popularity.desc&page=${page}`;
      break;
    case"tmdb_paramount":
      url = `https://api.themoviedb.org/3/discover/${tmdbType}?api_key=${TMDB_KEY}&with_watch_providers=2616%7C2303&watch_region=US&sort_by=popularity.desc&page=${page}`;
      break;
    case"search":
      console.log("SEARCH CASE HIT:", catalogId, extra?.search);
      if (!extra?.search) return { metas: [] };
      return { metas: await resultsToMetas((await fetchCached(`https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_KEY}&query=${encodeURIComponent(extra.search)}&page=1`)).results || [], type, false, language, rpdbKey, tpKey) };
    default:
      return { metas: [] };
      return { metas: [] };
  }


  if (language && language !== "en-US") url += `&language=${language}`;
  const startPage = Math.floor((extra?.skip || 0) / 100) * 5 + 1;
  const pages = await Promise.all(
    Array.from({length: 5}, (_, i) =>
      fetchCached(url.replace(`page=${page}`, `page=${startPage + i}`))
        .catch(() => ({ results: [] }))
    )
  );
  const allResults = pages.flatMap(d => d.results || []);
  return { metas: await resultsToMetas(allResults, type, filterLang, language, rpdbKey, tpKey, excludeUnreleased) };

}

function buildCatalogsFromIds(selectedIds) {
  const catalogs = selectedIds.map(id => {
    const def = CATALOG_DEFS[id];
    if (!def) return null;
   return { type: def.type, id, name: def.name, extra: [{ name:"skip", isRequired: false }] };
  });
  return catalogs;
}

builder.defineCatalogHandler(async ({ type, id, extra }) => {
  console.log("SDK HANDLER:", id, extra);
  try { return await handleCatalog(id, type, extra, null); }
  catch (e) { console.log("catalog error", id, e.message); return { metas: [] }; }
});

builder.defineStreamHandler(async () => ({ streams: [] }));

builder.defineMetaHandler(async ({ type, id }) => {
  try {
    const tmdbType = type ==="series" ?"tv" :"movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return { meta: { id, type } };
    const tmdbId = result.id;
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const meta = {
      id, type,
      name: d.title || d.name,
      description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      genres: (d.genres || []).map(g => g.name),
      cast
    };
    if (type ==="series" && d.next_episode_to_air) {
      const next = d.next_episode_to_air;
      meta.releaseInfo = `${d.first_air_date?.split("-")[0] ||""} - Next: S${next.season_number}E${next.episode_number} ${next.air_date}`;
    }
    if (type ==="series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const videos = [];
      for (const season of seasons) {
        try {
          const sr = await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          (sr.episodes || []).forEach(ep => {
            videos.push({
              id: `${id}:${season.season_number}:${ep.episode_number}`,
              title: ep.name || `Episode ${ep.episode_number}`,
              season: season.season_number, episode: ep.episode_number,
              overview: ep.overview ||"",
              thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
              released: ep.air_date ? new Date(ep.air_date).toISOString() : null
            });
          });
        } catch { }
      }
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }
    return { meta };
  } catch (e) { return { meta: { id, type } }; }
});

const addonInterface = builder.getInterface();
const app = express();
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(200); next(); });
app.use(express.json());

app.get("/configure", (req, res) => { res.setHeader("Cache-Control","no-store"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/configure/:token", (req, res) => { res.setHeader("Cache-Control","no-store"); res.sendFile(path.join(__dirname,"configure.html")); });
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
app.get("/collections-builder", (req, res) => { res.sendFile(path.join(__dirname,"collections-builder.html")); });
app.get("/logo.svg", (req, res) => { res.sendFile(path.join(__dirname,"logo.svg")); });
app.use("/images", express.static(path.join(__dirname,"images"), { maxAge: '7d', etag: true }));
app.get("/collections.json", (req, res) => { res.sendFile(path.join(__dirname,"collections.json")); });
app.post("/c/create", (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rateLimit(ip, 5, 60000)) return res.status(429).json({ error:"Too many requests." });
  const { password, catalogs, mdblistKey, language, rpdbKey, tpKey, traktUser, excludeUnreleased, maxRating } = req.body;
  if (!password || !catalogs || !catalogs.length) return res.status(400).json({ error:"Password and catalogs required" });
  const configs = loadConfigs();
  let token = generateToken();
  while (configs[token]) token = generateToken();
  configs[token] = { passwordHash: hashPassword(password), catalogs, mdblistKey: mdblistKey || null, language: language || "en-US", rpdbKey: rpdbKey || null, tpKey: tpKey || null, traktUser: traktUser || null, excludeUnreleased: !!excludeUnreleased, maxRating: maxRating || null, createdAt: new Date().toISOString() };
  saveConfigs(configs);
  res.json({ token });
});

app.post("/c/:token/update", (req, res) => {
  const { token } = req.params;
  const { password, catalogs, mdblistKey, language, rpdbKey, tpKey, traktUser, excludeUnreleased, maxRating } = req.body;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Config not found" });
  if (configs[token].passwordHash !== hashPassword(password)) return res.status(401).json({ error:"Incorrect password" });
  configs[token].catalogs = catalogs;
  configs[token].language = language || configs[token].language || "en-US";
  configs[token].rpdbKey = rpdbKey || configs[token].rpdbKey || null;
  configs[token].tpKey = tpKey || configs[token].tpKey || null;
  configs[token].mdblistKey = mdblistKey || configs[token].mdblistKey || null;
  configs[token].traktUser = traktUser !== undefined ? traktUser : configs[token].traktUser;
  configs[token].excludeUnreleased = excludeUnreleased !== undefined ? !!excludeUnreleased : (configs[token].excludeUnreleased || false);
  configs[token].maxRating = maxRating !== undefined ? maxRating : (configs[token].maxRating || null);
  configs[token].updatedAt = new Date().toISOString();
  saveConfigs(configs);
  res.json({ token });
});

app.get("/c/:token/config", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Not found" });
  res.json({ catalogs: configs[token].catalogs, mdblistKey: configs[token].mdblistKey, language: configs[token].language, rpdbKey: configs[token].rpdbKey, tpKey: configs[token].tpKey, traktUser: configs[token].traktUser, excludeUnreleased: configs[token].excludeUnreleased || false, maxRating: configs[token].maxRating || null });
});

app.post("/c/:token/collections", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json({ error:"Not found" });
  const { collections } = req.body;
  if (!Array.isArray(collections)) return res.status(400).json({ error:"Invalid collections" });
  configs[token].collections = collections;
  saveConfigs(configs);
  res.json({ ok: true });
});

app.get("/c/:token/collections.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  if (!configs[token]) return res.status(404).json([]);
  res.json(configs[token].collections || []);
});

app.get("/c/:token/manifest.json", (req, res) => {
  const { token } = req.params;
  const configs = loadConfigs();
  const config = configs[token];
  if (!config) return res.status(404).json({ error:"Config not found" });
  const manifest = {
    id: `org.kris.ultramax.custom.${token}`,
    version:"5.5.0",
    name:"Ultra MAX",
    description: `Custom addon with ${config.catalogs.length} catalogs`,
    logo: "https://max-streams.gleeze.com/logo.svg",
    types: ["movie","series"],
    resources: ["catalog","meta","stream"],
    catalogs: [
      ...buildCatalogsFromIds(config.catalogs),
      { type:"movie", id:"search_movies", name:"Ultra MAX", extra:[{ name:"search", isRequired:true }] },
      { type:"series", id:"search_series", name:"Ultra MAX", extra:[{ name:"search", isRequired:true }] }
    ],
  };
  res.json(manifest);
});


app.get("/c/:token/meta/:type/:id.json", async (req, res) => {
  const { token, type, id } = req.params;
  const configs = loadConfigs();
  const lang = configs[token]?.language || "en-US";
  try {
    const tmdbType = type === "series" ? "tv" : "movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    console.log("META DEBUG:", tmdbType, id, "result:", result?.id, "lang:", lang);
    if (!result) return res.json({ meta: { id, type } });
    const tmdbId = result.id;
    const d = await fetchCached(`https://api.themoviedb.org/3/${tmdbType}/${tmdbId}?api_key=${TMDB_KEY}&append_to_response=credits&language=${lang}`);
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const meta = {
      id, type, name: d.title || d.name, description: d.overview,
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null,
      background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null,
      releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null,
      imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null,
      genres: (d.genres || []).map(g => g.name), cast
    };
    if (type ==="series") {
      const seasons = (d.seasons || []).filter(s => s.season_number > 0);
      const videos = [];
      for (const season of seasons) {
        try {
          const sr = await fetchCached(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season.season_number}?api_key=${TMDB_KEY}`);
          (sr.episodes || []).forEach(ep => {
            videos.push({
              id: `${id}:${season.season_number}:${ep.episode_number}`,
              title: ep.name || `Episode ${ep.episode_number}`,
              season: season.season_number, episode: ep.episode_number,
              overview: ep.overview ||"",
              thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
              released: ep.air_date ? new Date(ep.air_date).toISOString() : null
            });
          });
        } catch { }
      }
      videos.sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode);
      meta.videos = videos;
    }
    res.json({ meta });
  } catch (e) { res.json({ meta: { id, type } }); }
});


app.get("/meta/:type/:id.json", async (req, res) => {
  const { type, id } = req.params;
  try {
    const tmdbType = type ==="series" ?"tv" :"movie";
    const findRes = await fetchCached(`https://api.themoviedb.org/3/find/${id}?api_key=${TMDB_KEY}&external_source=imdb_id`);
    const result = findRes[`${tmdbType}_results`]?.[0];
    if (!result) return res.json({ meta: { id, type } });
    const tmdbId = result.id;
    const cast = (d.credits?.cast || []).slice(0, 5).map(c => c.name);
    const meta = { id, type, name: d.title || d.name, description: d.overview, poster: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : null, background: d.backdrop_path ? `https://image.tmdb.org/t/p/original${d.backdrop_path}` : null, releaseInfo: d.release_date ? d.release_date.split("-")[0] : d.first_air_date ? d.first_air_date.split("-")[0] : null, imdbRating: d.vote_average ? d.vote_average.toFixed(1) : null, genres: (d.genres || []).map(g => g.name), cast };
    res.json({ meta });
  } catch (e) { res.json({ meta: { id, type } }); }
});

app.get("/stream/:type/:id.json", (req, res) => res.json({ streams: [] }));
app.get("/c/:token/stream/:type/:id.json", (req, res) => res.json({ streams: [] }));

app.use((req, res, next) => {
  const url = req.url;
  if (url.includes("/manifest.json") && !url.startsWith("/c/")) {
    const fullManifest = {
      id: FILTER_ENABLED ?"org.kris.ultra.max.v5" :"org.kris.ultra.max.all.v5",
      version:"5.5.0",
  logo: "https://max-streams.gleeze.com/logo.svg",
      name: FILTER_ENABLED ?"Ultra MAX" :"Ultra MAX All",
      description: FILTER_ENABLED ?"Filtered content" :"All content",
      types: ["movie","series"],
      resources: ["catalog","meta","stream"],
      catalogs: [
        ...buildManifestCatalogs(staticIds),
        ...DYNAMIC_CATALOGS.map(c => ({ type: c.type, id: c.id, name: c.name, extra: [{ name:"tmdbId", isRequired: true }] })),
        { type:"movie", id:"search_movies", name:"Ultra MAX", extra:[{ name:"search", isRequired:true }] },
        { type:"series", id:"search_series", name:"Ultra MAX", extra:[{ name:"search", isRequired:true }] }
      ]
    };
    fullManifest.catalogs = (fullManifest.catalogs || []).filter(c => !c.id.startsWith("mdb_")).map(c => ({
  ...c,
  name: (c.name || "").trim()
}));
    return res.json(fullManifest);
  }
  if (url.match(/\/catalog\//) && !url.startsWith("/c/")) {
    const match = url.match(/\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, type, id, extraStr] = match;
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split("&").forEach(p => { const [k,v] = p.split("="); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      handleCatalog(id, type, extra, null)
        .then(result => res.json(result))
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
if (url.includes("/catalog/") && url.includes("/c/")) {
    const match = url.match(/\/c\/([^/]+)\/catalog\/([^/]+)\/([^/]+)(?:\/(.+))?\.json/);
    if (match) {
      const [, token, type, id, extraStr] = match;
console.log("CUSTOM CATALOG:", token, id, "extraStr:", extraStr);
      const configs = loadConfigs();
      const config = configs[token];
      if (!config) return res.json({ metas: [] });
      let extra = {};
      if (extraStr) { try { extra = JSON.parse(decodeURIComponent(extraStr)); } catch { decodeURIComponent(extraStr).split('&').forEach(p => { const [k,v] = p.split('='); if(k && v) extra[k]=decodeURIComponent(v); }); } }
      if (req.query.skip) extra.skip = parseInt(req.query.skip);
      if (req.query.search) extra.search = req.query.search;
      const hasAnime = config.catalogs.some(c => c.includes("anime") || c.includes("bollywood") || c.includes("crunchyroll") || c.includes("hidive"));
      handleCatalog(id, type, extra, config.mdblistKey || MDBLIST_KEY, !hasAnime, config.language || "en-US", config.rpdbKey || null, config.tpKey || null, config.traktUser || null, config.excludeUnreleased || false, config.maxRating || null)
        .then(result => res.json(result))
        .catch(() => res.json({ metas: [] }));
      return;
    }
  }
  next();
});

const PREWARM_LISTS = ['92337','91304','91303','91302','91300','91301','86710','88307','88309','3087','3091'];
setTimeout(async () => {
  console.log('Pre-warming MDBList cache...');
  for (const id of PREWARM_LISTS) {
    try {
      await fetchCached(`https://mdblist.com/api/lists/${id}/items/?apikey=${MDBLIST_KEY}&limit=20&type=movie`);
      await new Promise(r => setTimeout(r, 300));
    } catch(e) {}
  }
  console.log('Cache pre-warm complete');
}, 5000);

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Ultra MAX v5.3 DEV running on port ${PORT}`);
  console.log(`Total catalog defs: ${Object.keys(CATALOG_DEFS).length}`);
  console.log(`Static catalogs: ${staticIds.length}`);
});
