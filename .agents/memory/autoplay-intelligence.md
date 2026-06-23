---
name: Autoplay Intelligence System
description: User history engine, language detection, and smart autoplay logic — design decisions
---

## Architecture

`autoplay.js` exports `buildModePanel` and `attachCollector` so the `np_autoplay` button handler in `interactionCreate.js` can open the mode panel as an ephemeral followUp (not a simple toggle).

**Why:** The Autoplay button on the now-playing card was a simple on/off toggle. Now it opens a 3-button mode selector (Related/Mood/Turn Off), then a 2×2 mood grid if Mood is picked — matching the reference UI in the screenshots.

## User History Engine

- **DB table**: `userhistory` — columns: `userId, title, uri, author, duration, thumbnail, language, vibe, playedAt`
- **Rolling cap**: 50 entries per user (enforced on every save)
- **Language detection**: `src/utils/languageDetect.js` — artist-name priority lookup, then title keyword scoring, then Unicode script heuristics (Devanagari→Hindi, Gurmukhi→Punjabi). Languages: Punjabi, Hindi, Bhojpuri, Tamil, Telugu, English.
- **Vibe detection**: keyword scoring across chill/lofi/party/sad/romantic/devotional. Falls back to 'mixed'.
- Language preference requires ≥3 non-English plays to be considered "strong signal" (prevents false positives from one-off plays).

## How to apply

- Every track that starts playing calls `UserHistory.save(userId, track)` from `playerStart.js`.
- `getLanguagePreference(userId)` → returns null if no strong signal (≥3 non-English plays required).
- `getTopArtists(userId, n)` → used by Related mode to build taste-aware search queries.

## Autoplay Mode Flow

1. User clicks **Autoplay** on NP card → ephemeral followUp with mode panel (Related / Mood / Turn Off)
2. **Related** → stores `autoplayUserId` on player; `attemptAutoplay` injects top-2 artists as Phase 0 taste query before Spotify/LastFM phases
3. **Mood** → 2×2 grid (Chill/Party/Lo-Fi/Sad); on selection, reads user's language preference and picks a language-targeted search query (e.g. "sad punjabi songs" if user has ≥3 Punjabi plays)
4. Guild-level `recentlyPlayed` set (last 25 track IDs) prevents loops across all autoplay modes

## Key conventions

- Mood queries are defined per-language in `MOODS[key].baseQueries[lang]` in `autoplay.js`
- `attachCollector` collector timeout = 60s; on timeout, the ephemeral panel is deleted
- The collector filter is strict: only the user who clicked the button can interact
