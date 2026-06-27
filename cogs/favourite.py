"""Liked songs commands."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from database.models import get_liked, set_liked
from utils.formatters import ms_to_time, clean_author, clean_thumbnail

COLOR = config.COLOR


class FavouriteCog(commands.Cog, name="Favourite"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="like", description="Like the current track.")
    async def like(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player or not player.current:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
        t = player.current
        songs = await get_liked(ctx.author.id)
        uris = [s.get("uri") for s in songs]
        if t.uri in uris:
            return await ctx.reply(embed=self.bot.err("Already in your liked songs."), mention_author=False)
        songs.append({
            "title": t.title,
            "uri": t.uri or "",
            "author": t.author or "Unknown",
            "duration": t.length or 0,
            "thumbnail": clean_thumbnail(t.artwork_url) or "",
        })
        await set_liked(ctx.author.id, songs)
        await ctx.reply(embed=discord.Embed(
            description=f"❤️ Added **{t.title}** to your liked songs!",
            color=COLOR
        ), mention_author=False)

    @commands.hybrid_command(name="unlike", description="Unlike the current track.")
    async def unlike(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        track_uri = None
        if player and player.current:
            track_uri = player.current.uri

        if not track_uri:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)

        songs = await get_liked(ctx.author.id)
        new_songs = [s for s in songs if s.get("uri") != track_uri]
        if len(new_songs) == len(songs):
            return await ctx.reply(embed=self.bot.err("This track isn't in your liked songs."), mention_author=False)
        await set_liked(ctx.author.id, new_songs)
        await ctx.reply(embed=discord.Embed(description="💔 Removed from liked songs.", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="likeall", description="Like all songs in the current queue.")
    async def likeall(self, ctx: commands.Context):
        from cogs.music import get_player
        player = get_player(ctx)
        if not player:
            return await ctx.reply(embed=self.bot.err("Nothing is playing."), mention_author=False)
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
        await ctx.reply(embed=discord.Embed(
            description=f"💖 Added **{added}** tracks to your liked songs!",
            color=COLOR
        ), mention_author=False)

    @commands.hybrid_command(name="showliked", aliases=["liked"], description="Show your liked songs.")
    async def showliked(self, ctx: commands.Context):
        songs = await get_liked(ctx.author.id)
        if not songs:
            return await ctx.reply(embed=self.bot.info_embed("You have no liked songs yet. Use `like` while a song plays!"), mention_author=False)

        per_page = 10
        pages = [songs[i: i + per_page] for i in range(0, len(songs), per_page)]

        def make_embed(page_idx: int) -> discord.Embed:
            page = pages[page_idx]
            desc = "\n".join(
                f"`{i + page_idx * per_page + 1}.` **{s['title'][:45]}** — {s.get('author', 'Unknown')[:25]} `[{ms_to_time(s.get('duration', 0))}]`"
                for i, s in enumerate(page)
            )
            embed = discord.Embed(title="❤️ Liked Songs", description=desc, color=COLOR)
            embed.set_footer(text=f"Page {page_idx + 1}/{len(pages)} • {len(songs)} total")
            return embed

        class PageView(discord.ui.View):
            def __init__(self):
                super().__init__(timeout=60)
                self.page = 0

            @discord.ui.button(label="◀", style=discord.ButtonStyle.secondary)
            async def prev(self, interaction: discord.Interaction, button: discord.ui.Button):
                if self.page > 0:
                    self.page -= 1
                await interaction.response.edit_message(embed=make_embed(self.page), view=self)

            @discord.ui.button(label="▶", style=discord.ButtonStyle.secondary)
            async def next_(self, interaction: discord.Interaction, button: discord.ui.Button):
                if self.page < len(pages) - 1:
                    self.page += 1
                await interaction.response.edit_message(embed=make_embed(self.page), view=self)

        view = PageView()
        await ctx.reply(embed=make_embed(0), view=view, mention_author=False)

    @commands.hybrid_command(name="playliked", description="Play all your liked songs.")
    async def playliked(self, ctx: commands.Context):
        songs = await get_liked(ctx.author.id)
        if not songs:
            return await ctx.reply(embed=self.bot.err("You have no liked songs."), mention_author=False)

        voice = getattr(ctx.author, "voice", None)
        if not voice or not voice.channel:
            return await ctx.reply(embed=self.bot.err("Join a voice channel first."), mention_author=False)

        from cogs.music import get_player, ensure_player
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

        await ctx.reply(embed=discord.Embed(
            description=f"▶️ Playing **{added}** liked songs!",
            color=COLOR
        ), mention_author=False)


async def setup(bot):
    await bot.add_cog(FavouriteCog(bot))
