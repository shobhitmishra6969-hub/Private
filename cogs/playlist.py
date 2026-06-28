"""User playlist commands."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from database.models import get_playlists, set_playlists
from utils.formatters import ms_to_time, clean_author
import utils.v2 as v2

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
            await v2.send(ctx, v2.info(
                "Subcommands: `create`, `delete`, `add`, `remove`, `list`, `load`, `info`"
            ))

    @playlist.command(name="create", description="Create a new playlist.")
    async def pl_create(self, ctx: commands.Context, *, name: str):
        if len(name) > 50:
            return await v2.send(ctx, v2.err("Name must be 50 characters or fewer."))
        playlists = await get_playlists(ctx.author.id)
        if len(playlists) >= MAX_PLAYLISTS:
            return await v2.send(ctx, v2.err(f"You can only have {MAX_PLAYLISTS} playlists."))
        _, existing = self._find_playlist(playlists, name)
        if existing:
            return await v2.send(ctx, v2.err(f"A playlist named `{name}` already exists."))
        playlists.append({"name": name, "tracks": [], "createdAt": int(__import__("time").time())})
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"➕ Playlist **{name}** created."))

    @playlist.command(name="delete", description="Delete a playlist.")
    async def pl_delete(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        playlists.pop(idx)
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"🗑️ Playlist **{name}** deleted."))

    @playlist.command(name="add", description="Add the current track to a playlist.")
    async def pl_add(self, ctx: commands.Context, *, name: str):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player or not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        t = player.current
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(
                f"Playlist `{name}` not found. Create it with `playlist create`."
            ))
        if len(pl["tracks"]) >= MAX_TRACKS_PER_PL:
            return await v2.send(ctx, v2.err(f"Playlist is full ({MAX_TRACKS_PER_PL} tracks max)."))
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
        await v2.send(ctx, v2.ok(f"➕ Added **{t.title}** to **{name}**."))

    @playlist.command(name="addqueue", description="Add all queued tracks to a playlist.")
    async def pl_addqueue(self, ctx: commands.Context, *, name: str):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        from utils.formatters import clean_thumbnail
        all_tracks = ([player.current] if player.current else []) + list(player.queue)
        added = 0
        for t in all_tracks:
            if t and len(pl["tracks"]) < MAX_TRACKS_PER_PL:
                pl["tracks"].append({
                    "title": t.title,
                    "uri": t.uri or "",
                    "author": t.author or "Unknown",
                    "duration": t.length or 0,
                })
                added += 1
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"➕ Added **{added}** tracks to **{name}**."))

    @playlist.command(name="remove", description="Remove a track from a playlist by position.")
    async def pl_remove(self, ctx: commands.Context, name: str, position: int):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        if position < 1 or position > len(pl["tracks"]):
            return await v2.send(ctx, v2.err("Invalid position."))
        removed = pl["tracks"].pop(position - 1)
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"❌ Removed **{removed['title']}** from **{name}**."))

    @playlist.command(name="list", description="List your playlists.")
    async def pl_list(self, ctx: commands.Context):
        playlists = await get_playlists(ctx.author.id)
        if not playlists:
            return await v2.send(ctx, v2.info(
                "You have no playlists. Create one with `playlist create <name>`."
            ))
        desc = "\n".join(
            f"`{i}.` **{pl['name']}** — `{len(pl['tracks'])}` tracks"
            for i, pl in enumerate(playlists, 1)
        )
        await v2.send(ctx, v2.container(desc, header="📋 Your Playlists"))

    @playlist.command(name="info", description="View tracks in a playlist.")
    async def pl_info(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        _, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        tracks = pl["tracks"][:15]
        desc = "\n".join(
            f"`{i}.` **{t['title'][:40]}** — {t.get('author', 'Unknown')[:25]} `[{ms_to_time(t.get('duration', 0))}]`"
            for i, t in enumerate(tracks, 1)
        ) or "Empty playlist."
        await v2.send(ctx, v2.container(
            desc,
            header=f"📋 {pl['name']}",
            footer=f"{len(pl['tracks'])} total tracks",
        ))

    @playlist.command(name="load", description="Load and play a playlist.")
    async def pl_load(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        _, pl = self._find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        if not pl["tracks"]:
            return await v2.send(ctx, v2.err("That playlist is empty."))
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await v2.send(ctx, v2.err("Join a voice channel first."))
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
        await v2.send(ctx, v2.container(
            f"▶️ Loaded **{added}** tracks from **{pl['name']}**!",
        ))


async def setup(bot):
    await bot.add_cog(PlaylistCog(bot))
