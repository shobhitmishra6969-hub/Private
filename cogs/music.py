"""Core music commands."""
from __future__ import annotations

import asyncio
import re
from typing import Optional

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from database.models import get_liked, set_liked, get_history, get_prefs, add_history
from events.player_events import NowPlayingView
from utils.checks import has_dj, is_premium
from utils.formatters import ms_to_time, clean_author, clean_thumbnail, progress_bar
import utils.v2 as v2

COLOR = config.COLOR
URL_RE = re.compile(r"https?://\S+")

SOURCE_MAP = {
    "ytsearch":   ravelink.TrackSource.YouTube,
    "ytmsearch":  ravelink.TrackSource.YouTubeMusic,
    "spsearch":   ravelink.TrackSource.Spotify,
    "scsearch":   ravelink.TrackSource.SoundCloud,
    "dzsearch":   ravelink.TrackSource.Deezer,
}


def get_player(ctx: commands.Context) -> ravelink.Player | None:
    vc = ctx.guild.voice_client if ctx.guild else None
    return vc if isinstance(vc, ravelink.Player) else None


async def ensure_player(ctx: commands.Context) -> ravelink.Player:
    player = get_player(ctx)
    if player:
        return player
    voice = getattr(ctx.author, "voice", None)
    if not voice or not voice.channel:
        raise commands.CommandError("You need to be in a voice channel first.")
    player = await voice.channel.connect(cls=ravelink.Player, self_deaf=True, reconnect=True)
    player._text_channel_id = ctx.channel.id
    player._np_message_id = None
    return player


async def voice_check(ctx: commands.Context) -> ravelink.Player:
    player = get_player(ctx)
    if not player:
        raise commands.CommandError("I'm not playing anything right now.")
    if not isinstance(ctx.author, discord.Member) or not ctx.author.voice:
        raise commands.CommandError("You need to be in a voice channel.")
    if ctx.author.voice.channel != player.channel:
        raise commands.CommandError("You need to be in my voice channel.")
    return player


async def do_search(query: str, source: str = "ytmsearch") -> ravelink.Playlist | list[ravelink.Playable] | None:
    is_url = bool(URL_RE.match(query))
    if is_url:
        return await ravelink.Playable.search(query)
    src = SOURCE_MAP.get(source, ravelink.TrackSource.YouTubeMusic)
    return await ravelink.Playable.search(query, source=src)


def _source_emoji(track: ravelink.Playable) -> str:
    """Pick a platform emoji from the track's URI or source name."""
    uri = (track.uri or "").lower()
    src = str(getattr(track, "source", "")).lower()
    if "spotify" in uri or "spotify" in src:
        return "<:spotify:1484500689722806453>"
    if "soundcloud" in uri or "soundcloud" in src:
        return "🟠"
    if "youtube" in uri or "youtu.be" in uri or "youtube" in src:
        return "<:Youtube:1484500601504006234>"
    return "🎵"


def _dur_fmt(ms: int) -> str:
    """Format milliseconds as 'Xm Ys' (matching the reference image style)."""
    total_sec = max(0, ms) // 1000
    h, rem = divmod(total_sec, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


# ── Track Added View ──────────────────────────────────────────────────────────

class TrackAddedView(discord.ui.LayoutView):
    """Green-accented 'Track Added' card with requester-only Play Now / Remove buttons."""

    ACCENT_GREEN = 0x1DB954
    ACCENT_RED   = 0xFF4444

    def __init__(
        self,
        track: ravelink.Playable,
        position: int,
        requester: discord.Member,
        guild: discord.Guild,
    ):
        super().__init__(timeout=300)
        self.track        = track
        self.position     = position
        self.requester_id = requester.id
        self._requester   = requester
        self.guild        = guild
        self._build_card()

    # ── build helpers ─────────────────────────────────────────────────────────

    def _requester_name(self) -> str:
        member = self.guild.get_member(self.requester_id)
        return member.display_name if member else self._requester.display_name

    def _track_line(self) -> str:
        src    = _source_emoji(self.track)
        artist = clean_author(self.track.author)
        title  = f"[{self.track.title}]({self.track.uri})" if self.track.uri else f"**{self.track.title}**"
        return f"{src} {title} by {artist} added to queue."

    def _meta_line(self) -> str:
        dur = _dur_fmt(self.track.length or 0)
        return f"Position #{self.position} • Duration: {dur} • By: {self._requester_name()}"

    def _build_card(self, *, title: str = "**Track Added**", accent: int = ACCENT_GREEN):
        self.clear_items()
        thumb = clean_thumbnail(self.track.artwork_url)

        card = discord.ui.Container(accent_color=accent)
        card.add_item(discord.ui.TextDisplay(title))
        card.add_item(discord.ui.Separator())

        body = f"{self._track_line()}\n-# {self._meta_line()}"
        if thumb:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=thumb),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))

        self.add_item(card)

        # Action buttons
        play_btn = discord.ui.Button(
            label="Play Now",
            emoji="▶️",
            style=discord.ButtonStyle.success,
            custom_id="ta_play_now",
        )
        play_btn.callback = self._play_now_cb

        remove_btn = discord.ui.Button(
            label="Remove",
            emoji="🗑️",
            style=discord.ButtonStyle.danger,
            custom_id="ta_remove",
        )
        remove_btn.callback = self._remove_cb

        self.add_item(discord.ui.ActionRow(play_btn, remove_btn))

    # ── internal helpers ──────────────────────────────────────────────────────

    def _get_player(self) -> ravelink.Player | None:
        vc = self.guild.voice_client
        return vc if isinstance(vc, ravelink.Player) else None

    def _find_queue_pos(self) -> int | None:
        """Return 1-based position of this track in the current queue, or None."""
        player = self._get_player()
        if not player:
            return None
        for i, t in enumerate(player.queue, 1):
            if self.track.uri and t.uri and t.uri == self.track.uri:
                return i
            if t.title == self.track.title:
                return i
        return None

    async def _deny(self, interaction: discord.Interaction) -> None:
        await interaction.response.send_message(
            "❌ You cannot manage this track because you did not request it!",
            ephemeral=True,
        )

    # ── button callbacks ──────────────────────────────────────────────────────

    async def _play_now_cb(self, interaction: discord.Interaction) -> None:
        if interaction.user.id != self.requester_id:
            return await self._deny(interaction)

        player = self._get_player()
        if not player:
            return await interaction.response.send_message(
                "❌ The bot is no longer in a voice channel.", ephemeral=True
            )

        pos = self._find_queue_pos()
        if pos is None:
            # Track might already be the currently playing one
            if player.current and (
                (self.track.uri and player.current.uri == self.track.uri)
                or player.current.title == self.track.title
            ):
                return await interaction.response.send_message(
                    "▶️ This track is already playing!", ephemeral=True
                )
            return await interaction.response.send_message(
                "❌ This track is no longer in the queue.", ephemeral=True
            )

        # Move this track to the front and play it immediately
        tracks = list(player.queue)
        target = tracks.pop(pos - 1)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)
        await player.play(target)

        # Update the card to "Now Playing" state (no buttons)
        thumb = clean_thumbnail(self.track.artwork_url)
        src   = _source_emoji(self.track)
        artist = clean_author(self.track.author)
        title_md = f"[{self.track.title}]({self.track.uri})" if self.track.uri else f"**{self.track.title}**"

        card = discord.ui.Container(accent_color=self.ACCENT_GREEN)
        card.add_item(discord.ui.TextDisplay("**▶️ Now Playing**"))
        card.add_item(discord.ui.Separator())
        body = f"{src} {title_md} by {artist} is now playing."
        if thumb:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=thumb),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))

        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(card)
        await interaction.response.edit_message(view=lv)
        self.stop()

    async def _remove_cb(self, interaction: discord.Interaction) -> None:
        if interaction.user.id != self.requester_id:
            return await self._deny(interaction)

        player = self._get_player()
        if not player:
            return await interaction.response.send_message(
                "❌ The bot is no longer in a voice channel.", ephemeral=True
            )

        pos = self._find_queue_pos()
        if pos is None:
            return await interaction.response.send_message(
                "❌ This track is no longer in the queue (already playing or removed).",
                ephemeral=True,
            )

        tracks = list(player.queue)
        tracks.pop(pos - 1)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)

        # Update the card to "removed" state (no buttons)
        thumb = clean_thumbnail(self.track.artwork_url)
        src   = _source_emoji(self.track)
        artist = clean_author(self.track.author)
        title_md = f"[{self.track.title}]({self.track.uri})" if self.track.uri else f"**{self.track.title}**"

        card = discord.ui.Container(accent_color=self.ACCENT_RED)
        card.add_item(discord.ui.TextDisplay("**Track Removed**"))
        card.add_item(discord.ui.Separator())
        body = f"{src} {title_md} by {artist} was removed from the queue."
        if thumb:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=thumb),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))

        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(card)
        await interaction.response.edit_message(view=lv)
        self.stop()


class QueueLayoutView(discord.ui.LayoutView):
    def __init__(self, tracks: list, current_track=None, per_page: int = 10):
        super().__init__(timeout=60)
        self.tracks = tracks
        self.current_track = current_track
        self.per_page = per_page
        self.page = 0
        self.max_page = max(0, (len(tracks) - 1) // per_page)
        self._build()

    def _build(self):
        self.clear_items()
        self.add_item(self._make_container())
        prev_btn = discord.ui.Button(
            label="◀", style=discord.ButtonStyle.secondary, disabled=self.page == 0
        )
        prev_btn.callback = self._prev_cb
        next_btn = discord.ui.Button(
            label="▶", style=discord.ButtonStyle.secondary, disabled=self.page >= self.max_page
        )
        next_btn.callback = self._next_cb
        self.add_item(discord.ui.ActionRow(prev_btn, next_btn))

    def _make_container(self) -> discord.ui.Container:
        start = self.page * self.per_page
        slice_ = self.tracks[start: start + self.per_page]
        lines = []
        for i, t in enumerate(slice_, start=start + 1):
            dur = ms_to_time(t.length or 0)
            lines.append(f"`{i}.` **{t.title[:45]}** — {clean_author(t.author)} `[{dur}]`")
        body = "\n".join(lines) if lines else "Queue is empty."

        children: list = [discord.ui.TextDisplay("## 📋 Queue")]
        children.append(discord.ui.Separator())
        if self.current_track:
            ct = self.current_track
            children.append(discord.ui.TextDisplay(
                f"🎧 **Now Playing:** {ct.title} — {clean_author(ct.author)} `[{ms_to_time(ct.length or 0)}]`"
            ))
            children.append(discord.ui.Separator())
        children.append(discord.ui.TextDisplay(body))
        children.append(discord.ui.Separator())
        children.append(discord.ui.TextDisplay(
            f"-# Page {self.page + 1}/{self.max_page + 1} • {len(self.tracks)} tracks"
        ))
        return discord.ui.Container(*children, accent_color=COLOR)

    async def _prev_cb(self, interaction: discord.Interaction):
        if self.page > 0:
            self.page -= 1
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if self.page < self.max_page:
            self.page += 1
        self._build()
        await interaction.response.edit_message(view=self)


class MusicCog(commands.Cog, name="Music"):

    def __init__(self, bot):
        self.bot = bot

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _send_queued(
        self,
        ctx: commands.Context,
        track: ravelink.Playable,
        position: int,
    ):
        """Send the Track Added card with Play Now / Remove buttons."""
        if not ctx.guild or not isinstance(ctx.author, discord.Member):
            # Fallback for DM context (shouldn't normally occur)
            dur = ms_to_time(track.length or 0)
            thumb = clean_thumbnail(track.artwork_url)
            body = (
                f"**[{track.title}]({track.uri})**\n"
                f"👤 {clean_author(track.author)} • ⏱ `{dur}` • 📋 Position **#{position}**"
            )
            return await v2.send(ctx, v2.container(body, header="🎵 Track Queued", thumbnail_url=thumb or None))

        view = TrackAddedView(track, position, ctx.author, ctx.guild)

        if ctx.interaction and ctx.interaction.response.is_done():
            await ctx.interaction.followup.send(view=view)
        elif ctx.interaction:
            await ctx.interaction.followup.send(view=view)
        else:
            await ctx.reply(view=view, mention_author=False)

    # ── play ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="play", aliases=["p"], description="Play a song or playlist.")
    async def play(self, ctx: commands.Context, *, query: str):
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await v2.send(ctx, v2.err("Join a voice channel first."))

        player = get_player(ctx)
        if player and player.channel != voice.channel:
            return await v2.send(ctx, v2.err("I'm already in a different voice channel."))

        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()

        try:
            player = await ensure_player(ctx)
        except Exception as e:
            return await v2.send(ctx, v2.err(str(e)))

        player._text_channel_id = ctx.channel.id

        prefs = await get_prefs(ctx.author.id)
        source = prefs["musicSource"] if prefs and prefs["musicSource"] else config.NODE_SOURCE

        try:
            results = await do_search(query, source)
        except Exception:
            results = None

        if not results:
            return await v2.send(ctx, v2.err("No results found for that query."))

        requester_extras = {
            "requester_id": ctx.author.id,
            "requester_name": ctx.author.display_name,
        }

        if isinstance(results, ravelink.Playlist):
            for track in results.tracks:
                track.extras = requester_extras
                await player.queue.put_wait(track)
            if not player.playing:
                try:
                    next_t = player.queue.get()
                    await player.play(next_t)
                except ravelink.QueueEmpty:
                    pass
            return await v2.send(ctx, v2.container(
                f"**{results.name}**\n📋 Added **{len(results.tracks)}** tracks to the queue.",
                header="✅ Playlist Queued",
            ))

        track = results[0]
        track.extras = requester_extras
        pos_in_queue = len(player.queue) + 1
        await player.queue.put_wait(track)
        if not player.playing:
            try:
                next_t = player.queue.get()
                await player.play(next_t)
            except ravelink.QueueEmpty:
                pass
        await self._send_queued(ctx, track, pos_in_queue)

    # ── search ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="search", description="Search and pick a track interactively.")
    async def search(self, ctx: commands.Context, *, query: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()

        prefs = await get_prefs(ctx.author.id)
        source = prefs["musicSource"] if prefs and prefs["musicSource"] else config.NODE_SOURCE
        results = await do_search(query, source)
        if not results or isinstance(results, ravelink.Playlist):
            return await v2.send(ctx, v2.err("No results found."))

        tracks = results[:10]
        lines = "\n".join(
            f"`{i}.` **{t.title[:50]}** — {clean_author(t.author)} `[{ms_to_time(t.length or 0)}]`"
            for i, t in enumerate(tracks, 1)
        )
        await v2.send(ctx, v2.container(
            lines,
            header="🔍 Search Results",
            footer="Reply with a number 1–10 within 30s, or type 'cancel'.",
        ))

        def check(m: discord.Message):
            return (
                m.author == ctx.author
                and m.channel == ctx.channel
                and (m.content.isdigit() or m.content.lower() == "cancel")
            )

        try:
            reply = await self.bot.wait_for("message", timeout=30.0, check=check)
        except asyncio.TimeoutError:
            return

        if reply.content.lower() == "cancel":
            return

        idx = int(reply.content) - 1
        if idx < 0 or idx >= len(tracks):
            return await v2.send(ctx, v2.err("Invalid number."))

        track = tracks[idx]
        await ctx.invoke(self.play, query=track.uri or track.title)

    # ── skip ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="skip", aliases=["s"], description="Skip the current track.")
    async def skip(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        skipped = player.current.title
        await player.skip()
        await v2.send(ctx, v2.container(f"⏭️ Skipped **{skipped}**"))

    @commands.hybrid_command(name="forceskip", aliases=["fs"], description="Force skip (bypasses votes).")
    async def forceskip(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        title = player.current.title
        await player.skip()
        await v2.send(ctx, v2.container(f"⏭️ Force-skipped **{title}**"))

    @commands.hybrid_command(name="skipto", description="Skip to a specific position in the queue.")
    async def skipto(self, ctx: commands.Context, position: int):
        player = await voice_check(ctx)
        q = list(player.queue)
        if position < 1 or position > len(q):
            return await v2.send(ctx, v2.err(f"Invalid position. Queue has {len(q)} tracks."))
        player.queue.reset()
        target = q[position - 1]
        for t in q[position:]:
            await player.queue.put_wait(t)
        await player.play(target)
        await v2.send(ctx, v2.container(f"⏭️ Skipped to **{target.title}**"))

    # ── pause / resume ────────────────────────────────────────────────────────

    @commands.hybrid_command(name="pause", description="Pause playback.")
    async def pause(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if player.paused:
            return await v2.send(ctx, v2.err("Already paused."))
        await player.pause(True)
        await v2.send(ctx, v2.container("⏸️ Paused."))

    @commands.hybrid_command(name="resume", aliases=["r"], description="Resume playback.")
    async def resume(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.paused:
            return await v2.send(ctx, v2.err("Not paused."))
        await player.pause(False)
        await v2.send(ctx, v2.container("▶️ Resumed."))

    # ── stop ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, ctx: commands.Context):
        player = await voice_check(ctx)
        player.queue.reset()
        await player.stop()
        await v2.send(ctx, v2.container("⏹️ Stopped and cleared the queue."))

    # ── leave / join ──────────────────────────────────────────────────────────

    @commands.hybrid_command(name="leave", aliases=["dc", "disconnect"], description="Leave the voice channel.")
    async def leave(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player:
            return await v2.send(ctx, v2.err("I'm not in a voice channel."))
        player.queue.reset()
        await player.disconnect()
        await v2.send(ctx, v2.container("👋 Disconnected."))

    @commands.hybrid_command(name="join", description="Join your voice channel.")
    async def join(self, ctx: commands.Context):
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await v2.send(ctx, v2.err("Join a voice channel first."))
        player = get_player(ctx)
        if player:
            if player.channel == voice.channel:
                return await v2.send(ctx, v2.err("Already in your channel."))
            await player.disconnect()
        p = await voice.channel.connect(cls=ravelink.Player, self_deaf=True, reconnect=True)
        p._text_channel_id = ctx.channel.id
        p._np_message_id = None
        await v2.send(ctx, v2.container(f"🔊 Joined **{voice.channel.name}**"))

    # ── volume ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="volume", aliases=["vol"], description="Set or view the volume.")
    async def volume(self, ctx: commands.Context, level: Optional[int] = None):
        player = await voice_check(ctx)
        if level is None:
            return await v2.send(ctx, v2.container(f"🔊 Current volume: **{player.volume}%**"))
        if not 0 <= level <= 200:
            return await v2.send(ctx, v2.err("Volume must be between 0 and 200."))
        await player.set_volume(level)
        await v2.send(ctx, v2.container(f"🔊 Volume set to **{level}%**"))

    # ── loop ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="loop", description="Set loop mode: off / track / queue")
    async def loop(self, ctx: commands.Context, mode: str = ""):
        player = await voice_check(ctx)
        mode = mode.lower()
        if mode in ("track", "song", "current"):
            player.queue.mode = ravelink.QueueMode.loop
            txt = "🔂 Loop: **Track**"
        elif mode in ("queue", "all", "q"):
            player.queue.mode = ravelink.QueueMode.loop_all
            txt = "🔁 Loop: **Queue**"
        elif mode in ("off", "none", "disable"):
            player.queue.mode = ravelink.QueueMode.normal
            txt = "▶️ Loop: **Off**"
        else:
            current = player.queue.mode
            if current == ravelink.QueueMode.normal:
                player.queue.mode = ravelink.QueueMode.loop
                txt = "🔂 Loop: **Track**"
            elif current == ravelink.QueueMode.loop:
                player.queue.mode = ravelink.QueueMode.loop_all
                txt = "🔁 Loop: **Queue**"
            else:
                player.queue.mode = ravelink.QueueMode.normal
                txt = "▶️ Loop: **Off**"
        await v2.send(ctx, v2.container(txt))

    # ── shuffle ───────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if len(player.queue) < 2:
            return await v2.send(ctx, v2.err("Need at least 2 songs in queue to shuffle."))
        player.queue.shuffle()
        await v2.send(ctx, v2.container("🔀 Queue shuffled!"))

    # ── seek ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="seek", description="Seek to a position (e.g. 1:30).")
    async def seek(self, ctx: commands.Context, position: str):
        player = await voice_check(ctx)
        from utils.formatters import time_to_ms
        ms = time_to_ms(position)
        await player.seek(ms)
        await v2.send(ctx, v2.container(f"⏩ Seeked to `{position}`"))

    @commands.hybrid_command(name="forward", description="Forward by N seconds.")
    async def forward(self, ctx: commands.Context, seconds: int = 10):
        player = await voice_check(ctx)
        new_pos = min((player.position or 0) + seconds * 1000, (player.current.length or 0) - 1000)
        await player.seek(int(new_pos))
        await v2.send(ctx, v2.container(f"⏩ Forwarded **{seconds}s**"))

    @commands.hybrid_command(name="rewind", description="Rewind by N seconds.")
    async def rewind(self, ctx: commands.Context, seconds: int = 10):
        player = await voice_check(ctx)
        new_pos = max((player.position or 0) - seconds * 1000, 0)
        await player.seek(int(new_pos))
        await v2.send(ctx, v2.container(f"⏪ Rewound **{seconds}s**"))

    # ── queue ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="queue", aliases=["q"], description="View the queue.")
    async def queue(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        tracks = list(player.queue)
        view = QueueLayoutView(tracks, current_track=player.current)
        await ctx.reply(view=view, mention_author=False)

    # ── nowplaying ────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="nowplaying", aliases=["np"], description="Show the current song.")
    async def nowplaying(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player or not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing right now."))
        np_view = NowPlayingView(player)
        await ctx.reply(view=np_view, mention_author=False)

    # ── move ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="move", description="Move a track from one position to another.")
    async def move(self, ctx: commands.Context, from_pos: int, to_pos: int):
        player = await voice_check(ctx)
        tracks = list(player.queue)
        if from_pos < 1 or from_pos > len(tracks) or to_pos < 1 or to_pos > len(tracks):
            return await v2.send(ctx, v2.err(f"Position out of range. Queue has {len(tracks)} tracks."))
        track = tracks.pop(from_pos - 1)
        tracks.insert(to_pos - 1, track)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)
        await v2.send(ctx, v2.container(f"↕️ Moved **{track.title}** to position **{to_pos}**."))

    # ── remove ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="remove", description="Remove a track from the queue.")
    async def remove(self, ctx: commands.Context, position: int):
        player = await voice_check(ctx)
        tracks = list(player.queue)
        if position < 1 or position > len(tracks):
            return await v2.send(ctx, v2.err("Invalid position."))
        removed = tracks.pop(position - 1)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)
        await v2.send(ctx, v2.container(f"🗑️ Removed **{removed.title}**"))

    # ── clear ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="clear", description="Clear the queue.")
    async def clear(self, ctx: commands.Context):
        player = await voice_check(ctx)
        player.queue.reset()
        await v2.send(ctx, v2.container("🧹 Queue cleared."))

    # ── replay ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="replay", description="Replay the current track from the start.")
    async def replay(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        await player.seek(0)
        await v2.send(ctx, v2.container("🔄 Replaying from the start."))

    # ── previous ──────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="previous", aliases=["prev"], description="Play the previous track.")
    async def previous(self, ctx: commands.Context):
        player = await voice_check(ctx)
        history = await get_history(ctx.author.id)
        if len(history) < 2:
            return await v2.send(ctx, v2.err("No previous track in history."))
        prev = history[-2]
        uri = prev.get("uri")
        if not uri:
            return await v2.send(ctx, v2.err("Could not find the previous track."))
        results = await ravelink.Playable.search(uri)
        if not results:
            return await v2.send(ctx, v2.err("Could not load the previous track."))
        track = results[0] if not isinstance(results, ravelink.Playlist) else results.tracks[0]
        track.extras = {"requester_id": ctx.author.id, "requester_name": ctx.author.display_name}
        player.queue.reset()
        await player.queue.put_wait(track)
        await player.skip()
        await v2.send(ctx, v2.container(f"⏮️ Playing previous: **{track.title}**"))

    # ── history ───────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="history", aliases=["hist", "recent"], description="View your recently played tracks.")
    async def history(self, ctx: commands.Context):
        history = await get_history(ctx.author.id)
        if not history:
            return await v2.send(ctx, v2.info("No listening history yet."))
        recent = list(reversed(history[-10:]))
        lines = "\n".join(
            f"`{i}.` **{t['title'][:45]}** — {t.get('author', 'Unknown')[:25]}"
            for i, t in enumerate(recent, 1)
        )
        await v2.send(ctx, v2.container(lines, header="🕐 Listening History", footer=f"Last {len(recent)} tracks"))

    # ── autoplay ──────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="autoplay", aliases=["ap"], description="Toggle autoplay for related tracks.")
    async def autoplay(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if player.autoplay == ravelink.AutoPlayMode.enabled:
            player.autoplay = ravelink.AutoPlayMode.disabled
            await v2.send(ctx, v2.container("🎵 Autoplay **disabled**."))
        else:
            player.autoplay = ravelink.AutoPlayMode.enabled
            await v2.send(ctx, v2.container("🎵 Autoplay **enabled**."))

    # ── grab / save ───────────────────────────────────────────────────────────

    @commands.hybrid_command(name="grab", aliases=["save"], description="Save the current track to your DMs.")
    async def grab(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player or not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        t = player.current
        embed = discord.Embed(
            title=f"🎵 {t.title}",
            description=f"👤 {clean_author(t.author)}\n⏱ `{ms_to_time(t.length or 0)}`\n🔗 [Listen]({t.uri})",
            color=COLOR,
        )
        thumb = clean_thumbnail(t.artwork_url)
        if thumb:
            embed.set_thumbnail(url=thumb)
        try:
            await ctx.author.send(embed=embed)
            await v2.send(ctx, v2.ok("Track saved to your DMs!"))
        except discord.Forbidden:
            await v2.send(ctx, v2.err("I couldn't DM you. Check your privacy settings."))

    # ── sleep ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="sleep", description="Set a timer to stop playback (e.g. 30m, 1h).")
    async def sleep(self, ctx: commands.Context, duration: str):
        multipliers = {"s": 1, "m": 60, "h": 3600}
        unit = duration[-1].lower()
        try:
            amount = int(duration[:-1])
            seconds = amount * multipliers.get(unit, 60)
        except ValueError:
            return await v2.send(ctx, v2.err("Invalid duration. Example: `30m`, `1h`"))

        player = await voice_check(ctx)
        await v2.send(ctx, v2.ok(f"⏰ Stopping playback in **{duration}**."))

        await asyncio.sleep(seconds)
        if player and player.is_connected():
            player.queue.reset()
            await player.stop()
            await player.disconnect()


async def setup(bot):
    await bot.add_cog(MusicCog(bot))
