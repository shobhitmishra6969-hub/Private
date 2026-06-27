"""Owner-only commands."""
from __future__ import annotations

import sys
import os
import traceback
import time
from typing import Optional

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from database import now_ts
from database.models import (
    set_blacklist, remove_blacklist, get_blacklist,
    set_premium, get_premium
)
from utils.checks import owner_only

COLOR = config.COLOR


class OwnerCog(commands.Cog, name="Owner"):

    def __init__(self, bot):
        self.bot = bot

    def cog_check(self, ctx: commands.Context):
        if ctx.author.id not in config.OWNER_IDS:
            raise commands.NotOwner("Owner-only command.")
        return True

    # ── reload ────────────────────────────────────────────────────────────────

    @commands.command(name="reload", hidden=True)
    async def reload(self, ctx: commands.Context, cog: str = "all"):
        cogs_to_reload = (
            [f"cogs.{cog}"] if cog != "all"
            else [f"cogs.{c}" for c in [
                "music", "filters", "config_cog", "giveaway",
                "information", "utility", "owner", "favourite",
                "spotify", "playlist", "lastfm"
            ]]
        )
        success, failed = [], []
        for c in cogs_to_reload:
            try:
                await self.bot.reload_extension(c)
                success.append(c)
            except Exception as e:
                failed.append(f"{c}: {e}")

        lines = []
        if success:
            lines.append("✅ Reloaded: " + ", ".join(f"`{c}`" for c in success))
        if failed:
            lines.append("❌ Failed:\n" + "\n".join(failed))
        await ctx.reply(embed=discord.Embed(description="\n".join(lines), color=COLOR), mention_author=False)

    # ── restart ───────────────────────────────────────────────────────────────

    @commands.command(name="restart", hidden=True)
    async def restart(self, ctx: commands.Context):
        await ctx.reply(embed=self.bot.ok("🔄 Restarting..."), mention_author=False)
        os.execv(sys.executable, [sys.executable] + sys.argv)

    # ── blacklist ─────────────────────────────────────────────────────────────

    @commands.hybrid_group(name="blacklist", hidden=True)
    async def blacklist_cmd(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed("Use `blacklist add` or `blacklist remove`."), mention_author=False)

    @blacklist_cmd.command(name="add")
    async def bl_add(self, ctx: commands.Context, user: discord.User, *, reason: str = ""):
        await set_blacklist(user.id, reason)
        await ctx.reply(embed=self.bot.ok(f"Blacklisted **{user}**" + (f": {reason}" if reason else ".")), mention_author=False)

    @blacklist_cmd.command(name="remove")
    async def bl_remove(self, ctx: commands.Context, user: discord.User):
        row = await get_blacklist(user.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("User is not blacklisted."), mention_author=False)
        await remove_blacklist(user.id)
        await ctx.reply(embed=self.bot.ok(f"Removed **{user}** from blacklist."), mention_author=False)

    @blacklist_cmd.command(name="check")
    async def bl_check(self, ctx: commands.Context, user: discord.User):
        row = await get_blacklist(user.id)
        if not row:
            return await ctx.reply(embed=self.bot.ok(f"**{user}** is not blacklisted."), mention_author=False)
        embed = discord.Embed(title="🔒 Blacklisted User", color=0xFF5555)
        embed.add_field(name="User", value=str(user), inline=True)
        embed.add_field(name="Reason", value=row["reason"] or "No reason", inline=True)
        await ctx.reply(embed=embed, mention_author=False)

    # ── premiumuser ───────────────────────────────────────────────────────────

    @commands.hybrid_group(name="premiumuser", aliases=["pu"], hidden=True)
    async def premiumuser(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed("Use `premiumuser add` or `premiumuser remove`."), mention_author=False)

    @premiumuser.command(name="add")
    async def pu_add(self, ctx: commands.Context, user: discord.User, days: int = 30):
        expires_at = now_ts() + days * 86400
        await set_premium(user.id, {
            "userId": str(user.id),
            "premium": 1,
            "addedBy": str(ctx.author.id),
            "addedAt": now_ts(),
            "expiresAt": expires_at,
        })
        await ctx.reply(embed=self.bot.ok(f"⭐ Added premium to **{user}** for **{days} days**."), mention_author=False)

    @premiumuser.command(name="remove")
    async def pu_remove(self, ctx: commands.Context, user: discord.User):
        await set_premium(user.id, {"userId": str(user.id), "premium": 0})
        await ctx.reply(embed=self.bot.ok(f"Removed premium from **{user}**."), mention_author=False)

    @premiumuser.command(name="check")
    async def pu_check(self, ctx: commands.Context, user: discord.User):
        row = await get_premium(user.id)
        if not row or not row["premium"]:
            return await ctx.reply(embed=self.bot.err(f"**{user}** does not have premium."), mention_author=False)
        exp = row["expiresAt"]
        exp_str = f"<t:{exp}:R>" if exp else "Never"
        embed = discord.Embed(title="⭐ Premium User", color=0xFFD700)
        embed.add_field(name="User", value=str(user), inline=True)
        embed.add_field(name="Expires", value=exp_str, inline=True)
        await ctx.reply(embed=embed, mention_author=False)

    # ── node ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="node", description="Show Lavalink node info.", hidden=True)
    async def node(self, ctx: commands.Context):
        nodes = list(ravelink.Pool.nodes.values())
        if not nodes:
            return await ctx.reply(embed=self.bot.err("No Lavalink nodes connected."), mention_author=False)

        embed = discord.Embed(title="🔗 Lavalink Nodes", color=COLOR)
        for n in nodes:
            status = "🟢 Connected" if n.status == ravelink.NodeStatus.CONNECTED else "🔴 Disconnected"
            stats = n.stats
            players_info = f"{stats.playing}/{stats.players}" if stats else "N/A"
            embed.add_field(
                name=n.identifier,
                value=f"Status: {status}\nPlayers: {players_info}\nURI: `{n.uri}`",
                inline=False
            )
        await ctx.reply(embed=embed, mention_author=False)

    # ── serverlist ────────────────────────────────────────────────────────────

    @commands.command(name="serverlist", hidden=True)
    async def serverlist(self, ctx: commands.Context, page: int = 1):
        guilds = sorted(self.bot.guilds, key=lambda g: g.member_count or 0, reverse=True)
        per_page = 10
        pages = [guilds[i: i + per_page] for i in range(0, len(guilds), per_page)]
        page = max(1, min(page, len(pages)))
        slice_ = pages[page - 1]

        desc = "\n".join(
            f"`{i + (page - 1) * per_page + 1}.` **{g.name}** — `{g.member_count:,}` members | `{g.id}`"
            for i, g in enumerate(slice_)
        )
        embed = discord.Embed(title=f"📋 Server List ({len(guilds)} total)", description=desc, color=COLOR)
        embed.set_footer(text=f"Page {page}/{len(pages)}")
        await ctx.reply(embed=embed, mention_author=False)

    # ── eval ─────────────────────────────────────────────────────────────────

    @commands.command(name="eval", hidden=True)
    async def eval_cmd(self, ctx: commands.Context, *, code: str):
        code = code.strip("`").lstrip("python").lstrip("py").strip()
        env = {"bot": self.bot, "ctx": ctx, "discord": discord, "ravelink": ravelink}
        try:
            exec(f"async def _eval():\n" + "\n".join(f"    {line}" for line in code.splitlines()), env)
            result = await env["_eval"]()
            await ctx.reply(embed=discord.Embed(description=f"```py\n{result}\n```", color=COLOR), mention_author=False)
        except Exception:
            await ctx.reply(embed=discord.Embed(description=f"```py\n{traceback.format_exc()}\n```", color=0xFF5555), mention_author=False)

    # ── sync ──────────────────────────────────────────────────────────────────

    @commands.command(name="sync", hidden=True)
    async def sync(self, ctx: commands.Context):
        synced = await self.bot.tree.sync()
        await ctx.reply(embed=self.bot.ok(f"Synced **{len(synced)}** slash commands."), mention_author=False)


async def setup(bot):
    await bot.add_cog(OwnerCog(bot))
