"""Information commands: help, ping, stats, invite, support, premium, about."""
from __future__ import annotations

import platform
import time
import os
import sys

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from utils.formatters import short_number, duration_str

COLOR = config.COLOR

COMMAND_CATEGORIES = {
    "Music":        ["play", "skip", "queue", "nowplaying", "pause", "resume", "stop", "seek", "volume", "loop", "shuffle", "search", "history", "grab", "move", "remove", "clear", "replay", "previous", "forward", "rewind", "skipto", "forceskip", "join", "leave", "autoplay", "speed", "sleep", "similar", "leavecleanup", "forcefix"],
    "Filters":      ["filter", "equalizer", "customfilter"],
    "Favourite":    ["like", "unlike", "likeall", "showliked", "playliked"],
    "Playlist":     ["playlist"],
    "Config":       ["setprefix", "source", "ignore", "247", "djrole", "toggle", "bioset"],
    "Giveaway":     ["giveaway", "giveawayconfig"],
    "Information":  ["help", "ping", "stats", "invite", "support", "premium", "about"],
    "Utility":      ["afk", "avatar", "banner", "servericon", "serverbanner", "membercount", "dm", "profile"],
    "Spotify":      ["spotify"],
    "Last.fm":      ["lastfm"],
}

CATEGORY_EMOJIS = {
    "Music":       str(E.Music),
    "Filters":     str(E.Filters),
    "Favourite":   str(E.Favourite),
    "Playlist":    str(E.Playlist),
    "Config":      str(E.Config),
    "Giveaway":    str(E.Giveaway),
    "Information": str(E.Information),
    "Utility":     str(E.Utility),
    "Spotify":     str(E.Spotify),
    "Last.fm":     str(E.Lastfm),
}


class HelpView(discord.ui.View):
    def __init__(self, bot, author_id: int):
        super().__init__(timeout=120)
        self.bot = bot
        self.author_id = author_id
        self.page = "home"

        select = discord.ui.Select(
            placeholder="Browse a category...",
            options=[
                discord.SelectOption(label=cat, emoji=CATEGORY_EMOJIS.get(cat), value=cat)
                for cat in COMMAND_CATEGORIES
            ]
        )
        select.callback = self.on_select
        self.add_item(select)

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author_id:
            await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
            return False
        return True

    def home_embed(self) -> discord.Embed:
        embed = discord.Embed(
            title="🎵 ToneVibes — Music Bot",
            description=(
                f"**Prefix:** `{config.PREFIX}` · **Slash commands supported**\n\n"
                + "\n".join(
                    f"{CATEGORY_EMOJIS.get(cat, '•')} **{cat}** — `{len(cmds)}` commands"
                    for cat, cmds in COMMAND_CATEGORIES.items()
                )
                + f"\n\n[Support]({config.SUPPORT_URL}) | [Invite]({config.INVITE_URL})"
            ),
            color=COLOR
        )
        embed.set_footer(text="Select a category below to see commands.")
        return embed

    def category_embed(self, cat: str) -> discord.Embed:
        cmds = COMMAND_CATEGORIES.get(cat, [])
        emoji = CATEGORY_EMOJIS.get(cat, "")
        embed = discord.Embed(
            title=f"{emoji} {cat} Commands",
            description="\n".join(f"`{config.PREFIX}{c}`" for c in cmds),
            color=COLOR
        )
        embed.set_footer(text=f"Use {config.PREFIX}<command> or /<command> · {len(cmds)} commands")
        return embed

    async def on_select(self, interaction: discord.Interaction):
        cat = interaction.data["values"][0]
        await interaction.response.edit_message(embed=self.category_embed(cat), view=self)


class InformationCog(commands.Cog, name="Information"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="help", description="Show the help menu.")
    async def help(self, ctx: commands.Context, command: str = ""):
        if command:
            cmd = self.bot.get_command(command)
            if not cmd:
                return await ctx.reply(embed=self.bot.err(f"Command `{command}` not found."), mention_author=False)
            embed = discord.Embed(
                title=f"❓ {config.PREFIX}{cmd.name}",
                description=cmd.help or cmd.description or "No description.",
                color=COLOR
            )
            if hasattr(cmd, "aliases") and cmd.aliases:
                embed.add_field(name="Aliases", value=", ".join(f"`{a}`" for a in cmd.aliases))
            return await ctx.reply(embed=embed, mention_author=False)

        view = HelpView(self.bot, ctx.author.id)
        await ctx.reply(embed=view.home_embed(), view=view, mention_author=False)

    @commands.hybrid_command(name="ping", description="Check bot latency.")
    async def ping(self, ctx: commands.Context):
        start = time.perf_counter()
        msg = await ctx.reply(embed=discord.Embed(description="🏓 Pinging...", color=COLOR), mention_author=False)
        rest_latency = (time.perf_counter() - start) * 1000
        ws_latency = self.bot.latency * 1000

        nodes = list(ravelink.Pool.nodes.values())
        node_lines = []
        for node in nodes:
            status = "🟢" if node.status == ravelink.NodeStatus.CONNECTED else "🔴"
            node_lines.append(f"{status} **{node.identifier}**")

        embed = discord.Embed(title="🏓 Pong!", color=COLOR)
        embed.add_field(name="WebSocket", value=f"`{ws_latency:.1f}ms`", inline=True)
        embed.add_field(name="REST", value=f"`{rest_latency:.1f}ms`", inline=True)
        if node_lines:
            embed.add_field(name="Lavalink Nodes", value="\n".join(node_lines), inline=False)

        await msg.edit(embed=embed)

    @commands.hybrid_command(name="stats", description="Show bot statistics.")
    async def stats(self, ctx: commands.Context):
        import psutil
        guilds = len(self.bot.guilds)
        users = sum(g.member_count or 0 for g in self.bot.guilds)
        players = len(ravelink.Pool.players)

        embed = discord.Embed(title="📊 Bot Statistics", color=COLOR)
        embed.add_field(name="Servers", value=f"`{guilds:,}`", inline=True)
        embed.add_field(name="Users", value=f"`{users:,}`", inline=True)
        embed.add_field(name="Active Players", value=f"`{players}`", inline=True)

        try:
            proc = psutil.Process()
            mem_mb = proc.memory_info().rss / 1024 / 1024
            embed.add_field(name="Memory", value=f"`{mem_mb:.1f} MB`", inline=True)
        except Exception:
            pass

        embed.add_field(name="Python", value=f"`{platform.python_version()}`", inline=True)
        embed.add_field(name="discord.py", value=f"`{discord.__version__}`", inline=True)

        nodes = list(ravelink.Pool.nodes.values())
        node_status = " • ".join(
            f"{'🟢' if n.status == ravelink.NodeStatus.CONNECTED else '🔴'} {n.identifier}"
            for n in nodes
        )
        if node_status:
            embed.add_field(name="Lavalink Nodes", value=node_status, inline=False)

        if self.bot.user and self.bot.user.avatar:
            embed.set_thumbnail(url=self.bot.user.avatar.url)
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_command(name="invite", description="Get the bot invite link.")
    async def invite(self, ctx: commands.Context):
        bot_id = self.bot.user.id if self.bot.user else 0
        default_invite = f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        link = config.INVITE_URL or default_invite
        embed = discord.Embed(
            title="📨 Invite ToneVibes",
            description=f"[Click here to invite the bot!]({link})",
            color=COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_command(name="support", description="Get the support server link.")
    async def support(self, ctx: commands.Context):
        embed = discord.Embed(
            title="💬 Support Server",
            description=f"[Join our support server!]({config.SUPPORT_URL})",
            color=COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_command(name="about", description="About ToneVibes.")
    async def about(self, ctx: commands.Context):
        embed = discord.Embed(
            title="🎵 About ToneVibes",
            description=(
                "ToneVibes is a feature-rich Discord music bot built with **discord.py** + **ravelink**.\n\n"
                "Supports YouTube, Spotify, SoundCloud, Deezer, and more through Lavalink.\n\n"
                "**Features:** Giveaways · Premium · Last.fm · Playlists · Liked Songs · AFK · Autoplay · Filters"
            ),
            color=COLOR
        )
        if self.bot.user and self.bot.user.avatar:
            embed.set_thumbnail(url=self.bot.user.avatar.url)
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_command(name="premium", description="View premium features.")
    async def premium(self, ctx: commands.Context):
        from utils.checks import is_premium as check_premium
        has_premium = await check_premium(ctx.author.id)
        status = "✅ **You have Premium!**" if has_premium else "❌ You don't have Premium."
        embed = discord.Embed(title="⭐ ToneVibes Premium", color=0xFFD700 if has_premium else COLOR)
        embed.description = (
            f"{status}\n\n"
            "**Premium Features:**\n"
            "• Advanced audio filters\n"
            "• Custom equalizer\n"
            "• Priority support\n"
        )
        if config.PREMIUM_URL:
            embed.description += f"\n[Get Premium]({config.PREMIUM_URL})"
        await ctx.reply(embed=embed, mention_author=False)


async def setup(bot):
    await bot.add_cog(InformationCog(bot))
