---
name: CV2 Aesthetic System
description: Dark sleek purple style applied across all 107 bot commands — conventions and exceptions
---

## Rule
All bot command responses use ComponentsV2 (`MessageFlags.IsComponentsV2`) with `ContainerBuilder().setAccentColor(0x7B2FBE)`.

**Why:** Owner requested "dark sleek — black/purple containers, clean icons, bold headings" aesthetic across all commands.

## Pattern
```js
new ContainerBuilder()
  .setAccentColor(0x7B2FBE)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('### 🎵 Title'))
  .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('body\n-# subtext'))
```

## Text conventions
- `### {emoji} Title` for section headers
- `-# subtext` for secondary info / footers
- `**Label** — \`value\`` for key-value pairs

## Legitimate EmbedBuilder exceptions (do NOT convert)
- `Giveaway/giveaway.js` — giveaway message embed users click to enter
- `Music/nowplaying.js` — card-style image embed for now-playing display  
- `Utility/dm.js` — the embed sent inside the DM to the recipient
- `Utility/embed.js` — interactive embed builder tool (builds embeds by design)
- `Utility/profile.js` — hybrid: some embed usage alongside CV2 containers

## How to apply
Any new command should use CV2 + accent color. Use the local `reply(message, content)` helper pattern (ContainerBuilder with text) for error/info messages.
