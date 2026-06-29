"""User playlist commands — interactive v2 UI."""
from __future__ import annotations

import time
from typing import Optional

import discord
import ravelink
from discord.ext import commands

import config
from database.models import get_playlists, set_playlists
from utils.formatters import ms_to_time, clean_author, clean_thumbnail
import utils.v2 as v2

COLOR = config.COLOR
COLOR_DARK = 0x2B2D31
COLOR_ERR  = 0xFF5555
COLOR_OK   = 0x57F287

MAX_PLAYLISTS      = 10
MAX_TRACKS_PER_PL  = 100
PAGE_SIZE          = 5   # playlist selector buttons per page
TRACK_PAGE_SIZE    = 10  # tracks shown per page in track view


# ── helpers ───────────────────────────────────────────────────────────────────

def _find_playlist(playlists: list, name: str) -> tuple[int, dict | None]:
    name_lower = name.lower()
    for i, pl in enumerate(playlists):
        if pl["name"].lower() == name_lower:
            return i, pl
    return -1, None


# ── Modals ────────────────────────────────────────────────────────────────────

class CreatePlaylistModal(discord.ui.Modal, title="Create Playlist"):
    name_input = discord.ui.TextInput(
        label="Playlist Name",
        placeholder="e.g. Chill Vibes, Workout Hits…",
        min_length=1,
        max_length=50,
        required=True,
    )

    def __init__(self, menu: "PlaylistMenuView"):
        super().__init__()
        self.menu = menu

    async def on_submit(self, interaction: discord.Interaction) -> None:
        name = self.name_input.value.strip()
        playlists = await get_playlists(self.menu.author.id)

        if len(playlists) >= MAX_PLAYLISTS:
            return await interaction.response.send_message(
                f"❌ You can only have **{MAX_PLAYLISTS}** playlists.", ephemeral=True
            )
        _, existing = _find_playlist(playlists, name)
        if existing:
            return await interaction.response.send_message(
                f"❌ A playlist named **{name}** already exists.", ephemeral=True
            )

        playlists.append({"name": name, "tracks": [], "createdAt": int(time.time())})
        await set_playlists(self.menu.author.id, playlists)

        self.menu.playlists = playlists
        self.menu.selected_idx = len(playlists) - 1
        self.menu.page = self.menu.selected_idx // PAGE_SIZE
        self.menu._build()
        await interaction.response.edit_message(view=self.menu)


class RenamePlaylistModal(discord.ui.Modal, title="Rename Playlist"):
    new_name = discord.ui.TextInput(
        label="New Name",
        placeholder="New playlist name…",
        min_length=1,
        max_length=50,
        required=True,
    )

    def __init__(self, menu: "PlaylistMenuView"):
        super().__init__()
        self.menu = menu

    async def on_submit(self, interaction: discord.Interaction) -> None:
        name = self.new_name.value.strip()
        playlists = self.menu.playlists
        idx = self.menu.selected_idx
        if idx is None or idx >= len(playlists):
            return await interaction.response.send_message("❌ No playlist selected.", ephemeral=True)

        _, existing = _find_playlist(playlists, name)
        if existing and existing is not playlists[idx]:
            return await interaction.response.send_message(
                f"❌ A playlist named **{name}** already exists.", ephemeral=True
            )

        playlists[idx]["name"] = name
        await set_playlists(self.menu.author.id, playlists)
        self.menu.playlists = playlists
        self.menu._build()
        await interaction.response.edit_message(view=self.menu)


# ── Track list view ───────────────────────────────────────────────────────────

class TrackListView(discord.ui.LayoutView):
    """Paginated track list for a playlist."""

    def __init__(self, menu: "PlaylistMenuView", pl: dict, pl_idx: int):
        super().__init__(timeout=120)
        self.menu     = menu
        self.pl       = pl
        self.pl_idx   = pl_idx
        self.track_page = 0
        self._build()

    def _build(self):
        self.clear_items()
        tracks = self.pl["tracks"]
        total  = len(tracks)
        start  = self.track_page * TRACK_PAGE_SIZE
        end    = min(start + TRACK_PAGE_SIZE, total)
        page_tracks = tracks[start:end]
        total_pages = max(1, (total + TRACK_PAGE_SIZE - 1) // TRACK_PAGE_SIZE)

        # ── Main card ─────────────────────────────────────────────────────────
        card = discord.ui.Container(accent_color=COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## 📋 {self.pl['name']}"
        ))
        card.add_item(discord.ui.Separator())

        if not tracks:
            card.add_item(discord.ui.TextDisplay(
                "This playlist is empty.\nAdd a track with **+playlist add <name>** while a song is playing."
            ))
        else:
            lines = []
            for i, t in enumerate(page_tracks, start + 1):
                dur   = ms_to_time(t.get("duration", 0))
                title = t["title"][:38]
                artist = clean_author(t.get("author", ""))[:22]
                lines.append(f"`{i:>2}.` **{title}** — {artist}  `[{dur}]`")
            card.add_item(discord.ui.TextDisplay("\n".join(lines)))

        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            f"-# {total} track{'s' if total != 1 else ''}  •  Page {self.track_page + 1}/{total_pages}"
        ))
        self.add_item(card)

        # ── Nav buttons ───────────────────────────────────────────────────────
        nav = discord.ui.Container(accent_color=COLOR_DARK)

        prev_btn  = discord.ui.Button(label="◄ Prev",  style=discord.ButtonStyle.secondary, custom_id="tl_prev",  disabled=self.track_page == 0)
        next_btn  = discord.ui.Button(label="Next ►",  style=discord.ButtonStyle.secondary, custom_id="tl_next",  disabled=end >= total)
        back_btn  = discord.ui.Button(label="← Back",  style=discord.ButtonStyle.primary,   custom_id="tl_back")
        close_btn = discord.ui.Button(label="✕ Close", style=discord.ButtonStyle.danger,     custom_id="tl_close")

        prev_btn.callback  = self._prev_cb
        next_btn.callback  = self._next_cb
        back_btn.callback  = self._back_cb
        close_btn.callback = self._close_cb

        nav.add_item(discord.ui.ActionRow(prev_btn, next_btn, back_btn, close_btn))
        self.add_item(nav)

    async def _check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.menu.author.id:
            await interaction.response.send_message("This isn't your menu.", ephemeral=True)
            return False
        return True

    async def _prev_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.track_page -= 1
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.track_page += 1
        self._build()
        await interaction.response.edit_message(view=self)

    async def _back_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.menu._build()
        await interaction.response.edit_message(view=self.menu)

    async def _close_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.defer()
        await interaction.delete_original_response()
        self.stop()


# ── Main playlist menu ────────────────────────────────────────────────────────

class PlaylistMenuView(discord.ui.LayoutView):
    """
    Interactive v2 playlist manager.
    Layout:
      [Container 1] — playlist list with track counts
      [Container 2] — selector buttons (numbered, paged) + action row
    """

    def __init__(self, bot, author: discord.Member, playlists: list):
        super().__init__(timeout=180)
        self.bot          = bot
        self.author       = author
        self.playlists    = playlists
        self.selected_idx: int | None = None
        self.page         = 0
        self._build()

    # ── build ─────────────────────────────────────────────────────────────────

    def _build(self):
        self.clear_items()
        total_pls   = len(self.playlists)
        total_pages = max(1, (total_pls + PAGE_SIZE - 1) // PAGE_SIZE)
        self.page   = min(self.page, max(0, total_pages - 1))

        # ── Container 1: Playlist list ────────────────────────────────────────
        card = discord.ui.Container(accent_color=COLOR)
        card.add_item(discord.ui.TextDisplay("## <:_playlist:1484571731036213430> Your Playlists"))
        card.add_item(discord.ui.Separator())

        if not self.playlists:
            card.add_item(discord.ui.TextDisplay(
                "You have no playlists yet.\n\n"
                "Tap **➕ Create** to make your first playlist, then add songs with:\n"
                "`+playlist add <name>` while a track is playing."
            ))
        else:
            lines = []
            for i, pl in enumerate(self.playlists):
                is_sel  = (i == self.selected_idx)
                marker  = "▶ " if is_sel else "    "
                total_t = len(pl["tracks"])
                lines.append(
                    f"{marker}`{i + 1}.` **{pl['name']}** — `{total_t}` track{'s' if total_t != 1 else ''}"
                )
            card.add_item(discord.ui.TextDisplay("\n".join(lines)))

        card.add_item(discord.ui.Separator())
        if self.playlists:
            sel_name = f"**{self.playlists[self.selected_idx]['name']}** selected" if self.selected_idx is not None else "Tap a number to select a playlist"
            card.add_item(discord.ui.TextDisplay(f"-# {sel_name}"))
        else:
            card.add_item(discord.ui.TextDisplay(f"-# {len(self.playlists)}/{MAX_PLAYLISTS} playlists used"))
        self.add_item(card)

        # ── Container 2: Controls ─────────────────────────────────────────────
        ctrl = discord.ui.Container(accent_color=COLOR_DARK)

        # Playlist number selector buttons (current page)
        if self.playlists:
            start = self.page * PAGE_SIZE
            end   = min(start + PAGE_SIZE, total_pls)
            sel_btns: list[discord.ui.Button] = []
            for i in range(start, end):
                pl   = self.playlists[i]
                btn  = discord.ui.Button(
                    label  = f"{i + 1}. {pl['name'][:12]}",
                    style  = discord.ButtonStyle.primary if i == self.selected_idx else discord.ButtonStyle.secondary,
                    custom_id = f"pl_sel_{i}",
                )
                btn.callback = self._make_select_cb(i)
                sel_btns.append(btn)

            # Page nav if more than PAGE_SIZE playlists
            if total_pages > 1:
                prev_p = discord.ui.Button(label="◄", style=discord.ButtonStyle.secondary, custom_id="pl_pg_prev", disabled=self.page == 0)
                next_p = discord.ui.Button(label="►", style=discord.ButtonStyle.secondary, custom_id="pl_pg_next", disabled=self.page >= total_pages - 1)
                prev_p.callback = self._page_prev_cb
                next_p.callback = self._page_next_cb
                sel_btns = [prev_p] + sel_btns + [next_p]

            ctrl.add_item(discord.ui.ActionRow(*sel_btns))

        ctrl.add_item(discord.ui.Separator())

        # Action row 1
        has_sel  = self.selected_idx is not None and self.playlists
        create_btn = discord.ui.Button(label="➕ Create",     style=discord.ButtonStyle.success,   custom_id="pl_create")
        load_btn   = discord.ui.Button(label="▶️ Load",       style=discord.ButtonStyle.primary,   custom_id="pl_load",   disabled=not has_sel)
        tracks_btn = discord.ui.Button(label="📄 Tracks",     style=discord.ButtonStyle.secondary, custom_id="pl_tracks", disabled=not has_sel)
        create_btn.callback = self._create_cb
        load_btn.callback   = self._load_cb
        tracks_btn.callback = self._tracks_cb
        ctrl.add_item(discord.ui.ActionRow(create_btn, load_btn, tracks_btn))

        # Action row 2
        rename_btn = discord.ui.Button(label="✏️ Rename",     style=discord.ButtonStyle.secondary, custom_id="pl_rename", disabled=not has_sel)
        delete_btn = discord.ui.Button(label="🗑️ Delete",     style=discord.ButtonStyle.danger,    custom_id="pl_delete", disabled=not has_sel)
        close_btn  = discord.ui.Button(label="✕ Close",       style=discord.ButtonStyle.secondary, custom_id="pl_close")
        rename_btn.callback = self._rename_cb
        delete_btn.callback = self._delete_cb
        close_btn.callback  = self._close_cb
        ctrl.add_item(discord.ui.ActionRow(rename_btn, delete_btn, close_btn))

        self.add_item(ctrl)

    # ── auth check ────────────────────────────────────────────────────────────

    async def _check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author.id:
            await interaction.response.send_message("This isn't your menu.", ephemeral=True)
            return False
        return True

    # ── selector callbacks ─────────────────────────────────────────────────────

    def _make_select_cb(self, idx: int):
        async def callback(interaction: discord.Interaction):
            if not await self._check(interaction): return
            self.selected_idx = idx
            self._build()
            await interaction.response.edit_message(view=self)
        return callback

    async def _page_prev_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.page -= 1
        self._build()
        await interaction.response.edit_message(view=self)

    async def _page_next_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.page += 1
        self._build()
        await interaction.response.edit_message(view=self)

    # ── action callbacks ───────────────────────────────────────────────────────

    async def _create_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        playlists = await get_playlists(self.author.id)
        if len(playlists) >= MAX_PLAYLISTS:
            return await interaction.response.send_message(
                f"❌ You can only have **{MAX_PLAYLISTS}** playlists.", ephemeral=True
            )
        self.playlists = playlists
        await interaction.response.send_modal(CreatePlaylistModal(self))

    async def _load_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        if self.selected_idx is None:
            return await interaction.response.send_message("Select a playlist first.", ephemeral=True)

        pl = self.playlists[self.selected_idx]
        if not pl["tracks"]:
            return await interaction.response.send_message(
                f"❌ **{pl['name']}** is empty. Add songs with `+playlist add {pl['name']}`.", ephemeral=True
            )

        member = interaction.user
        voice  = getattr(member, "voice", None)
        if not voice or not voice.channel:
            return await interaction.response.send_message(
                "❌ Join a voice channel first.", ephemeral=True
            )

        await interaction.response.defer()

        from cogs.music import ensure_player
        ctx_like = type("_Ctx", (), {
            "author": member,
            "guild":  interaction.guild,
            "channel": interaction.channel,
            "voice_client": interaction.guild.voice_client if interaction.guild else None,
        })()

        try:
            player = await ensure_player(ctx_like)
            player._text_channel_id = interaction.channel_id
        except Exception as e:
            return await interaction.followup.send(f"❌ Could not connect: {e}", ephemeral=True)

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
                t.extras = {"requester_id": member.id, "requester_name": member.display_name}
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

        # Update the menu and show a status card
        result_card = discord.ui.Container(accent_color=COLOR_OK)
        result_card.add_item(discord.ui.TextDisplay(
            f"## ▶️ Loaded Playlist\n"
            f"**{pl['name']}** — `{added}` track{'s' if added != 1 else ''} queued successfully!"
        ))
        lv = discord.ui.LayoutView(timeout=None)
        lv.add_item(result_card)
        await interaction.followup.send(view=lv, components_v2=True)

    async def _tracks_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        if self.selected_idx is None:
            return await interaction.response.send_message("Select a playlist first.", ephemeral=True)
        pl = self.playlists[self.selected_idx]
        track_view = TrackListView(self, pl, self.selected_idx)
        await interaction.response.edit_message(view=track_view)

    async def _rename_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        if self.selected_idx is None:
            return await interaction.response.send_message("Select a playlist first.", ephemeral=True)
        await interaction.response.send_modal(RenamePlaylistModal(self))

    async def _delete_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        if self.selected_idx is None:
            return await interaction.response.send_message("Select a playlist first.", ephemeral=True)

        pl   = self.playlists[self.selected_idx]
        name = pl["name"]

        # Confirm delete with a small ephemeral prompt
        confirm_card = discord.ui.Container(accent_color=COLOR_ERR)
        confirm_card.add_item(discord.ui.TextDisplay(
            f"## 🗑️ Delete Playlist\nAre you sure you want to delete **{name}**?\n"
            f"This will remove `{len(pl['tracks'])}` track{'s' if len(pl['tracks']) != 1 else ''} permanently."
        ))

        yes_btn = discord.ui.Button(label="Yes, Delete", style=discord.ButtonStyle.danger,     custom_id="pl_del_yes")
        no_btn  = discord.ui.Button(label="Cancel",      style=discord.ButtonStyle.secondary,  custom_id="pl_del_no")

        async def _yes(i: discord.Interaction):
            if i.user.id != self.author.id: return
            pls = await get_playlists(self.author.id)
            idx, _ = _find_playlist(pls, name)
            if idx != -1:
                pls.pop(idx)
                await set_playlists(self.author.id, pls)
            self.playlists    = pls
            self.selected_idx = None
            self.page         = 0
            self._build()
            await i.response.edit_message(view=self)

        async def _no(i: discord.Interaction):
            if i.user.id != self.author.id: return
            self._build()
            await i.response.edit_message(view=self)

        yes_btn.callback = _yes
        no_btn.callback  = _no

        confirm_lv = discord.ui.LayoutView(timeout=30)
        confirm_lv.add_item(confirm_card)
        confirm_lv.add_item(discord.ui.ActionRow(yes_btn, no_btn))
        await interaction.response.edit_message(view=confirm_lv)

    async def _close_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.defer()
        await interaction.delete_original_response()
        self.stop()

    async def on_timeout(self):
        pass


# ── Cog ───────────────────────────────────────────────────────────────────────

class PlaylistCog(commands.Cog, name="Playlist"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_group(name="playlist", aliases=["pl"], description="Manage your playlists.")
    async def playlist(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            playlists = await get_playlists(ctx.author.id)
            view = PlaylistMenuView(self.bot, ctx.author, playlists)
            await ctx.reply(view=view, mention_author=False, components_v2=True)

    @playlist.command(name="create", description="Create a new playlist.")
    async def pl_create(self, ctx: commands.Context, *, name: str):
        if len(name) > 50:
            return await v2.send(ctx, v2.err("Name must be 50 characters or fewer."))
        playlists = await get_playlists(ctx.author.id)
        if len(playlists) >= MAX_PLAYLISTS:
            return await v2.send(ctx, v2.err(f"You can only have {MAX_PLAYLISTS} playlists."))
        _, existing = _find_playlist(playlists, name)
        if existing:
            return await v2.send(ctx, v2.err(f"A playlist named `{name}` already exists."))
        playlists.append({"name": name, "tracks": [], "createdAt": int(time.time())})
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"➕ Playlist **{name}** created."))

    @playlist.command(name="delete", description="Delete a playlist.")
    async def pl_delete(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = _find_playlist(playlists, name)
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
        idx, pl = _find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(
                f"Playlist `{name}` not found. Create it with `+playlist create <name>`."
            ))
        if len(pl["tracks"]) >= MAX_TRACKS_PER_PL:
            return await v2.send(ctx, v2.err(f"Playlist is full ({MAX_TRACKS_PER_PL} tracks max)."))
        pl["tracks"].append({
            "title":    t.title,
            "uri":      t.uri or "",
            "author":   t.author or "Unknown",
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
        idx, pl = _find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        all_tracks = ([player.current] if player.current else []) + list(player.queue)
        added = 0
        for t in all_tracks:
            if t and len(pl["tracks"]) < MAX_TRACKS_PER_PL:
                pl["tracks"].append({
                    "title":    t.title,
                    "uri":      t.uri or "",
                    "author":   t.author or "Unknown",
                    "duration": t.length or 0,
                })
                added += 1
        playlists[idx] = pl
        await set_playlists(ctx.author.id, playlists)
        await v2.send(ctx, v2.ok(f"➕ Added **{added}** tracks to **{name}**."))

    @playlist.command(name="remove", description="Remove a track from a playlist by position.")
    async def pl_remove(self, ctx: commands.Context, name: str, position: int):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = _find_playlist(playlists, name)
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
        view = PlaylistMenuView(self.bot, ctx.author, playlists)
        await ctx.reply(view=view, mention_author=False, components_v2=True)

    @playlist.command(name="info", description="View tracks in a playlist.")
    async def pl_info(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        idx, pl = _find_playlist(playlists, name)
        if pl is None:
            return await v2.send(ctx, v2.err(f"Playlist `{name}` not found."))
        # Open the menu with that playlist selected and immediately go to track view
        menu = PlaylistMenuView(self.bot, ctx.author, playlists)
        menu.selected_idx = idx
        menu.page = idx // PAGE_SIZE
        track_view = TrackListView(menu, pl, idx)
        await ctx.reply(view=track_view, mention_author=False, components_v2=True)

    @playlist.command(name="load", description="Load and play a playlist.")
    async def pl_load(self, ctx: commands.Context, *, name: str):
        playlists = await get_playlists(ctx.author.id)
        _, pl = _find_playlist(playlists, name)
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
        await v2.send(ctx, v2.ok(f"▶️ Loaded **{added}** tracks from **{pl['name']}**!"))


async def setup(bot):
    await bot.add_cog(PlaylistCog(bot))
