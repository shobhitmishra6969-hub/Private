---
name: Taste engine architecture
description: How tasteEngine.js and autoplayManager.js are built and wired into the bot.
---

## Files
- `src/utils/tasteEngine.js` — pure utility, no event wiring inside
- `src/utils/autoplayManager.js` — class with singleton `.instance`; call `AutoplayManager.instance.init(client)` once

## Persistence
- JSON file: `data/user_tastes.json`
- In-memory cache (`_store`); debounced 2-second disk write on every mutation

## Signal deltas (capped to [-15, +30])
- LIKE   → +4   (green heart button)
- SKIP   → -3   (played < 30 s before trackEnd)
- FINISH → +1.5 (played ≥ 75 % of duration)

## Wiring points
1. `src/commands/loaders/loadPlayers.js` — `AutoplayManager.instance.init(client)` after event loop
2. `src/events/Client/interactionCreate.js` — `processInteraction(userId, trackMeta, 'LIKE')` inside `np_like` case (only on add, not on remove)
3. `src/utils/playerUtils.js` — `pickBest()` now calls `AutoplayManager.rankByTaste()` which calls `scoreCandidates()` to sort search results before selection

## Scoring
- Per active VC user: artist weight × 2.0 + genre weight × 1.5
- +random(0–3) entropy to prevent deterministic repeat loops
- Genre detection: keyword regex in GENRE_RULES covering Bollywood, Punjabi, Hip-hop, Lo-fi, EDM, K-pop, R&B, Rock, Classical, Jazz, Pop, Regional-India

**Why:** AutoplayManager must be init'd AFTER loadPlayers.js creates the Kazagumo manager. Singleton pattern ensures double-init from require cache is a no-op.
