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
from database import now_ts
from database.models import (
    set_blacklist, remove_blacklist, get_blacklist,
    set_premium, get_premium
)
import utils.v2 as v2

COLOR = config.COLOR


class OwnerCog(commands.Cog, name="Owner"):

    def __init__(self, bot):
        self.bot = bot

    def cog_check(self, ctx: commands.Context):
        if ctx.author.id not in config.OWNER_IDS:
            raise commands.NotOwner("Owner-only command.")
        return True

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
        await v2.send(ctx, v2.container("\n".join(lines)))

    @commands.command(name="restart", hidden=True)
    async def restart(self, ctx: commands.Context):
        await v2.send(ctx, v2.ok("🔄 Restarting..."))
        os.execv(sys.executable, [sys.executable] + sys.argv)

    @commands.hybrid_group(name="blacklist", hidden=True)
    async def blacklist_cmd(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info("Use `blacklist add` or `blacklist remove`."))

    @blacklist_cmd.command(name="add")
    async def bl_add(self, ctx: commands.Context, user: discord.User, *, reason: str = ""):
        await set_blacklist(user.id, reason)
        await v2.send(ctx, v2.ok(f"Blacklisted **{user}**" + (f": {reason}" if reason else ".")))

    @blacklist_cmd.command(name="remove")
    async def bl_remove(self, ctx: commands.Context, user: discord.User):
        row = await get_blacklist(user.id)
        if not row:
            return await v2.send(ctx, v2.err("User is not blacklisted."))
        await remove_blacklist(user.id)
        await v2.send(ctx, v2.ok(f"Removed **{user}** from blacklist."))

    @blacklist_cmd.command(name="check")
    async def bl_check(self, ctx: commands.Context, user: discord.User):
        row = await get_blacklist(user.id)
        if not row:
            return await v2.send(ctx, v2.ok(f"**{user}** is not blacklisted."))
        body = f"**User:** {user}\n**Reason:** {row['reason'] or 'No reason'}"
        await v2.send(ctx, v2.container(body, header="🔒 Blacklisted User", color=0xFF5555))

    @commands.hybrid_group(name="premiumuser", aliases=["pu"], hidden=True)
    async def premiumuser(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info("Use `premiumuser add` or `premiumuser remove`."))

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
        await v2.send(ctx, v2.ok(f"⭐ Added premium to **{user}** for **{days} days**."))

    @premiumuser.command(name="remove")
    async def pu_remove(self, ctx: commands.Context, user: discord.User):
        await set_premium(user.id, {"userId": str(user.id), "premium": 0})
        await v2.send(ctx, v2.ok(f"Removed premium from **{user}**."))

    @premiumuser.command(name="check")
    async def pu_check(self, ctx: commands.Context, user: discord.User):
        row = await get_premium(user.id)
        if not row or not row["premium"]:
            return await v2.send(ctx, v2.err(f"**{user}** does not have premium."))
        exp = row["expiresAt"]
        exp_str = f"<t:{exp}:R>" if exp else "Never"
        body = f"**User:** {user}\n**Expires:** {exp_str}"
        await v2.send(ctx, v2.container(body, header="⭐ Premium User", color=0xFFD700))

    @commands.hybrid_command(name="node", description="Show Lavalink node info.", hidden=True)
    async def node(self, ctx: commands.Context):
        nodes = list(ravelink.Pool.nodes.values())
        if not nodes:
            return await v2.send(ctx, v2.err("No Lavalink nodes connected."))
        lines = []
        for n in nodes:
            status = "🟢 Connected" if n.status == ravelink.NodeStatus.CONNECTED else "🔴 Disconnected"
            stats = n.stats
            players_info = f"{stats.playing}/{stats.players}" if stats else "N/A"
            lines.append(f"**{n.identifier}**\n{status} • Players: {players_info} • `{n.uri}`")
        await v2.send(ctx, v2.container("\n\n".join(lines), header="🔗 Lavalink Nodes"))

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
        await v2.send(ctx, v2.container(
            desc,
            header=f"📋 Server List ({len(guilds)} total)",
            footer=f"Page {page}/{len(pages)}",
        ))

    @commands.command(name="eval", hidden=True)
    async def eval_cmd(self, ctx: commands.Context, *, code: str):
        code = code.strip("`").lstrip("python").lstrip("py").strip()
        env = {"bot": self.bot, "ctx": ctx, "discord": discord, "ravelink": ravelink}
        try:
            exec(f"async def _eval():\n" + "\n".join(f"    {line}" for line in code.splitlines()), env)
            result = await env["_eval"]()
            await v2.send(ctx, v2.container(f"```py\n{result}\n```"))
        except Exception:
            await v2.send(ctx, v2.container(f"```py\n{traceback.format_exc()}\n```", color=0xFF5555))

    @commands.command(name="sync", hidden=True)
    async def sync(self, ctx: commands.Context):
        synced = await self.bot.tree.sync()
        await v2.send(ctx, v2.ok(f"Synced **{len(synced)}** slash commands."))


async def setup(bot):
    await bot.add_cog(OwnerCog(bot))
