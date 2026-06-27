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


class SpotifyCog(commands.Cog, name="Spotify"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_group(name="spotify", aliases=["sp"], description="Spotify commands.")
    async def spotify(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed(
                "Available: `spotify search`, `spotify album`, `spotify artist`, `spotify playlist`, `spotify profile`"
            ), mention_author=False)

    @spotify.command(name="search", description="Search for a track on Spotify.")
    async def sp_search(self, ctx: commands.Context, *, query: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply(embed=self.bot.err("Spotify is not configured."), mention_author=False)
        try:
            results = sp.search(q=query, limit=5, type="track")
            tracks = results["tracks"]["items"]
        except Exception:
            return await ctx.reply(embed=self.bot.err("Spotify search failed."), mention_author=False)

        if not tracks:
            return await ctx.reply(embed=self.bot.err("No tracks found."), mention_author=False)

        desc = "\n".join(
            f"`{i}.` **[{t['name']}]({t['external_urls']['spotify']})** — {', '.join(a['name'] for a in t['artists'])} `[{ms_to_time(t['duration_ms'])}]`"
            for i, t in enumerate(tracks, 1)
        )
        embed = discord.Embed(title=f"🎵 Spotify Search: {query[:30]}", description=desc, color=SP_COLOR)
        embed.set_footer(text="Use /play with the track name to play!")
        await ctx.reply(embed=embed, mention_author=False)

    @spotify.command(name="album", description="Get info about a Spotify album.")
    async def sp_album(self, ctx: commands.Context, url_or_query: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply(embed=self.bot.err("Spotify is not configured."), mention_author=False)
        try:
            type_, sp_id = extract_spotify_id(url_or_query)
            if type_ == "album" and sp_id:
                album = sp.album(sp_id)
            else:
                results = sp.search(q=url_or_query, limit=1, type="album")
                albums = results["albums"]["items"]
                if not albums:
                    return await ctx.reply(embed=self.bot.err("Album not found."), mention_author=False)
                album = sp.album(albums[0]["id"])

            tracks = album["tracks"]["items"][:10]
            desc = "\n".join(
                f"`{i}.` {t['name']} — {', '.join(a['name'] for a in t['artists'])} `[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(tracks, 1)
            )
            embed = discord.Embed(
                title=album["name"],
                url=album["external_urls"]["spotify"],
                description=desc,
                color=SP_COLOR
            )
            embed.set_author(name=", ".join(a["name"] for a in album["artists"]))
            if album["images"]:
                embed.set_thumbnail(url=album["images"][0]["url"])
            embed.add_field(name="Tracks", value=str(album["total_tracks"]), inline=True)
            embed.add_field(name="Released", value=album["release_date"][:4], inline=True)
            await ctx.reply(embed=embed, mention_author=False)
        except Exception as e:
            await ctx.reply(embed=self.bot.err(f"Spotify error: {e}"), mention_author=False)

    @spotify.command(name="artist", description="Get info about a Spotify artist.")
    async def sp_artist(self, ctx: commands.Context, *, name: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply(embed=self.bot.err("Spotify is not configured."), mention_author=False)
        try:
            results = sp.search(q=name, limit=1, type="artist")
            artists = results["artists"]["items"]
            if not artists:
                return await ctx.reply(embed=self.bot.err("Artist not found."), mention_author=False)
            artist = artists[0]
            top_tracks = sp.artist_top_tracks(artist["id"])["tracks"][:5]
            top = "\n".join(
                f"`{i}.` {t['name']} `[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(top_tracks, 1)
            )
            embed = discord.Embed(
                title=artist["name"],
                url=artist["external_urls"]["spotify"],
                description=f"**Genres:** {', '.join(artist.get('genres', ['?']))[:80]}\n\n**Top Tracks:**\n{top}",
                color=SP_COLOR
            )
            embed.add_field(name="Followers", value=f"{artist['followers']['total']:,}", inline=True)
            embed.add_field(name="Popularity", value=f"{artist['popularity']}/100", inline=True)
            if artist["images"]:
                embed.set_thumbnail(url=artist["images"][0]["url"])
            await ctx.reply(embed=embed, mention_author=False)
        except Exception as e:
            await ctx.reply(embed=self.bot.err(f"Spotify error: {e}"), mention_author=False)

    @spotify.command(name="playlist", description="Get info about a Spotify playlist.")
    async def sp_playlist(self, ctx: commands.Context, url: str):
        if isinstance(ctx.interaction, discord.Interaction):
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply(embed=self.bot.err("Spotify is not configured."), mention_author=False)
        try:
            type_, sp_id = extract_spotify_id(url)
            if type_ != "playlist" or not sp_id:
                return await ctx.reply(embed=self.bot.err("Please provide a valid Spotify playlist URL."), mention_author=False)
            playlist = sp.playlist(sp_id)
            tracks = playlist["tracks"]["items"][:10]
            desc = "\n".join(
                f"`{i}.` {item['track']['name']} — {', '.join(a['name'] for a in item['track']['artists'])}"
                for i, item in enumerate(tracks, 1)
                if item.get("track")
            )
            embed = discord.Embed(
                title=playlist["name"],
                url=playlist["external_urls"]["spotify"],
                description=desc or "Empty playlist.",
                color=SP_COLOR
            )
            embed.add_field(name="Tracks", value=str(playlist["tracks"]["total"]), inline=True)
            embed.add_field(name="Owner", value=playlist["owner"]["display_name"], inline=True)
            if playlist.get("images"):
                embed.set_thumbnail(url=playlist["images"][0]["url"])
            view = discord.ui.View()
            view.add_item(discord.ui.Button(label="▶ Play Playlist", style=discord.ButtonStyle.success, custom_id=f"sp_play_{sp_id}"))
            await ctx.reply(embed=embed, view=view, mention_author=False)
        except Exception as e:
            await ctx.reply(embed=self.bot.err(f"Spotify error: {e}"), mention_author=False)

    @spotify.command(name="profile", description="View your linked Spotify profile.")
    async def sp_profile(self, ctx: commands.Context):
        row = await db_get("spotifyprofile", {"userId": str(ctx.author.id)})
        if not row:
            embed = discord.Embed(
                description=(
                    "❌ No Spotify profile linked.\n\n"
                    "To link your profile, use the Spotify login feature if available."
                ),
                color=SP_COLOR
            )
            return await ctx.reply(embed=embed, mention_author=False)

        embed = discord.Embed(title=f"{E.spotify} {row['displayName']}'s Spotify", color=SP_COLOR)
        if row["profileUrl"]:
            embed.url = row["profileUrl"]
        if row["avatarUrl"]:
            embed.set_thumbnail(url=row["avatarUrl"])
        playlists = json_load(row["playlists"])
        embed.add_field(name="Playlists", value=str(len(playlists)), inline=True)
        embed.add_field(name="Linked", value=f"<t:{row['linkedAt']}:R>" if row["linkedAt"] else "N/A", inline=True)
        await ctx.reply(embed=embed, mention_author=False)


def json_load(val):
    import json
    try:
        return json.loads(val) if val else []
    except Exception:
        return []


async def setup(bot):
    await bot.add_cog(SpotifyCog(bot))
