"""Server configuration commands."""
from __future__ import annotations

from typing import Optional

import discord
from discord.ext import commands

import config
import emojis as E
from database import db_get, db_set, db_delete
from database.models import get_prefs, set_prefs, set_toggle, get_toggle
import utils.v2 as v2

COLOR = config.COLOR

SOURCES = {
    "youtube":    "ytsearch",
    "yt":         "ytsearch",
    "ytmusic":    "ytmsearch",
    "ytm":        "ytmsearch",
    "spotify":    "spsearch",
    "sp":         "spsearch",
    "soundcloud": "scsearch",
    "sc":         "scsearch",
    "deezer":     "dzsearch",
    "dz":         "dzsearch",
}

# Canonical source buttons shown in the panel (one per unique search prefix)
SOURCE_BUTTONS = [
    ("YouTube",       "ytsearch",  E.youtube,  discord.ButtonStyle.danger),
    ("YouTube Music", "ytmsearch", E.ytmusic,  discord.ButtonStyle.primary),
    ("Spotify",       "spsearch",  E.spotify,  discord.ButtonStyle.success),
    ("SoundCloud",    "scsearch",  "🔊",        discord.ButtonStyle.secondary),
    ("Deezer",        "dzsearch",  E.deezer,   discord.ButtonStyle.secondary),
]


# ── Source Panel View ─────────────────────────────────────────────────────────

class SourceView(discord.ui.LayoutView):
    """
    Interactive music-source picker.
    Current source is shown with a green ✅ label; others are gray.
    Clicking any source button sets it immediately and rebuilds in-place.
    All buttons are INSIDE the container — no floating rows.
    """

    def __init__(self, user: discord.Member | discord.User, current: str):
        super().__init__(timeout=180)
        self.user    = user
        self.current = current
        self._build()

    def _build(self):
        self.clear_items()

        # ── Description lines ──────────────────────────────────────────────
        lines = []
        for label, key, _, _ in SOURCE_BUTTONS:
            tick = "✅ " if key == self.current else "  "
            lines.append(f"{tick}`{key}` — {label}")

        card = discord.ui.Container(accent_color=COLOR)
        card.add_item(discord.ui.TextDisplay(f"## {E.Music} Music Sources"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("\n".join(lines)))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            f"-# Your current source: **{self.current}** · Click a button below to switch."
        ))
        card.add_item(discord.ui.Separator())

        # ── Source buttons (row 1: first 3, row 2: last 2) ─────────────────
        row1_btns = []
        row2_btns = []
        for i, (label, key, emoji, style) in enumerate(SOURCE_BUTTONS):
            is_active = (key == self.current)
            btn = discord.ui.Button(
                label=f"{'✅ ' if is_active else ''}{label}",
                emoji=emoji,
                style=discord.ButtonStyle.success if is_active else style,
                custom_id=f"src_{key}",
                disabled=is_active,
            )
            # Bind a closure for each key
            btn.callback = self._make_cb(key)
            if i < 3:
                row1_btns.append(btn)
            else:
                row2_btns.append(btn)

        card.add_item(discord.ui.ActionRow(*row1_btns))
        if row2_btns:
            card.add_item(discord.ui.ActionRow(*row2_btns))

        self.add_item(card)

    def _make_cb(self, key: str):
        async def _cb(interaction: discord.Interaction):
            if interaction.user.id != self.user.id:
                return await interaction.response.send_message(
                    "This panel belongs to someone else.", ephemeral=True
                )
            await set_prefs(interaction.user.id, musicSource=key)
            self.current = key
            self._build()
            await interaction.response.edit_message(view=self)
        return _cb


class ConfigCog(commands.Cog, name="Config"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="setprefix", description="Set the server prefix.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def setprefix(self, ctx: commands.Context, prefix: str):
        if len(prefix) > 5:
            return await v2.send(ctx, v2.err("Prefix must be 5 characters or fewer."))
        from database.models import set_guild_prefix
        await set_guild_prefix(ctx.guild.id, prefix)
        await v2.send(ctx, v2.ok(f"Prefix set to `{prefix}`"))

    @commands.hybrid_command(name="source", description="Set your preferred music search source.")
    async def source(self, ctx: commands.Context, platform: str = ""):
        platform = platform.lower().strip()

        # If a platform was given directly, set it and confirm
        if platform:
            resolved = SOURCES.get(platform)
            if not resolved:
                return await v2.send(ctx, v2.err(
                    f"Unknown source `{platform}`. "
                    f"Try: `{', '.join(set(SOURCES.values()))}`"
                ))
            await set_prefs(ctx.author.id, musicSource=resolved)
            return await v2.send(ctx, v2.ok(f"Music source set to `{resolved}`"))

        # No argument — show the interactive panel
        prefs   = await get_prefs(ctx.author.id)
        current = (prefs["musicSource"] if prefs else None) or config.NODE_SOURCE

        view = SourceView(ctx.author, current)
        if ctx.interaction:
            await ctx.interaction.response.send_message(view=view)
        else:
            await ctx.reply(view=view, mention_author=False)

    @commands.hybrid_command(name="ignore", description="Ignore or unignore a channel for bot commands.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def ignore(self, ctx: commands.Context, channel: Optional[discord.TextChannel] = None):
        ch = channel or ctx.channel
        db = await db_get("ignorechannel", {"guildId": str(ctx.guild.id), "channelId": str(ch.id)})
        from database import get_db
        conn = await get_db()
        if db:
            await conn.execute(
                "DELETE FROM ignorechannel WHERE guildId=? AND channelId=?",
                [str(ctx.guild.id), str(ch.id)]
            )
            await conn.commit()
            await v2.send(ctx, v2.ok(f"Un-ignored {ch.mention}"))
        else:
            await conn.execute(
                "INSERT INTO ignorechannel (guildId, channelId) VALUES (?, ?)",
                [str(ctx.guild.id), str(ch.id)]
            )
            await conn.commit()
            await v2.send(ctx, v2.ok(f"Now ignoring {ch.mention}"))

    @commands.hybrid_command(name="247", description="Toggle 24/7 mode (always stay in VC).")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def always_on(self, ctx: commands.Context):
        row = await db_get("autoreconnect", {"Guild": str(ctx.guild.id)})
        if row:
            await db_delete("autoreconnect", {"Guild": str(ctx.guild.id)})
            await v2.send(ctx, v2.ok("🕐 24/7 mode **disabled**."))
        else:
            from cogs.music import get_player
            player = get_player(ctx)
            if not player:
                return await v2.send(ctx, v2.err("Start playing music first."))
            await db_set("autoreconnect", {
                "Guild": str(ctx.guild.id),
                "TextId": str(ctx.channel.id),
                "VoiceId": str(player.channel.id),
            }, pk="Guild")
            await v2.send(ctx, v2.ok("🕐 24/7 mode **enabled**. I'll stay in the VC."))

    @commands.hybrid_command(name="djrole", description="Set or clear the DJ role.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def djrole(self, ctx: commands.Context, role: Optional[discord.Role] = None):
        from database import now_ts
        if role is None:
            await db_delete("djrole", {"guildId": str(ctx.guild.id)})
            await v2.send(ctx, v2.ok("DJ role cleared."))
        else:
            await db_set("djrole", {
                "guildId": str(ctx.guild.id),
                "roleId": str(role.id),
                "updatedAt": now_ts(),
            }, pk="guildId")
            await v2.send(ctx, v2.ok(f"DJ role set to {role.mention}"))

    @commands.hybrid_command(name="bioset", description="Set your profile bio.")
    async def bioset(self, ctx: commands.Context, *, bio: str):
        if len(bio) > 200:
            return await v2.send(ctx, v2.err("Bio must be 200 characters or fewer."))
        await set_prefs(ctx.author.id, bio=bio)
        await v2.send(ctx, v2.ok(f"Bio updated: *{bio}*"))

    @commands.hybrid_command(name="toggle", description="Toggle bot features on/off.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def toggle(self, ctx: commands.Context, feature: str = ""):
        features = ["lyrics", "autoplay", "announce"]
        if not feature or feature.lower() not in features:
            current = await get_toggle(ctx.guild.id)
            lines = "\n".join(
                f"{'✅' if current.get(f, 1) else '❌'} **{f}**"
                for f in features
            )
            return await v2.send(ctx, v2.container(
                lines,
                header="🔄 Server Toggles",
                footer=f"Use {config.PREFIX}toggle <feature> to toggle.",
            ))

        feature = feature.lower()
        current = await get_toggle(ctx.guild.id)
        new_val = 0 if current.get(feature, 1) else 1
        await set_toggle(ctx.guild.id, **{feature: new_val})
        state = "enabled" if new_val else "disabled"
        await v2.send(ctx, v2.ok(f"**{feature}** {state}."))


async def setup(bot):
    await bot.add_cog(ConfigCog(bot))
