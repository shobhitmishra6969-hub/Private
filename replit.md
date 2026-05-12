# Shafed Billi - Discord Music Bot

## Overview
A feature-rich Discord music bot built with Discord.js v14 and Lavalink (via kazagumo/shoukaku). Supports music playback, AFK system, giveaways, premium system, and user profiles.

## Architecture
- **Entry**: `run.js` → `psycho.js` → `index.js`
- **Client**: `src/structures/MusicClient.js`
- **Commands**: `src/commands/<Category>/` (auto-loaded)
- **Events**: `src/events/Client/`, `src/events/Node/`, `src/events/Players/`
- **Loaders**: `src/commands/loaders/` (loadClients, loadCommands, loadNodes, loadPlayers, loadPlayerManager)
- **Database**: SQLite via `better-sqlite3` (`data/bot.db`), schema models in `src/database/Model.js`
- **Schemas**: `src/schema/` — Mongoose-compatible Model wrappers over SQLite tables

## Command Categories
- **Music**: play, skip, queue, pause, resume, stop, nowplaying, lyrics, etc.
- **Filters**: filter/eq with 13+ audio effects (premium)
- **Favourite**: like, unlike, playliked, showliked
- **Config**: setprefix, ignore, 247, source
- **Giveaway**: start, end, reroll, cancel, list, edit
- **Information**: help, ping, stats, invite, support, premium
- **Utility**: afk, calculator, avatar, banner, membercount, dm, servericon, serverbanner
- **Profile**: profile (badges, stats, premium info), bioset
- **Spotify**: searchTrack, searchAlbum, searchArtist, spotifyPlaylist, spotifyProfile
- **Owner**: reload, restart, blacklist, premiumuser, node, serverlist, branding

## Key Files
- `src/config.js` — Bot configuration (token, prefix, Lavalink nodes, links)
- `src/emojis.js` — Emoji constants
- `src/database/index.js` — SQLite schema creation & migrations
- `src/custom/` — Discord Components V2 builders

## Database Tables
- `afk` — AFK status (userId, guildId, mode, reason, createdAt)
- `premiumuser` — Premium users (userId, premium, addedBy, addedAt, expiresAt, credits, activatedGuilds)
- `userstats` — Per-user command run count (userId, commandsRun, updatedAt)
- `userbadges` — User badges (userId, badges JSON array)
- `userpreferences` — User settings (userId, musicSource, bio)
- `giveaway`, `prefix`, `blacklist`, `ignorechannel`, `liked`, `noprefix`, `setup`, `spotifyprofile`, `vcstatus`, `voicerole`, `autorole`

## Recent Fixes
- Fixed all loader paths in `src/structures/MusicClient.js` and `src/commands/loaders/` — were pointing to non-existent directories
- Fixed `loadCommands.js` to correctly scan `src/commands/` and skip the `loaders` subfolder
- Fixed `loadClients.js`, `loadNodes.js`, `loadPlayers.js` event paths to use `../../events/`
- Added `userstats` and `userbadges` tables to database
- Added `credits` and `activatedGuilds` columns to `premiumuser` table
- Created `profile` command with badges, command count, and premium info panel
- Command runs now tracked automatically in `userstats` via `messageCreate` event
