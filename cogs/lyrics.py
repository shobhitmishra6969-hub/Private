"""Lyrics command — Live Sync and Static modes via v2 components."""
from __future__ import annotations

import asyncio
import re
from typing import Optional

import aiohttp
import discord
import ravelink
from discord.ext import commands

import config
import utils.v2 as v2
from utils.formatters import clean_author, ms_to_time

COLOR    = config.COLOR
LRCLIB   = "https://lrclib.net/api/search"
LRC_RE   = re.compile(r"\[(\d+):(\d+\.\d+)\](.*)")
WINDOW   = 6   # lines shown above and below the current line in Live Sync
INTERVAL = 5   # seconds between live-sync refreshes
MAX_STATIC_CHARS = 3600


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_lrc(text: str) -> list[tuple[int, str]]:
    """Parse LRC text into [(position_ms, line)] sorted by time."""
    lines: list[tuple[int, str]] = []
    for m in LRC_RE.finditer(text):
        mins, secs, content = m.groups()
        ms = int((int(mins) * 60 + float(secs)) * 1000)
        lines.append((ms, content.strip()))
    return sorted(lines, key=lambda x: x[0])


def _current_idx(lrc: list[tuple[int, str]], pos_ms: int) -> int:
    """Return the index of the line currently playing."""
    idx = 0
    for i, (ms, _) in enumerate(lrc):
        if ms <= pos_ms:
            idx = i
    return idx


def _build_live_text(lrc: list[tuple[int, str]], pos_ms: int) -> str:
    """Build lyrics text with the current line bold and context lines dimmed."""
    if not lrc:
        return "*(no synced lyrics)*"
    idx   = _current_idx(lrc, pos_ms)
    start = max(0, idx - WINDOW)
    end   = min(len(lrc), idx + WINDOW + 1)
    parts: list[str] = []
    for i in range(start, end):
        _, line = lrc[i]
        if not line:
            continue
        if i == idx:
            parts.append(f"**▶ {line}**")
        else:
            parts.append(f"-# {line}")
    return "\n".join(parts) if parts else "*(instrumental)*"


async def _fetch_lyrics(title: str, artist: str) -> Optional[dict]:
    """Fetch lyrics from lrclib.net. Returns the best matching result or None."""
    params = {"track_name": title, "artist_name": artist}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                LRCLIB,
                params=params,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                if not data:
                    # Retry with a broader query
                    async with session.get(
                        LRCLIB,
                        params={"q": f"{artist} {title}"},
                        timeout=aiohttp.ClientTimeout(total=10),
                    ) as resp2:
                        if resp2.status != 200:
                            return None
                        data = await resp2.json()
                return data[0] if data else None
    except Exception:
        return None


# ── LyricsView ────────────────────────────────────────────────────────────────

class LyricsView(discord.ui.LayoutView):
    """v2 LayoutView — two buttons: Live Sync and Static."""

    def __init__(
        self,
        player: ravelink.Player,
        track: ravelink.Playable,
        plain: str,
        lrc: list[tuple[int, str]],
    ):
        super().__init__(timeout=300)
        self.player  = player
        self.track   = track
        self.plain   = plain
        self.lrc     = lrc
        self._mode   = "live" if lrc else "static"
        self._task: Optional[asyncio.Task] = None
        self._msg:  Optional[discord.Message] = None
        self._build()

    # ── rendering ─────────────────────────────────────────────────────────────

    def _build(self) -> None:
        self.clear_items()

        title  = self.track.title
        artist = clean_author(self.track.author)
        dur    = ms_to_time(self.track.length or 0)

        # ── Header card ───────────────────────────────────────────────────────
        header_card = discord.ui.Container(accent_color=COLOR)
        header_card.add_item(discord.ui.TextDisplay("## 🎵 Lyrics"))
        header_card.add_item(discord.ui.Separator())
        header_card.add_item(discord.ui.TextDisplay(
            f"**{discord.utils.escape_markdown(title)}**  —  {discord.utils.escape_markdown(artist)}\n"
            f"-# Duration: {dur}"
        ))
        self.add_item(header_card)

        # ── Lyrics card ───────────────────────────────────────────────────────
        lyrics_card = discord.ui.Container(accent_color=0x2B2D31)

        if self._mode == "live" and self.lrc:
            pos  = self.player.position or 0
            body = _build_live_text(self.lrc, pos)
            lyrics_card.add_item(discord.ui.TextDisplay(body))
            lyrics_card.add_item(discord.ui.Separator())
            lyrics_card.add_item(discord.ui.TextDisplay(
                f"-# 🔄 Live synced · refreshes every {INTERVAL}s"
            ))
        else:
            text = self.plain
            if not text and self.lrc:
                text = "\n".join(line for _, line in self.lrc if line)
            if not text:
                text = "*(lyrics not found)*"
            if len(text) > MAX_STATIC_CHARS:
                text = text[:MAX_STATIC_CHARS] + "\n\n*…(truncated — lyrics too long)*"
            lyrics_card.add_item(discord.ui.TextDisplay(text))

        self.add_item(lyrics_card)

        # ── Button card ───────────────────────────────────────────────────────
        btn_card = discord.ui.Container(accent_color=0x1A1C1E)

        live_btn = discord.ui.Button(
            label="Live Sync",
            emoji="🔄",
            style=(
                discord.ButtonStyle.success
                if self._mode == "live"
                else discord.ButtonStyle.secondary
            ),
            custom_id="lyrics_live",
            disabled=not bool(self.lrc),
        )
        static_btn = discord.ui.Button(
            label="Static",
            emoji="📄",
            style=(
                discord.ButtonStyle.success
                if self._mode == "static"
                else discord.ButtonStyle.secondary
            ),
            custom_id="lyrics_static",
        )

        live_btn.callback   = self._cb_live
        static_btn.callback = self._cb_static

        btn_card.add_item(discord.ui.ActionRow(live_btn, static_btn))
        self.add_item(btn_card)

    # ── button callbacks ──────────────────────────────────────────────────────

    async def _cb_live(self, interaction: discord.Interaction) -> None:
        if not self.lrc:
            await interaction.response.send_message(
                "No synced lyrics available for this track.", ephemeral=True
            )
            return
        self._mode = "live"
        self._build()
        await interaction.response.edit_message(view=self)
        self._start_sync()

    async def _cb_static(self, interaction: discord.Interaction) -> None:
        self._mode = "static"
        self._stop_sync()
        self._build()
        await interaction.response.edit_message(view=self)

    # ── live-sync task ────────────────────────────────────────────────────────

    def _start_sync(self) -> None:
        self._stop_sync()
        if self.lrc and self._msg:
            self._task = asyncio.create_task(self._sync_loop())

    def _stop_sync(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None

    async def _sync_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(INTERVAL)
                if self._mode != "live" or not self.player.playing:
                    break
                self._build()
                try:
                    await self._msg.edit(view=self)
                except Exception:
                    break
        except asyncio.CancelledError:
            pass

    def attach_message(self, msg: discord.Message) -> None:
        """Call after sending the view to wire up the live-sync task."""
        self._msg = msg
        if self._mode == "live":
            self._start_sync()

    async def on_timeout(self) -> None:
        self._stop_sync()


# ── Cog ───────────────────────────────────────────────────────────────────────

class LyricsCog(commands.Cog, name="Lyrics"):

    def __init__(self, bot: commands.Bot):
        self.bot = bot

    @commands.hybrid_command(name="lyrics", aliases=["ly"], description="Show lyrics for the current (or given) song.")
    async def lyrics(self, ctx: commands.Context, *, query: str = ""):
        # Defer early for slash commands
        if ctx.interaction:
            await ctx.interaction.response.defer()

        # Determine track to look up
        from cogs.music import get_player
        player = get_player(ctx)

        if query:
            # Manual query: split on " - " or treat whole thing as title
            if " - " in query:
                artist_q, title_q = [p.strip() for p in query.split(" - ", 1)]
            else:
                title_q  = query
                artist_q = ""
            fake_title  = title_q
            fake_artist = artist_q
            current     = None
        elif player and player.current:
            current     = player.current
            fake_title  = current.title
            fake_artist = clean_author(current.author)
        else:
            return await v2.send(ctx, v2.err(
                "Nothing is currently playing. Use `/lyrics <song name>` to look up any song."
            ))

        # Fetch from lrclib.net
        data = await _fetch_lyrics(fake_title, fake_artist)

        if not data:
            return await v2.send(ctx, v2.err(
                f"No lyrics found for **{discord.utils.escape_markdown(fake_title)}**."
            ))

        plain = (data.get("plainLyrics") or "").strip()
        lrc   = _parse_lrc(data.get("syncedLyrics") or "")

        # Build a minimal Playable-like object when no player is active
        if current is None:
            class _FakeTrack:
                title      = fake_title
                author     = fake_artist or (data.get("artistName") or "Unknown")
                length     = (data.get("duration") or 0) * 1000
                artwork_url = None
                uri        = None
            track_obj = _FakeTrack()

            class _FakePlayer:
                playing  = False
                position = 0
            player_obj = _FakePlayer()
        else:
            track_obj  = current
            player_obj = player

        view = LyricsView(player_obj, track_obj, plain, lrc)

        # Send and wire up live-sync
        if ctx.interaction:
            msg = await ctx.interaction.followup.send(view=view)
        else:
            msg = await ctx.reply(view=view, mention_author=False)

        view.attach_message(msg)


async def setup(bot: commands.Bot) -> None:
    await bot.add_cog(LyricsCog(bot))
