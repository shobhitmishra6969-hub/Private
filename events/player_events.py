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


COLOR = 0x7B2FBE


# ── NP message view ──────────────────────────────────────────────────────────

class NowPlayingView(discord.ui.View):
    def __init__(self, player: ravelink.Player):
        super().__init__(timeout=None)
        self.player = player

    @discord.ui.button(emoji="⏸️", style=discord.ButtonStyle.secondary, custom_id="np_pause")
    async def pause_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        if not self.player.paused:
            await self.player.pause(True)
            button.emoji = discord.PartialEmoji.from_str("▶️")
            button.style = discord.ButtonStyle.success
        else:
            await self.player.pause(False)
            button.emoji = discord.PartialEmoji.from_str("⏸️")
            button.style = discord.ButtonStyle.secondary
        await interaction.edit_original_response(view=self)

    @discord.ui.button(emoji="⏭️", style=discord.ButtonStyle.secondary, custom_id="np_skip")
    async def skip_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        await self.player.skip()
        await interaction.followup.send("⏭️ Skipped!", ephemeral=True, delete_after=3)

    @discord.ui.button(emoji="❤️", style=discord.ButtonStyle.danger, custom_id="np_like")
    async def like_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        from database.models import get_liked, set_liked
        await interaction.response.defer(ephemeral=True)
        track = self.player.current
        if not track:
            return await interaction.followup.send("Nothing playing.", ephemeral=True, delete_after=3)
        songs = await get_liked(interaction.user.id)
        song_data = {
            "title": track.title,
            "uri": track.uri or "",
            "author": track.author or "Unknown",
            "duration": track.length or 0,
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

    @discord.ui.button(emoji="🔀", style=discord.ButtonStyle.secondary, custom_id="np_shuffle")
    async def shuffle_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        self.player.queue.shuffle()
        await interaction.followup.send("🔀 Queue shuffled!", ephemeral=True, delete_after=3)

    @discord.ui.button(emoji="🔁", style=discord.ButtonStyle.secondary, custom_id="np_loop")
    async def loop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        if self.player.queue.mode == ravelink.QueueMode.normal:
            self.player.queue.mode = ravelink.QueueMode.loop
            button.style = discord.ButtonStyle.success
            msg = "🔂 Loop track on."
        elif self.player.queue.mode == ravelink.QueueMode.loop:
            self.player.queue.mode = ravelink.QueueMode.loop_all
            button.emoji = discord.PartialEmoji.from_str("🔁")
            button.style = discord.ButtonStyle.primary
            msg = "🔁 Loop queue on."
        else:
            self.player.queue.mode = ravelink.QueueMode.normal
            button.style = discord.ButtonStyle.secondary
            msg = "▶️ Loop off."
        await interaction.edit_original_response(view=self)
        await interaction.followup.send(msg, ephemeral=True, delete_after=3)

    @discord.ui.button(emoji="⏹️", style=discord.ButtonStyle.danger, custom_id="np_stop")
    async def stop_btn(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.defer()
        self.player.queue.reset()
        await self.player.stop()
        await self.player.disconnect()
        await interaction.followup.send("⏹️ Stopped and disconnected.", ephemeral=True, delete_after=5)


def build_np_embed(track: ravelink.Playable, player: ravelink.Player) -> discord.Embed:
    artist = clean_author(track.author)
    pos = player.position or 0
    dur = track.length or 0
    bar = progress_bar(pos, dur)
    thumb = clean_thumbnail(track.artwork_url)

    requester = getattr(track, "extras", {}) or {}
    req_name = requester.get("requester_name", "")

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

        # Record history for requester
        extras = getattr(track, "extras", {}) or {}
        req_id = extras.get("requester_id")
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

        # Delete old NP message
        old_msg_id = getattr(player, "_np_message_id", None)
        if old_msg_id:
            try:
                old = await channel.fetch_message(old_msg_id)
                await old.delete()
            except Exception:
                pass
            player._np_message_id = None

        embed = build_np_embed(track, player)
        view = NowPlayingView(player)
        try:
            msg = await channel.send(embed=embed, view=view)
            player._np_message_id = msg.id
        except Exception as e:
            logger.log(f"[NP] Failed to send NP message: {e}", "warn")

    @bot.event
    async def on_ravelink_track_end(payload: ravelink.TrackEndEventPayload) -> None:
        player = payload.player
        if not player:
            return

        # Delete old NP message
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

        # Play next track from queue
        try:
            next_track = player.queue.get()
            await player.play(next_track)
        except ravelink.QueueEmpty:
            # Autoplay
            if player.autoplay == ravelink.AutoPlayMode.enabled:
                pass  # ravelink handles autoplay internally
            else:
                if text_channel_id:
                    ch = bot.get_channel(text_channel_id)
                    if ch:
                        embed = discord.Embed(
                            description="✅ Queue finished! Use `play` to add more songs.",
                            color=COLOR
                        )
                        try:
                            await ch.send(embed=embed, delete_after=15)
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
                embed = discord.Embed(
                    description=f"⚠️ Could not play **{track_name}**. Skipping...",
                    color=0xFF5555
                )
                try:
                    await ch.send(embed=embed, delete_after=10)
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
                embed = discord.Embed(
                    description="💤 Left voice channel due to inactivity.",
                    color=COLOR
                )
                try:
                    await ch.send(embed=embed, delete_after=15)
                except Exception:
                    pass
        await player.disconnect()

    @bot.event
    async def on_ravelink_websocket_closed(payload: ravelink.WebsocketClosedEventPayload) -> None:
        if payload.raw_code not in (1000, 4014):
            logger.log(f"[WS Closed] code={payload.raw_code} reason={payload.reason}", "warn")
