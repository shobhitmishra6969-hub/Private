"""User playlist commands."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from database.models import get_playlists, set_playlists
from utils.formatters import ms_to_time, clean_author

COLOR = config.COLOR
MAX_PLAYLISTS = 10
MAX_TRACKS_PER_PL = 100


class PlaylistCog(commands.Cog, name="Playlist"):

    def __init__(self, bot):
        self.bot = bot

    def _find_playlist(self, playlists: list, name: str) -> tuple[int, dict | None]:
        name_lower = name.lower()
        for i, pl in enumerate(playlists):
            if pl["name"].lower() == name_lower:
                return i, pl
        return -1, None

    @commands.hybrid_group(name="playlist", aliases=["pl"], description="Manage your playlists.")
    async def playlist(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed(
                "Subcommands: `create`, `delete`, `add`, `remove`, `list`, `load`, `info`"
            ), mention_author=False)

    @playlist.command(name="create", description="Create a new playlist.")
    async def pl_create(self, ctx: commands.Context, *, name: str):
        if len(name) > 50:
            return await ctx.reply(embed=self.bot.err("Name must be 50 characters or fewer."), mention_author=False)
        playlists = await get_playlists(ctx.author.id)
        if len(playlists) >= MAX_PLAYLISTS:
            return await ctx.reply(embed=self.bot.err(f"You can only have {MAX_PLAYLISTS} playlists."), mention_author=False)
        _, existing = self._find_playlist(playlists, name)
        if existing:
            return await ctx.reply(embed=self.bot.err(f"A playlist named `{name}` already exists."), mention_author=False)
        playlists.append({"name": name, "tracks": [], "createdAt": int(__import__("time").time())})
        await set_playlists(ctx.author.id, playlists)
        await ctx.reply(embed=self.bot.ok(f"➕ Playlist **{name}** created."), mention_author=False)

    @playlist.command(name="delete", description="Delete a playlist.")
    async def pl_delete(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found."), mention_author=False)
        playlists.pop(idx)
        await set_playlists(ctx.author.id, playlists)
        await ctx.reply(embed=self.bot.ok(f"🗑️ Playlist **{name}** deleted."), mention_author=False)

    @playlist.command(name="add", description="Add the current track to a playlist.")
    async def pl_add(self, ctx: commands.Context, *, name: str):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player or not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        t = player.current
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found. Create it with `playlist create`."), mention_author=False)
        if len(pl["tracks"]) >= MAX_TRACKS_PER_PL:
            return await ctx.reply(embed=self.bot.err(f"Playlist is full ({MAX_TRACKS_PER_PL} tracks max)."), mention_author=False)
        from utils.formatters import clean_thumbnail
        pl["tracks"].append({
            "title": t.title,
            "uri": t.uri or "",
            "author": t.author or "Unknown",
            "duration": t.length or 0,
            "thumbnail": clean_thumbnail(t.artwork_url) or "",
        })
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await ctx.reply(embed=self.bot.ok(f"➕ Added **{t.title}** to **{name}**."), mention_author=False)

    @playlist.command(name="addqueue", description="Add all queued tracks to a playlist.")
    async def pl_addqueue(self, ctx: commands.Context, *, name: str):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found."), mention_author=False)
        from utils.formatters import clean_thumbnail
        all_tracks = ([player.current] if player.current else []) + list(player.queue)
        added = 0
        for t in all_tracks:
            if t and len(pl["tracks"]) < MAX_TRACKS_PER_PL:
                pl["tracks"].append({"title": t.title, "uri": t.uri or "", "author": t.author or "Unknown", "duration": t.length or 0})
                added += 1
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await ctx.reply(embed=self.bot.ok(f"➕ Added **{added}** tracks to **{name}**."), mention_author=False)

    @playlist.command(name="remove", description="Remove a track from a playlist by position.")
    async def pl_remove(self, ctx: commands.Context, name: str, position: int):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found."), mention_author=False)
        if position < 1 or position > len(pl["tracks"]):
            return await ctx.reply(embed=self.bot.err("Invalid position."), mention_author=False)
        removed = pl["tracks"].pop(position - 1)
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await ctx.reply(embed=self.bot.ok(f"❌ Removed **{removed['title']}** from **{name}**."), mention_author=False)

    @playlist.command(name="list", description="List your playlists.")
    async def pl_list(self, ctx: commands.Context):
        playlists = await get_playlists(ctx.author.id)
        if not playlists:
            return await ctx.reply(embed=self.bot.info_embed("You have no playlists. Create one with `playlist create <name>`."), mention_author=False)
        desc = "\n".join(
            f"`{i}.` **{pl['name']}** — `{len(pl['tracks'])}` tracks"
            for i, pl in enumerate(playlists, 1)
        )
        embed = discord.Embed(title="📋 Your Playlists", description=desc, color=COLOR)
        await ctx.reply(embed=embed, mention_author=False)

    @playlist.command(name="info", description="View tracks in a playlist.")
    async def pl_info(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        _, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found."), mention_author=False)
        tracks = pl["tracks"][:15]
        desc = "\n".join(
            f"`{i}.` **{t['title'][:40]}** — {t.get('author', 'Unknown')[:25]} `[{ms_to_time(t.get('duration', 0))}]`"
            for i, t in enumerate(tracks, 1)
        ) or "Empty playlist."
        embed = discord.Embed(title=f"📋 {pl['name']}", description=desc, color=COLOR)
        embed.set_footer(text=f"{len(pl['tracks'])} total tracks")
        await ctx.reply(embed=embed, mention_author=False)

    @playlist.command(name="load", description="Load and play a playlist.")
    async def pl_load(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        _, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await ctx.reply(embed=self.bot.err(f"Playlist `{name}` not found."), mention_author=False)
        if not pl["tracks"]:
            return await ctx.reply(embed=self.bot.err("That playlist is empty."), mention_author=False)

        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await ctx.reply(embed=self.bot.err("Join a voice channel first."), mention_author=False)

        from cogs.music import ensure_player
        player = await ensure_player(ctx)
        player._text_channel_id = ctx.channel.id

        added = 0
        for s in pl["tracks"]:
            uri = s.get("uri")
            if not uri:
                continue
            try:
                results = await ravelink.Playable.search(uri)
                if not results:
                    continue
                t = results[0] if not isinstance(results, ravelink.Playlist) else results.tracks[0]
                t.extras = {"requester_id": ctx.author.id, "requester_name": ctx.author.display_name}
                await player.queue.put_wait(t)
                added += 1
            except Exception:
                continue

        if not player.playing:
            try:
                next_t = player.queue.get()
                await player.play(next_t)
            except ravelink.QueueEmpty:
                pass

        await ctx.reply(embed=discord.Embed(
            description=f"▶️ Loaded **{added}** tracks from **{pl['name']}**!",
            color=COLOR
        ), mention_author=False)


async def setup(bot):
    await bot.add_cog(PlaylistCog(bot))
