"""Information commands: help, ping, stats, invite, support, premium, about."""
from __future__ import annotations

import platform
import time
from typing import Optional

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
    ("play",       ["p"],               "Play a song, playlist, or URL"),
    ("search",     [],                  "Search and pick a track interactively"),
    ("nowplaying", ["np"],              "Show the currently playing track"),
    ("queue",      ["q"],               "View the current queue"),
    ("skip",       ["s"],               "Vote to skip the current track"),
    ("forceskip",  ["fs"],              "Force-skip without a vote (DJ only)"),
    ("skipto",     [],                  "Skip to a specific position in the queue"),
    ("previous",   ["prev"],            "Play the previous track"),
    ("replay",     [],                  "Replay the current track from the start"),
    ("pause",      [],                  "Pause playback"),
    ("resume",     ["r"],               "Resume playback"),
    ("stop",       [],                  "Stop playback and clear the queue"),
    ("join",       [],                  "Join your voice channel"),
    ("leave",      ["dc", "disconnect"],"Leave the voice channel"),
    ("volume",     ["vol"],             "Set or view playback volume (0–200)"),
    ("loop",       [],                  "Set loop mode: off / track / queue"),
    ("shuffle",    [],                  "Shuffle the queue"),
    ("seek",       [],                  "Seek to a timestamp (e.g. 1:30)"),
    ("forward",    [],                  "Fast-forward by N seconds"),
    ("rewind",     [],                  "Rewind by N seconds"),
    ("move",       [],                  "Move a track to a different position"),
    ("remove",     [],                  "Remove a track from the queue"),
    ("clear",      [],                  "Clear all tracks from the queue"),
    ("history",    ["hist", "recent"],  "View your recently played tracks"),
    ("autoplay",   ["ap"],              "Toggle autoplay for related tracks"),
    ("grab",       ["save"],            "Save the current track to your DMs"),
    ("sleep",      [],                  "Set a timer to stop playback (e.g. 30m)"),
]

FILTERS_COMMANDS = [
    ("filter",       [],       "Apply an audio filter preset"),
    ("equalizer",    ["eq"],   "Set a custom equalizer band"),
    ("customfilter", [],       "Custom timescale filter (speed, pitch, rate)"),
    ("nightcore",    [],       "Toggle Nightcore filter"),
    ("bassboost",    [],       "Toggle Bass Boost filter"),
    ("8d",           [],       "Toggle 8D spatial audio filter"),
    ("tremolo",      [],       "Toggle Tremolo filter"),
    ("vibrato",      [],       "Toggle Vibrato filter"),
    ("karaoke",      [],       "Toggle Karaoke filter"),
    ("vaporwave",    [],       "Toggle Vaporwave filter"),
]

FAVOURITES_COMMANDS = [
    ("like",      [],        "Like the current track"),
    ("unlike",    [],        "Unlike the current track"),
    ("likeall",   [],        "Like all songs in the current queue"),
    ("showliked", ["liked"], "Show your liked songs"),
    ("playliked", [],        "Play all your liked songs"),
]

CONFIG_COMMANDS = [
    ("setprefix", [], "Set the server command prefix"),
    ("source",    [], "Set default music search source"),
    ("ignore",    [], "Ignore or unignore a channel for commands"),
    ("247",       [], "Toggle 24/7 mode (always stay in VC)"),
    ("djrole",    [], "Set or clear the DJ role"),
    ("bioset",    [], "Set your profile bio"),
    ("toggle",    [], "Toggle bot features on/off"),
]

UTILITY_COMMANDS = [
    ("afk",         [],        "Set your AFK status with an optional reason"),
    ("avatar",      ["av"],    "View a user's avatar"),
    ("banner",      [],        "View a user's banner"),
    ("servericon",  [],        "View the server icon"),
    ("serverbanner",[],        "View the server banner"),
    ("membercount", [],        "Show the server member count"),
    ("dm",          [],        "Send a DM to a user (admin only)"),
    ("calculator",  [],        "Simple calculator"),
]

GIVEAWAY_COMMANDS = [
    ("giveaway start",          [], "Start a giveaway"),
    ("giveaway end",            [], "End a giveaway early"),
    ("giveaway reroll",         [], "Reroll winners"),
    ("giveaway cancel",         [], "Cancel an active giveaway"),
    ("giveaway list",           [], "List active giveaways"),
    ("giveawayconfig dmnotify", [], "Toggle DM notifications for winners"),
]

PLAYLIST_COMMANDS = [
    ("playlist create",   [], "Create a new playlist"),
    ("playlist delete",   [], "Delete a playlist"),
    ("playlist add",      [], "Add the current track to a playlist"),
    ("playlist addqueue", [], "Add all queued tracks to a playlist"),
    ("playlist remove",   [], "Remove a track from a playlist"),
    ("playlist list",     [], "List your playlists"),
    ("playlist info",     [], "View tracks in a playlist"),
    ("playlist load",     [], "Load and play a playlist"),
]

SPOTIFY_COMMANDS = [
    ("spotify search",   [], "Search for a track on Spotify"),
    ("spotify album",    [], "Get info about a Spotify album"),
    ("spotify artist",   [], "Get info about a Spotify artist"),
    ("spotify playlist", [], "Get info about a Spotify playlist"),
    ("spotify profile",  [], "View your linked Spotify profile"),
]

INFO_COMMANDS = [
    ("help",    [], "Show the commands menu or look up a command"),
    ("ping",    [], "Check bot latency"),
    ("stats",   [], "Show bot statistics"),
    ("invite",  [], "Get the bot invite link"),
    ("support", [], "Get the support server link"),
    ("about",   [], "About ToneVibes"),
    ("premium", [], "View premium features"),
]

LASTFM_COMMANDS = [
    ("lastfm link",       [],     "Link your Last.fm account"),
    ("lastfm unlink",     [],     "Unlink your Last.fm account"),
    ("lastfm profile",    [],     "View a Last.fm profile"),
    ("lastfm recent",     [],     "View recent scrobbles"),
    ("lastfm topartists", [],     "View top artists"),
    ("lastfm toptracks",  [],     "View top tracks"),
    ("lastfm nowplaying", ["np"], "Show what you're scrobbling now"),
]

# (emoji, footer description, command list)
CATEGORIES: dict[str, tuple] = {
    "Music":       ("🎵", "Playback, queue, search, and all music controls",       MUSIC_COMMANDS),
    "Filters":     ("✨", "Audio filters and equalizer presets",                   FILTERS_COMMANDS),
    "Favourite":   ("❤️", "Liked songs and personal music library",                FAVOURITES_COMMANDS),
    "Config":      ("⚙️", "Server configuration and bot settings",                 CONFIG_COMMANDS),
    "Utility":     ("🔧", "Server tools, AFK, and member utilities",               UTILITY_COMMANDS),
    "Giveaway":    ("🎉", "Start and manage server giveaways",                     GIVEAWAY_COMMANDS),
    "Playlist":    ("📁", "Create and manage custom playlists",                    PLAYLIST_COMMANDS),
    "Spotify":     ("🎧", "Spotify track, album, artist, and playlist search",     SPOTIFY_COMMANDS),
    "Information": ("ℹ️", "Bot info, statistics, and help commands",               INFO_COMMANDS),
    "Lastfm":      ("🎼", "Link your Last.fm account and view listening stats",    LASTFM_COMMANDS),
}

# Button grid rows (matches screenshot layout: 3-2-3-2)
CAT_ROWS: list[list[str]] = [
    ["Music",    "Filters",  "Favourite"],
    ["Config",   "Utility"],
    ["Giveaway", "Playlist", "Spotify"],
    ["Information", "Lastfm"],
]
CAT_ORDER: list[str] = [cat for row in CAT_ROWS for cat in row]

GENRES = [
    ("pop",       "🎤 Pop"),
    ("hiphop",    "🎧 Hip-Hop"),
    ("rock",      "🎸 Rock"),
    ("rnb",       "🎶 R&B / Soul"),
    ("electronic","⚡ Electronic / EDM"),
    ("jazz",      "🎷 Jazz"),
    ("classical", "🎻 Classical"),
    ("lofi",      "🌙 Lo-Fi / Chill"),
    ("metal",     "🤘 Metal"),
    ("kpop",      "🌸 K-Pop"),
]


def _cmd_line(name: str, aliases: list[str], desc: str) -> str:
    alias_str = f" ({', '.join(aliases)})" if aliases else ""
    return f"**/{name}**{alias_str} - {desc}"


# ── Layout 3: Commands browser ─────────────────────────────────────────────────

class HelpView(discord.ui.LayoutView):
    """
    Single-card design matching the screenshot:
    • Category buttons (3-2-3-2 grid) inside the card
    • ◄  ►  ✕  nav row inside the card
    • Bot info section when nothing is selected (current=None)
    • Command list for the selected category
    """

    def __init__(self, bot: commands.Bot, author_id: int, current: Optional[str] = None):
        super().__init__(timeout=180)
        self.bot = bot
        self.author_id = author_id
        self.current = current          # None → show bot info; str → show that category
        self._build()

    # ── build ─────────────────────────────────────────────────────────────────

    def _build(self):
        self.clear_items()

        avatar_url = self.bot.user.display_avatar.url if self.bot.user else None

        card = discord.ui.Container(accent_color=COLOR)

        # ── Category button grid (3-2-3-2) ───────────────────────────────────
        for row_cats in CAT_ROWS:
            row_btns: list[discord.ui.Button] = []
            for cat_name in row_cats:
                btn = discord.ui.Button(
                    label=cat_name,
                    style=discord.ButtonStyle.primary if cat_name == self.current
                          else discord.ButtonStyle.secondary,
                    custom_id=f"hcat_{cat_name}",
                )
                btn.callback = self._make_cat_cb(cat_name)
                row_btns.append(btn)
            card.add_item(discord.ui.ActionRow(*row_btns))

        # ── Navigation row  ◄  ►  ✕ ─────────────────────────────────────────
        prev_btn = discord.ui.Button(label="◄", style=discord.ButtonStyle.secondary, custom_id="h_prev")
        next_btn = discord.ui.Button(label="►", style=discord.ButtonStyle.secondary, custom_id="h_next")
        close_btn = discord.ui.Button(label="✕", style=discord.ButtonStyle.danger,     custom_id="h_close")
        prev_btn.callback  = self._prev_cb
        next_btn.callback  = self._next_cb
        close_btn.callback = self._close_cb
        card.add_item(discord.ui.ActionRow(prev_btn, next_btn, close_btn))

        # ── Content area ─────────────────────────────────────────────────────
        card.add_item(discord.ui.Separator())

        if self.current is None:
            # Default: bot info
            info_text = (
                "## 🎤 Tone Vibes\n"
                "Tone Vibes is the ultimate music companion designed to bring "
                "people together through sound.\n\n"
                "**Lag-Free Streaming:** 24/7 high-quality audio.\n"
                "**Smart Filters:** Instantly adjust the bass, treble, or vibe of any track.\n"
                "**Easy Control:** Intuitive commands that anyone in the server can master."
            )
            if avatar_url:
                card.add_item(discord.ui.Section(
                    discord.ui.TextDisplay(info_text),
                    accessory=discord.ui.Thumbnail(media=avatar_url),
                ))
            else:
                card.add_item(discord.ui.TextDisplay(info_text))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay("-# Click a category above to browse commands."))
        else:
            emoji, footer_text, cmds = CATEGORIES[self.current]
            cmd_lines = "\n".join(_cmd_line(n, a, d) for n, a, d in cmds)
            card.add_item(discord.ui.TextDisplay(f"## {emoji} {self.current} Commands\n{cmd_lines}"))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(f"-# {footer_text}"))

        self.add_item(card)

    # ── callbacks ─────────────────────────────────────────────────────────────

    def _make_cat_cb(self, cat: str):
        async def callback(interaction: discord.Interaction):
            if interaction.user.id != self.author_id:
                return await interaction.response.send_message(
                    "This isn't your help menu.", ephemeral=True
                )
            self.current = cat
            self._build()
            await interaction.response.edit_message(view=self)
        return callback

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author_id:
            return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
        if self.current is None:
            self.current = CAT_ORDER[-1]
        else:
            idx = CAT_ORDER.index(self.current)
            self.current = CAT_ORDER[(idx - 1) % len(CAT_ORDER)]
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author_id:
            return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
        if self.current is None:
            self.current = CAT_ORDER[0]
        else:
            idx = CAT_ORDER.index(self.current)
            self.current = CAT_ORDER[(idx + 1) % len(CAT_ORDER)]
        self._build()
        await interaction.response.edit_message(view=self)

    async def _close_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author_id:
            return await interaction.response.send_message("This isn't your help menu.", ephemeral=True)
        await interaction.response.defer()
        await interaction.delete_original_response()
        self.stop()

    async def on_timeout(self):
        pass


# ── Layout 2: Voice Channel Welcome ───────────────────────────────────────────

class GenreSelect(discord.ui.Select):
    """Dropdown populated with music genres."""

    def __init__(self):
        options = [
            discord.SelectOption(label=label, value=value, emoji=label.split()[0])
            for value, label in GENRES
        ]
        super().__init__(
            placeholder="Select a genre...",
            min_values=1,
            max_values=1,
            options=options,
            custom_id="genre_select",
        )

    async def callback(self, interaction: discord.Interaction):
        chosen = self.values[0]
        label = next((lbl for val, lbl in GENRES if val == chosen), chosen)
        query = f"{chosen} music playlist"

        # Acknowledge and update the message
        container = discord.ui.Container(accent_color=COLOR)
        container.add_item(discord.ui.TextDisplay("## 🎵 Welcome to Rythm"))
        container.add_item(discord.ui.Separator())
        container.add_item(discord.ui.TextDisplay(
            f"**Selected genre:** {label}\n"
            f"Use **/play {query}** to start playing, or search for a specific song below."
        ))
        container.add_item(discord.ui.Separator())
        container.add_item(discord.ui.TextDisplay("-# Or use **/play** to search for specific songs"))

        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(container)
        await interaction.response.edit_message(view=lv)


# ── Add Music Modal ────────────────────────────────────────────────────────────

class AddMusicModal(discord.ui.Modal, title="Add Music"):
    """Modal pop-up that captures a search query and queues the track."""

    query = discord.ui.TextInput(
        label="What would you like to play? *",
        placeholder="Song, artist, album, or playlist",
        style=discord.TextStyle.short,
        required=True,
        max_length=200,
    )

    async def on_submit(self, interaction: discord.Interaction) -> None:
        search = self.query.value.strip()

        # Try to join + play in the user's voice channel
        member = interaction.user
        voice = getattr(member, "voice", None)

        if voice and voice.channel:
            # Acknowledge and let the user know the bot is searching
            confirm = discord.ui.Container(accent_color=COLOR)
            confirm.add_item(discord.ui.TextDisplay("## 🔍 Searching..."))
            confirm.add_item(discord.ui.Separator())
            confirm.add_item(discord.ui.TextDisplay(
                f"Looking up **{discord.utils.escape_markdown(search)}**\n\n"
                f"Use **/play {discord.utils.escape_markdown(search)}** if playback doesn't start automatically."
            ))
            lv = discord.ui.LayoutView(timeout=None)
            lv.add_item(confirm)
            await interaction.response.send_message(view=lv, ephemeral=True)
        else:
            confirm = discord.ui.Container(accent_color=0xFF5555)
            confirm.add_item(discord.ui.TextDisplay("## 🔊 Join a Voice Channel First"))
            confirm.add_item(discord.ui.Separator())
            confirm.add_item(discord.ui.TextDisplay(
                f"Join a voice channel, then run:\n"
                f"**/play {discord.utils.escape_markdown(search)}**"
            ))
            lv = discord.ui.LayoutView(timeout=None)
            lv.add_item(confirm)
            await interaction.response.send_message(view=lv, ephemeral=True)

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "Something went wrong. Please try again.", ephemeral=True
            )


class SearchInsteadButton(discord.ui.Button):
    def __init__(self):
        super().__init__(
            label="Search for Music Instead",
            emoji="🔍",
            style=discord.ButtonStyle.secondary,
            custom_id="search_instead",
        )

    async def callback(self, interaction: discord.Interaction):
        await interaction.response.send_modal(AddMusicModal())


class WelcomeView(discord.ui.LayoutView):
    """Layout 2 — Welcome to Rythm: voice channel info + genre select + search button."""

    def __init__(self, member: discord.Member, voice_channel: Optional[discord.VoiceChannel] = None):
        super().__init__(timeout=300)

        if voice_channel:
            # User is in a voice channel — show connected state
            body = (
                f"**Connected to:** 🔊 {voice_channel.name}  •  started by @{member.display_name}\n\n"
                "**Choose your vibe**\n"
                "Select a genre to start playing music:"
            )
            footer = "Or use **/play** to search for specific songs"
        else:
            # User is not in a voice channel — prompt them to join
            guild = member.guild
            channels = [
                f"• 🔊 {ch.name}"
                for ch in guild.voice_channels
                if ch.permissions_for(guild.me).connect
            ][:5]
            ch_list = "\n".join(channels) if channels else "• No voice channels available"
            body = (
                "The best way to listen to music on Discord, let's get started\n\n"
                "**Join a Voice Channel**\n"
                "To get started, join a voice channel:\n"
                f"{ch_list}\n\n"
                "Once you join, this message will automatically update"
            )
            footer = "Or use **/play** to search for specific songs"

        # Build container
        card = discord.ui.Container(accent_color=COLOR)
        card.add_item(discord.ui.TextDisplay("## Welcome to Rythm"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(body))
        if not voice_channel:
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(f"-# {footer}"))
        self.add_item(card)

        if voice_channel:
            # Genre select menu
            select_container = discord.ui.Container(accent_color=0x2B2D31)
            select_container.add_item(discord.ui.ActionRow(GenreSelect()))
            select_container.add_item(discord.ui.ActionRow(SearchInsteadButton()))
            select_container.add_item(discord.ui.Separator())
            select_container.add_item(discord.ui.TextDisplay(f"-# {footer}"))
            self.add_item(select_container)


# ── Layout 1: Rythm Info Card ─────────────────────────────────────────────────

class InfoLayoutView(discord.ui.LayoutView):
    """Layout 1 — Rythm Info card: info embed + Get Started (blurple) + Add To Server + Support + Website."""

    def __init__(self, bot: commands.Bot):
        super().__init__(timeout=None)
        self.bot = bot
        prefix = config.PREFIX
        bot_id = bot.user.id if bot.user else 0
        invite = config.INVITE_URL or (
            f"https://discord.com/api/oauth2/authorize?client_id={bot_id}&permissions=8&scope=bot+applications.commands"
        )
        avatar_url = bot.user.display_avatar.url if bot.user else None

        desc = (
            f"Rythm is the easiest way to listen to music with your friends on Discord. "
            f"Use **/play** to add tracks to the queue & **/help** to see the list of all commands.\n\n"
            "**Features:**\n"
            "🎵 High-quality music streaming\n"
            "⚡ Easy-to-use commands\n"
            "🎛️ Optional no-command button system\n"
            "🕐 24/7 uptime"
        )

        # Info container with thumbnail
        card_children: list = [
            discord.ui.TextDisplay("## 🎵 Rythm Info"),
            discord.ui.Separator(),
        ]
        if avatar_url:
            card_children.append(discord.ui.Section(
                discord.ui.TextDisplay(desc),
                accessory=discord.ui.Thumbnail(media=avatar_url),
            ))
        else:
            card_children.append(discord.ui.TextDisplay(desc))

        if avatar_url:
            card_children.append(discord.ui.MediaGallery(
                discord.MediaGalleryItem(avatar_url)
            ))

        self.add_item(discord.ui.Container(*card_children, accent_color=COLOR))

        # Row 0: "Get Started" (blurple, interactive) + "Add To Server" (gray link)
        get_started = discord.ui.Button(
            label="Get Started",
            emoji="🎵",
            style=discord.ButtonStyle.primary,
            custom_id="info_get_started",
        )
        get_started.callback = self._get_started_cb

        row0 = discord.ui.ActionRow(
            get_started,
            discord.ui.Button(
                label="Add To Server",
                emoji="↗️",
                url=invite,
                style=discord.ButtonStyle.link,
            ),
        )
        self.add_item(row0)

        # Row 1: Support + Website (gray link buttons)
        row1_btns: list[discord.ui.Button] = []
        support_url = config.SUPPORT_URL
        if support_url and support_url != "https://discord.gg/your-invite-code":
            row1_btns.append(discord.ui.Button(
                label="Support",
                emoji="↗️",
                url=support_url,
                style=discord.ButtonStyle.link,
            ))
        website_url = config.SOURCE_CODE_URL
        if website_url and website_url != "https://github.com/":
            row1_btns.append(discord.ui.Button(
                label="Website",
                emoji="↗️",
                url=website_url,
                style=discord.ButtonStyle.link,
            ))

        # Always show both buttons (use invite as fallback if URLs not configured)
        if not row1_btns:
            row1_btns = [
                discord.ui.Button(
                    label="Support",
                    emoji="↗️",
                    url=invite,
                    style=discord.ButtonStyle.link,
                ),
                discord.ui.Button(
                    label="Website",
                    emoji="↗️",
                    url=invite,
                    style=discord.ButtonStyle.link,
                ),
            ]
        elif len(row1_btns) == 1:
            row1_btns.append(discord.ui.Button(
                label="Website",
                emoji="↗️",
                url=invite,
                style=discord.ButtonStyle.link,
            ))

        self.add_item(discord.ui.ActionRow(*row1_btns))

    async def _get_started_cb(self, interaction: discord.Interaction):
        member = interaction.user
        voice = getattr(member, "voice", None)
        voice_channel = voice.channel if voice else None

        welcome = WelcomeView(member, voice_channel)
        await interaction.response.send_message(view=welcome, ephemeral=True)


# ── Shim for bot.py ────────────────────────────────────────────────────────────

def info_embed(bot: commands.Bot) -> discord.Embed:
    prefix = config.PREFIX
    embed = discord.Embed(
        title="🎵 Rythm Info",
        description=(
            f"Rythm is the easiest way to listen to music. "
            f"Use **/play** to add tracks & **/help** for all commands."
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

    # ── Feature 1: Auto Welcome on Voice Join ──────────────────────────────────

    @commands.Cog.listener()
    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        # Only fire when a non-bot user joins a voice channel from no channel
        if member.bot:
            return
        if before.channel is not None or after.channel is None:
            return

        voice_channel = after.channel
        guild = member.guild

        # Pick the best text channel to post in:
        # 1) Guild system channel, 2) first writable text channel
        text_channel: Optional[discord.TextChannel] = None
        if guild.system_channel and guild.system_channel.permissions_for(guild.me).send_messages:
            text_channel = guild.system_channel
        else:
            for ch in guild.text_channels:
                if ch.permissions_for(guild.me).send_messages:
                    text_channel = ch
                    break

        if text_channel is None:
            return

        # Build the welcome layout matching the reference image
        body = (
            f"Connected to: 🔊 {voice_channel.name}  •  started by @{member.display_name}\n\n"
            "**Choose your vibe**\n"
            "Select a genre to start playing music:"
        )
        footer = "Or use **/play** to search for specific songs"

        card = discord.ui.Container(accent_color=COLOR)
        card.add_item(discord.ui.TextDisplay("## Welcome to Rythm"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(body))

        select_card = discord.ui.Container(accent_color=0x2B2D31)
        select_card.add_item(discord.ui.ActionRow(GenreSelect()))
        select_card.add_item(discord.ui.ActionRow(SearchInsteadButton()))
        select_card.add_item(discord.ui.Separator())
        select_card.add_item(discord.ui.TextDisplay(f"-# {footer}"))

        lv = discord.ui.LayoutView(timeout=600)
        lv.add_item(card)
        lv.add_item(select_card)

        try:
            await text_channel.send(view=lv)
        except discord.HTTPException:
            pass

    @commands.hybrid_command(name="help", description="Show the commands menu, or look up a specific command.")
    async def help(self, ctx: commands.Context, *, command: str = ""):
        if command:
            # Try direct lookup first, then search subcommands (e.g. "playlist create")
            cmd = self.bot.get_command(command)
            if not cmd:
                # Search group subcommands by qualified name or alias
                query = command.lower()
                for c in self.bot.walk_commands():
                    if c.qualified_name.lower() == query or query in [a.lower() for a in getattr(c, "aliases", [])]:
                        cmd = c
                        break

            if not cmd:
                return await v2.send(ctx, v2.err(f"No command named `{command}` found."))

            # Build usage string from parameters
            params = []
            for pname, param in cmd.clean_params.items():
                params.append(f"<{pname}>" if param.default is param.empty else f"[{pname}]")
            usage = f"`{config.PREFIX}{cmd.qualified_name}" + (f" {' '.join(params)}`" if params else "`")

            aliases = getattr(cmd, "aliases", [])
            aliases_str = ", ".join(f"`{a}`" for a in aliases) if aliases else "None"

            desc = cmd.help or getattr(cmd, "description", "") or "No description available."

            body = (
                f"**Description:**\n{desc}\n\n"
                f"**Usage:** {usage}\n\n"
                f"**Aliases:** {aliases_str}"
            )
            card = v2.container(body, header=f"❓ {cmd.qualified_name}")
            lv = discord.ui.LayoutView(timeout=None)
            lv.add_item(card)
            # Also add a "Back to Help" button
            back_btn = discord.ui.Button(label="← Back to Help", style=discord.ButtonStyle.secondary)
            async def _back(interaction: discord.Interaction):
                view = HelpView(self.bot, ctx.author.id)
                await interaction.response.edit_message(view=view)
            back_btn.callback = _back
            lv.add_item(discord.ui.ActionRow(back_btn))
            return await ctx.reply(view=lv, mention_author=False)

        help_view = HelpView(self.bot, ctx.author.id)
        await ctx.reply(view=help_view, mention_author=False)

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
