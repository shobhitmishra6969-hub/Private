"""Spotify integration commands."""
from __future__ import annotations

import re
from typing import Optional

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from database import db_get, db_set, now_ts
from utils.formatters import ms_to_time
import utils.v2 as v2

COLOR = config.COLOR
SP_COLOR = 0x1DB954


def _get_spotify_client():
    try:
        import spotipy
        from spotipy.oauth2 import SpotifyClientCredentials
        if not config.SPOTIFY_CLIENT_ID or not config.SPOTIFY_CLIENT_SECRET:
            return None
        return spotipy.Spotify(auth_manager=SpotifyClientCredentials(
            client_id=config.SPOTIFY_CLIENT_ID,
            client_secret=config.SPOTIFY_CLIENT_SECRET,
        ))
    except Exception:
        return None


_sp = None


def get_sp():
    global _sp
    if _sp is None:
        _sp = _get_spotify_client()
    return _sp


def extract_spotify_id(url: str) -> tuple[str, str]:
    patterns = {
        "track":    r"track/([A-Za-z0-9]+)",
        "album":    r"album/([A-Za-z0-9]+)",
        "playlist": r"playlist/([A-Za-z0-9]+)",
        "artist":   r"artist/([A-Za-z0-9]+)",
    }
    for type_, pattern in patterns.items():
        m = re.search(pattern, url)
        if m:
            return type_, m.group(1)
    return "", ""


def json_load(val):
    import json
    try:
        return json.loads(val) if val else []
    except Exception:
        return []


class SpotifyCog(commands.Cog, name="Spotify"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_group(name="spotify", aliases=["sp"], description="Spotify commands.")
    async def spotify(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info(
                "Available: `spotify search`, `spotify album`, `spotify artist`, `spotify playlist`, `spotify profile`"
            ))

    @spotify.command(name="search", description="Search for a track on Spotify.")
    async def sp_search(self, ctx: commands.Context, *, query: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await v2.send(ctx, v2.err("Spotify is not configured."))
        try:
            results = sp.search(q=query, limit=5, type="track")
            tracks = results["tracks"]["items"]
        except Exception:
            return await v2.send(ctx, v2.err("Spotify search failed."))
        if not tracks:
            return await v2.send(ctx, v2.err("No tracks found."))
        desc = "\n".join(
            f"`{i}.` **[{t['name']}]({t['external_urls']['spotify']})** — "
            f"{', '.join(a['name'] for a in t['artists'])} `[{ms_to_time(t['duration_ms'])}]`"
            for i, t in enumerate(tracks, 1)
        )
        await v2.send(ctx, v2.container(
            desc,
            header=f"🎵 Spotify Search: {query[:30]}",
            footer="Use /play with the track name to play!",
            color=SP_COLOR,
        ))

    @spotify.command(name="album", description="Get info about a Spotify album.")
    async def sp_album(self, ctx: commands.Context, url_or_query: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await v2.send(ctx, v2.err("Spotify is not configured."))
        try:
            type_, sp_id = extract_spotify_id(url_or_query)
            if type_ == "album" and sp_id:
                album = sp.album(sp_id)
            else:
                results = sp.search(q=url_or_query, limit=1, type="album")
                albums = results["albums"]["items"]
                if not albums:
                    return await v2.send(ctx, v2.err("Album not found."))
                album = sp.album(albums[0]["id"])
            tracks = album["tracks"]["items"][:10]
            desc = "\n".join(
                f"`{i}.` {t['name']} — {', '.join(a['name'] for a in t['artists'])} `[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(tracks, 1)
            )
            thumb = album["images"][0]["url"] if album.get("images") else None
            artists = ", ".join(a["name"] for a in album["artists"])
            header = f"💿 {album['name']} — {artists}"
            footer = f"{album['total_tracks']} tracks • Released {album['release_date'][:4]}"
            await v2.send(ctx, v2.container(desc, header=header, thumbnail_url=thumb, footer=footer, color=SP_COLOR))
        except Exception as e:
            await v2.send(ctx, v2.err(f"Spotify error: {e}"))

    @spotify.command(name="artist", description="Get info about a Spotify artist.")
    async def sp_artist(self, ctx: commands.Context, *, name: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await v2.send(ctx, v2.err("Spotify is not configured."))
        try:
            results = sp.search(q=name, limit=1, type="artist")
            artists = results["artists"]["items"]
            if not artists:
                return await v2.send(ctx, v2.err("Artist not found."))
            artist = artists[0]
            top_tracks = sp.artist_top_tracks(artist["id"])["tracks"][:5]
            top = "\n".join(
                f"`{i}.` {t['name']} `[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(top_tracks, 1)
            )
            genres = ', '.join(artist.get('genres', ['?']))[:80]
            body = (
                f"**Genres:** {genres}\n"
                f"**Followers:** {artist['followers']['total']:,}\n"
                f"**Popularity:** {artist['popularity']}/100\n\n"
                f"**Top Tracks:**\n{top}"
            )
            thumb = artist["images"][0]["url"] if artist.get("images") else None
            await v2.send(ctx, v2.container(body, header=f"🎤 {artist['name']}", thumbnail_url=thumb, color=SP_COLOR))
        except Exception as e:
            await v2.send(ctx, v2.err(f"Spotify error: {e}"))

    @spotify.command(name="playlist", description="Get info about a Spotify playlist.")
    async def sp_playlist(self, ctx: commands.Context, url: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await v2.send(ctx, v2.err("Spotify is not configured."))
        try:
            type_, sp_id = extract_spotify_id(url)
            if type_ != "playlist" or not sp_id:
                return await v2.send(ctx, v2.err("Please provide a valid Spotify playlist URL."))
            playlist = sp.playlist(sp_id)
            tracks = playlist["tracks"]["items"][:10]
            desc = "\n".join(
                f"`{i}.` {item['track']['name']} — {', '.join(a['name'] for a in item['track']['artists'])}"
                for i, item in enumerate(tracks, 1)
                if item.get("track")
            ) or "Empty playlist."
            thumb = playlist["images"][0]["url"] if playlist.get("images") else None
            header = f"📋 {playlist['name']}"
            footer = f"{playlist['tracks']['total']} tracks • by {playlist['owner']['display_name']}"
            layout = discord.ui.LayoutView(timeout=None)
            layout.add_item(v2.container(desc, header=header, thumbnail_url=thumb, footer=footer, color=SP_COLOR))
            play_url = playlist["external_urls"]["spotify"]
            layout.add_item(discord.ui.Button(
                label="▶ Open in Spotify",
                url=play_url,
                style=discord.ButtonStyle.link,
                emoji=E.spotify if hasattr(E, 'spotify') else None,
            ))
            await ctx.reply(view=layout, mention_author=False)
        except Exception as e:
            await v2.send(ctx, v2.err(f"Spotify error: {e}"))

    @spotify.command(name="profile", description="View your linked Spotify profile.")
    async def sp_profile(self, ctx: commands.Context):
        row = await db_get("spotifyprofile", {"userId": str(ctx.author.id)})
        if not row:
            return await v2.send(ctx, v2.container(
                "No Spotify profile linked.\n\nTo link your profile, use the Spotify login feature if available.",
                color=SP_COLOR,
            ))
        playlists = json_load(row["playlists"])
        linked_at = row.get("linkedAt")
        linked_str = f"<t:{linked_at}:R>" if linked_at else "N/A"
        body = (
            f"**Playlists:** {len(playlists)}\n"
            f"**Linked:** {linked_str}"
        )
        thumb = row.get("avatarUrl") or None
        name = row.get("displayName", "Spotify Profile")
        await v2.send(ctx, v2.container(body, header=f"{E.spotify} {name}", thumbnail_url=thumb, color=SP_COLOR))


async def setup(bot):
    await bot.add_cog(SpotifyCog(bot))
