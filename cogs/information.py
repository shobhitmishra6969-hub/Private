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
import utils.v2 as v2

COLOR = config.COLOR

# ── Command data ───────────────────────────────────────────────────────────────

MUSIC_COMMANDS = [
    ("play",       ["p"],                  "Play a track or playlist from a URL or search query."),
    ("search",     ["find"],               "Search for tracks and pick from a list."),
    ("nowplaying", ["np", "current"],      "Show the currently playing track."),
    ("autoplay",   ["ap"],                 "Toggle autoplay for related tracks."),
    ("grab",       ["save"],               "Save the current track to your DMs."),
    ("history",    ["hist", "recent"],     "View your recently played tracks."),
    ("sleep",      [],                     "Set a sleep timer to stop playback."),
]

QUEUE_COMMANDS = [
    ("queue",      ["q"],                  "View the current queue."),
    ("skip",       ["s"],                  "Skip the current track."),
    ("forceskip",  ["fs", "fskip"],        "Force skip without a vote (DJ only)."),
    ("skipto",     ["st"],                 "Skip to a specific position in the queue."),
    ("previous",   ["prev"],               "Play the previous track."),
    ("replay",     [],                     "Replay the current track from the start."),
    ("loop",       ["repeat"],             "Loop the current track or the whole queue."),
    ("shuffle",    [],                     "Shuffle the queue randomly."),
    ("move",       [],                     "Move a track to a different queue position."),
    ("remove",     ["rm"],                 "Remove a track from the queue."),
    ("clear",      [],                     "Clear all tracks from the queue."),
    ("forward",    [],                     "Skip forward by a number of seconds."),
    ("rewind",     [],                     "Rewind by a number of seconds."),
]

CONTROLS_COMMANDS = [
    ("pause",      [],                     "Pause the current track."),
    ("resume",     [],                     "Resume a paused track."),
    ("stop",       [],                     "Stop playback and clear the queue."),
    ("join",       ["summon"],             "Invite the bot to your voice channel."),
    ("leave",      ["dc", "disconnect"],   "Disconnect from the voice channel."),
    ("seek",       [],                     "Jump to a specific timestamp in the track."),
    ("volume",     ["vol"],                "Adjust the playback volume (0–200)."),
    ("filter",     [],                     "Apply an audio filter preset."),
    ("equalizer",  ["eq"],                 "Apply a custom equalizer preset."),
    ("customfilter",["cf"],                "Set custom speed, pitch, and rate values."),
]

FAVOURITE_COMMANDS = [
    ("like",       ["heart", "love"],      "Like the current track and save it to your liked songs."),
    ("unlike",     [],                     "Remove the current track from liked songs."),
    ("likeall",    [],                     "Like all tracks currently in the queue."),
    ("showliked",  ["liked", "favorites"], "View your liked songs list."),
    ("playliked",  [],                     "Play your entire liked songs list."),
    ("playlist",   ["pl"],                 "Create and manage your custom playlists."),
]

UTILITY_COMMANDS = [
    ("afk",        [],                     "Set your AFK status with an optional reason."),
    ("avatar",     ["av"],                 "View a user's avatar."),
    ("banner",     [],                     "View a user's banner."),
    ("servericon", [],                     "View the server icon."),
    ("serverbanner",[],                    "View the server banner."),
    ("membercount",[],                     "Show the server member count."),
    ("dm",         [],                     "Send a DM to a user (admin only)."),
    ("profile",    [],                     "View your ToneVibes profile."),
    ("setprefix",  [],                     "Change the bot prefix for this server."),
    ("source",     [],                     "Set the default music search source."),
    ("ignore",     [],                     "Ignore or unignore a channel for commands."),
    ("247",        [],                     "Toggle 24/7 mode to stay in voice."),
    ("djrole",     [],                     "Set the DJ role for the server."),
    ("giveaway",   ["ga"],                 "Start and manage server giveaways."),
    ("spotify",    [],                     "Search Spotify tracks, albums, and artists."),
    ("lastfm",     [],                     "Link your Last.fm account and view stats."),
]

CATEGORIES: dict[str, list] = {
    "Music":     MUSIC_COMMANDS,
    "Queue":     QUEUE_COMMANDS,
    "Controls":  CONTROLS_COMMANDS,
    "Favourite": FAVOURITE_COMMANDS,
    "Utility":   UTILITY_COMMANDS,
}

CAT_EMOJI: dict[str, str] = {
    "Music":     "🎵",
    "Queue":     "📋",
    "Controls":  "🎛️",
    "Favourite": "❤️",
    "Utility":   "🔧",
}

CAT_FOOTER: dict[str, str] = {
    "Music":     "Core music playback, search, and library management",
    "Queue":     "Queue management, skipping, looping, and navigation",
    "Controls":  "Playback controls, volume, filters, and equalizer",
    "Favourite": "Liked songs, playlists, and personal library",
    "Utility":   "Server tools, AFK, Spotify, Last.fm, and config",
}


def _cmd_line(name: str, aliases: list[str], desc: str) -> str:
    alias_str = f" ({', '.join(aliases)})" if aliases else ""
    return f"**/{name}**{alias_str} — {desc}"


def _category_container(cat: str) -> discord.ui.Container:
    cmds = CATEGORIES.get(cat, [])
    emoji = CAT_EMOJI.get(cat, "•")
    footer = CAT_FOOTER.get(cat, "")
    lines = [_cmd_line(n, a, d) for n, a, d in cmds]
    body = "\n".join(lines)
    children: list = [
        discord.ui.TextDisplay(f"## {emoji} ToneVibes Commands ({cat})"),
        discord.ui.Separator(),
        discord.ui.TextDisplay(body),
        discord.ui.Separator(),
        discord.ui.TextDisplay(f"-# {footer} • {config.PREFIX}help <command> for details"),
    ]
    return discord.ui.Container(*children, accent_color=COLOR)


# ── Help LayoutView ───────────────────────────────────────────────────────────

class HelpView(discord.ui.LayoutView):
    def __init__(self, bot: commands.Bot, author_id: int, current: str = "Music"):
        super().__init__(timeout=180)
        self.bot = bot
        self.author_id = author_id
        self.current = current
        self._build()

    def _build(self):
        self.clear_items()
        self.add_item(_category_container(self.current))

        # Row 1: category buttons (max 5)
        cat_btns = []
        for cat in CATEGORIES:
            btn = discord.ui.Button(
                label=cat,
                emoji=CAT_EMOJI.get(cat),
                style=discord.ButtonStyle.primary if self.current == cat else discord.ButtonStyle.secondary,
                custom_id=f"help_{cat}",
            )
            btn.callback = self._make_callback(cat)
            cat_btns.append(btn)
        self.add_item(discord.ui.ActionRow(*cat_btns))

        # Row 2: link buttons + close
        row2: list = []
        bot_id = self.bot.user.id if self.bot.user else 0
        invite = config.INVITE_URL or (
            f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        )
        if config.SUPPORT_URL and config.SUPPORT_URL != "https://discord.gg/your-invite-code":
            row2.append(discord.ui.Button(
                label="Support Server", emoji="🔧",
                url=config.SUPPORT_URL, style=discord.ButtonStyle.link,
            ))
        row2.append(discord.ui.Button(
            label="Invite ToneVibes", emoji="➕",
            url=invite, style=discord.ButtonStyle.link,
        ))
        close_btn = discord.ui.Button(label="✕", style=discord.ButtonStyle.danger, custom_id="help_close")
        close_btn.callback = self._close_cb
        row2.append(close_btn)
        self.add_item(discord.ui.ActionRow(*row2))

    def _make_callback(self, cat: str):
        async def callback(interaction: discord.Interaction):
            if interaction.user.id != self.author_id:
                return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
            self.current = cat
            self._build()
            await interaction.response.edit_message(view=self)
        return callback

    async def _close_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author_id:
            return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
        await interaction.response.defer()
        await interaction.delete_original_response()
        self.stop()

    async def on_timeout(self):
        try:
            self._build()
            for item in self.walk_children():
                if isinstance(item, discord.ui.Button) and not item.url:
                    item.disabled = True
        except Exception:
            pass


# ── Info card (bot mention) ───────────────────────────────────────────────────

class InfoLayoutView(discord.ui.LayoutView):
    """Rythm-style info card sent when someone @mentions the bot."""

    def __init__(self, bot: commands.Bot):
        super().__init__(timeout=None)
        prefix = config.PREFIX
        bot_id = bot.user.id if bot.user else 0
        invite = config.INVITE_URL or (
            f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        )
        avatar_url = bot.user.display_avatar.url if bot.user else None

        desc = (
            f"ToneVibes is the easiest way to listen to music with your friends on Discord. "
            f"Use **{prefix}play** to add tracks to the queue & **{prefix}help** to see the list of all commands.\n\n"
            "**Features:**\n"
            "🎵 High-quality music streaming\n"
            "⚡ Easy-to-use commands\n"
            "❤️ Liked songs & custom playlists\n"
            "🎛️ Audio filters & equalizer\n"
            "🎁 Built-in giveaway system\n"
            "💤 AFK system & user profiles\n\n"
            f"-# Use {prefix}help to see all commands"
        )

        # Build container children
        container_children: list = [
            discord.ui.TextDisplay("## 🎵 ToneVibes Info"),
            discord.ui.Separator(),
        ]
        if avatar_url:
            container_children.append(discord.ui.Section(
                discord.ui.TextDisplay(desc),
                accessory=discord.ui.Thumbnail(media=avatar_url),
            ))
        else:
            container_children.append(discord.ui.TextDisplay(desc))

        # Banner image at the bottom of the container
        if avatar_url:
            container_children.append(discord.ui.MediaGallery(
                discord.MediaGalleryItem(avatar_url)
            ))

        self.add_item(discord.ui.Container(*container_children, accent_color=COLOR))

        # Row 1: primary action buttons
        row1 = [
            discord.ui.Button(label="Get Started", emoji="🎵", url=invite, style=discord.ButtonStyle.link),
            discord.ui.Button(label="Add To Server", emoji="➕", url=invite, style=discord.ButtonStyle.link),
        ]
        self.add_item(discord.ui.ActionRow(*row1))

        # Row 2: support + website (only if configured)
        row2: list = []
        if config.SUPPORT_URL and config.SUPPORT_URL != "https://discord.gg/your-invite-code":
            row2.append(discord.ui.Button(
                label="Support", emoji="💬",
                url=config.SUPPORT_URL, style=discord.ButtonStyle.link,
            ))
        if config.SOURCE_CODE_URL and config.SOURCE_CODE_URL != "https://github.com/":
            row2.append(discord.ui.Button(
                label="Website", emoji="🌐",
                url=config.SOURCE_CODE_URL, style=discord.ButtonStyle.link,
            ))
        if row2:
            self.add_item(discord.ui.ActionRow(*row2))


# Keep old names as shims so bot.py import doesn't break during transition
def info_embed(bot: commands.Bot) -> discord.Embed:
    prefix = config.PREFIX
    embed = discord.Embed(
        title="🎵 ToneVibes Info",
        description=(
            f"ToneVibes is the easiest way to listen to music. "
            f"Use **{prefix}play** to add tracks & **{prefix}help** for all commands."
        ),
        color=COLOR,
    )
    if bot.user and bot.user.avatar:
        embed.set_thumbnail(url=bot.user.avatar.url)
    return embed


def info_view(bot: commands.Bot) -> discord.ui.View:
    return discord.ui.View(timeout=None)


# ── Cog ───────────────────────────────────────────────────────────────────────

class InformationCog(commands.Cog, name="Information"):

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.hybrid_command(name="help", description="Show the help menu.")
    async def help(self, ctx: commands.Context, command: str = ""):
        if command:
            cmd = self.bot.get_command(command)
            if not cmd:
                return await v2.send(ctx, v2.err(f"Command `{command}` not found."))
            aliases_str = ", ".join(f"`{a}`" for a in cmd.aliases) if getattr(cmd, "aliases", None) else "None"
            body = f"{cmd.help or cmd.description or 'No description.'}\n\n**Aliases:** {aliases_str}"
            return await v2.send(ctx, v2.container(body, header=f"❓ {config.PREFIX}{cmd.name}"))

        view = HelpView(self.bot, ctx.author.id)
        await ctx.reply(view=view, mention_author=False)

    @commands.hybrid_command(name="ping", description="Check bot latency.")
    async def ping(self, ctx: commands.Context):
        start = time.perf_counter()
        await v2.send(ctx, v2.container("🏓 Pinging..."))
        rest_latency = (time.perf_counter() - start) * 1000
        ws_latency = self.bot.latency * 1000

        nodes = list(ravelink.Pool.nodes.values())
        node_lines = "\n".join(
            f"{'🟢' if n.status == ravelink.NodeStatus.CONNECTED else '🔴'} **{n.identifier}**"
            for n in nodes
        ) if nodes else "No nodes connected"

        body = (
            f"**WebSocket:** `{ws_latency:.1f}ms`\n"
            f"**REST:** `{rest_latency:.1f}ms`\n\n"
            f"**Lavalink Nodes:**\n{node_lines}"
        )
        if ctx.interaction and ctx.interaction.response.is_done():
            lv = v2._wrap(v2.container(body, header="🏓 Pong!"))
            await ctx.interaction.edit_original_response(view=lv)
        else:
            await v2.send(ctx, v2.container(body, header="🏓 Pong!"))

    @commands.hybrid_command(name="stats", description="Show bot statistics.")
    async def stats(self, ctx: commands.Context):
        import psutil
        guilds = len(self.bot.guilds)
        users = sum(g.member_count or 0 for g in self.bot.guilds)
        players = len(ravelink.Pool.players)

        body = (
            f"**Servers:** `{guilds:,}` • **Users:** `{users:,}` • **Players:** `{players}`\n"
        )
        try:
            proc = psutil.Process()
            mem_mb = proc.memory_info().rss / 1024 / 1024
            body += f"**Memory:** `{mem_mb:.1f} MB` • "
        except Exception:
            pass
        body += (
            f"**Python:** `{platform.python_version()}` • "
            f"**discord.py:** `{discord.__version__}`"
        )
        nodes = list(ravelink.Pool.nodes.values())
        if nodes:
            node_status = " • ".join(
                f"{'🟢' if n.status == ravelink.NodeStatus.CONNECTED else '🔴'} {n.identifier}"
                for n in nodes
            )
            body += f"\n\n**Lavalink Nodes:** {node_status}"

        await v2.send(ctx, v2.container(body, header="📊 Bot Statistics"))

    @commands.hybrid_command(name="invite", description="Get the bot invite link.")
    async def invite(self, ctx: commands.Context):
        bot_id = self.bot.user.id if self.bot.user else 0
        link = config.INVITE_URL or (
            f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        )
        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(v2.container(f"[Click here to invite ToneVibes!]({link})", header="📨 Invite ToneVibes"))
        lv.add_item(discord.ui.ActionRow(
            discord.ui.Button(label="Invite", emoji="➕", url=link, style=discord.ButtonStyle.link)
        ))
        await ctx.reply(view=lv, mention_author=False)

    @commands.hybrid_command(name="support", description="Get the support server link.")
    async def support(self, ctx: commands.Context):
        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(v2.container(f"[Join our support server!]({config.SUPPORT_URL})", header="💬 Support Server"))
        lv.add_item(discord.ui.ActionRow(
            discord.ui.Button(label="Join Support", emoji="💬", url=config.SUPPORT_URL, style=discord.ButtonStyle.link)
        ))
        await ctx.reply(view=lv, mention_author=False)

    @commands.hybrid_command(name="about", description="About ToneVibes.")
    async def about(self, ctx: commands.Context):
        body = (
            "ToneVibes is a feature-rich Discord music bot built with **discord.py** + **ravelink**.\n\n"
            "Supports YouTube, Spotify, SoundCloud, Deezer, and more through Lavalink.\n\n"
            "**Features:** Giveaways · Premium · Last.fm · Playlists · Liked Songs · AFK · Autoplay · Filters"
        )
        await v2.send(ctx, v2.container(body, header="🎵 About ToneVibes"))

    @commands.hybrid_command(name="premium", description="View premium features.")
    async def premium(self, ctx: commands.Context):
        from utils.checks import is_premium as check_premium
        has_prem = await check_premium(ctx.author.id)
        status = "✅ **You have Premium!**" if has_prem else "❌ You don't have Premium."
        body = (
            f"{status}\n\n"
            "**Premium Features:**\n"
            "• Advanced audio filters\n"
            "• Custom equalizer\n"
            "• Priority support\n"
        )
        if config.PREMIUM_URL:
            body += f"\n[Get Premium]({config.PREMIUM_URL})"
        color = 0xFFD700 if has_prem else COLOR
        await v2.send(ctx, v2.container(body, header="⭐ ToneVibes Premium", color=color))


async def setup(bot):
    await bot.add_cog(InformationCog(bot))
