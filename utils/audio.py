"""
Audio backend configuration for ToneVibes.

Architecture note
-----------------
ToneVibes streams audio through Lavalink (via the ravelink wrapper).
Lavalink runs yt-dlp and FFmpeg server-side, so the Python process never
touches raw PCM or Opus packets directly — Discord.py's built-in Opus
encoder handles the voice gateway layer automatically.

This module exposes:
  - YTDLP_OPTS   canonical yt-dlp extraction options (used for direct
                 metadata lookups / fallback search outside Lavalink)
  - FFMPEG_OPTS  exact FFmpeg flags requested for any direct-voice usage
  - async search helpers that wrap yt-dlp for offline / fallback paths
"""
from __future__ import annotations

import asyncio
from typing import Optional

# ── yt-dlp options ────────────────────────────────────────────────────────────
# extract_flat=True  → fetch playlist/search metadata without downloading
# quiet / no_warnings → suppress console noise in async contexts
YTDLP_OPTS: dict = {
    "format": "bestaudio/best",
    "extract_flat": True,
    "force_generic_extractor": False,
    "quiet": True,
    "no_warnings": True,
    "default_search": "ytsearch",
    "source_address": "0.0.0.0",
    "noplaylist": True,
}

# ── FFmpeg options for discord.FFmpegPCMAudio ─────────────────────────────────
# Used when the bot streams audio directly (non-Lavalink path / fallback).
#
# before_options:
#   -reconnect 1            → re-open stream on EOF / network drop
#   -reconnect_streamed 1   → reconnect live/stream sources
#   -reconnect_delay_max 5  → cap reconnect backoff at 5 s
#
# options:
#   -vn          → strip video track (audio-only decode)
#   -b:a 128k    → constant 128 kbps audio bitrate
#   -bufsize 64k → small output buffer for low-latency delivery
FFMPEG_BEFORE_OPTIONS: str = (
    "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5"
)
FFMPEG_OPTIONS: str = "-vn -b:a 128k -bufsize 64k"

# Convenience dict for unpacking into FFmpegPCMAudio
FFMPEG_AUDIO_OPTIONS: dict = {
    "before_options": FFMPEG_BEFORE_OPTIONS,
    "options": FFMPEG_OPTIONS,
}

# ── Opus note ─────────────────────────────────────────────────────────────────
# discord.py encodes PCM → Opus natively via the _opus C extension bundled
# with PyNaCl.  No manual OpusEncoder instantiation is needed; the voice
# client calls discord.opus.Encoder internally on every speak() cycle.
# Ensure PyNaCl is installed (it is — listed in requirements.txt) so the
# C-level encoder is available rather than the slower pure-Python fallback.

# ── Async yt-dlp metadata helper ─────────────────────────────────────────────

async def fetch_track_info(url: str) -> Optional[dict]:
    """
    Fetch track metadata via yt-dlp in a thread pool so the event loop
    stays unblocked.  Returns the info dict or None on failure.
    """
    try:
        import yt_dlp  # type: ignore

        opts = {**YTDLP_OPTS, "extract_flat": False}

        def _extract() -> dict:
            with yt_dlp.YoutubeDL(opts) as ydl:
                return ydl.extract_info(url, download=False) or {}

        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(None, _extract)
        return info
    except Exception:
        return None


async def search_tracks(query: str, max_results: int = 5) -> list[dict]:
    """
    Search YouTube via yt-dlp and return up to *max_results* track dicts.
    Each dict contains at minimum: id, title, url, duration, uploader.
    Falls back to an empty list on any error.
    """
    try:
        import yt_dlp  # type: ignore

        opts = {
            **YTDLP_OPTS,
            "extract_flat": True,
            "default_search": f"ytsearch{max_results}",
            "noplaylist": True,
        }

        def _search() -> list[dict]:
            with yt_dlp.YoutubeDL(opts) as ydl:
                result = ydl.extract_info(query, download=False) or {}
                entries = result.get("entries") or []
                return [e for e in entries if e]

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, _search)
    except Exception:
        return []
