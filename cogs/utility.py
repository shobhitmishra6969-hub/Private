"""Utility commands: afk, avatar, banner, membercount, dm, profile, etc."""
from __future__ import annotations

import time
from typing import Optional

import discord
from discord.ext import commands

import config
import emojis as E
from database.models import (
    get_afk, set_afk, clear_afk, get_user_stats, get_badges,
    get_prefs, get_premium
)
from utils.formatters import short_number, duration_str
import utils.v2 as v2

COLOR = config.COLOR


class UtilityCog(commands.Cog, name="Utility"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="afk", description="Set your AFK status.")
    async def afk(self, ctx: commands.Context, *, reason: str = "AFK"):
        await set_afk(ctx.author.id, ctx.guild.id if ctx.guild else 0, reason)
        await v2.send(ctx, v2.container(
            f"💤 {ctx.author.mention} is now AFK: **{reason}**"
        ))

    @commands.hybrid_command(name="avatar", description="View a user's avatar.")
    async def avatar(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        avatar_url = target.display_avatar.url
        layout = discord.ui.LayoutView(timeout=None)
        layout.add_item(v2.container(
            f"[Open full size]({avatar_url})",
            header=f"🖼️ {target.display_name}'s Avatar",
            thumbnail_url=avatar_url,
        ))
        layout.add_item(discord.ui.Button(
            label="Open",
            url=avatar_url,
            style=discord.ButtonStyle.link,
        ))
        await ctx.reply(view=layout, mention_author=False)

    @commands.hybrid_command(name="banner", description="View a user's banner.")
    async def banner(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        fetched = await self.bot.fetch_user(target.id)
        if not fetched.banner:
            return await v2.send(ctx, v2.err(f"**{target.display_name}** has no banner."))
        banner_url = fetched.banner.url
        layout = discord.ui.LayoutView(timeout=None)
        layout.add_item(v2.container(
            f"[Open full size]({banner_url})",
            header=f"🖼️ {target.display_name}'s Banner",
            thumbnail_url=banner_url,
        ))
        layout.add_item(discord.ui.Button(label="Open", url=banner_url, style=discord.ButtonStyle.link))
        await ctx.reply(view=layout, mention_author=False)

    @commands.hybrid_command(name="servericon", description="Show the server icon.")
    @commands.guild_only()
    async def servericon(self, ctx: commands.Context):
        if not ctx.guild.icon:
            return await v2.send(ctx, v2.err("This server has no icon."))
        icon_url = ctx.guild.icon.url
        layout = discord.ui.LayoutView(timeout=None)
        layout.add_item(v2.container(
            f"[Open full size]({icon_url})",
            header=f"🖼️ {ctx.guild.name} Icon",
            thumbnail_url=icon_url,
        ))
        layout.add_item(discord.ui.Button(label="Open", url=icon_url, style=discord.ButtonStyle.link))
        await ctx.reply(view=layout, mention_author=False)

    @commands.hybrid_command(name="serverbanner", description="Show the server banner.")
    @commands.guild_only()
    async def serverbanner(self, ctx: commands.Context):
        if not ctx.guild.banner:
            return await v2.send(ctx, v2.err("This server has no banner."))
        banner_url = ctx.guild.banner.url
        layout = discord.ui.LayoutView(timeout=None)
        layout.add_item(v2.container(
            f"[Open full size]({banner_url})",
            header=f"🖼️ {ctx.guild.name} Banner",
            thumbnail_url=banner_url,
        ))
        layout.add_item(discord.ui.Button(label="Open", url=banner_url, style=discord.ButtonStyle.link))
        await ctx.reply(view=layout, mention_author=False)

    @commands.hybrid_command(name="membercount", description="Show the server member count.")
    @commands.guild_only()
    async def membercount(self, ctx: commands.Context):
        g = ctx.guild
        humans = sum(1 for m in g.members if not m.bot)
        bots = sum(1 for m in g.members if m.bot)
        body = (
            f"**Total:** `{g.member_count:,}`\n"
            f"**Humans:** `{humans:,}`\n"
            f"**Bots:** `{bots:,}`"
        )
        thumb = g.icon.url if g.icon else None
        await v2.send(ctx, v2.container(body, header=f"👥 {g.name} — Members", thumbnail_url=thumb))

    @commands.hybrid_command(name="dm", description="DM a user a message.")
    @commands.has_permissions(manage_messages=True)
    async def dm(self, ctx: commands.Context, user: discord.User, *, message: str):
        try:
            embed = discord.Embed(
                title=f"📨 Message from {ctx.guild.name if ctx.guild else 'staff'}",
                description=message,
                color=COLOR
            )
            await user.send(embed=embed)
            await v2.send(ctx, v2.ok(f"DM sent to **{user.display_name}**."))
        except discord.Forbidden:
            await v2.send(ctx, v2.err("Could not DM that user."))

    @commands.hybrid_command(name="profile", description="View a user's ToneVibes profile.")
    async def profile(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        stats = await get_user_stats(target.id)
        badges = await get_badges(target.id)
        prefs = await get_prefs(target.id)
        premium_row = await get_premium(target.id)

        cmds_run = stats["commandsRun"] if stats else 0
        bio = prefs["bio"] if prefs and prefs["bio"] else "No bio set."
        source = prefs["musicSource"] if prefs and prefs["musicSource"] else "ytmsearch"

        has_prem = False
        expires = ""
        if premium_row and premium_row["premium"]:
            exp = premium_row["expiresAt"]
            if not exp or exp > int(time.time()):
                has_prem = True
                if exp:
                    expires = f" (expires <t:{exp}:R>)"

        badge_str = " ".join(badges) if badges else "No badges"
        body = (
            f"*{bio}*\n\n"
            f"**💎 Premium:** {'✅ Yes' + expires if has_prem else '❌ No'}\n"
            f"**🎵 Commands Run:** `{cmds_run:,}`\n"
            f"**🎧 Music Source:** `{source}`\n"
            f"**🏅 Badges:** {badge_str}"
        )
        thumb = target.display_avatar.url
        await v2.send(ctx, v2.container(body, header=f"👤 {target.display_name}'s Profile", thumbnail_url=thumb))

    @commands.hybrid_command(name="calculator", aliases=["calc"], description="Simple calculator.")
    async def calculator(self, ctx: commands.Context, *, expression: str):
        allowed = set("0123456789+-*/().% ")
        if not all(c in allowed for c in expression):
            return await v2.send(ctx, v2.err("Invalid expression. Only basic math allowed."))
        try:
            result = eval(expression, {"__builtins__": {}})
            body = f"**Expression:** `{expression}`\n**Result:** `{result}`"
            await v2.send(ctx, v2.container(body, header="🧮 Calculator"))
        except Exception:
            await v2.send(ctx, v2.err("Could not evaluate that expression."))


async def setup(bot):
    await bot.add_cog(UtilityCog(bot))
