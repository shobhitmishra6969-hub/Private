---
name: Discord v2 components migration
description: How ToneVibes sends all command responses using Discord v2 layout components (Containers, TextDisplay, Section+Thumbnail, Separator).
---

## Rule
Every command response uses `utils/v2.py` helpers — no `discord.Embed` in command replies.

**Why:** The user wants the Rythm-bot dark-card style: Container with purple left accent, TextDisplay body, Section+Thumbnail for artwork, Separator for dividers, and interactive buttons below.

## How to apply
- `v2.ok(text)` / `v2.err(text)` / `v2.info(text)` → Container (send with `await v2.send(ctx, ...)`)
- `v2.container(body, header=, footer=, thumbnail_url=, color=)` → full card
- `await v2.send(ctx, container)` handles slash vs prefix automatically
- Interactive views (buttons + container): subclass `discord.ui.LayoutView`, `add_item(container)` first, then `add_item(button)` — buttons render below the card
- Send LayoutView: `await ctx.reply(view=layout_view, mention_author=False)`

## CRITICAL — do NOT pass components_v2=True to send()
In discord.py 2.7.1, `LayoutView` sets the `components_v2` message flag **automatically**.
Passing `components_v2=True` as a kwarg to `send()`, `reply()`, or `followup.send()` raises:
`TypeError: Messageable.send() got an unexpected keyword argument 'components_v2'`
and breaks all responses. **Never add it explicitly anywhere.**

## File map
- `utils/v2.py` — helper builders and `send()` / `channel_send()` async helpers
- `events/player_events.py` — `NowPlayingView(LayoutView)` with `_build()` pattern
- `cogs/music.py` — `QueueLayoutView(LayoutView)` with pagination
- `cogs/favourite.py` — `LikedLayoutView(LayoutView)` with pagination
- `cogs/information.py` — `HelpView(LayoutView)` with category buttons
- `cogs/giveaway.py` — `GiveawayEnterView(LayoutView)` with live entry count update
- `cogs/playlist.py` — `PlaylistMenuView(LayoutView)` + `TrackListView(LayoutView)` with modals
