"""Server configuration commands."""
from __future__ import annotations

from typing import Optional

import discord
from discord.ext import commands

import config
import emojis as E
from database import db_get, db_set, db_delete
from database.models import get_prefs, set_prefs, set_toggle, get_toggle

COLOR = config.COLOR

SOURCES = {
    "youtube":   "ytsearch",
    "yt":        "ytsearch",
    "ytmusic":   "ytmsearch",
    "ytm":       "ytmsearch",
    "spotify":   "spsearch",
    "sp":        "spsearch",
    "soundcloud":"scsearch",
    "sc":        "scsearch",
    "deezer":    "dzsearch",
    "dz":        "dzsearch",
}


class ConfigCog(commands.Cog, name="Config"):

    def __init__(self, bot):
        self.bot = bot

    # ── setprefix ─────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="setprefix", description="Set the server prefix.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def setprefix(self, ctx: commands.Context, prefix: str):
        if len(prefix) > 5:
            return await ctx.reply(embed=self.bot.err("Prefix must be 5 characters or fewer."), mention_author=False)
        from database.models import set_guild_prefix
        await set_guild_prefix(ctx.guild.id, prefix)
        await ctx.reply(embed=self.bot.ok(f"Prefix set to `{prefix}`"), mention_author=False)

    # ── source ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="source", description="Set your preferred music source.")
    async def source(self, ctx: commands.Context, platform: str = ""):
        platform = platform.lower()
        if not platform:
            source_list = "\n".join(f"`{k}` → `{v}`" for k, v in SOURCES.items() if not k.endswith(("yt", "sp", "sc", "dz")))
            embed = discord.Embed(title="🎵 Music Sources", description=source_list, color=COLOR)
            prefs = await get_prefs(ctx.author.id)
            current = prefs["musicSource"] if prefs else config.NODE_SOURCE
            embed.set_footer(text=f"Your current source: {current}")
            return await ctx.reply(embed=embed, mention_author=False)

        resolved = SOURCES.get(platform)
        if not resolved:
            return await ctx.reply(embed=self.bot.err(f"Unknown source. Try: `{', '.join(set(SOURCES.values()))}`"), mention_author=False)

        await set_prefs(ctx.author.id, musicSource=resolved)
        await ctx.reply(embed=self.bot.ok(f"Music source set to `{resolved}`"), mention_author=False)

    # ── ignore ────────────────────────────────────────────────────────────────

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
            await ctx.reply(embed=self.bot.ok(f"Un-ignored {ch.mention}"), mention_author=False)
        else:
            await conn.execute(
                "INSERT INTO ignorechannel (guildId, channelId) VALUES (?, ?)",
                [str(ctx.guild.id), str(ch.id)]
            )
            await conn.commit()
            await ctx.reply(embed=self.bot.ok(f"Now ignoring {ch.mention}"), mention_author=False)

    # ── 247 ───────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="247", description="Toggle 24/7 mode (always stay in VC).")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def always_on(self, ctx: commands.Context):
        row = await db_get("autoreconnect", {"Guild": str(ctx.guild.id)})
        if row:
            await db_delete("autoreconnect", {"Guild": str(ctx.guild.id)})
            await ctx.reply(embed=self.bot.ok("🕐 24/7 mode **disabled**."), mention_author=False)
        else:
            from cogs.music import get_player
            player = get_player(ctx)
            if not player:
                return await ctx.reply(embed=self.bot.err("Start playing music first."), mention_author=False)
            await db_set("autoreconnect", {
                "Guild": str(ctx.guild.id),
                "TextId": str(ctx.channel.id),
                "VoiceId": str(player.channel.id),
            }, pk="Guild")
            await ctx.reply(embed=self.bot.ok("🕐 24/7 mode **enabled**. I'll stay in the VC."), mention_author=False)

    # ── djrole ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="djrole", description="Set or clear the DJ role.")
    @commands.has_permissions(manage_guild=True)
    @commands.guild_only()
    async def djrole(self, ctx: commands.Context, role: Optional[discord.Role] = None):
        from database import now_ts
        if role is None:
            await db_delete("djrole", {"guildId": str(ctx.guild.id)})
            await ctx.reply(embed=self.bot.ok("DJ role cleared."), mention_author=False)
        else:
            await db_set("djrole", {
                "guildId": str(ctx.guild.id),
                "roleId": str(role.id),
                "updatedAt": now_ts(),
            }, pk="guildId")
            await ctx.reply(embed=self.bot.ok(f"DJ role set to {role.mention}"), mention_author=False)

    # ── bioset ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="bioset", description="Set your profile bio.")
    async def bioset(self, ctx: commands.Context, *, bio: str):
        if len(bio) > 200:
            return await ctx.reply(embed=self.bot.err("Bio must be 200 characters or fewer."), mention_author=False)
        await set_prefs(ctx.author.id, bio=bio)
        await ctx.reply(embed=self.bot.ok(f"Bio updated: *{bio}*"), mention_author=False)

    # ── toggle ────────────────────────────────────────────────────────────────

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
            embed = discord.Embed(title="🔄 Server Toggles", description=lines, color=COLOR)
            embed.set_footer(text=f"Use {config.PREFIX}toggle <feature> to toggle.")
            return await ctx.reply(embed=embed, mention_author=False)

        feature = feature.lower()
        current = await get_toggle(ctx.guild.id)
        new_val = 0 if current.get(feature, 1) else 1
        await set_toggle(ctx.guild.id, **{feature: new_val})
        state = "enabled" if new_val else "disabled"
        await ctx.reply(embed=self.bot.ok(f"**{feature}** {state}."), mention_author=False)


async def setup(bot):
    await bot.add_cog(ConfigCog(bot))
