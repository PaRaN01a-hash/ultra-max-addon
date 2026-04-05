# Ultra MAX

A self-hosted Stremio addon that provides clean, curated movie and series catalogs powered by the TMDB API. Built with Node.js and the Stremio Addon SDK.

## Install

Visit [max-streams.gleeze.com](https://max-streams.gleeze.com) to install via the landing page. Two versions are available — a filtered build and an unfiltered build that includes anime and Bollywood content.

## Features

**Providers**
Netflix, Amazon, Disney+, Hulu, HBO/Max, Apple TV+, Paramount+, Peacock, MGM+, Acorn TV, Shudder, BritBox, ITVX, Channel 4

**Genres**
Action, Comedy, Horror, Sci-Fi, Documentary, Romance, Thriller, Crime, Animation, Family, Fantasy, Mystery

**Catalogs**
Trending, Popular, Top Rated, Now Playing, Airing Today, On The Air — all available for both movies and series.

**Metadata**
Full metadata returned directly from TMDB including descriptions, cast, ratings, trailers, backdrop images and episode listings for series. No external metadata addon required.

**Pagination**
Continuous scrolling supported across all catalogs.

**Companion Addons**
A Live TV addon is also available at [max-streams-tv.gleeze.com](https://max-streams-tv.gleeze.com) with 200+ UK, 47 Australian and 1500+ US channels sourced from the iptv-org project.

## Tech Stack

- Node.js
- Stremio Addon SDK
- TMDB API
- Docker

## Self Hosting

Clone the repository and create a `.env` file with your TMDB API key:
TMDB_KEY=your_key_here
Run with Docker Compose:
docker compose up -d
The filtered version runs on port 7000 and the unfiltered version on port 7001, controlled by the `FILTER_MODE` environment variable. Set `FILTER_MODE=off` to disable content filtering.

## Notes

This addon provides catalogs and metadata only. A stream source addon such as aiostreams is required to play content.

TMDB API key required for self hosting. Free keys are available at [themoviedb.org](https://www.themoviedb.org/settings/api).