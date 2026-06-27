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
            await ctx.reply(embed=self.bot.info_embed(
                "Subcommands: `link`, `unlink`, `profile`, `recent`, `topartists`, `toptracks`"
            ), mention_author=False)

    @lastfm.command(name="link", description="Link your Last.fm account.")
    async def lfm_link(self, ctx: commands.Context, username: str):
        if not config.LASTFM_KEY:
            return await ctx.reply(embed=self.bot.err("Last.fm is not configured."), mention_author=False)
        data = await lfm_request("user.getInfo", {"user": username})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err(f"Last.fm user `{username}` not found."), mention_author=False)
        await set_lastfm(ctx.author.id, username)
        embed = discord.Embed(
            description=f"{E.lastfm} Linked Last.fm account: **{username}**",
            color=LFM_COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @lastfm.command(name="unlink", description="Unlink your Last.fm account.")
    async def lfm_unlink(self, ctx: commands.Context):
        row = await get_lastfm(ctx.author.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("No Last.fm account linked."), mention_author=False)
        await db_delete("lastfm", {"userId": str(ctx.author.id)})
        await ctx.reply(embed=self.bot.ok("Last.fm account unlinked."), mention_author=False)

    @lastfm.command(name="profile", description="View a Last.fm profile.")
    async def lfm_profile(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await ctx.reply(embed=self.bot.err(
                f"{'You have' if not user else f'{target.display_name} has'} no Last.fm linked."
            ), mention_author=False)

        data = await lfm_request("user.getInfo", {"user": row["username"]})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err("Could not fetch Last.fm profile."), mention_author=False)

        u = data["user"]
        embed = discord.Embed(
            title=f"{E.lastfm} {u.get('realname') or u['name']}",
            url=u.get("url", ""),
            color=LFM_COLOR
        )
        embed.add_field(name="Username", value=u["name"], inline=True)
        embed.add_field(name="Scrobbles", value=f"{int(u.get('playcount', 0)):,}", inline=True)
        embed.add_field(name="Country", value=u.get("country", "N/A"), inline=True)
        embed.add_field(name="Registered", value=f"<t:{int(u['registered']['unixtime'])}:D>", inline=True)
        if u.get("image"):
            img_url = u["image"][-1]["#text"]
            if img_url:
                embed.set_thumbnail(url=img_url)
        await ctx.reply(embed=embed, mention_author=False)

    @lastfm.command(name="recent", description="View recent scrobbles.")
    async def lfm_recent(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("No Last.fm account linked."), mention_author=False)

        data = await lfm_request("user.getRecentTracks", {"user": row["username"], "limit": 10})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err("Could not fetch recent tracks."), mention_author=False)

        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply(embed=self.bot.err("No recent tracks found."), mention_author=False)

        desc = []
        for t in tracks[:10]:
            name = t.get("name", "?")
            artist = t.get("artist", {}).get("#text", "?")
            now = t.get("@attr", {}).get("nowplaying") == "true"
            prefix = "▶️ " if now else ""
            desc.append(f"{prefix}**{name}** — {artist}")

        embed = discord.Embed(
            title=f"{E.lastfm} {row['username']}'s Recent Tracks",
            description="\n".join(desc),
            color=LFM_COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @lastfm.command(name="topartists", description="View top artists.")
    async def lfm_topartists(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("No Last.fm account linked."), mention_author=False)
        periods = {"week": "7day", "month": "1month", "3month": "3month", "6month": "6month",
                   "year": "12month", "overall": "overall"}
        period_key = periods.get(period.lower(), "overall")
        data = await lfm_request("user.getTopArtists", {"user": row["username"], "period": period_key, "limit": 10})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err("Could not fetch top artists."), mention_author=False)

        artists = data.get("topartists", {}).get("artist", [])
        if not artists:
            return await ctx.reply(embed=self.bot.err("No data found."), mention_author=False)

        desc = "\n".join(
            f"`{i}.` **{a['name']}** — {int(a.get('playcount', 0)):,} plays"
            for i, a in enumerate(artists, 1)
        )
        embed = discord.Embed(
            title=f"{E.lastfm} {row['username']}'s Top Artists ({period})",
            description=desc, color=LFM_COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @lastfm.command(name="toptracks", description="View top tracks.")
    async def lfm_toptracks(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("No Last.fm account linked."), mention_author=False)
        periods = {"week": "7day", "month": "1month", "year": "12month", "overall": "overall"}
        period_key = periods.get(period.lower(), "overall")
        data = await lfm_request("user.getTopTracks", {"user": row["username"], "period": period_key, "limit": 10})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err("Could not fetch top tracks."), mention_author=False)

        tracks = data.get("toptracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply(embed=self.bot.err("No data found."), mention_author=False)

        desc = "\n".join(
            f"`{i}.` **{t['name']}** — {t.get('artist', {}).get('name', '?')} — {int(t.get('playcount', 0)):,} plays"
            for i, t in enumerate(tracks, 1)
        )
        embed = discord.Embed(
            title=f"{E.lastfm} {row['username']}'s Top Tracks ({period})",
            description=desc, color=LFM_COLOR
        )
        await ctx.reply(embed=embed, mention_author=False)

    @lastfm.command(name="nowplaying", aliases=["np"], description="Show what you're scrobbling now.")
    async def lfm_nowplaying(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        row = await get_lastfm(target.id)
        if not row:
            return await ctx.reply(embed=self.bot.err("No Last.fm account linked."), mention_author=False)
        data = await lfm_request("user.getRecentTracks", {"user": row["username"], "limit": 1})
        if not data or "error" in data:
            return await ctx.reply(embed=self.bot.err("Could not fetch data."), mention_author=False)
        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply(embed=self.bot.err("No recent track found."), mention_author=False)
        t = tracks[0]
        now = t.get("@attr", {}).get("nowplaying") == "true"
        name = t.get("name", "?")
        artist = t.get("artist", {}).get("#text", "?")
        album = t.get("album", {}).get("#text", "")
        embed = discord.Embed(
            title=f"{'▶️ Now Playing' if now else '🕐 Last Played'} — {row['username']}",
            description=f"**{name}**\nby **{artist}**" + (f"\n*{album}*" if album else ""),
            color=LFM_COLOR
        )
        img = t.get("image", [])
        if img and img[-1].get("#text"):
            embed.set_thumbnail(url=img[-1]["#text"])
        await ctx.reply(embed=embed, mention_author=False)


async def setup(bot):
    await bot.add_cog(LastFMCog(bot))
