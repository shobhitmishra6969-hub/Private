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

COLOR = config.COLOR


class UtilityCog(commands.Cog, name="Utility"):

    def __init__(self, bot):
        self.bot = bot

    # ── AFK ───────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="afk", description="Set your AFK status.")
    async def afk(self, ctx: commands.Context, *, reason: str = "AFK"):
        await set_afk(ctx.author.id, ctx.guild.id if ctx.guild else 0, reason)
        embed = discord.Embed(
            description=f"💤 {ctx.author.mention} is now AFK: **{reason}**",
            color=COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    # ── avatar ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="avatar", description="View a user's avatar.")
    async def avatar(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        avatar = target.display_avatar.url
        embed = discord.Embed(title=f"🖼️ {target.display_name}'s Avatar", color=COLOR)
        embed.set_image(url=avatar)
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Open", url=avatar, style=discord.ButtonStyle.link))
        await ctx.reply(embed=embed, view=view, mention_author=False)

    # ── banner ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="banner", description="View a user's banner.")
    async def banner(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        fetched = await self.bot.fetch_user(target.id)
        if not fetched.banner:
            return await ctx.reply(embed=self.bot.err(f"**{target.display_name}** has no banner."), mention_author=False)
        embed = discord.Embed(title=f"🖼️ {target.display_name}'s Banner", color=COLOR)
        embed.set_image(url=fetched.banner.url)
        await ctx.reply(embed=embed, mention_author=False)

    # ── servericon ────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="servericon", description="Show the server icon.")
    @commands.guild_only()
    async def servericon(self, ctx: commands.Context):
        if not ctx.guild.icon:
            return await ctx.reply(embed=self.bot.err("This server has no icon."), mention_author=False)
        embed = discord.Embed(title=f"🖼️ {ctx.guild.name} Icon", color=COLOR)
        embed.set_image(url=ctx.guild.icon.url)
        await ctx.reply(embed=embed, mention_author=False)

    # ── serverbanner ──────────────────────────────────────────────────────────

    @commands.hybrid_command(name="serverbanner", description="Show the server banner.")
    @commands.guild_only()
    async def serverbanner(self, ctx: commands.Context):
        if not ctx.guild.banner:
            return await ctx.reply(embed=self.bot.err("This server has no banner."), mention_author=False)
        embed = discord.Embed(title=f"🖼️ {ctx.guild.name} Banner", color=COLOR)
        embed.set_image(url=ctx.guild.banner.url)
        await ctx.reply(embed=embed, mention_author=False)

    # ── membercount ───────────────────────────────────────────────────────────

    @commands.hybrid_command(name="membercount", description="Show the server member count.")
    @commands.guild_only()
    async def membercount(self, ctx: commands.Context):
        g = ctx.guild
        humans = sum(1 for m in g.members if not m.bot)
        bots = sum(1 for m in g.members if m.bot)
        embed = discord.Embed(title=f"👥 {g.name} — Members", color=COLOR)
        embed.add_field(name="Total", value=f"`{g.member_count:,}`", inline=True)
        embed.add_field(name="Humans", value=f"`{humans:,}`", inline=True)
        embed.add_field(name="Bots", value=f"`{bots:,}`", inline=True)
        if g.icon:
            embed.set_thumbnail(url=g.icon.url)
        await ctx.reply(embed=embed, mention_author=False)

    # ── dm ────────────────────────────────────────────────────────────────────

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
            await ctx.reply(embed=self.bot.ok(f"DM sent to **{user.display_name}**."), mention_author=False)
        except discord.Forbidden:
            await ctx.reply(embed=self.bot.err("Could not DM that user."), mention_author=False)

    # ── profile ───────────────────────────────────────────────────────────────

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

        embed = discord.Embed(color=COLOR)
        embed.set_author(name=f"{target.display_name}'s Profile", icon_url=target.display_avatar.url)
        embed.description = f"*{bio}*"
        embed.add_field(name="💎 Premium", value=f"{'✅ Yes' + expires if has_prem else '❌ No'}", inline=True)
        embed.add_field(name="🎵 Commands Run", value=f"`{cmds_run:,}`", inline=True)
        embed.add_field(name="🎧 Music Source", value=f"`{source}`", inline=True)
        embed.add_field(name="🏅 Badges", value=badge_str, inline=False)
        embed.set_thumbnail(url=target.display_avatar.url)
        await ctx.reply(embed=embed, mention_author=False)

    # ── calculator ────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="calculator", aliases=["calc"], description="Simple calculator.")
    async def calculator(self, ctx: commands.Context, *, expression: str):
        allowed = set("0123456789+-*/().% ")
        if not all(c in allowed for c in expression):
            return await ctx.reply(embed=self.bot.err("Invalid expression. Only basic math allowed."), mention_author=False)
        try:
            result = eval(expression, {"__builtins__": {}})
            embed = discord.Embed(color=COLOR)
            embed.add_field(name="Expression", value=f"`{expression}`", inline=False)
            embed.add_field(name="Result", value=f"`{result}`", inline=False)
            await ctx.reply(embed=embed, mention_author=False)
        except Exception:
            await ctx.reply(embed=self.bot.err("Could not evaluate that expression."), mention_author=False)


async def setup(bot):
    await bot.add_cog(UtilityCog(bot))
