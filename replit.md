# Tone Vibes — Discord Music Bot

## Overview
A feature-rich Discord music bot built with **discord.py** and **ravelink** (Lavalink v4 wrapper). Supports music playback, filters, playlists, giveaways, AFK system, Spotify/Last.fm integration, and a premium system.

## Architecture
- **Entry**: `run.py` → `bot.py` (ToneVibes class)
- **Config**: `config.py` — reads all settings from environment variables
- **Cogs**: `cogs/` — command categories (auto-loaded)
- **Events**: `events/player_events.py` — ravelink player/node events
- **Database**: SQLite via `aiosqlite` (`data/bot.db`), models in `database/models.py`
- **Utils**: `utils/` — formatters, checks, logger

## Command Categories (Cogs)
- **music** — play, skip, queue, pause, resume, stop, nowplaying, seek, volume, loop, shuffle, etc.
- **filters** — nightcore, vaporwave, bassboost, 8d, tremolo, vibrato, karaoke, customfilter
- **favourite** — like, unlike, playliked, showliked
- **config_cog** — setprefix, source, ignore, 247, djrole, toggle
- **giveaway** — start, end, reroll, cancel, list, edit
- **information** — help, ping, stats, invite, support, about, premium
- **utility** — afk, calculator, avatar, banner, membercount, dm, servericon, serverbanner
- **owner** — reload, restart, blacklist, premiumuser, node, serverlist, eval, sync
- **spotify** — searchTrack, searchAlbum, searchArtist, spotifyPlaylist
- **playlist** — create, add, remove, load, list, info
- **lastfm** — link, profile, recent, top artists/tracks

## Key Files
- `run.py` — entry point
- `bot.py` — ToneVibes bot class, cog loading, event hooks
- `config.py` — all configuration from environment variables
- `emojis.py` — emoji constants
- `database/__init__.py` — SQLite schema creation
- `database/models.py` — async database helpers
- `events/player_events.py` — ravelink player event handlers

## Environment Variables
- `DISCORD_TOKEN` *(secret, required)* — Discord bot token
- `BOT_PREFIX` — command prefix (default: `+`)
- `OWNER_ID` — comma-separated owner user IDs
- `LAVALINK_NODE_1_NAME/URL/AUTH/SECURE` — first Lavalink node
- `LAVALINK_NODE_2_NAME/URL/AUTH/SECURE` — second Lavalink node
- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` — Spotify API (optional)
- `LASTFM_API_KEY` / `LASTFM_API_SECRET` — Last.fm API (optional)
- `NODE_SOURCE` — default search source (default: `ytmsearch`)

## User Preferences
- Pure Python codebase — no JavaScript
- ravelink wrapper from https://github.com/ravelink-dev/ravelink
