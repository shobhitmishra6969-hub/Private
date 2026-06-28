"""Liked songs commands."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from database.models import get_liked, set_liked
from utils.formatters import ms_to_time, clean_author, clean_thumbnail
import utils.v2 as v2

COLOR = config.COLOR


class LikedLayoutView(discord.ui.LayoutView):
    def __init__(self, songs: list, author: discord.User | discord.Member):
        super().__init__(timeout=60)
        self.songs = songs
        self.author = author
        self.page = 0
        self.per_page = 10
        self.max_page = max(0, (len(songs) - 1) // self.per_page)
        self._build()

    def _build(self):
        self.clear_items()
        self.add_item(self._make_container())
        prev_btn = discord.ui.Button(
            label="◀", style=discord.ButtonStyle.secondary, disabled=self.page == 0
        )
        prev_btn.callback = self._prev_cb
        next_btn = discord.ui.Button(
            label="▶", style=discord.ButtonStyle.secondary, disabled=self.page >= self.max_page
        )
        next_btn.callback = self._next_cb
        self.add_item(prev_btn)
        self.add_item(next_btn)

    def _make_container(self) -> discord.ui.Container:
        start = self.page * self.per_page
        page_songs = self.songs[start: start + self.per_page]
        lines = [
            f"`{start + i + 1}.` **{s['title'][:45]}** — "
            f"{s.get('author', 'Unknown')[:25]} `[{ms_to_time(s.get('duration', 0))}]`"
            for i, s in enumerate(page_songs)
        ]
        body = "\n".join(lines)
        footer = f"Page {self.page + 1}/{self.max_page + 1} • {len(self.songs)} total"
        return v2.container(body, header="❤️ Liked Songs", footer=footer)

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author.id:
            return await interaction.response.send_message("This isn't your list.", ephemeral=True)
        if self.page > 0:
            self.page -= 1
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.author.id:
            return await interaction.response.send_message("This isn't your list.", ephemeral=True)
        if self.page < self.max_page:
            self.page += 1
        self._build()
        await interaction.response.edit_message(view=self)


class FavouriteCog(commands.Cog, name="Favourite"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="like", description="Like the current track.")
    async def like(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player or not player.current:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        t = player.current
        songs = await get_liked(ctx.author.id)
        uris = [s.get("uri") for s in songs]
        if t.uri in uris:
            return await v2.send(ctx, v2.err("Already in your liked songs."))
        songs.append({
            "title": t.title,
            "uri": t.uri or "",
            "author": t.author or "Unknown",
            "duration": t.length or 0,
            "thumbnail": clean_thumbnail(t.artwork_url) or "",
        })
        await set_liked(ctx.author.id, songs)
        await v2.send(ctx, v2.container(f"❤️ Added **{t.title}** to your liked songs!"))

    @commands.hybrid_command(name="unlike", description="Unlike the current track.")
    async def unlike(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        track_uri = None
        if player and player.current:
            track_uri = player.current.uri
        if not track_uri:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        songs = await get_liked(ctx.author.id)
        new_songs = [s for s in songs if s.get("uri") != track_uri]
        if len(new_songs) == len(songs):
            return await v2.send(ctx, v2.err("This track isn't in your liked songs."))
        await set_liked(ctx.author.id, new_songs)
        await v2.send(ctx, v2.container("💔 Removed from liked songs."))

    @commands.hybrid_command(name="likeall", description="Like all songs in the current queue.")
    async def likeall(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player:
            return await v2.send(ctx, v2.err("Nothing is playing."))
        songs = await get_liked(ctx.author.id)
        existing_uris = {s.get("uri") for s in songs}
        added = 0
        all_tracks = ([player.current] if player.current else []) + list(player.queue)
        for t in all_tracks:
            if t and t.uri and t.uri not in existing_uris:
                songs.append({
                    "title": t.title,
                    "uri": t.uri,
                    "author": t.author or "Unknown",
                    "duration": t.length or 0,
                    "thumbnail": clean_thumbnail(t.artwork_url) or "",
                })
                existing_uris.add(t.uri)
                added += 1
        await set_liked(ctx.author.id, songs)
        await v2.send(ctx, v2.container(f"💖 Added **{added}** tracks to your liked songs!"))

    @commands.hybrid_command(name="showliked", aliases=["liked"], description="Show your liked songs.")
    async def showliked(self, ctx: commands.Context):
        songs = await get_liked(ctx.author.id)
        if not songs:
            return await v2.send(ctx, v2.info(
                "You have no liked songs yet. Use `/like` while a song is playing!"
            ))
        view = LikedLayoutView(songs, ctx.author)
        await ctx.reply(view=view, mention_author=False)

    @commands.hybrid_command(name="playliked", description="Play all your liked songs.")
    async def playliked(self, ctx: commands.Context):
        songs = await get_liked(ctx.author.id)
        if not songs:
            return await v2.send(ctx, v2.err("You have no liked songs."))
        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await v2.send(ctx, v2.err("Join a voice channel first."))
        from cogs.music import ensure_player
        player = await ensure_player(ctx)
        player._text_channel_id = ctx.channel.id
        added = 0
        for s in songs:
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
        await v2.send(ctx, v2.container(f"▶️ Playing **{added}** liked songs!"))


async def setup(bot):
    await bot.add_cog(FavouriteCog(bot))
