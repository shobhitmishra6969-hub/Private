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

## Critical gotcha
- `discord.MessageFlags(components_v2=True)` ← correct flag name in discord.py 2.7.1
- `discord.MessageFlags(is_components_v2=True)` ← WRONG, raises TypeError
- When using v2 flag: NO embeds or content text in the same message

## File map
- `utils/v2.py` — helper builders and `send()` async helper
- `events/player_events.py` — `NowPlayingView(LayoutView)` with `_build()` pattern
- `cogs/music.py` — `QueueLayoutView(LayoutView)` with pagination
- `cogs/favourite.py` — `LikedLayoutView(LayoutView)` with pagination
- `cogs/information.py` — `HelpView(LayoutView)` with category buttons; `info_embed()`/`info_view()` kept as legacy Embed for the bot mention response
- `cogs/giveaway.py` — `GiveawayEnterView(LayoutView)` with live entry count update
