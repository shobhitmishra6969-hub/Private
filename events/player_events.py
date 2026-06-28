"""Ravelink player/node event listeners registered on the bot."""
from __future__ import annotations

import asyncio
import time

import discord
import ravelink

import emojis as E
from database.models import add_history, increment_commands
from utils.formatters import ms_to_time, clean_author, clean_thumbnail, progress_bar
from utils import logger
import utils.v2 as v2

NP_GREEN  = 0x57F287
NP_PURPLE = 0x7B2FBE
COLOR     = NP_PURPLE

# Filters shown in the filter picker (preset key, emoji, display label)
FILTER_BUTTONS = [
    ("nightcore", "🌙", "Nightcore"),
    ("bassboost", "🔊", "Bass Boost"),
    ("8d",        "🌐", "8D"),
    ("vaporwave", "🌊", "Vaporwave"),
    ("tremolo",   "🎵", "Tremolo"),
    ("vibrato",   "🎸", "Vibrato"),
    ("karaoke",   "🎤", "Karaoke"),
    ("pop",       "🎶", "Pop"),
    ("soft",      "💫", "Soft"),
    ("metal",     "🤘", "Metal"),
    ("clear",     "❌", "Clear Filters"),
]


# ── Filter Picker (auto-deletes in 10 s) ─────────────────────────────────────

class FilterPickerView(discord.ui.LayoutView):
    def __init__(self, player: ravelink.Player):
        super().__init__(timeout=10)
        self.player = player
        self._msg: discord.Message | None = None
        self._build()

    def _build(self):
        self.clear_items()
        card = discord.ui.Container(accent_color=NP_PURPLE)
        card.add_item(discord.ui.TextDisplay("## ✨ Audio Filters\nSelect a filter to apply:"))
        card.add_item(discord.ui.Separator())
        for i in range(0, len(FILTER_BUTTONS), 5):
            chunk = FILTER_BUTTONS[i:i + 5]
            row = []
            for preset, emoji, label in chunk:
                btn = discord.ui.Button(
                    label=label,
                    emoji=emoji,
                    style=discord.ButtonStyle.danger if preset == "clear"
                          else discord.ButtonStyle.secondary,
                    custom_id=f"flt_{preset}",
                )
                btn.callback = self._make_filter_cb(preset, emoji, label)
                row.append(btn)
            card.add_item(discord.ui.ActionRow(*row))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("-# Auto-deletes in 10 seconds"))
        self.add_item(card)

    def _make_filter_cb(self, preset: str, emoji: str, label: str):
        async def callback(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            try:
                if preset == "clear":
                    await self.player.set_filters(None, seek=True)
                    confirm = "❌ Filters cleared."
                else:
                    from cogs.filters import FILTER_PRESETS
                    f = ravelink.Filters()
                    FILTER_PRESETS[preset](f)
                    await self.player.set_filters(f, seek=True)
                    confirm = f"{emoji} **{label}** filter applied!"
                await interaction.followup.send(confirm, ephemeral=True, delete_after=5)
            except Exception as exc:
                await interaction.followup.send(f"⚠️ {exc}", ephemeral=True, delete_after=5)
            if self._msg:
                try:
                    await self._msg.delete()
                except Exception:
                    pass
            self.stop()
        return callback

    async def on_timeout(self):
        if self._msg:
            try:
                await self._msg.delete()
            except Exception:
                pass


# ── NowPlaying LayoutView ─────────────────────────────────────────────────────

class NowPlayingView(discord.ui.LayoutView):
    def __init__(self, player: ravelink.Player):
        super().__init__(timeout=None)
        self.player = player
        self._build()

    # ── build ─────────────────────────────────────────────────────────────────

    def _build(self):
        self.clear_items()
        track = self.player.current

        card = discord.ui.Container(accent_color=NP_GREEN)

        if not track:
            card.add_item(discord.ui.TextDisplay("Nothing is currently playing."))
            self.add_item(card)
            return

        artist   = clean_author(track.author)
        dur      = track.length or 0
        extras   = getattr(track, "extras", None)
        req_name = getattr(extras, "requester_name", "") if extras else ""
        thumb    = clean_thumbnail(track.artwork_url)
        uri      = track.uri or ""
        src_icon = "🔴" if ("youtube" in uri or "youtu.be" in uri) else "🎵"

        body = (
            f"{src_icon} **{track.title}** — {artist}\n"
            f"Duration: {ms_to_time(dur)}"
        )
        if req_name:
            body += f"\nRequested by (@{req_name})"

        # Header
        card.add_item(discord.ui.TextDisplay("**Now Playing** `HQ`"))
        card.add_item(discord.ui.Separator())

        # Track info + album art thumbnail
        if thumb:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=thumb),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))

        card.add_item(discord.ui.Separator())

        # ── Row 1: ⏮  ⏸/▶  ⏭  ❤️ ────────────────────────────────────────
        is_paused = self.player.paused
        prev_btn  = discord.ui.Button(emoji="⏮️", style=discord.ButtonStyle.secondary, custom_id="np_prev")
        pause_btn = discord.ui.Button(
            emoji="▶️" if is_paused else "⏸️",
            style=discord.ButtonStyle.secondary,
            custom_id="np_pause",
        )
        skip_btn  = discord.ui.Button(emoji="⏭️", style=discord.ButtonStyle.secondary, custom_id="np_skip")
        like_btn  = discord.ui.Button(emoji="❤️", style=discord.ButtonStyle.success,   custom_id="np_like")
        prev_btn.callback  = self._prev_cb
        pause_btn.callback = self._pause_cb
        skip_btn.callback  = self._skip_cb
        like_btn.callback  = self._like_cb
        card.add_item(discord.ui.ActionRow(prev_btn, pause_btn, skip_btn, like_btn))

        # ── Row 2: ⏹ stop (danger, standalone) ──────────────────────────────
        stop_btn = discord.ui.Button(emoji="⏹️", style=discord.ButtonStyle.danger, custom_id="np_stop")
        stop_btn.callback = self._stop_cb
        card.add_item(discord.ui.ActionRow(stop_btn))

        # ── Row 3: ♾ Loop  🔀 Shuffle ────────────────────────────────────────
        loop_mode  = self.player.queue.mode
        loop_label = {
            ravelink.QueueMode.normal:   "Loop",
            ravelink.QueueMode.loop:     "Loop: Track",
            ravelink.QueueMode.loop_all: "Loop: Queue",
        }.get(loop_mode, "Loop")
        loop_style = (discord.ButtonStyle.success if loop_mode != ravelink.QueueMode.normal
                      else discord.ButtonStyle.secondary)
        loop_btn    = discord.ui.Button(label=loop_label, emoji="♾️",  style=loop_style,                        custom_id="np_loop")
        shuffle_btn = discord.ui.Button(label="Shuffle",  emoji="🔀", style=discord.ButtonStyle.secondary, custom_id="np_shuffle")
        loop_btn.callback    = self._loop_cb
        shuffle_btn.callback = self._shuffle_cb
        card.add_item(discord.ui.ActionRow(loop_btn, shuffle_btn))

        # ── Row 4: 🔄 Autoplay ───────────────────────────────────────────────
        ap_on = getattr(self.player, "autoplay", ravelink.AutoPlayMode.disabled) == ravelink.AutoPlayMode.enabled
        autoplay_btn = discord.ui.Button(
            label="Autoplay", emoji="🔄",
            style=discord.ButtonStyle.success if ap_on else discord.ButtonStyle.secondary,
            custom_id="np_autoplay",
        )
        autoplay_btn.callback = self._autoplay_cb
        card.add_item(discord.ui.ActionRow(autoplay_btn))

        # ── Row 5: ✨ Filter ─────────────────────────────────────────────────
        filter_btn = discord.ui.Button(label="Filter", emoji="✨", style=discord.ButtonStyle.secondary, custom_id="np_filter")
        filter_btn.callback = self._filter_cb
        card.add_item(discord.ui.ActionRow(filter_btn))

        self.add_item(card)

    # ── callbacks ─────────────────────────────────────────────────────────────

    async def _prev_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        await self.player.seek(0)
        await interaction.followup.send("⏮️ Replayed from start!", ephemeral=True, delete_after=3)

    async def _pause_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        await self.player.pause(not self.player.paused)
        self._build()
        await interaction.edit_original_response(view=self)

    async def _skip_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        await self.player.skip()
        await interaction.followup.send("⏭️ Skipped!", ephemeral=True, delete_after=3)

    async def _like_cb(self, interaction: discord.Interaction):
        from database.models import get_liked, set_liked
        await interaction.response.defer(ephemeral=True)
        track = self.player.current
        if not track:
            return await interaction.followup.send("Nothing playing.", ephemeral=True, delete_after=3)
        songs    = await get_liked(interaction.user.id)
        song_data = {
            "title":     track.title,
            "uri":       track.uri or "",
            "author":    track.author or "Unknown",
            "duration":  track.length or 0,
            "thumbnail": clean_thumbnail(track.artwork_url) or "",
        }
        uris = [s.get("uri") for s in songs]
        if track.uri in uris:
            songs = [s for s in songs if s.get("uri") != track.uri]
            await set_liked(interaction.user.id, songs)
            await interaction.followup.send(f"💔 Removed **{track.title}** from liked songs.", ephemeral=True, delete_after=5)
        else:
            songs.append(song_data)
            await set_liked(interaction.user.id, songs)
            await interaction.followup.send(f"❤️ Added **{track.title}** to liked songs!", ephemeral=True, delete_after=5)

    async def _stop_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        self.player.queue.reset()
        await self.player.stop()
        await self.player.disconnect()
        await interaction.followup.send("⏹️ Stopped and disconnected.", ephemeral=True, delete_after=5)

    async def _loop_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if self.player.queue.mode == ravelink.QueueMode.normal:
            self.player.queue.mode = ravelink.QueueMode.loop
            msg = "🔂 Loop: Track"
        elif self.player.queue.mode == ravelink.QueueMode.loop:
            self.player.queue.mode = ravelink.QueueMode.loop_all
            msg = "🔁 Loop: Queue"
        else:
            self.player.queue.mode = ravelink.QueueMode.normal
            msg = "▶️ Loop: Off"
        self._build()
        await interaction.edit_original_response(view=self)
        await interaction.followup.send(msg, ephemeral=True, delete_after=3)

    async def _shuffle_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        self.player.queue.shuffle()
        await interaction.followup.send("🔀 Queue shuffled!", ephemeral=True, delete_after=3)

    async def _autoplay_cb(self, interaction: discord.Interaction):
        await interaction.response.defer()
        if self.player.autoplay == ravelink.AutoPlayMode.enabled:
            self.player.autoplay = ravelink.AutoPlayMode.disabled
            msg = "🔄 Autoplay disabled."
        else:
            self.player.autoplay = ravelink.AutoPlayMode.enabled
            msg = "🔄 Autoplay enabled!"
        self._build()
        await interaction.edit_original_response(view=self)
        await interaction.followup.send(msg, ephemeral=True, delete_after=3)

    async def _filter_cb(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        channel = interaction.channel
        if channel:
            view = FilterPickerView(self.player)
            msg  = await channel.send(view=view)
            view._msg = msg


def build_np_embed(track: ravelink.Playable, player: ravelink.Player) -> discord.Embed:
    """Legacy helper kept for any callers that still need an Embed (unused internally)."""
    from utils.formatters import ms_to_time, clean_author, clean_thumbnail, progress_bar
    artist = clean_author(track.author)
    pos = player.position or 0
    dur = track.length or 0
    bar = progress_bar(pos, dur)
    thumb = clean_thumbnail(track.artwork_url)
    extras = getattr(track, "extras", None)
    req_name = getattr(extras, "requester_name", "") if extras else ""
    queue_size = len(player.queue)
    vol = getattr(player, "volume", 100)
    loop_map = {
        ravelink.QueueMode.normal:   "Off",
        ravelink.QueueMode.loop:     "Track 🔂",
        ravelink.QueueMode.loop_all: "Queue 🔁",
    }
    loop_str = loop_map.get(player.queue.mode, "Off")
    desc = (
        f"**{track.title}**\n"
        f"👤 **Artist:** {artist}\n\n"
        f"`{ms_to_time(pos)}` {bar} `{ms_to_time(dur)}`\n\n"
        f"🔊 Vol: **{vol}%** • 🔁 Loop: **{loop_str}**"
        + (f"\n➕ Requested by **{req_name}**" if req_name else "")
        + (f"\n📋 **{queue_size}** song(s) in queue" if queue_size else "")
    )
    embed = discord.Embed(description=desc, color=COLOR)
    embed.set_author(name="🎧 Now Playing")
    if thumb:
        embed.set_thumbnail(url=thumb)
    return embed


# ── Event registration ────────────────────────────────────────────────────────

def setup_events(bot) -> None:

    @bot.event
    async def on_ravelink_node_ready(payload: ravelink.NodeReadyEventPayload) -> None:
        logger.log(f'Lavalink "{payload.node.identifier}" connected. Resumed: {payload.resumed}', "ready")

    @bot.event
    async def on_ravelink_node_disconnected(node: ravelink.Node) -> None:
        logger.log(f'Lavalink "{node.identifier}" disconnected — retrying...', "warn")

    @bot.event
    async def on_ravelink_node_closed(node: ravelink.Node, disconnected: list) -> None:
        logger.log(f'Lavalink "{node.identifier}" closed. Affected players: {len(disconnected)}', "error")

    @bot.event
    async def on_ravelink_track_start(payload: ravelink.TrackStartEventPayload) -> None:
        player = payload.player
        if not player:
            return
        track = payload.track

        extras = getattr(track, "extras", None)
        req_id = getattr(extras, "requester_id", None) if extras else None
        if req_id:
            try:
                await add_history(req_id, {
                    "title": track.title,
                    "uri": track.uri or "",
                    "author": track.author or "Unknown",
                    "duration": track.length or 0,
                    "thumbnail": clean_thumbnail(track.artwork_url) or "",
                })
            except Exception:
                pass

        text_channel_id = getattr(player, "_text_channel_id", None)
        if not text_channel_id:
            return
        channel = bot.get_channel(text_channel_id)
        if not channel:
            return

        old_msg_id = getattr(player, "_np_message_id", None)
        if old_msg_id:
            try:
                old = await channel.fetch_message(old_msg_id)
                await old.delete()
            except Exception:
                pass
            player._np_message_id = None

        np_view = NowPlayingView(player)
        try:
            msg = await channel.send(view=np_view)
            player._np_message_id = msg.id
        except Exception as e:
            logger.log(f"[NP] Failed to send NP message: {e}", "warn")

    @bot.event
    async def on_ravelink_track_end(payload: ravelink.TrackEndEventPayload) -> None:
        player = payload.player
        if not player:
            return

        text_channel_id = getattr(player, "_text_channel_id", None)
        old_msg_id = getattr(player, "_np_message_id", None)
        if old_msg_id and text_channel_id:
            try:
                ch = bot.get_channel(text_channel_id)
                if ch:
                    msg = await ch.fetch_message(old_msg_id)
                    await msg.delete()
            except Exception:
                pass
            player._np_message_id = None

        if payload.reason in ("replaced", "stopped"):
            return

        try:
            next_track = player.queue.get()
            await player.play(next_track)
        except ravelink.QueueEmpty:
            if player.autoplay == ravelink.AutoPlayMode.enabled:
                pass
            else:
                if text_channel_id:
                    ch = bot.get_channel(text_channel_id)
                    if ch:
                        try:
                            await v2.channel_send(
                                ch,
                                v2.container("✅ Queue finished! Use `/play` to add more songs."),
                                delete_after=15,
                            )
                        except Exception:
                            pass

    @bot.event
    async def on_ravelink_track_exception(payload: ravelink.TrackExceptionEventPayload) -> None:
        player = payload.player
        logger.log(f"[Track Exception] {payload.track.title if payload.track else '?'}: {payload.exception}", "error")

        text_channel_id = getattr(player, "_text_channel_id", None) if player else None
        if text_channel_id:
            ch = bot.get_channel(text_channel_id)
            if ch:
                track_name = payload.track.title if payload.track else "Unknown track"
                try:
                    await v2.channel_send(
                        ch,
                        v2.container(f"⚠️ Could not play **{track_name}**. Skipping...", color=0xFF5555),
                        delete_after=10,
                    )
                except Exception:
                    pass

        if player:
            try:
                next_track = player.queue.get()
                await player.play(next_track)
            except ravelink.QueueEmpty:
                pass

    @bot.event
    async def on_ravelink_track_stuck(payload: ravelink.TrackStuckEventPayload) -> None:
        logger.log(f"[Track Stuck] {payload.track.title}: threshold={payload.threshold}ms", "warn")
        player = payload.player
        if player:
            try:
                next_track = player.queue.get()
                await player.play(next_track)
            except ravelink.QueueEmpty:
                pass

    @bot.event
    async def on_ravelink_inactive_player(player: ravelink.Player) -> None:
        logger.log(f"[Inactive Player] Disconnecting from {player.guild}", "info")
        text_channel_id = getattr(player, "_text_channel_id", None)
        if text_channel_id:
            ch = bot.get_channel(text_channel_id)
            if ch:
                try:
                    await v2.channel_send(
                        ch,
                        v2.container("💤 Left voice channel due to inactivity."),
                        delete_after=15,
                    )
                except Exception:
                    pass
        await player.disconnect()

    @bot.event
    async def on_ravelink_websocket_closed(payload: ravelink.WebsocketClosedEventPayload) -> None:
        if payload.raw_code not in (1000, 4014):
            logger.log(f"[WS Closed] code={payload.raw_code} reason={payload.reason}", "warn")
