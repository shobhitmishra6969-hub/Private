"""Last.fm integration — interactive hub + subcommands."""
from __future__ import annotations

import aiohttp
from typing import Optional

import discord
from discord.ext import commands

import config
import emojis as E
from database.models import get_lastfm, set_lastfm
from database import db_delete

COLOR     = config.COLOR
LFM_COLOR = 0xD51007   # Last.fm red
LFM_DARK  = 0x7B2020   # accent for not-linked / profile views

LASTFM_API = "https://ws.audioscrobbler.com/2.0/"

PERIOD_MAP = {
    "week":    "7day",
    "month":   "1month",
    "3month":  "3month",
    "6month":  "6month",
    "year":    "12month",
    "overall": "overall",
}
PERIOD_LABELS = {
    "7day":    "This Week",
    "1month":  "This Month",
    "3month":  "3 Months",
    "6month":  "6 Months",
    "12month": "This Year",
    "overall": "All Time",
}


# ── API helper ────────────────────────────────────────────────────────────────

async def lfm_request(method: str, params: dict) -> dict | None:
    if not config.LASTFM_KEY:
        return None
    params.update({"method": method, "api_key": config.LASTFM_KEY, "format": "json"})
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(LASTFM_API, params=params, timeout=aiohttp.ClientTimeout(total=10)) as r:
                if r.status == 200:
                    return await r.json()
    except Exception:
        pass
    return None


def _avatar(user_data: dict) -> Optional[str]:
    """Extract the largest avatar URL from a Last.fm user object."""
    for img in reversed(user_data.get("image", [])):
        url = img.get("#text", "")
        if url:
            return url
    return None


def _row_dict(row) -> dict:
    if row is None:
        return {}
    return dict(row)


# ─────────────────────────────────────────────────────────────────────────────
# Views
# ─────────────────────────────────────────────────────────────────────────────

class LastFMHubView(discord.ui.LayoutView):
    """
    Root interactive hub for +lastfm / @bot lastfm.
    Not Linked → Login modal → Connected card with nav buttons.
    All navigation is in-place via edit_message.
    """

    def __init__(self, bot, user: discord.Member | discord.User, row: Optional[dict] = None):
        super().__init__(timeout=300)
        self.bot     = bot
        self.user    = user
        self.row     = row        # dict or None
        self.message: Optional[discord.Message] = None
        self._build()

    def _build(self):
        self.clear_items()
        if self.row:
            self._add_connected_card()
        else:
            self._add_not_linked_card()

    # ── Not-linked card ───────────────────────────────────────────────────────

    def _add_not_linked_card(self):
        card = discord.ui.Container(accent_color=LFM_DARK)
        card.add_item(discord.ui.TextDisplay(f"## {E.info} Last.fm Not Linked"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            "Link your Last.fm account to view your profile and recent tracks.\n"
            "Click the button below to get started."
        ))
        login_btn = discord.ui.Button(
            label="Login",
            emoji=E.info,
            style=discord.ButtonStyle.primary,
            custom_id="lfm_hub_login",
        )
        login_btn.callback = self._login_cb
        card.add_item(discord.ui.ActionRow(login_btn))
        self.add_item(card)

    async def _login_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.send_modal(LastFMLinkModal(self))

    # ── Connected card ────────────────────────────────────────────────────────

    def _add_connected_card(self):
        row      = self.row
        username = row.get("username", "Unknown")
        scrobbles = row.get("scrobbles", 0)
        country  = row.get("country") or "Unknown"
        url      = f"https://www.last.fm/user/{username}"
        avatar   = row.get("avatarUrl") or None

        body = (
            f"Logged in as **{discord.utils.escape_markdown(username)}**\n"
            f"Scrobbles: {int(scrobbles):,}\n"
            f"Country: {country}\n"
            f"Profile: [Open in Last.fm]({url})"
        )

        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(f"## {E.check} Last.fm Connected"))
        card.add_item(discord.ui.Separator())
        if avatar:
            card.add_item(discord.ui.Section(
                discord.ui.TextDisplay(body),
                accessory=discord.ui.Thumbnail(media=avatar),
            ))
        else:
            card.add_item(discord.ui.TextDisplay(body))
        card.add_item(discord.ui.Separator())

        recent_btn = discord.ui.Button(
            label="Recent",
            emoji=E.play,
            style=discord.ButtonStyle.success,
            custom_id="lfm_hub_recent",
        )
        profile_btn = discord.ui.Button(
            label="Profile",
            emoji=E.info,
            style=discord.ButtonStyle.primary,
            custom_id="lfm_hub_profile",
        )
        top_artists_btn = discord.ui.Button(
            label="Top Artists",
            emoji=E.Lastfm,
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_hub_artists",
        )
        top_tracks_btn = discord.ui.Button(
            label="Top Tracks",
            emoji=E.Music,
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_hub_tracks",
        )
        recent_btn.callback     = self._recent_cb
        profile_btn.callback    = self._profile_cb
        top_artists_btn.callback = self._artists_cb
        top_tracks_btn.callback  = self._tracks_cb

        card.add_item(discord.ui.ActionRow(recent_btn, profile_btn))
        card.add_item(discord.ui.ActionRow(top_artists_btn, top_tracks_btn))
        self.add_item(card)

    async def _recent_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getRecentTracks", {"user": username, "limit": 50})
        tracks = (data or {}).get("recenttracks", {}).get("track", []) if data else []
        view = LastFMRecentView(self.bot, self.user, self.row, tracks)
        await interaction.edit_original_response(view=view)

    async def _profile_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getInfo", {"user": username})
        u = (data or {}).get("user", {})
        view = LastFMProfileView(self.bot, self.user, self.row, u)
        await interaction.edit_original_response(view=view)

    async def _artists_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getTopArtists", {"user": username, "period": "overall", "limit": 50})
        artists = (data or {}).get("topartists", {}).get("artist", [])
        view = LastFMTopArtistsView(self.bot, self.user, self.row, artists, "overall")
        await interaction.edit_original_response(view=view)

    async def _tracks_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getTopTracks", {"user": username, "period": "overall", "limit": 50})
        tracks = (data or {}).get("toptracks", {}).get("track", [])
        view = LastFMTopTracksView(self.bot, self.user, self.row, tracks, "overall")
        await interaction.edit_original_response(view=view)


# ── Link Modal ────────────────────────────────────────────────────────────────

class LastFMLinkModal(discord.ui.Modal, title="Link Last.fm"):
    """Modal that takes a Last.fm username, validates it, and links the account."""

    username_input: discord.ui.TextInput = discord.ui.TextInput(
        label="Last.fm Username",
        placeholder="your_lastfm_username",
        style=discord.TextStyle.short,
        required=True,
        max_length=64,
    )

    def __init__(self, hub: LastFMHubView):
        super().__init__()
        self.hub = hub

    async def on_submit(self, interaction: discord.Interaction):
        username = self.username_input.value.strip()
        if not username:
            await interaction.response.send_message("❌ Please enter a username.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)

        data = await lfm_request("user.getInfo", {"user": username})
        if not data or "error" in data or "user" not in data:
            await interaction.followup.send(
                f"❌ Last.fm user **{discord.utils.escape_markdown(username)}** not found.\n"
                "Make sure the username is correct and the profile is public.",
                ephemeral=True,
            )
            return

        u         = data["user"]
        avatar    = _avatar(u)
        scrobbles = int(u.get("playcount", 0))
        country   = u.get("country") or "Unknown"

        await set_lastfm(interaction.user.id, u["name"])

        self.hub.row = {
            "username":  u["name"],
            "scrobbles": scrobbles,
            "country":   country,
            "avatarUrl": avatar or "",
        }
        self.hub._build()

        if self.hub.message:
            try:
                await self.hub.message.edit(view=self.hub)
            except Exception:
                pass

        await interaction.followup.send(
            f"✅ Last.fm linked as **{discord.utils.escape_markdown(u['name'])}**!",
            ephemeral=True,
        )

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        if not interaction.response.is_done():
            await interaction.response.send_message(
                "Something went wrong. Please try again.", ephemeral=True
            )


# ── Profile View ──────────────────────────────────────────────────────────────

class LastFMProfileView(discord.ui.LayoutView):
    """Full profile card: stats + Logout + Back."""

    def __init__(self, bot, user: discord.Member | discord.User, row: dict, lfm_data: dict):
        super().__init__(timeout=300)
        self.bot      = bot
        self.user     = user
        self.row      = row
        self.lfm_data = lfm_data
        self._build()

    def _build(self):
        self.clear_items()
        u        = self.lfm_data
        username = self.row.get("username", u.get("name", "Unknown"))
        url      = f"https://www.last.fm/user/{username}"
        avatar   = _avatar(u) or self.row.get("avatarUrl") or None
        scrobbles = int(u.get("playcount", self.row.get("scrobbles", 0)))
        country  = u.get("country") or self.row.get("country") or "Unknown"
        realname = u.get("realname") or ""
        registered = u.get("registered", {})
        reg_ts   = registered.get("unixtime") if isinstance(registered, dict) else None

        lines = [
            f"**Username:** {discord.utils.escape_markdown(username)}",
        ]
        if realname:
            lines.append(f"**Real Name:** {discord.utils.escape_markdown(realname)}")
        lines += [
            f"**Scrobbles:** {scrobbles:,}",
            f"**Country:** {country}",
            f"**Profile:** [Open in Last.fm]({url})",
            f"**Discord:** {self.user.name}",
        ]
        if reg_ts:
            lines.append(f"**Registered:** <t:{int(reg_ts)}:D>")

        body = "\n".join(lines)

        card = discord.ui.Container(accent_color=LFM_DARK)
        card.add_item(discord.ui.TextDisplay(f"## {E.info} Your Last.fm Profile"))
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
            custom_id="lfm_prof_logout",
        )
        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_prof_back",
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
        await db_delete("lastfm", {"userId": str(self.user.id)})
        hub = LastFMHubView(self.bot, self.user, row=None)
        await interaction.response.edit_message(view=hub)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = LastFMHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ── Recent Tracks View ────────────────────────────────────────────────────────

class LastFMRecentView(discord.ui.LayoutView):
    """Paginated recent tracks browser — 10 per page, ◄ ► navigation."""

    PAGE_SIZE = 10

    def __init__(self, bot, user: discord.Member | discord.User, row: dict, tracks: list):
        super().__init__(timeout=300)
        self.bot    = bot
        self.user   = user
        self.row    = row
        self.tracks = tracks
        self.page   = 0
        self._build()

    def _build(self):
        self.clear_items()
        username = self.row.get("username", "Unknown")
        total    = len(self.tracks)
        ps       = self.PAGE_SIZE
        start    = self.page * ps
        chunk    = self.tracks[start: start + ps]
        pages    = max(1, (total + ps - 1) // ps)

        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {discord.utils.escape_markdown(username)}'s Recent Tracks"
        ))
        card.add_item(discord.ui.Separator())

        if not chunk:
            card.add_item(discord.ui.TextDisplay("No recent tracks found."))
        else:
            lines = []
            for t in chunk:
                name   = t.get("name", "?")
                artist = t.get("artist", {}).get("#text", "?")
                now    = t.get("@attr", {}).get("nowplaying") == "true"
                prefix = "▶️ " if now else ""
                lines.append(f"{prefix}**{discord.utils.escape_markdown(name)}** — {discord.utils.escape_markdown(artist)}")

            card.add_item(discord.ui.TextDisplay("\n".join(lines)))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(f"-# Page {self.page + 1} of {pages} · {total} tracks total"))
            card.add_item(discord.ui.Separator())

            prev_btn = discord.ui.Button(
                label="◄",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_rec_prev",
                disabled=(self.page == 0),
            )
            next_btn = discord.ui.Button(
                label="►",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_rec_next",
                disabled=(self.page >= pages - 1),
            )
            prev_btn.callback = self._prev_cb
            next_btn.callback = self._next_cb
            card.add_item(discord.ui.ActionRow(prev_btn, next_btn))

        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_rec_back",
        )
        back_btn.callback = self._back_cb
        card.add_item(discord.ui.ActionRow(back_btn))
        self.add_item(card)

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.page = max(0, self.page - 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        ps    = self.PAGE_SIZE
        pages = max(1, (len(self.tracks) + ps - 1) // ps)
        self.page = min(pages - 1, self.page + 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = LastFMHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ── Top Artists View ──────────────────────────────────────────────────────────

class LastFMTopArtistsView(discord.ui.LayoutView):
    """Top artists browser — period select + ◄ ► pagination + Back."""

    PAGE_SIZE = 10

    def __init__(self, bot, user, row: dict, artists: list, period: str):
        super().__init__(timeout=300)
        self.bot     = bot
        self.user    = user
        self.row     = row
        self.artists = artists
        self.period  = period
        self.page    = 0
        self._build()

    def _build(self):
        self.clear_items()
        username = self.row.get("username", "Unknown")
        total    = len(self.artists)
        ps       = self.PAGE_SIZE
        start    = self.page * ps
        chunk    = self.artists[start: start + ps]
        pages    = max(1, (total + ps - 1) // ps)
        period_label = PERIOD_LABELS.get(self.period, "All Time")

        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {discord.utils.escape_markdown(username)}'s Top Artists"
        ))
        card.add_item(discord.ui.Separator())

        if not chunk:
            card.add_item(discord.ui.TextDisplay("No data found for this period."))
        else:
            lines = [
                f"`{start + i + 1}.` **{discord.utils.escape_markdown(a['name'])}** — "
                f"{int(a.get('playcount', 0)):,} plays"
                for i, a in enumerate(chunk)
            ]
            card.add_item(discord.ui.TextDisplay("\n".join(lines)))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(
                f"-# {period_label} · Page {self.page + 1} of {pages}"
            ))
            card.add_item(discord.ui.Separator())

            prev_btn = discord.ui.Button(
                label="◄",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_art_prev",
                disabled=(self.page == 0),
            )
            next_btn = discord.ui.Button(
                label="►",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_art_next",
                disabled=(self.page >= pages - 1),
            )
            prev_btn.callback = self._prev_cb
            next_btn.callback = self._next_cb
            card.add_item(discord.ui.ActionRow(prev_btn, next_btn))

        # Period select
        period_options = [
            discord.SelectOption(label=label, value=key, default=(key == self.period))
            for key, label in PERIOD_LABELS.items()
        ]
        period_select = discord.ui.Select(
            placeholder="Change period",
            options=period_options,
            custom_id="lfm_art_period",
        )
        period_select.callback = self._period_cb
        card.add_item(discord.ui.ActionRow(period_select))

        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_art_back",
        )
        back_btn.callback = self._back_cb
        card.add_item(discord.ui.ActionRow(back_btn))
        self.add_item(card)

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.page = max(0, self.page - 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        ps    = self.PAGE_SIZE
        pages = max(1, (len(self.artists) + ps - 1) // ps)
        self.page = min(pages - 1, self.page + 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _period_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        new_period = interaction.data["values"][0]
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getTopArtists", {
            "user": username, "period": new_period, "limit": 50
        })
        self.artists = (data or {}).get("topartists", {}).get("artist", [])
        self.period  = new_period
        self.page    = 0
        self._build()
        await interaction.edit_original_response(view=self)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = LastFMHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ── Top Tracks View ───────────────────────────────────────────────────────────

class LastFMTopTracksView(discord.ui.LayoutView):
    """Top tracks browser — period select + ◄ ► pagination + Back."""

    PAGE_SIZE = 10

    def __init__(self, bot, user, row: dict, tracks: list, period: str):
        super().__init__(timeout=300)
        self.bot    = bot
        self.user   = user
        self.row    = row
        self.tracks = tracks
        self.period = period
        self.page   = 0
        self._build()

    def _build(self):
        self.clear_items()
        username = self.row.get("username", "Unknown")
        total    = len(self.tracks)
        ps       = self.PAGE_SIZE
        start    = self.page * ps
        chunk    = self.tracks[start: start + ps]
        pages    = max(1, (total + ps - 1) // ps)
        period_label = PERIOD_LABELS.get(self.period, "All Time")

        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {discord.utils.escape_markdown(username)}'s Top Tracks"
        ))
        card.add_item(discord.ui.Separator())

        if not chunk:
            card.add_item(discord.ui.TextDisplay("No data found for this period."))
        else:
            lines = [
                f"`{start + i + 1}.` **{discord.utils.escape_markdown(t['name'])}** — "
                f"{discord.utils.escape_markdown(t.get('artist', {}).get('name', '?'))} — "
                f"{int(t.get('playcount', 0)):,} plays"
                for i, t in enumerate(chunk)
            ]
            card.add_item(discord.ui.TextDisplay("\n".join(lines)))
            card.add_item(discord.ui.Separator())
            card.add_item(discord.ui.TextDisplay(
                f"-# {period_label} · Page {self.page + 1} of {pages}"
            ))
            card.add_item(discord.ui.Separator())

            prev_btn = discord.ui.Button(
                label="◄",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_trk_prev",
                disabled=(self.page == 0),
            )
            next_btn = discord.ui.Button(
                label="►",
                style=discord.ButtonStyle.secondary,
                custom_id="lfm_trk_next",
                disabled=(self.page >= pages - 1),
            )
            prev_btn.callback = self._prev_cb
            next_btn.callback = self._next_cb
            card.add_item(discord.ui.ActionRow(prev_btn, next_btn))

        period_options = [
            discord.SelectOption(label=label, value=key, default=(key == self.period))
            for key, label in PERIOD_LABELS.items()
        ]
        period_select = discord.ui.Select(
            placeholder="Change period",
            options=period_options,
            custom_id="lfm_trk_period",
        )
        period_select.callback = self._period_cb
        card.add_item(discord.ui.ActionRow(period_select))

        back_btn = discord.ui.Button(
            label="Back",
            emoji="◄",
            style=discord.ButtonStyle.secondary,
            custom_id="lfm_trk_back",
        )
        back_btn.callback = self._back_cb
        card.add_item(discord.ui.ActionRow(back_btn))
        self.add_item(card)

    async def _prev_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        self.page = max(0, self.page - 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _next_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        ps    = self.PAGE_SIZE
        pages = max(1, (len(self.tracks) + ps - 1) // ps)
        self.page = min(pages - 1, self.page + 1)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _period_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        new_period = interaction.data["values"][0]
        await interaction.response.defer(thinking=True)
        username = self.row.get("username", "")
        data = await lfm_request("user.getTopTracks", {
            "user": username, "period": new_period, "limit": 50
        })
        self.tracks = (data or {}).get("toptracks", {}).get("track", [])
        self.period = new_period
        self.page   = 0
        self._build()
        await interaction.edit_original_response(view=self)

    async def _back_cb(self, interaction: discord.Interaction):
        if interaction.user.id != self.user.id:
            return await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
        hub = LastFMHubView(self.bot, self.user, row=self.row)
        await interaction.response.edit_message(view=hub)


# ─────────────────────────────────────────────────────────────────────────────
# Cog
# ─────────────────────────────────────────────────────────────────────────────

class LastFMCog(commands.Cog, name="Lastfm"):

    def __init__(self, bot):
        self.bot = bot

    # ── Main hub command ──────────────────────────────────────────────────────

    @commands.hybrid_command(
        name="lastfm",
        aliases=["lfm"],
        description="Manage your linked Last.fm account.",
    )
    async def lastfm_hub(self, ctx: commands.Context):
        """Interactive Last.fm dashboard — link, browse recent tracks, top artists/tracks."""
        db_row = await get_lastfm(ctx.author.id)

        row = None
        if db_row:
            username = db_row["username"]
            data     = await lfm_request("user.getInfo", {"user": username})
            if data and "user" in data:
                u = data["user"]
                row = {
                    "username":  u["name"],
                    "scrobbles": int(u.get("playcount", 0)),
                    "country":   u.get("country") or "Unknown",
                    "avatarUrl": _avatar(u) or "",
                }
            else:
                row = {"username": username, "scrobbles": 0, "country": "Unknown", "avatarUrl": ""}

        view = LastFMHubView(self.bot, ctx.author, row=row)

        if ctx.interaction:
            await ctx.interaction.response.send_message(view=view)
            resp = await ctx.interaction.original_response()
            view.message = resp
        else:
            msg = await ctx.reply(view=view, mention_author=False)
            view.message = msg

    # ── Legacy / utility subcommands (still usable via +lfm <sub>) ───────────

    @commands.hybrid_group(
        name="lfmcmd",
        aliases=["lfms"],
        description="Last.fm utility subcommands (nowplaying, recent, topartists, toptracks).",
        hidden=True,
    )
    async def lfmcmd(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(
                "Subcommands: `lfmcmd nowplaying`, `lfmcmd recent`, "
                "`lfmcmd topartists`, `lfmcmd toptracks`",
                mention_author=False,
            )

    @lfmcmd.command(name="nowplaying", aliases=["np"], description="Show what you're scrobbling now.")
    async def lfm_nowplaying(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        db_row = await get_lastfm(target.id)
        if not db_row:
            return await ctx.reply("❌ No Last.fm account linked.", mention_author=False)
        data = await lfm_request("user.getRecentTracks", {"user": db_row["username"], "limit": 1})
        if not data or "error" in data:
            return await ctx.reply("❌ Could not fetch data.", mention_author=False)
        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply("❌ No recent track found.", mention_author=False)
        t      = tracks[0]
        now    = t.get("@attr", {}).get("nowplaying") == "true"
        name   = t.get("name", "?")
        artist = t.get("artist", {}).get("#text", "?")
        album  = t.get("album", {}).get("#text", "")
        thumb  = None
        for img in reversed(t.get("image", [])):
            if img.get("#text"):
                thumb = img["#text"]
                break
        body   = f"**{name}**\nby **{artist}**" + (f"\n*{album}*" if album else "")
        header = f"{'▶️ Now Playing' if now else '🕐 Last Played'} — {db_row['username']}"

        lv   = discord.ui.LayoutView(timeout=None)
        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(f"## {header}"))
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

    @lfmcmd.command(name="recent", description="View recent scrobbles.")
    async def lfm_recent(self, ctx: commands.Context, user: Optional[discord.User] = None):
        target = user or ctx.author
        db_row = await get_lastfm(target.id)
        if not db_row:
            return await ctx.reply("❌ No Last.fm account linked.", mention_author=False)
        data = await lfm_request("user.getRecentTracks", {"user": db_row["username"], "limit": 10})
        if not data or "error" in data:
            return await ctx.reply("❌ Could not fetch recent tracks.", mention_author=False)
        tracks = data.get("recenttracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply("No recent tracks found.", mention_author=False)
        lines = []
        for t in tracks[:10]:
            nm  = t.get("name", "?")
            ar  = t.get("artist", {}).get("#text", "?")
            now = t.get("@attr", {}).get("nowplaying") == "true"
            lines.append(f"{'▶️ ' if now else ''}**{nm}** — {ar}")
        lv   = discord.ui.LayoutView(timeout=None)
        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {db_row['username']}'s Recent Tracks"
        ))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("\n".join(lines)))
        lv.add_item(card)
        await ctx.reply(view=lv, mention_author=False)

    @lfmcmd.command(name="topartists", description="View top artists.")
    async def lfm_topartists(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target     = user or ctx.author
        db_row     = await get_lastfm(target.id)
        if not db_row:
            return await ctx.reply("❌ No Last.fm account linked.", mention_author=False)
        period_key = PERIOD_MAP.get(period.lower(), "overall")
        data = await lfm_request("user.getTopArtists", {
            "user": db_row["username"], "period": period_key, "limit": 10
        })
        if not data or "error" in data:
            return await ctx.reply("❌ Could not fetch top artists.", mention_author=False)
        artists = data.get("topartists", {}).get("artist", [])
        if not artists:
            return await ctx.reply("No data found.", mention_author=False)
        lines = [
            f"`{i}.` **{a['name']}** — {int(a.get('playcount', 0)):,} plays"
            for i, a in enumerate(artists, 1)
        ]
        lv   = discord.ui.LayoutView(timeout=None)
        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {db_row['username']}'s Top Artists ({period})"
        ))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("\n".join(lines)))
        lv.add_item(card)
        await ctx.reply(view=lv, mention_author=False)

    @lfmcmd.command(name="toptracks", description="View top tracks.")
    async def lfm_toptracks(self, ctx: commands.Context, period: str = "overall", user: Optional[discord.User] = None):
        target     = user or ctx.author
        db_row     = await get_lastfm(target.id)
        if not db_row:
            return await ctx.reply("❌ No Last.fm account linked.", mention_author=False)
        period_key = PERIOD_MAP.get(period.lower(), "overall")
        data = await lfm_request("user.getTopTracks", {
            "user": db_row["username"], "period": period_key, "limit": 10
        })
        if not data or "error" in data:
            return await ctx.reply("❌ Could not fetch top tracks.", mention_author=False)
        tracks = data.get("toptracks", {}).get("track", [])
        if not tracks:
            return await ctx.reply("No data found.", mention_author=False)
        lines = [
            f"`{i}.` **{t['name']}** — {t.get('artist', {}).get('name', '?')} — "
            f"{int(t.get('playcount', 0)):,} plays"
            for i, t in enumerate(tracks, 1)
        ]
        lv   = discord.ui.LayoutView(timeout=None)
        card = discord.ui.Container(accent_color=LFM_COLOR)
        card.add_item(discord.ui.TextDisplay(
            f"## {E.Lastfm} {db_row['username']}'s Top Tracks ({period})"
        ))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay("\n".join(lines)))
        lv.add_item(card)
        await ctx.reply(view=lv, mention_author=False)


async def setup(bot):
    await bot.add_cog(LastFMCog(bot))
