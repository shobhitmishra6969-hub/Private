"""Last.fm integration commands."""
from __future__ import annotations

import aiohttp
from typing import Optional

import discord
from discord.ext import commands

import config
import emojis as E
from database.models import get_lastfm, set_lastfm
from database import db_delete
import utils.v2 as v2

COLOR = config.COLOR
LFM_COLOR = 0xD51007
LASTFM_API = "https://ws.audioscrobbler.com/2.0/"


async def lfm_request(method: str, params: dict) -> dict | None:
    params.update({"method": method, "api_key": config.LASTFM_KEY, "format": "json"})
    async with aiohttp.ClientSession() as session:
        async with session.get(LASTFM_API, params=params) as resp:
            if resp.status == 200:
                return await resp.json()
    return None


class LastFMCog(commands.Cog, name="Lastfm"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_group(name="lastfm", aliases=["lfm"], description="Last.fm commands.")
    async def lastfm(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info(
                "Subcommands: `link`, `unlink`, `profile`, `recent`, `topartists`, `toptracks`, `nowplaying`"
            ))

    @lastfm.command(name="link", description="Link your Last.fm account.")
    async def lfm_link(self, ctx: commands.Context, username: str):
        if not config.LASTFM_KEY:
            return await v2.send(ctx, v2.err("Last.fm is not configured."))
        data = await lfm_request("user.getInfo", {"user": username})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err(f"Last.fm user `{username}` not found."))
        await set_lastfm(ctx.author.id, username)
        await v2.send(ctx, v2.container(
            f"{E.lastfm} Linked Last.fm account: **{username}**",
            color=LFM_COLOR,
        ))

    @lastfm.command(name="unlink", description="Unlink your Last.fm account.")
    async def lfm_unlink(self, ctx: commands.Context):
        row = await get_lastfm(ctx.author.id)
        if not row:
            return await v2.send(ctx, v2.err("No Last.fm account linked."))
        await db_delete("lastfm", {"userId": str(ctx.author.id)})
        await v2.send(ctx, v2.ok("Last.fm account unlinked."))

    @lastfm.command(name="profile", description="View a Last.fm profile.")
    async def lfm_profile(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await v2.send(ctx, v2.err(
                f"{'You have' if not user else f'{target.display_name} has'} no Last.fm linked."
            ))
        data = await lfm_request("user.getInfo", {"user": row["username"]})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err("Could not fetch Last.fm profile."))
        u = data["user"]
        thumb = None
        if u.get("image"):
            img_url = u["image"][-1]["#text"]
            if img_url:
                thumb = img_url
        body = (
            f"**Username:** {u['name']}\n"
            f"**Scrobbles:** {int(u.get('playcount', 0)):,}\n"
            f"**Country:** {u.get('country', 'N/A')}\n"
            f"**Registered:** <t:{int(u['registered']['unixtime'])}:D>"
        )
        await v2.send(ctx, v2.container(
            body,
            header=f"{E.lastfm} {u.get('realname') or u['name']}",
            thumbnail_url=thumb,
            color=LFM_COLOR,
        ))

    @lastfm.command(name="recent", description="View recent scrobbles.")
    async def lfm_recent(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await v2.send(ctx, v2.err("No Last.fm account linked."))
        data = await lfm_request("user.getRecentTracks", {"user": row["username"], "limit": 10})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err("Could not fetch recent tracks."))
        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await v2.send(ctx, v2.err("No recent tracks found."))
        desc = []
        for t in tracks[:10]:
            name = t.get("name", "?")
            artist = t.get("artist", {}).get("#text", "?")
            now = t.get("@attr", {}).get("nowplaying") == "true"
            prefix = "▶️ " if now else ""
            desc.append(f"{prefix}**{name}** — {artist}")
        await v2.send(ctx, v2.container(
            "\n".join(desc),
            header=f"{E.lastfm} {row['username']}'s Recent Tracks",
            color=LFM_COLOR,
        ))

    @lastfm.command(name="topartists", description="View top artists.")
    async def lfm_topartists(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await v2.send(ctx, v2.err("No Last.fm account linked."))
        periods = {"week": "7day", "month": "1month", "3month": "3month",
                   "6month": "6month", "year": "12month", "overall": "overall"}
        period_key = periods.get(period.lower(), "overall")
        data = await lfm_request("user.getTopArtists",
                                 {"user": row["username"], "period": period_key, "limit": 10})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err("Could not fetch top artists."))
        artists = data.get("topartists", {}).get("artist", [])
        if not artists:
            return await v2.send(ctx, v2.err("No data found."))
        desc = "\n".join(
            f"`{i}.` **{a['name']}** — {int(a.get('playcount', 0)):,} plays"
            for i, a in enumerate(artists, 1)
        )
        await v2.send(ctx, v2.container(
            desc,
            header=f"{E.lastfm} {row['username']}'s Top Artists ({period})",
            color=LFM_COLOR,
        ))

    @lastfm.command(name="toptracks", description="View top tracks.")
    async def lfm_toptracks(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await v2.send(ctx, v2.err("No Last.fm account linked."))
        periods = {"week": "7day", "month": "1month", "year": "12month", "overall": "overall"}
        period_key = periods.get(period.lower(), "overall")
        data = await lfm_request("user.getTopTracks",
                                 {"user": row["username"], "period": period_key, "limit": 10})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err("Could not fetch top tracks."))
        tracks = data.get("toptracks", {}).get("track", [])
        if not tracks:
            return await v2.send(ctx, v2.err("No data found."))
        desc = "\n".join(
            f"`{i}.` **{t['name']}** — {t.get('artist', {}).get('name', '?')} — {int(t.get('playcount', 0)):,} plays"
            for i, t in enumerate(tracks, 1)
        )
        await v2.send(ctx, v2.container(
            desc,
            header=f"{E.lastfm} {row['username']}'s Top Tracks ({period})",
            color=LFM_COLOR,
        ))

    @lastfm.command(name="nowplaying", aliases=["np"], description="Show what you're scrobbling now.")
    async def lfm_nowplaying(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await v2.send(ctx, v2.err("No Last.fm account linked."))
        data = await lfm_request("user.getRecentTracks", {"user": row["username"], "limit": 1})
        if not data or "error" in data:
            return await v2.send(ctx, v2.err("Could not fetch data."))
        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await v2.send(ctx, v2.err("No recent track found."))
        t = tracks[0]
        now = t.get("@attr", {}).get("nowplaying") == "true"
        name = t.get("name", "?")
        artist = t.get("artist", {}).get("#text", "?")
        album = t.get("album", {}).get("#text", "")
        thumb = None
        img = t.get("image", [])
        if img and img[-1].get("#text"):
            thumb = img[-1]["#text"]
        body = f"**{name}**\nby **{artist}**" + (f"\n*{album}*" if album else "")
        header = f"{'▶️ Now Playing' if now else '🕐 Last Played'} — {row['username']}"
        await v2.send(ctx, v2.container(body, header=header, thumbnail_url=thumb, color=LFM_COLOR))


async def setup(bot):
    await bot.add_cog(LastFMCog(bot))
