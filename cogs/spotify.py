"""Spotify integration — interactive hub + search/album/artist/playlist subcommands."""
from __future__ import annotations

import json
import re
from typing import Optional

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from database import db_get, db_set, db_delete, now_ts
from utils.formatters import ms_to_time

COLOR     = config.COLOR
SP_COLOR  = 0x1DB954   # Spotify green
SP_PURPLE = 0x7B2FBE   # accent for not-linked / profile views

SPOTIFY_USER_RE = re.compile(r"open\.spotify\.com/user/([A-Za-z0-9_-]+)")


# ── Spotify API client ────────────────────────────────────────────────────────

def _make_sp():
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
        _sp = _make_sp()
    return _sp


# ── Utility helpers ───────────────────────────────────────────────────────────

def extract_spotify_id(url: str) -> tuple[str, str]:
    for type_, pattern in {
        "track":    r"track/([A-Za-z0-9]+)",
        "album":    r"album/([A-Za-z0-9]+)",
        "playlist": r"playlist/([A-Za-z0-9]+)",
        "artist":   r"artist/([A-Za-z0-9]+)",
    }.items():
        m = re.search(pattern, url)
        if m:
            return type_, m.group(1)
    return "", ""


def jload(val) -> list:
    try:
        return json.loads(val) if val else []
    except Exception:
        return []


async def _fetch_and_save_profile(discord_id: int, spotify_uid: str) -> Optional[dict]:
    """
    Fetch public Spotify profile + playlists via API and persist in DB.
    Returns the dict row on success, None on failure.
    """
    sp = get_sp()
    if not sp:
        return None
    try:
        profile  = sp.user(spotify_uid)
        praw     = sp.user_playlists(spotify_uid, limit=50)
        playlists = [
            {
                "id":     p["id"],
                "name":   p["name"],
                "owner":  p["owner"]["display_name"],
                "tracks": p["tracks"]["total"],
                "image":  p["images"][0]["url"] if p.get("images") else None,
                "url":    p["external_urls"]["spotify"],
            }
            for p in (praw.get("items") or [])
            if p
        ]
        avatar  = profile["images"][0]["url"] if profile.get("images") else ""
        row = {
            "userId":      str(discord_id),
            "spotifyUserId": spotify_uid,
            "displayName": profile.get("display_name") or spotify_uid,
            "followers":   profile.get("followers", {}).get("total", 0),
            "avatarUrl":   avatar,
            "profileUrl":  profile["external_urls"]["spotify"],
            "playlists":   json.dumps(playlists),
            "linkedAt":    now_ts(),
            "updatedAt":   now_ts(),
        }
        await db_set("spotifyprofile", row, pk="userId")
        return row
    except Exception:
        return None


def _row_to_dict(row) -> dict:
    """Convert aiosqlite.Row → plain dict."""
    if row is None:
        return {}
    return dict(row)


# ─────────────────────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────────────────────

class SpotifyHubView(discord.ui.LayoutView):
    """
    Root interactive hub for +spotify / @bot spotify.
    Shows either the 'Not Linked' card or the 'Connected' card.
    Navigation is fully in-place via edit_message.
    """

    def __init__(self, bot, user: discord.Member | discord.User, row: Optional[dict] = None):
        super().__init__(timeout=300)
        self.bot  = bot
        self.user = user
        self.row  = row          # plain dict or None
        self.message: Optional[discord.Message] = None   # set after send
        self._build()

    def _build(self):
        self.clear_items()
        if self.row:
            self._add_connected_card()
        else:
            self._add_not_linked_card()

    # ── Not-linked card ───────────────────────────────────────────────────────

    def _add_not_linked_card(self):
        card = discord.ui.Container(accent_color=SP_PURPLE)
        card.add_item(discord.ui.TextDisplay(f"## {E.info} Spotify Not Linked"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            "Link your Spotify account to access your playlists and profile.\n"
            "Click the button below to get started."
        ))

        login_btn = discord.ui.Button(
            label="Login",
            emoji=E.info,
            style=discord.ButtonStyle.primary,
            custom_id="sp_hub_login",
        )
        login_btn.callback = self._login_cb
        card.add_item(discord.ui.ActionRow(login_btn))
        self.add_item(card)

    async def _login_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        modal = SpotifyLinkModal(self)
        await interaction.response.send_modal(modal)

    # ── Connected card ────────────────────────────────────────────────────────

    def _add_connected_card(self):
        row       = self.row
        name      = row.get("displayName", "Unknown")
        followers = row.get("followers", 0)
        url       = row.get("profileUrl", "")
        avatar    = row.get("avatarUrl") or None
        playlists = jload(row.get("playlists", "[]"))

        # ── Profile card ──────────────────────────────────────────────────────
        profile_body = (
            f"**Display Name:** {discord.utils.escape_markdown(name)}\n"
            f"**Followers:** {int(followers):,}\n"
            f"**Public Playlists:** {len(playlists)}\n"
            f"**Profile:** [Open in Spotify]({url})"
        )

        profile_card = discord.ui.Container(accent_color=SP_COLOR)
        profile_card.add_item(discord.ui.TextDisplay(f"## {E.check} Spotify Connected"))
        profile_card.add_item(discord.ui.Separator())
        if avatar:
            profile_card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(profile_body),
                accessory=discord.ui.Thumbnail(media=avatar),
            ))
        else:
            profile_card.add_item(discord.ui.TextDisplay(profile_body))
        profile_card.add_item(discord.ui.Separator())

        profile_btn  = discord.ui.Button(label="Profile",  emoji=E.info,    style=discord.ButtonStyle.primary,   custom_id="sp_hub_profile")
        refresh_btn  = discord.ui.Button(label="Refresh",  emoji="🔄",      style=discord.ButtonStyle.secondary, custom_id="sp_hub_refresh")
        profile_btn.callback = self._profile_cb
        refresh_btn.callback = self._refresh_cb
        profile_card.add_item(discord.ui.ActionRow(profile_btn, refresh_btn))
        self.add_item(profile_card)

        # ── Playlists preview card ────────────────────────────────────────────
        pl_card = discord.ui.Container(accent_color=0x1A1A2E)
        pl_card.add_item(discord.ui.TextDisplay(f"## {E.Spotify} Your Playlists"))
        pl_card.add_item(discord.ui.Separator())

        if not playlists:
            pl_card.add_item(discord.ui.TextDisplay(
                "No public playlists found on your Spotify profile.\n"
                "Make sure your playlists are set to **public** on Spotify."
            ))
        else:
            preview = playlists[:6]
            lines = [
                f"`{i}.` **{discord.utils.escape_markdown(p.get('name', 'Untitled')[:35])}**"
                f"  —  `{p.get('tracks', 0)} tracks`"
                for i, p in enumerate(preview, 1)
            ]
            if len(playlists) > 6:
                lines.append(f"-# … and {len(playlists) - 6} more")
            pl_card.add_item(discord.ui.TextDisplay("\n".join(lines)))

        pl_card.add_item(discord.ui.Separator())

        all_btn  = discord.ui.Button(label="Browse All Playlists", emoji=E.Spotify, style=discord.ButtonStyle.success,   custom_id="sp_hub_playlists")
        all_btn.callback = self._playlists_cb
        pl_card.add_item(discord.ui.ActionRow(all_btn))
        self.add_item(pl_card)

    async def _playlists_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        playlists = jload(self.row.get("playlists"))
        view = SpotifyPlaylistsView(self.bot, self.user, self.row, playlists)
        await interaction.response.edit_message(view=view)

    async def _profile_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        view = SpotifyProfileView(self.bot, self.user, self.row)
        await interaction.response.edit_message(view=view)

    async def _refresh_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.defer()
        spotify_uid = self.row.get("spotifyUserId") or ""
        if not spotify_uid:
            return await interaction.followup.send("❌ No linked Spotify user ID.", ephemeral=True)
        row = await _fetch_and_save_profile(self.user.id, spotify_uid)
        if not row:
            return await interaction.followup.send(
                "❌ Couldn't refresh Spotify profile. The profile may be private or deleted.",
                ephemeral=True,
            )
        self.row = row
        self._build()
        await interaction.edit_original_response(view=self)


# ── Link Modal ────────────────────────────────────────────────────────────────

class SpotifyLinkModal(discord.ui.Modal, title="Link Spotify"):
    """Modal that takes a Spotify profile URL and links the account."""

    url_input: discord.ui.TextInput = discord.ui.TextInput(
        label="Spotify Profile URL",
        placeholder="https://open.spotify.com/user/your_id",
        style=discord.TextStyle.short,
        required=True,
        max_length=300,
    )

    def __init__(self, hub: SpotifyHubView):
        super().__init__()
        self.hub = hub

    async def on_submit(self, interaction: discord.Interaction):
        raw = self.url_input.value.strip()
        m   = SPOTIFY_USER_RE.search(raw)
        if not m:
            await interaction.response.send_message(
                "❌ That doesn't look like a valid Spotify profile URL.\n"
                "Format: `https://open.spotify.com/user/your_id`",
                ephemeral=True,
            )
            return

        spotify_uid = m.group(1)
        # Acknowledge the modal immediately so we can do async work
        await interaction.response.defer(ephemeral=True)

        row = await _fetch_and_save_profile(interaction.user.id, spotify_uid)
        if not row:
            await interaction.followup.send(
                "❌ Couldn't fetch that Spotify profile.\n"
                "Make sure the URL is correct and the profile is **public**.",
                ephemeral=True,
            )
            return

        # Update the hub view in-place
        self.hub.row = row
        self.hub._build()

        # Edit the original hub message to show the connected card
        if self.hub.message:
            try:
                await self.hub.message.edit(view=self.hub)
            except Exception:
                pass

        await interaction.followup.send(
            f"✅ Spotify linked as **{row.get('displayName', spotify_uid)}**!",
            ephemeral=True,
        )

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "Something went wrong. Please try again.", ephemeral=True
            )


# ── Profile View ──────────────────────────────────────────────────────────────

class SpotifyProfileView(discord.ui.LayoutView):
    """
    'Your Spotify Profile' card with Logout (red) + Back (gray) buttons.
    Shown when user clicks 'Profile' from the connected hub.
    """

    def __init__(self, bot, user: discord.Member | discord.User, row: dict):
        super().__init__(timeout=300)
        self.bot  = bot
        self.user = user
        self.row  = row
        self._build()

    def _build(self):
        self.clear_items()
        row      = self.row
        name     = row.get("displayName", "Unknown")
        followers = row.get("followers", 0)
        url      = row.get("profileUrl", "")
        avatar   = row.get("avatarUrl") or None

        body = (
            f"**Display Name:** {discord.utils.escape_markdown(name)}\n"
            f"**Followers:** {followers}\n"
            f"**Profile:** [Open in Spotify]({url})\n"
            f"**Discord:** {self.user.name}"
        )

        card = discord.ui.Container(accent_color=SP_PURPLE)
        card.add_item(discord.ui.TextDisplay(f"## {E.info} Your Spotify Profile"))
        card.add_item(discord.ui.Separator())
        if avatar:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=avatar),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))
        card.add_item(discord.ui.Separator())

        logout_btn = discord.ui.Button(
            label="Logout",
            emoji=E.cross,
            style=discord.ButtonStyle.danger,
            custom_id="sp_prof_logout",
        )
        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="sp_prof_back",
        )
        logout_btn.callback = self._logout_cb
        back_btn.callback   = self._back_cb
        card.add_item(discord.ui.ActionRow(logout_btn))
        card.add_item(discord.ui.ActionRow(back_btn))
        self.add_item(card)

    async def _logout_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await db_delete("spotifyprofile", {"userId": str(self.user.id)})
        hub = SpotifyHubView(self.bot, self.user, row=None)
        await interaction.response.edit_message(view=hub)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = SpotifyHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ── Playlists View ────────────────────────────────────────────────────────────

class SpotifyPlaylistsView(discord.ui.LayoutView):
    """
    Paginated playlist browser.
    ◄ (prev) | ✅ Play | ► (next)  — Open (link) — Jump select — Back
    """

    def __init__(
        self,
        bot,
        user: discord.Member | discord.User,
        row: dict,
        playlists: list,
    ):
        super().__init__(timeout=300)
        self.bot       = bot
        self.user      = user
        self.row       = row
        self.playlists = playlists
        self.idx       = 0
        self._build()

    def _build(self):
        self.clear_items()
        name  = self.row.get("displayName", "Unknown")
        total = len(self.playlists)

        card = discord.ui.Container(accent_color=SP_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {discord.utils.escape_markdown(name)}'s Playlists"
        ))
        card.add_item(discord.ui.Separator())

        if not self.playlists:
            card.add_item(discord.ui.TextDisplay("No public playlists found on this profile."))
        else:
            pl    = self.playlists[self.idx]
            image = pl.get("image")
            body  = (
                f"**{discord.utils.escape_markdown(pl.get('name', 'Untitled'))}**\n\n"
                f"**Owner:** {discord.utils.escape_markdown(pl.get('owner') or 'Unknown')}\n"
                f"**Tracks:** {pl.get('tracks', 0)}\n"
                f"**Playlist:** {self.idx + 1} of {total}\n\n"
                f"-# Playlist · Spotify"
            )

            if image:
                card.add_item(discord.ui.Section(
                    discord.ui.TextDisplay(body),
                    accessory=discord.ui.Thumbnail(media=image),
                ))
            else:
                card.add_item(discord.ui.TextDisplay(body))

            card.add_item(discord.ui.Separator())

            # ◄ Play ► navigation
            prev_btn = discord.ui.Button(
                label="◄",
                style=discord.ButtonStyle.secondary,
                custom_id="sp_pl_prev",
                disabled=(self.idx == 0),
            )
            play_btn = discord.ui.Button(
                label="Play",
                emoji=E.check,
                style=discord.ButtonStyle.success,
                custom_id="sp_pl_play",
            )
            next_btn = discord.ui.Button(
                label="►",
                style=discord.ButtonStyle.secondary,
                custom_id="sp_pl_next",
                disabled=(self.idx >= total - 1),
            )
            prev_btn.callback = self._prev_cb
            play_btn.callback = self._play_cb
            next_btn.callback = self._next_cb
            card.add_item(discord.ui.ActionRow(prev_btn, play_btn, next_btn))

            # Open in Spotify
            open_btn = discord.ui.Button(
                label="Open",
                emoji="↗️",
                url=pl.get("url", "https://open.spotify.com"),
                style=discord.ButtonStyle.link,
            )
            card.add_item(discord.ui.ActionRow(open_btn))

            # Jump to a playlist (select menu, max 25 options)
            if total > 1:
                options = [
                    discord.SelectOption(
                        label=p.get("name", f"Playlist {i+1}")[:100],
                        value=str(i),
                        default=(i == self.idx),
                    )
                    for i, p in enumerate(self.playlists[:25])
                ]
                jump_select = discord.ui.Select(
                    placeholder="Jump to a playlist",
                    options=options,
                    custom_id="sp_pl_jump",
                )
                jump_select.callback = self._jump_cb
                card.add_item(discord.ui.ActionRow(jump_select))

        # Back button — always shown
        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="sp_pl_back",
        )
        back_btn.callback = self._back_cb
        card.add_item(discord.ui.ActionRow(back_btn))
        self.add_item(card)

    # ── Callbacks ─────────────────────────────────────────────────────────────

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.idx = max(0, self.idx - 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.idx = min(len(self.playlists) - 1, self.idx + 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _jump_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.idx = int(interaction.data["values"][0])
        self._build()
        await interaction.response.edit_message(view=self)

    async def _play_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        if not self.playlists:
            return await interaction.response.send_message(
                "No playlists to play.", ephemeral=True
            )
        pl  = self.playlists[self.idx]
        url = pl.get("url", "")

        voice = getattr(interaction.user, "voice", None)
        if not voice or not voice.channel:
            return await interaction.response.send_message(
                "❌ Join a voice channel first.", ephemeral=True
            )

        await interaction.response.defer(ephemeral=True)

        try:
            from cogs.music import _resolve_spotify_url

            guild  = interaction.guild
            vc     = guild.voice_client if guild else None
            player = vc if isinstance(vc, ravelink.Player) else None

            if not player:
                player = await voice.channel.connect(
                    cls=ravelink.Player, self_deaf=True, reconnect=True
                )
                player._text_channel_id = interaction.channel_id
                player._np_message_id   = None

            tracks = await _resolve_spotify_url(url)
            if not tracks:
                return await interaction.followup.send(
                    "❌ Couldn't load that playlist. Make sure it's public.", ephemeral=True
                )

            extras = {
                "requester_id":   interaction.user.id,
                "requester_name": interaction.user.display_name,
            }
            for track in tracks:
                track.extras = extras
                await player.queue.put_wait(track)

            if not player.playing:
                try:
                    next_t = player.queue.get()
                    await player.play(next_t)
                except ravelink.QueueEmpty:
                    pass

            await interaction.followup.send(
                f"{E.check} Added **{len(tracks)}** tracks from "
                f"**{discord.utils.escape_markdown(pl.get('name', 'playlist'))}**!",
                ephemeral=True,
            )
        except Exception as e:
            await interaction.followup.send(f"❌ Error: {e}", ephemeral=True)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = SpotifyHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ─────────────────────────────────────────────────────────────────────────────
# Cog
# ─────────────────────────────────────────────────────────────────────────────

class SpotifyCog(commands.Cog, name="Spotify"):

    def __init__(self, bot):
        self.bot = bot

    # ── Main hub command ──────────────────────────────────────────────────────

    @commands.hybrid_command(
        name="spotify",
        aliases=["sp"],
        description="Manage your linked Spotify account or browse Spotify.",
    )
    async def spotify_hub(self, ctx: commands.Context):
        """Interactive Spotify dashboard — link, browse playlists, view profile."""
        user_id = ctx.author.id
        db_row  = await db_get("spotifyprofile", {"userId": str(user_id)})
        row     = _row_to_dict(db_row) if db_row else None

        view = SpotifyHubView(self.bot, ctx.author, row=row)

        if ctx.interaction:
            await ctx.interaction.response.send_message(view=view)
            resp = await ctx.interaction.original_response()
            view.message = resp
        else:
            msg = await ctx.reply(view=view, mention_author=False)
            view.message = msg

    # ── Spotify search subcommands (kept from original) ───────────────────────

    @commands.hybrid_group(
        name="spotifysearch",
        aliases=["sps"],
        description="Search Spotify for tracks, albums, artists and playlists.",
    )
    async def spotifysearch(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(
                "Available: `spotifysearch track`, `spotifysearch album`, "
                "`spotifysearch artist`, `spotifysearch playlist`",
                mention_author=False,
            )

    @spotifysearch.command(name="track", description="Search for a track on Spotify.")
    async def sp_search(self, ctx: commands.Context, *, query: str):
        if ctx.interaction:
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply("❌ Spotify API is not configured.", mention_author=False)
        try:
            results = sp.search(q=query, limit=5, type="track")
            tracks  = results["tracks"]["items"]
        except Exception:
            return await ctx.reply("❌ Spotify search failed.", mention_author=False)
        if not tracks:
            return await ctx.reply("No tracks found.", mention_author=False)

        desc = "\n".join(
            f"`{i}.` **[{t['name']}]({t['external_urls']['spotify']})** — "
            f"{', '.join(a['name'] for a in t['artists'])} `[{ms_to_time(t['duration_ms'])}]`"
            for i, t in enumerate(tracks, 1)
        )
        lv = discord.ui.LayoutView(timeout=None)
        card = discord.ui.Container(accent_color=SP_COLOR)
        card.add_item(discord.ui.TextDisplay(f"## {E.Spotify} Spotify Search: {query[:40]}"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(desc))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("-# Use /play with the track name to play!"))
        lv.add_item(card)
        await ctx.reply(view=lv, mention_author=False)

    @spotifysearch.command(name="album", description="Get info about a Spotify album.")
    async def sp_album(self, ctx: commands.Context, *, url_or_query: str):
        if ctx.interaction:
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply("❌ Spotify API is not configured.", mention_author=False)
        try:
            type_, sp_id = extract_spotify_id(url_or_query)
            if type_ == "album" and sp_id:
                album = sp.album(sp_id)
            else:
                res = sp.search(q=url_or_query, limit=1, type="album")
                albums = res["albums"]["items"]
                if not albums:
                    return await ctx.reply("Album not found.", mention_author=False)
                album = sp.album(albums[0]["id"])

            tracks  = album["tracks"]["items"][:10]
            artists = ", ".join(a["name"] for a in album["artists"])
            thumb   = album["images"][0]["url"] if album.get("images") else None
            desc    = "\n".join(
                f"`{i}.` {t['name']} — {', '.join(a['name'] for a in t['artists'])} "
                f"`[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(tracks, 1)
            )
            footer = f"{album['total_tracks']} tracks • Released {album['release_date'][:4]}"

            lv   = discord.ui.LayoutView(timeout=None)
            card = discord.ui.Container(accent_color=SP_COLOR)
            card.add_item(discord.ui.TextDisplay(f"## 💿 {album['name']} — {artists}"))
            card.add_item(discord.ui.Separator())
            if thumb:
                card.add_item(discord.ui.Section(
                    discord.ui.TextDisplay(desc),
                    accessory=discord.ui.Thumbnail(media=thumb),
                ))
            else:
                card.add_item(discord.ui.TextDisplay(desc))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(f"-# {footer}"))
            lv.add_item(card)
            await ctx.reply(view=lv, mention_author=False)
        except Exception as e:
            await ctx.reply(f"❌ Spotify error: {e}", mention_author=False)

    @spotifysearch.command(name="artist", description="Get info about a Spotify artist.")
    async def sp_artist(self, ctx: commands.Context, *, name: str):
        if ctx.interaction:
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply("❌ Spotify API is not configured.", mention_author=False)
        try:
            res     = sp.search(q=name, limit=1, type="artist")
            artists = res["artists"]["items"]
            if not artists:
                return await ctx.reply("Artist not found.", mention_author=False)
            artist     = artists[0]
            top_tracks = sp.artist_top_tracks(artist["id"])["tracks"][:5]
            genres     = ", ".join(artist.get("genres", ["?"]))[:80]
            top        = "\n".join(
                f"`{i}.` {t['name']} `[{ms_to_time(t['duration_ms'])}]`"
                for i, t in enumerate(top_tracks, 1)
            )
            thumb = artist["images"][0]["url"] if artist.get("images") else None
            body  = (
                f"**Genres:** {genres}\n"
                f"**Followers:** {artist['followers']['total']:,}\n"
                f"**Popularity:** {artist['popularity']}/100\n\n"
                f"**Top Tracks:**\n{top}"
            )
            lv   = discord.ui.LayoutView(timeout=None)
            card = discord.ui.Container(accent_color=SP_COLOR)
            card.add_item(discord.ui.TextDisplay(f"## 🎤 {artist['name']}"))
            card.add_item(discord.ui.Separator())
            if thumb:
                card.add_item(discord.ui.Section(
                    discord.ui.TextDisplay(body),
                    accessory=discord.ui.Thumbnail(media=thumb),
                ))
            else:
                card.add_item(discord.ui.TextDisplay(body))
            lv.add_item(card)
            await ctx.reply(view=lv, mention_author=False)
        except Exception as e:
            await ctx.reply(f"❌ Spotify error: {e}", mention_author=False)

    @spotifysearch.command(name="playlist", description="Get info about a Spotify playlist.")
    async def sp_playlist(self, ctx: commands.Context, *, url: str):
        if ctx.interaction:
            await ctx.interaction.response.defer()
        sp = get_sp()
        if not sp:
            return await ctx.reply("❌ Spotify API is not configured.", mention_author=False)
        try:
            type_, sp_id = extract_spotify_id(url)
            if type_ != "playlist" or not sp_id:
                return await ctx.reply(
                    "Please provide a valid Spotify playlist URL.", mention_author=False
                )
            playlist = sp.playlist(sp_id)
            tracks   = playlist["tracks"]["items"][:10]
            thumb    = playlist["images"][0]["url"] if playlist.get("images") else None
            desc     = "\n".join(
                f"`{i}.` {item['track']['name']} — "
                f"{', '.join(a['name'] for a in item['track']['artists'])}"
                for i, item in enumerate(tracks, 1)
                if item.get("track")
            ) or "Empty playlist."
            footer    = (
                f"{playlist['tracks']['total']} tracks • "
                f"by {playlist['owner']['display_name']}"
            )
            play_url  = playlist["external_urls"]["spotify"]
            open_btn  = discord.ui.Button(
                label="Open in Spotify",
                emoji=E.Spotify,
                url=play_url,
                style=discord.ButtonStyle.link,
            )
            lv   = discord.ui.LayoutView(timeout=None)
            card = discord.ui.Container(accent_color=SP_COLOR)
            card.add_item(discord.ui.TextDisplay(f"## 📋 {playlist['name']}"))
            card.add_item(discord.ui.Separator())
            if thumb:
                card.add_item(discord.ui.Section(
                    discord.ui.TextDisplay(desc),
                    accessory=discord.ui.Thumbnail(media=thumb),
                ))
            else:
                card.add_item(discord.ui.TextDisplay(desc))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(f"-# {footer}"))
            card.add_item(discord.ui.ActionRow(open_btn))
            lv.add_item(card)
            await ctx.reply(view=lv, mention_author=False)
        except Exception as e:
            await ctx.reply(f"❌ Spotify error: {e}", mention_author=False)


async def setup(bot):
    await bot.add_cog(SpotifyCog(bot))
