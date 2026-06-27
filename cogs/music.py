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
from events.player_events import build_np_embed, NowPlayingView
from utils.checks import has_dj, is_premium
from utils.formatters import ms_to_time, clean_author, clean_thumbnail, progress_bar

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


class QueuePages(discord.ui.View):
    def __init__(self, tracks: list, title: str = "Queue", per_page: int = 10):
        super().__init__(timeout=60)
        self.tracks = tracks
        self.title = title
        self.per_page = per_page
        self.page = 0
        self.max_page = max(0, (len(tracks) - 1) // per_page)

    def make_embed(self, current_track=None, total_dur=0) -> discord.Embed:
        start = self.page * self.per_page
        slice_ = self.tracks[start: start + self.per_page]
        lines = []
        for i, t in enumerate(slice_, start=start + 1):
            dur = ms_to_time(t.length or 0)
            lines.append(f"`{i}.` **{t.title[:45]}** — {clean_author(t.author)} `[{dur}]`")
        desc = "\n".join(lines) if lines else "Queue is empty."

        embed = discord.Embed(title=self.title, description=desc, color=COLOR)
        if current_track:
            ct = current_track
            embed.add_field(
                name="🎧 Now Playing",
                value=f"**{ct.title}** — {clean_author(ct.author)} `[{ms_to_time(ct.length or 0)}]`",
                inline=False
            )
        embed.set_footer(text=f"Page {self.page + 1}/{self.max_page + 1} • {len(self.tracks)} tracks")
        return embed

    @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary)
    async def prev(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page > 0:
            self.page -= 1
        await interaction.response.edit_message(embed=self.make_embed(), view=self)

    @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary)
    async def next_(self, interaction: discord.Interaction, button: discord.ui.Button):
        if self.page < self.max_page:
            self.page += 1
        await interaction.response.edit_message(embed=self.make_embed(), view=self)


class MusicCog(commands.Cog, name="Music"):

    def __init__(self, bot):
        self.bot = bot

    # ── helpers ───────────────────────────────────────────────────────────────

    async def _send_queued(self, ctx: commands.Context, track: ravelink.Playable, position: int):
        dur = ms_to_time(track.length or 0)
        thumb = clean_thumbnail(track.artwork_url)
        embed = discord.Embed(color=COLOR)
        embed.set_author(name="🎵 Track Queued")
        embed.description = (
            f"**[{track.title}]({track.uri})**\n"
            f"👤 {clean_author(track.author)} • ⏱ `{dur}`\n"
            f"📋 Position: **#{position}**"
        )
        if thumb:
            embed.set_thumbnail(url=thumb)
        await ctx.reply(embed=embed, mention_author=False)

    # ── play ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="play", aliases=["p"], description="Play a song or playlist.")
    async def play(self, ctx: commands.Context, *, query: str):
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await ctx.reply(embed=self.bot.err("Join a voice channel first."), mention_author=False)

        player = get_player(ctx)
        if player and player.channel != voice.channel:
            return await ctx.reply(embed=self.bot.err("I'm already in a different voice channel."), mention_author=False)

        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()

        try:
            player = await ensure_player(ctx)
        except Exception as e:
            return await ctx.reply(embed=self.bot.err(str(e)), mention_author=False)

        player._text_channel_id = ctx.channel.id

        prefs = await get_prefs(ctx.author.id)
        source = prefs["musicSource"] if prefs and prefs["musicSource"] else config.NODE_SOURCE

        try:
            results = await do_search(query, source)
        except Exception:
            results = None

        if not results:
            return await ctx.reply(embed=self.bot.err("No results found for that query."), mention_author=False)

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

            embed = discord.Embed(color=COLOR)
            embed.set_author(name=f"{E.check} Playlist Queued")
            embed.description = (
                f"**{results.name}**\n"
                f"📋 Added **{len(results.tracks)}** tracks to the queue."
            )
            return await ctx.reply(embed=embed, mention_author=False)

        track = results[0]
        track.extras = requester_extras

        pos_in_queue = len(player.queue) + 1
        is_first = not player.playing and pos_in_queue == 1

        await player.queue.put_wait(track)

        if not player.playing:
            try:
                next_t = player.queue.get()
                await player.play(next_t)
            except ravelink.QueueEmpty:
                pass
            return

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
            return await ctx.reply(embed=self.bot.err("No results found."), mention_author=False)

        tracks = results[:10]

        desc = "\n".join(
            f"`{i}.` **{t.title[:50]}** — {clean_author(t.author)} `[{ms_to_time(t.length or 0)}]`"
            for i, t in enumerate(tracks, 1)
        )
        embed = discord.Embed(title="🔍 Search Results", description=desc, color=COLOR)
        embed.set_footer(text="Reply with a number 1–10 within 30s, or type 'cancel'.")
        msg = await ctx.reply(embed=embed, mention_author=False)

        def check(m: discord.Message):
            return (
                m.author == ctx.author
                and m.channel == ctx.channel
                and (m.content.isdigit() or m.content.lower() == "cancel")
            )

        try:
            reply = await self.bot.wait_for("message", timeout=30.0, check=check)
        except asyncio.TimeoutError:
            await msg.delete()
            return

        if reply.content.lower() == "cancel":
            await msg.delete()
            return

        idx = int(reply.content) - 1
        if idx < 0 or idx >= len(tracks):
            return await ctx.reply(embed=self.bot.err("Invalid number."), mention_author=False)

        track = tracks[idx]
        ctx2 = ctx
        await ctx2.invoke(self.play, query=track.uri or track.title)

    # ── skip ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="skip", aliases=["s"], description="Skip the current track.")
    async def skip(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        skipped = player.current.title
        await player.skip()
        embed = discord.Embed(description=f"⏭️ Skipped **{skipped}**", color=COLOR)
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_command(name="forceskip", aliases=["fs"], description="Force skip (bypasses votes).")
    async def forceskip(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        title = player.current.title
        await player.skip()
        await ctx.reply(embed=discord.Embed(description=f"⏭️ Force-skipped **{title}**", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="skipto", description="Skip to a specific position in the queue.")
    async def skipto(self, ctx: commands.Context, position: int):
        player = await voice_check(ctx)
        q = list(player.queue)
        if position < 1 or position > len(q):
            return await ctx.reply(embed=self.bot.err(f"Invalid position. Queue has {len(q)} tracks."), mention_author=False)
        player.queue.reset()
        target = q[position - 1]
        for t in q[position:]:
            await player.queue.put_wait(t)
        await player.play(target)
        await ctx.reply(embed=discord.Embed(description=f"⏭️ Skipped to **{target.title}**", color=COLOR), mention_author=False)

    # ── pause / resume ────────────────────────────────────────────────────────

    @commands.hybrid_command(name="pause", description="Pause playback.")
    async def pause(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if player.paused:
            return await ctx.reply(embed=self.bot.err("Already paused."), mention_author=False)
        await player.pause(True)
        await ctx.reply(embed=discord.Embed(description=f"⏸️ Paused.", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="resume", aliases=["r"], description="Resume playback.")
    async def resume(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.paused:
            return await ctx.reply(embed=self.bot.err("Not paused."), mention_author=False)
        await player.pause(False)
        await ctx.reply(embed=discord.Embed(description=f"▶️ Resumed.", color=COLOR), mention_author=False)

    # ── stop ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="stop", description="Stop playback and clear the queue.")
    async def stop(self, ctx: commands.Context):
        player = await voice_check(ctx)
        player.queue.reset()
        await player.stop()
        await ctx.reply(embed=discord.Embed(description="⏹️ Stopped and cleared the queue.", color=COLOR), mention_author=False)

    # ── leave / join ──────────────────────────────────────────────────────────

    @commands.hybrid_command(name="leave", aliases=["dc", "disconnect"], description="Leave the voice channel.")
    async def leave(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player:
            return await ctx.reply(embed=self.bot.err("I'm not in a voice channel."), mention_author=False)
        player.queue.reset()
        await player.disconnect()
        await ctx.reply(embed=discord.Embed(description="👋 Disconnected.", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="join", description="Join your voice channel.")
    async def join(self, ctx: commands.Context):
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await ctx.reply(embed=self.bot.err("Join a voice channel first."), mention_author=False)
        player = get_player(ctx)
        if player:
            if player.channel == voice.channel:
                return await ctx.reply(embed=self.bot.err("Already in your channel."), mention_author=False)
            await player.disconnect()
        p = await voice.channel.connect(cls=ravelink.Player, self_deaf=True, reconnect=True)
        p._text_channel_id = ctx.channel.id
        p._np_message_id = None
        await ctx.reply(embed=discord.Embed(description=f"🔊 Joined **{voice.channel.name}**", color=COLOR), mention_author=False)

    # ── volume ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="volume", aliases=["vol"], description="Set or view the volume.")
    async def volume(self, ctx: commands.Context, level: Optional[int] = None):
        player = await voice_check(ctx)
        if level is None:
            return await ctx.reply(embed=discord.Embed(description=f"🔊 Current volume: **{player.volume}%**", color=COLOR), mention_author=False)
        if not 0 <= level <= 200:
            return await ctx.reply(embed=self.bot.err("Volume must be between 0 and 200."), mention_author=False)
        await player.set_volume(level)
        await ctx.reply(embed=discord.Embed(description=f"🔊 Volume set to **{level}%**", color=COLOR), mention_author=False)

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
        await ctx.reply(embed=discord.Embed(description=txt, color=COLOR), mention_author=False)

    # ── shuffle ───────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="shuffle", description="Shuffle the queue.")
    async def shuffle(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if len(player.queue) < 2:
            return await ctx.reply(embed=self.bot.err("Need at least 2 songs in queue to shuffle."), mention_author=False)
        player.queue.shuffle()
        await ctx.reply(embed=discord.Embed(description="🔀 Queue shuffled!", color=COLOR), mention_author=False)

    # ── seek ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="seek", description="Seek to a position (e.g. 1:30).")
    async def seek(self, ctx: commands.Context, position: str):
        player = await voice_check(ctx)
        from utils.formatters import time_to_ms
        ms = time_to_ms(position)
        await player.seek(ms)
        await ctx.reply(embed=discord.Embed(description=f"⏩ Seeked to `{position}`", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="forward", description="Forward by N seconds.")
    async def forward(self, ctx: commands.Context, seconds: int = 10):
        player = await voice_check(ctx)
        new_pos = min((player.position or 0) + seconds * 1000, (player.current.length or 0) - 1000)
        await player.seek(int(new_pos))
        await ctx.reply(embed=discord.Embed(description=f"⏩ Forwarded **{seconds}s**", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="rewind", description="Rewind by N seconds.")
    async def rewind(self, ctx: commands.Context, seconds: int = 10):
        player = await voice_check(ctx)
        new_pos = max((player.position or 0) - seconds * 1000, 0)
        await player.seek(int(new_pos))
        await ctx.reply(embed=discord.Embed(description=f"⏪ Rewound **{seconds}s**", color=COLOR), mention_author=False)

    # ── queue ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="queue", aliases=["q"], description="View the queue.")
    async def queue(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)

        tracks = list(player.queue)
        view = QueuePages(tracks)
        embed = view.make_embed(current_track=player.current)
        await ctx.reply(embed=embed, view=view, mention_author=False)

    # ── nowplaying ────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="nowplaying", aliases=["np"], description="Show the current song.")
    async def nowplaying(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player or not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing right now."), mention_author=False)
        embed = build_np_embed(player.current, player)
        view = NowPlayingView(player)
        await ctx.reply(embed=embed, view=view, mention_author=False)

    # ── move ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="move", description="Move a track from one position to another.")
    async def move(self, ctx: commands.Context, from_pos: int, to_pos: int):
        player = await voice_check(ctx)
        tracks = list(player.queue)
        if from_pos < 1 or from_pos > len(tracks) or to_pos < 1 or to_pos > len(tracks):
            return await ctx.reply(embed=self.bot.err(f"Position out of range. Queue has {len(tracks)} tracks."), mention_author=False)
        track = tracks.pop(from_pos - 1)
        tracks.insert(to_pos - 1, track)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)
        await ctx.reply(embed=discord.Embed(description=f"↕️ Moved **{track.title}** to position **{to_pos}**.", color=COLOR), mention_author=False)

    # ── remove ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="remove", description="Remove a track from the queue.")
    async def remove(self, ctx: commands.Context, position: int):
        player = await voice_check(ctx)
        tracks = list(player.queue)
        if position < 1 or position > len(tracks):
            return await ctx.reply(embed=self.bot.err(f"Invalid position."), mention_author=False)
        removed = tracks.pop(position - 1)
        player.queue.reset()
        for t in tracks:
            await player.queue.put_wait(t)
        await ctx.reply(embed=discord.Embed(description=f"🗑️ Removed **{removed.title}**", color=COLOR), mention_author=False)

    # ── clear ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="clear", description="Clear the queue.")
    async def clear(self, ctx: commands.Context):
        player = await voice_check(ctx)
        player.queue.reset()
        await ctx.reply(embed=discord.Embed(description="🧹 Queue cleared.", color=COLOR), mention_author=False)

    # ── replay ────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="replay", description="Replay the current track.")
    async def replay(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        await player.seek(0)
        await ctx.reply(embed=discord.Embed(description="🔄 Replaying current track.", color=COLOR), mention_author=False)

    # ── previous ──────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="previous", aliases=["prev"], description="Play the previous track.")
    async def previous(self, ctx: commands.Context):
        player = await voice_check(ctx)
        hist = getattr(player, "_history", [])
        if not hist:
            return await ctx.reply(embed=self.bot.err("No previous track in history."), mention_author=False)
        prev_track = hist[-1]
        if player.current:
            player.queue._queue.insert(0, player.current) if hasattr(player.queue, "_queue") else None
        await player.play(prev_track)
        await ctx.reply(embed=discord.Embed(description=f"⏮️ Playing previous: **{prev_track.title}**", color=COLOR), mention_author=False)

    # ── grab ──────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="grab", description="DM yourself the current song info.")
    async def grab(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player or not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        t = player.current
        embed = discord.Embed(
            title="🎵 Grabbed Track",
            description=f"**[{t.title}]({t.uri})**\nby {clean_author(t.author)}\n⏱ `{ms_to_time(t.length or 0)}`",
            color=COLOR
        )
        thumb = clean_thumbnail(t.artwork_url)
        if thumb:
            embed.set_thumbnail(url=thumb)
        try:
            await ctx.author.send(embed=embed)
            await ctx.reply(embed=self.bot.ok("📌 Sent song info to your DMs!"), mention_author=False)
        except discord.Forbidden:
            await ctx.reply(embed=self.bot.err("I can't DM you. Enable DMs from server members."), mention_author=False)

    # ── history ───────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="history", description="View your listening history.")
    async def history(self, ctx: commands.Context):
        rows = await get_history(ctx.author.id, 15)
        if not rows:
            return await ctx.reply(embed=self.bot.info_embed("No listening history yet."), mention_author=False)
        desc = "\n".join(
            f"`{i}.` **{r['title'][:40]}** — {r['author'][:25]} `[{ms_to_time(r['duration'] or 0)}]`"
            for i, r in enumerate(rows, 1)
        )
        embed = discord.Embed(title="📜 Listening History", description=desc, color=COLOR)
        embed.set_footer(text=f"Showing last {len(rows)} tracks")
        await ctx.reply(embed=embed, mention_author=False)

    # ── autoplay ──────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="autoplay", description="Toggle autoplay mode.")
    async def autoplay(self, ctx: commands.Context, mode: str = ""):
        player = await voice_check(ctx)
        mode = mode.lower()
        if mode in ("on", "enable", "enabled"):
            player.autoplay = ravelink.AutoPlayMode.enabled
            txt = "🤖 Autoplay: **Enabled**"
        elif mode in ("off", "disable", "disabled"):
            player.autoplay = ravelink.AutoPlayMode.disabled
            txt = "🤖 Autoplay: **Disabled**"
        else:
            if player.autoplay == ravelink.AutoPlayMode.disabled:
                player.autoplay = ravelink.AutoPlayMode.enabled
                txt = "🤖 Autoplay: **Enabled**"
            else:
                player.autoplay = ravelink.AutoPlayMode.disabled
                txt = "🤖 Autoplay: **Disabled**"
        await ctx.reply(embed=discord.Embed(description=txt, color=COLOR), mention_author=False)

    # ── speed ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="speed", description="Set playback speed (0.25–3.0).")
    async def speed(self, ctx: commands.Context, speed: float):
        player = await voice_check(ctx)
        if not 0.25 <= speed <= 3.0:
            return await ctx.reply(embed=self.bot.err("Speed must be between 0.25 and 3.0."), mention_author=False)
        filters = player.filters
        filters.timescale.set(speed=speed)
        await player.set_filters(filters, seek=True)
        await ctx.reply(embed=discord.Embed(description=f"⚡ Speed set to **{speed}x**", color=COLOR), mention_author=False)

    # ── sleep ─────────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="sleep", description="Stop the bot after N minutes.")
    async def sleep(self, ctx: commands.Context, minutes: int):
        if minutes < 1 or minutes > 360:
            return await ctx.reply(embed=self.bot.err("Minutes must be between 1 and 360."), mention_author=False)
        player = await voice_check(ctx)
        await ctx.reply(embed=discord.Embed(description=f"💤 Will stop playback in **{minutes} minute(s)**.", color=COLOR), mention_author=False)

        async def _sleep_task():
            await asyncio.sleep(minutes * 60)
            if player and player.connected:
                player.queue.reset()
                await player.stop()
                await player.disconnect()
                ch = self.bot.get_channel(ctx.channel.id)
                if ch:
                    await ch.send(embed=discord.Embed(description="💤 Sleep timer expired. Disconnected.", color=COLOR), delete_after=15)

        asyncio.create_task(_sleep_task())

    # ── leavecleanup ──────────────────────────────────────────────────────────

    @commands.hybrid_command(name="leavecleanup", description="Remove songs from users no longer in VC.")
    async def leavecleanup(self, ctx: commands.Context):
        player = await voice_check(ctx)
        vc_members = set(m.id for m in player.channel.members if not m.bot)
        tracks = list(player.queue)
        kept = []
        removed = 0
        for t in tracks:
            req_id = (getattr(t, "extras", {}) or {}).get("requester_id")
            if req_id and req_id not in vc_members:
                removed += 1
            else:
                kept.append(t)
        player.queue.reset()
        for t in kept:
            await player.queue.put_wait(t)
        await ctx.reply(embed=discord.Embed(description=f"🧹 Removed **{removed}** tracks from users not in VC.", color=COLOR), mention_author=False)

    # ── forcefix ──────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="forcefix", description="Fix a stuck player.")
    async def forcefix(self, ctx: commands.Context):
        player = get_player(ctx)
        if not player:
            return await ctx.reply(embed=self.bot.err("No active player."), mention_author=False)
        current = player.current
        await player.stop()
        if current:
            await asyncio.sleep(0.5)
            try:
                results = await ravelink.Playable.search(current.uri or current.title)
                if results:
                    t = results[0] if not isinstance(results, ravelink.Playlist) else results.tracks[0]
                    t.extras = getattr(current, "extras", {})
                    await player.play(t)
                    return await ctx.reply(embed=self.bot.ok(f"🔧 Fixed — replaying **{t.title}**"), mention_author=False)
            except Exception:
                pass
        await ctx.reply(embed=self.bot.ok("🔧 Player reset."), mention_author=False)

    # ── similar ───────────────────────────────────────────────────────────────

    @commands.hybrid_command(name="similar", description="Queue songs similar to the current track.")
    async def similar(self, ctx: commands.Context):
        player = await voice_check(ctx)
        if not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        t = player.current
        query = f"{t.title} {clean_author(t.author)} similar"
        try:
            results = await ravelink.Playable.search(query, source=ravelink.TrackSource.YouTubeMusic)
        except Exception:
            return await ctx.reply(embed=self.bot.err("Could not find similar tracks."), mention_author=False)
        if not results:
            return await ctx.reply(embed=self.bot.err("No similar tracks found."), mention_author=False)

        added = 0
        for track in (results[:5] if not isinstance(results, ravelink.Playlist) else results.tracks[:5]):
            if track.uri != (player.current.uri if player.current else None):
                track.extras = {"requester_id": ctx.author.id, "requester_name": ctx.author.display_name}
                await player.queue.put_wait(track)
                added += 1

        if not player.playing:
            try:
                next_t = player.queue.get()
                await player.play(next_t)
            except ravelink.QueueEmpty:
                pass

        await ctx.reply(embed=discord.Embed(description=f"💡 Added **{added}** similar tracks to the queue.", color=COLOR), mention_author=False)

    # ── pmusic (play from Spotify/search with picker) ─────────────────────────

    @commands.hybrid_command(name="pmusic", description="Play with multi-source search.")
    async def pmusic(self, ctx: commands.Context, *, query: str):
        await ctx.invoke(self.play, query=query)


async def setup(bot):
    await bot.add_cog(MusicCog(bot))
