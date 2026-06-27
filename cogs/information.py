"""Information commands: help, ping, stats, invite, support, premium, about."""
from __future__ import annotations

import platform
import time

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from utils.formatters import short_number

COLOR = config.COLOR

# ── Command data: (aliases, description) ─────────────────────────────────────

MUSIC_COMMANDS = [
    ("play",       ["p"],              "Play a track or playlist from a URL or search query."),
    ("search",     ["find"],           "Search for tracks and pick from a list."),
    ("nowplaying", ["np", "current"],  "Show the currently playing track."),
    ("autoplay",   ["ap"],             "Toggle autoplay for related tracks."),
    ("similar",    [],                 "Queue tracks similar to the current song."),
    ("grab",       ["save"],           "Save the current track to your DMs."),
    ("history",    ["hist", "recent"], "View your recently played tracks."),
    ("speed",      [],                 "Change the playback speed (premium)."),
    ("sleep",      [],                 "Set a timer to stop playback."),
]

QUEUE_COMMANDS = [
    ("queue",      ["q"],              "View the current queue."),
    ("skip",       ["s"],              "Vote-skip the current track."),
    ("forceskip",  ["fs", "fskip"],    "Force skip without a vote (DJ only)."),
    ("skipto",     ["st"],             "Skip to a specific position in the queue."),
    ("previous",   ["prev"],           "Play the previous track."),
    ("replay",     [],                 "Replay the current track from the start."),
    ("loop",       ["repeat"],         "Loop the current track or the whole queue."),
    ("shuffle",    [],                 "Shuffle the queue randomly."),
    ("move",       [],                 "Move a track to a different queue position."),
    ("remove",     ["rm"],             "Remove a track from the queue."),
    ("clear",      [],                 "Clear all tracks from the queue."),
    ("forward",    [],                 "Skip forward by a number of seconds."),
    ("rewind",     [],                 "Rewind by a number of seconds."),
]

CONTROLS_COMMANDS = [
    ("pause",      [],                 "Pause the current track."),
    ("resume",     [],                 "Resume a paused track."),
    ("stop",       [],                 "Stop playback and clear the queue."),
    ("join",       ["summon"],         "Invite the bot to your voice channel."),
    ("leave",      ["dc", "disconnect"],"Disconnect from the voice channel."),
    ("seek",       [],                 "Jump to a specific timestamp in the track."),
    ("volume",     ["vol"],            "Adjust the playback volume (0–200)."),
    ("filter",     [],                 "Apply an audio filter preset."),
    ("equalizer",  ["eq"],             "Apply a custom equalizer preset (premium)."),
    ("customfilter",["cf"],            "Set custom speed/pitch/rate values (premium)."),
]

FAVOURITE_COMMANDS = [
    ("like",       ["heart", "love"],  "Like the current track and save it."),
    ("unlike",     [],                 "Remove the current track from liked songs."),
    ("likeall",    [],                 "Like all tracks currently in the queue."),
    ("showliked",  ["liked", "favorites"], "View your liked songs list."),
    ("playliked",  [],                 "Play your entire liked songs list."),
    ("playlist",   ["pl"],             "Manage your custom playlists."),
]

UTILITY_COMMANDS = [
    ("afk",        [],                 "Set your AFK status with an optional reason."),
    ("avatar",     ["av"],             "View a user's avatar."),
    ("banner",     [],                 "View a user's banner."),
    ("servericon", [],                 "View the server icon."),
    ("serverbanner",[],                "View the server banner."),
    ("membercount",[],                 "Show the server member count."),
    ("dm",         [],                 "Send a DM to a user (admin only)."),
    ("profile",    [],                 "View your ToneVibes profile."),
    ("setprefix",  [],                 "Change the bot prefix for this server."),
    ("source",     [],                 "Set the default music search source."),
    ("ignore",     [],                 "Ignore/unignore a channel for commands."),
    ("247",        [],                 "Toggle 24/7 mode to stay in voice."),
    ("djrole",     [],                 "Set the DJ role for the server."),
    ("giveaway",   ["ga"],             "Start and manage server giveaways."),
    ("spotify",    [],                 "Search Spotify tracks, albums, artists."),
    ("lastfm",     [],                 "Link your Last.fm account."),
]

CATEGORIES = {
    "Music":    MUSIC_COMMANDS,
    "Queue":    QUEUE_COMMANDS,
    "Controls": CONTROLS_COMMANDS,
    "Favourite":FAVOURITE_COMMANDS,
    "Utility":  UTILITY_COMMANDS,
}

CAT_EMOJI = {
    "Music":     "🎵",
    "Queue":     "📋",
    "Controls":  "🎛️",
    "Favourite": "❤️",
    "Utility":   "🔧",
}


def _cmd_line(name: str, aliases: list[str], desc: str, prefix: str) -> str:
    alias_str = f" ({', '.join(aliases)})" if aliases else ""
    return f"**{prefix}{name}**{alias_str}\n{desc}"


def category_embed(cat: str) -> discord.Embed:
    cmds = CATEGORIES.get(cat, [])
    prefix = config.PREFIX
    emoji = CAT_EMOJI.get(cat, "•")
    lines = [_cmd_line(n, a, d, prefix) for n, a, d in cmds]
    embed = discord.Embed(
        title=f"{emoji} ToneVibes Commands ({cat})",
        description="\n\n".join(lines),
        color=COLOR,
    )
    embed.set_footer(text=f"Core music playback, search, likes, and library management • {len(cmds)} commands")
    return embed


def home_embed(bot: commands.Bot) -> discord.Embed:
    total = sum(len(v) for v in CATEGORIES.values())
    embed = discord.Embed(
        title="🎵 ToneVibes Commands",
        description=(
            f"ToneVibes is an advanced music bot for Discord. "
            f"Use **{config.PREFIX}play** to add tracks to the queue & "
            f"**{config.PREFIX}help** to see all commands.\n\n"
            + "\n".join(
                f"{CAT_EMOJI.get(cat, '•')} **{cat}** — `{len(cmds)}` commands"
                for cat, cmds in CATEGORIES.items()
            )
        ),
        color=COLOR,
    )
    embed.set_footer(text=f"{total} total commands • {config.PREFIX}help <command> for details")
    if bot.user and bot.user.avatar:
        embed.set_thumbnail(url=bot.user.avatar.url)
    return embed


def help_links_view() -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    if config.SUPPORT_URL and config.SUPPORT_URL != "https://discord.gg/your-invite-code":
        view.add_item(discord.ui.Button(
            label="Support Server",
            emoji="🔧",
            url=config.SUPPORT_URL,
            style=discord.ButtonStyle.link,
        ))
    bot_id_placeholder = "0"
    invite = config.INVITE_URL or f"https://discord.com/api/oauth2/authorize?client_id={bot_id_placeholder}&permissions=8&scope=bot+applications.commands"
    view.add_item(discord.ui.Button(
        label="Invite ToneVibes",
        emoji="➕",
        url=invite,
        style=discord.ButtonStyle.link,
    ))
    return view


# ── Help View with category buttons ──────────────────────────────────────────

class HelpView(discord.ui.View):
    def __init__(self, bot: commands.Bot, author_id: int, current: str = "home"):
        super().__init__(timeout=180)
        self.bot = bot
        self.author_id = author_id
        self.current = current
        self._build_buttons()

    def _build_buttons(self):
        self.clear_items()
        cats = list(CATEGORIES.keys())

        # Row 0: first 5 categories
        for i, cat in enumerate(cats[:5]):
            btn = discord.ui.Button(
                label=cat,
                emoji=CAT_EMOJI.get(cat),
                style=discord.ButtonStyle.primary if self.current == cat else discord.ButtonStyle.secondary,
                custom_id=f"help_{cat}",
                row=0,
            )
            btn.callback = self._make_callback(cat)
            self.add_item(btn)

        # Row 1: link buttons + close
        if config.SUPPORT_URL and config.SUPPORT_URL != "https://discord.gg/your-invite-code":
            self.add_item(discord.ui.Button(
                label="Support Server",
                emoji="🔧",
                url=config.SUPPORT_URL,
                style=discord.ButtonStyle.link,
                row=1,
            ))

        close_btn = discord.ui.Button(
            label="✕",
            style=discord.ButtonStyle.danger,
            custom_id="help_close",
            row=1,
        )
        close_btn.callback = self._close_callback
        self.add_item(close_btn)

    def _make_callback(self, cat: str):
        async def callback(interaction: discord.Interaction):
            if interaction.user.id != self.author_id:
                return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
            self.current = cat
            self._build_buttons()
            await interaction.response.edit_message(embed=category_embed(cat), view=self)
        return callback

    async def _close_callback(self, interaction: discord.Interaction):
        if interaction.user.id != self.author_id:
            return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
        await interaction.response.defer()
        await interaction.delete_original_response()
        self.stop()

    async def on_timeout(self):
        for item in self.children:
            if isinstance(item, discord.ui.Button) and not item.url:
                item.disabled = True

    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        return True


# ── Bot info card (mention response) ─────────────────────────────────────────

def info_embed(bot: commands.Bot) -> discord.Embed:
    prefix = config.PREFIX
    embed = discord.Embed(
        title=f"🎵 ToneVibes Info",
        description=(
            f"ToneVibes is the easiest way to listen to music with your friends on Discord. "
            f"Use **/{prefix}play** to add tracks to the queue & **{prefix}help** to see the list of all commands.\n\n"
            "**Features:**\n"
            "🎵 High-quality music streaming\n"
            "⚡ Easy-to-use commands\n"
            "❤️ Liked songs & custom playlists\n"
            "🎛️ Audio filters & equalizer\n"
            "🎁 Built-in giveaway system\n"
            "💤 AFK system & user profiles"
        ),
        color=COLOR,
    )
    if bot.user and bot.user.avatar:
        embed.set_thumbnail(url=bot.user.avatar.url)
    embed.set_footer(text=f"Use {prefix}help to see all commands")
    return embed


def info_view(bot: commands.Bot) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    prefix = config.PREFIX

    # Get Started → help command hint (no link, just a button style label)
    bot_id = bot.user.id if bot.user else 0
    invite = config.INVITE_URL or (
        f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
    )

    view.add_item(discord.ui.Button(
        label="Get Started",
        emoji="🎵",
        url=invite,
        style=discord.ButtonStyle.link,
        row=0,
    ))
    view.add_item(discord.ui.Button(
        label="Add To Server",
        emoji="➕",
        url=invite,
        style=discord.ButtonStyle.link,
        row=0,
    ))
    if config.SUPPORT_URL and config.SUPPORT_URL != "https://discord.gg/your-invite-code":
        view.add_item(discord.ui.Button(
            label="Support",
            emoji="💬",
            url=config.SUPPORT_URL,
            style=discord.ButtonStyle.link,
            row=1,
        ))
    if config.SOURCE_CODE_URL and config.SOURCE_CODE_URL != "https://github.com/":
        view.add_item(discord.ui.Button(
            label="Website",
            emoji="🌐",
            url=config.SOURCE_CODE_URL,
            style=discord.ButtonStyle.link,
            row=1,
        ))
    return view


# ── Cog ───────────────────────────────────────────────────────────────────────

class InformationCog(commands.Cog, name="Information"):

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.hybrid_command(name="help", description="Show the help menu.")
    async def help(self, ctx: commands.Context, command: str = ""):
        if command:
            cmd = self.bot.get_command(command)
            if not cmd:
                return await ctx.reply(
                    embed=self.bot.err(f"Command `{command}` not found."),
                    mention_author=False,
                )
            embed = discord.Embed(
                title=f"❓ {config.PREFIX}{cmd.name}",
                description=cmd.help or cmd.description or "No description.",
                color=COLOR,
            )
            if hasattr(cmd, "aliases") and cmd.aliases:
                embed.add_field(name="Aliases", value=", ".join(f"`{a}`" for a in cmd.aliases))
            return await ctx.reply(embed=embed, mention_author=False)

        view = HelpView(self.bot, ctx.author.id)
        await ctx.reply(embed=home_embed(self.bot), view=view, mention_author=False)

    @commands.hybrid_command(name="ping", description="Check bot latency.")
    async def ping(self, ctx: commands.Context):
        start = time.perf_counter()
        msg = await ctx.reply(
            embed=discord.Embed(description="🏓 Pinging...", color=COLOR),
            mention_author=False,
        )
        rest_latency = (time.perf_counter() - start) * 1000
        ws_latency = self.bot.latency * 1000

        nodes = list(ravelink.Pool.nodes.values())
        node_lines = [
            f"{'🟢' if n.status == ravelink.NodeStatus.CONNECTED else '🔴'} **{n.identifier}**"
            for n in nodes
        ]

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
        link = config.INVITE_URL or (
            f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        )
        embed = discord.Embed(
            title="📨 Invite ToneVibes",
            description=f"[Click here to invite the bot!]({link})",
            color=COLOR,
        )
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Invite", emoji="➕", url=link, style=discord.ButtonStyle.link))
        await ctx.reply(embed=embed, view=view, mention_author=False)

    @commands.hybrid_command(name="support", description="Get the support server link.")
    async def support(self, ctx: commands.Context):
        embed = discord.Embed(
            title="💬 Support Server",
            description=f"[Join our support server!]({config.SUPPORT_URL})",
            color=COLOR,
        )
        view = discord.ui.View()
        view.add_item(discord.ui.Button(label="Join Support", emoji="💬", url=config.SUPPORT_URL, style=discord.ButtonStyle.link))
        await ctx.reply(embed=embed, view=view, mention_author=False)

    @commands.hybrid_command(name="about", description="About ToneVibes.")
    async def about(self, ctx: commands.Context):
        embed = discord.Embed(
            title="🎵 About ToneVibes",
            description=(
                "ToneVibes is a feature-rich Discord music bot built with **discord.py** + **ravelink**.\n\n"
                "Supports YouTube, Spotify, SoundCloud, Deezer, and more through Lavalink.\n\n"
                "**Features:** Giveaways · Premium · Last.fm · Playlists · Liked Songs · AFK · Autoplay · Filters"
            ),
            color=COLOR,
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
