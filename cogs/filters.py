"""Audio filter studio — interactive v2 panel with presets, EQ, and timescale."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from cogs.music import voice_check
import utils.v2 as v2

COLOR = config.COLOR

# ── EQ band definitions ───────────────────────────────────────────────────────
# (display name, dot emoji, lavalink band index)
EQ_BANDS = [
    ("Sub Bass", "🔴",  0),
    ("Bass",     "🟠",  2),
    ("Mid",      "🟡",  5),
    ("Presence", "🟢",  8),
    ("Treble",   "🔵", 11),
]

EQ_STEP = 0.1
EQ_MIN  = -0.25
EQ_MAX  =  1.0

TS_STEP = 0.05
TS_MIN  =  0.1
TS_MAX  =  3.0

# ── Preset groups ─────────────────────────────────────────────────────────────
PRESET_GROUPS = [
    ("⚡ Energy", [
        ("nightcore", "🌙", "Nightcore"),
        ("bassboost", "🔊", "Bass Boost"),
        ("superbass",  "💪", "Superbass"),
        ("metal",     "🤘", "Metal"),
    ]),
    ("🌈 Mood", [
        ("vaporwave", "🌊", "Vaporwave"),
        ("soft",      "💫", "Soft"),
        ("pop",       "🎶", "Pop"),
        ("piano",     "🎹", "Piano"),
    ]),
    ("🌐 Spatial & FX", [
        ("8d",      "🌐", "8D"),
        ("tremolo", "🎵", "Tremolo"),
        ("vibrato", "🎸", "Vibrato"),
        ("karaoke", "🎤", "Karaoke"),
        ("lowpass", "🔉", "Low Pass"),
    ]),
]

FILTER_PRESETS = {
    "nightcore": lambda f: f.timescale.set(speed=1.18, pitch=1.12, rate=1.0),
    "vaporwave": lambda f: f.timescale.set(speed=0.8, pitch=0.88, rate=1.0),
    "bassboost": lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": 0.3}, {"band": 1, "gain": 0.25},
        {"band": 2, "gain": 0.2}, {"band": 3, "gain": 0.1},
    ]),
    "8d":        lambda f: f.rotation.set(rotation_hz=0.2),
    "tremolo":   lambda f: f.tremolo.set(frequency=4.0, depth=0.75),
    "vibrato":   lambda f: f.vibrato.set(frequency=4.0, depth=1.0),
    "pop":       lambda f: f.equalizer.set(bands=[
        {"band": 2, "gain": 0.15}, {"band": 3, "gain": 0.15},
        {"band": 5, "gain": 0.2},  {"band": 7, "gain": 0.1},
    ]),
    "soft":      lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": -0.2}, {"band": 7, "gain": 0.15},
        {"band": 8, "gain": 0.25}, {"band": 9, "gain": 0.2},
    ]),
    "superbass": lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": 0.6}, {"band": 1, "gain": 0.5},
        {"band": 2, "gain": 0.3},
    ]),
    "karaoke":   lambda f: f.karaoke.set(level=1.0, mono_level=1.0,
                                          filter_band=220.0, filter_width=100.0),
    "lowpass":   lambda f: f.low_pass.set(smoothing=20.0),
    "piano":     lambda f: (
        f.equalizer.set(bands=[
            {"band": 2, "gain": 0.3}, {"band": 3, "gain": 0.3},
            {"band": 5, "gain": 0.25}, {"band": 6, "gain": 0.2},
        ]),
        f.timescale.set(speed=0.95, pitch=1.0, rate=1.0),
    ),
    "metal":     lambda f: f.equalizer.set(bands=[
        {"band": 4, "gain": 0.4}, {"band": 5, "gain": 0.4},
        {"band": 6, "gain": 0.3}, {"band": 0, "gain": -0.2},
    ]),
    "clear": None,
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _gain_bar(gain: float) -> str:
    """Render a 10-block visual bar for an EQ gain value."""
    normalised = (gain - EQ_MIN) / (EQ_MAX - EQ_MIN)
    filled     = round(normalised * 10)
    bar        = "█" * filled + "░" * (10 - filled)
    sign       = "+" if gain >= 0 else ""
    return f"`{bar}` `{sign}{gain:.2f}`"


def _ts_bar(val: float) -> str:
    """Render a 10-block bar for speed/pitch/rate (0.1 – 3.0)."""
    normalised = (val - TS_MIN) / (TS_MAX - TS_MIN)
    filled     = round(normalised * 10)
    bar        = "█" * filled + "░" * (10 - filled)
    return f"`{bar}` `{val:.2f}×`"


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _round2(v: float) -> float:
    return round(v, 2)


# ── Custom EQ Modal ───────────────────────────────────────────────────────────

class CustomEQModal(discord.ui.Modal, title="Custom EQ Band"):
    band_input = discord.ui.TextInput(
        label="Band (0–14)",
        placeholder="e.g. 0",
        max_length=2,
        style=discord.TextStyle.short,
    )
    gain_input = discord.ui.TextInput(
        label="Gain (−0.25 to 1.0)",
        placeholder="e.g. 0.5",
        max_length=6,
        style=discord.TextStyle.short,
    )

    def __init__(self, view: "FiltersView"):
        super().__init__()
        self._view = view

    async def on_submit(self, interaction: discord.Interaction):
        try:
            band = int(self.band_input.value.strip())
            gain = float(self.gain_input.value.strip())
        except ValueError:
            return await interaction.response.send_message(
                "❌ Band must be a whole number (0–14) and gain a decimal.", ephemeral=True
            )
        if not 0 <= band <= 14:
            return await interaction.response.send_message("❌ Band must be 0–14.", ephemeral=True)
        if not EQ_MIN <= gain <= EQ_MAX:
            return await interaction.response.send_message(
                f"❌ Gain must be between {EQ_MIN} and {EQ_MAX}.", ephemeral=True
            )
        # Map band to one of our 5 display bands if it overlaps, else apply raw
        for _, _, b in EQ_BANDS:
            if b == band:
                self._view._eq_gains[b] = _round2(gain)
                break
        f = ravelink.Filters()
        bands = [{"band": b, "gain": g} for b, g in
                 [(b, self._view._eq_gains.get(b, 0.0)) for _, _, b in EQ_BANDS]
                 if g != 0.0]
        if bands:
            f.equalizer.set(bands=bands)
        await self._view.player.set_filters(f, seek=True)
        self._view._active = None
        self._view._build()
        await interaction.response.edit_message(view=self._view)


# ── FiltersView ───────────────────────────────────────────────────────────────

class FiltersView(discord.ui.LayoutView):
    """
    Three-tab audio filter studio.
      presets   → preset buttons grouped by Energy / Mood / Spatial
      eq        → 5-band equalizer with +/− controls
      timescale → speed / pitch / rate sliders
    """

    _PRESET_COLOR = 0x7B2FBE
    _EQ_COLOR     = 0x5865F2
    _TS_COLOR     = 0x1DB954

    def __init__(self, player: ravelink.Player, author: discord.Member | discord.User):
        super().__init__(timeout=180)
        self.player  = player
        self.author  = author
        self._state  = "presets"
        self._active = None               # active preset key
        self._eq_gains: dict[int, float] = {b: 0.0 for _, _, b in EQ_BANDS}
        self._speed  = 1.0
        self._pitch  = 1.0
        self._rate   = 1.0
        self._build()

    # ── auth ──────────────────────────────────────────────────────────────────

    async def _check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author.id:
            await interaction.response.send_message(
                "This panel belongs to someone else.", ephemeral=True
            )
            return False
        return True

    # ── build dispatcher ──────────────────────────────────────────────────────

    def _build(self):
        self.clear_items()
        if self._state == "presets":
            self._build_presets()
        elif self._state == "eq":
            self._build_eq()
        elif self._state == "timescale":
            self._build_timescale()

    # ── Tab 1: Presets ────────────────────────────────────────────────────────

    def _build_presets(self):
        active_label = "None"
        for grp, entries in PRESET_GROUPS:
            for key, emoji, label in entries:
                if key == self._active:
                    active_label = f"{emoji} {label}"
        if self._active is None and any(g != 0.0 for g in self._eq_gains.values()):
            active_label = "🎛 Custom EQ"
        if self._active is None and (self._speed != 1.0 or self._pitch != 1.0 or self._rate != 1.0):
            active_label = f"⚙️ Custom ({self._speed:.2f}× / {self._pitch:.2f}× / {self._rate:.2f}×)"

        card = discord.ui.Container(accent_color=self._PRESET_COLOR)
        card.add_item(discord.ui.TextDisplay("## 🎚️ Audio Filter Studio"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(f"**Active Filter:** {active_label}"))
        card.add_item(discord.ui.Separator())

        for grp_label, entries in PRESET_GROUPS:
            card.add_item(discord.ui.TextDisplay(f"**{grp_label}**"))
            row_btns = []
            for key, emoji, label in entries:
                is_active = key == self._active
                btn = discord.ui.Button(
                    label=label,
                    emoji=emoji,
                    style=discord.ButtonStyle.success if is_active else discord.ButtonStyle.secondary,
                    custom_id=f"fl_preset_{key}",
                )
                btn.callback = self._make_preset_cb(key, emoji, label)
                row_btns.append(btn)
            card.add_item(discord.ui.ActionRow(*row_btns))

        card.add_item(discord.ui.Separator())

        eq_btn = discord.ui.Button(label="Equalizer", emoji="🎛", style=discord.ButtonStyle.primary, custom_id="fl_tab_eq")
        ts_btn = discord.ui.Button(label="Timescale", emoji="⚙️", style=discord.ButtonStyle.primary, custom_id="fl_tab_ts")
        cl_btn = discord.ui.Button(label="Clear All",  emoji="❌", style=discord.ButtonStyle.danger,  custom_id="fl_clear")
        eq_btn.callback = self._eq_tab_cb
        ts_btn.callback = self._ts_tab_cb
        cl_btn.callback = self._clear_cb
        card.add_item(discord.ui.ActionRow(eq_btn, ts_btn, cl_btn))
        self.add_item(card)

    # ── Tab 2: Equalizer ──────────────────────────────────────────────────────

    def _build_eq(self):
        lines = []
        for name, dot, band in EQ_BANDS:
            gain = self._eq_gains.get(band, 0.0)
            lines.append(f"{dot} **{name:<9}** {_gain_bar(gain)}")
        eq_display = "\n".join(lines)

        card = discord.ui.Container(accent_color=self._EQ_COLOR)
        card.add_item(discord.ui.TextDisplay("## 🎛 Equalizer"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(eq_display))
        card.add_item(discord.ui.Separator())

        # Row per band-pair (2 bands per row = 4 buttons per row)
        for i in range(0, len(EQ_BANDS), 2):
            row_btns = []
            for j in range(2):
                if i + j >= len(EQ_BANDS):
                    break
                name, dot, band = EQ_BANDS[i + j]
                short = name[:3]
                btn_minus = discord.ui.Button(
                    label=f"▼ {short}", style=discord.ButtonStyle.secondary,
                    custom_id=f"fl_eq_{band}_dn",
                )
                btn_plus  = discord.ui.Button(
                    label=f"▲ {short}", style=discord.ButtonStyle.primary,
                    custom_id=f"fl_eq_{band}_up",
                )
                btn_minus.callback = self._make_eq_cb(band, -EQ_STEP)
                btn_plus.callback  = self._make_eq_cb(band, +EQ_STEP)
                row_btns += [btn_minus, btn_plus]
            card.add_item(discord.ui.ActionRow(*row_btns))

        # Last row: Treble +/- alone (5th band)
        card.add_item(discord.ui.Separator())

        apply_btn  = discord.ui.Button(label="Apply",     emoji="✅", style=discord.ButtonStyle.success, custom_id="fl_eq_apply")
        reset_btn  = discord.ui.Button(label="Reset EQ",  emoji="🔄", style=discord.ButtonStyle.danger,  custom_id="fl_eq_reset")
        custom_btn = discord.ui.Button(label="Custom Band",emoji="✏️", style=discord.ButtonStyle.secondary, custom_id="fl_eq_custom")
        back_btn   = discord.ui.Button(label="Back",       emoji="◀", style=discord.ButtonStyle.secondary, custom_id="fl_eq_back")
        apply_btn.callback  = self._eq_apply_cb
        reset_btn.callback  = self._eq_reset_cb
        custom_btn.callback = self._eq_custom_cb
        back_btn.callback   = self._back_cb
        card.add_item(discord.ui.ActionRow(apply_btn, reset_btn, custom_btn, back_btn))
        self.add_item(card)

    # ── Tab 3: Timescale ──────────────────────────────────────────────────────

    def _build_timescale(self):
        card = discord.ui.Container(accent_color=self._TS_COLOR)
        card.add_item(discord.ui.TextDisplay("## ⚙️ Custom Timescale"))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            f"🏃 **Speed  ** {_ts_bar(self._speed)}\n"
            f"🎵 **Pitch  ** {_ts_bar(self._pitch)}\n"
            f"⏩ **Rate   ** {_ts_bar(self._rate)}"
        ))
        card.add_item(discord.ui.Separator())
        card.add_item(discord.ui.TextDisplay(
            "-# Speed affects tempo, Pitch shifts tone, Rate combines both.\n"
            "-# Nightcore ≈ Speed 1.18 Pitch 1.12 · Vaporwave ≈ Speed 0.8 Pitch 0.88"
        ))
        card.add_item(discord.ui.Separator())

        # Speed row
        sp_dn = discord.ui.Button(label="▼ Speed", style=discord.ButtonStyle.secondary, custom_id="fl_sp_dn")
        sp_up = discord.ui.Button(label="▲ Speed", style=discord.ButtonStyle.primary,   custom_id="fl_sp_up")
        pt_dn = discord.ui.Button(label="▼ Pitch", style=discord.ButtonStyle.secondary, custom_id="fl_pt_dn")
        pt_up = discord.ui.Button(label="▲ Pitch", style=discord.ButtonStyle.primary,   custom_id="fl_pt_up")
        sp_dn.callback = self._make_ts_cb("speed", -TS_STEP)
        sp_up.callback = self._make_ts_cb("speed", +TS_STEP)
        pt_dn.callback = self._make_ts_cb("pitch", -TS_STEP)
        pt_up.callback = self._make_ts_cb("pitch", +TS_STEP)
        card.add_item(discord.ui.ActionRow(sp_dn, sp_up, pt_dn, pt_up))

        # Rate + utility row
        rt_dn = discord.ui.Button(label="▼ Rate", style=discord.ButtonStyle.secondary, custom_id="fl_rt_dn")
        rt_up = discord.ui.Button(label="▲ Rate", style=discord.ButtonStyle.primary,   custom_id="fl_rt_up")
        ap_btn = discord.ui.Button(label="Apply", emoji="✅", style=discord.ButtonStyle.success, custom_id="fl_ts_apply")
        rs_btn = discord.ui.Button(label="Reset", emoji="🔄", style=discord.ButtonStyle.danger,  custom_id="fl_ts_reset")
        bk_btn = discord.ui.Button(label="Back",  emoji="◀", style=discord.ButtonStyle.secondary, custom_id="fl_ts_back")
        rt_dn.callback = self._make_ts_cb("rate", -TS_STEP)
        rt_up.callback = self._make_ts_cb("rate", +TS_STEP)
        ap_btn.callback = self._ts_apply_cb
        rs_btn.callback = self._ts_reset_cb
        bk_btn.callback = self._back_cb
        card.add_item(discord.ui.ActionRow(rt_dn, rt_up, ap_btn, rs_btn, bk_btn))
        self.add_item(card)

    # ── Preset callbacks ──────────────────────────────────────────────────────

    def _make_preset_cb(self, key: str, emoji: str, label: str):
        async def _cb(interaction: discord.Interaction):
            if not await self._check(interaction): return
            if key == self._active:
                # toggle off
                self._active = None
                await self.player.set_filters(None, seek=True)
            else:
                try:
                    f = ravelink.Filters()
                    FILTER_PRESETS[key](f)
                    await self.player.set_filters(f, seek=True)
                    self._active = key
                    # reset manual EQ / TS state for display clarity
                    self._eq_gains = {b: 0.0 for _, _, b in EQ_BANDS}
                    self._speed = self._pitch = self._rate = 1.0
                except Exception as e:
                    return await interaction.response.send_message(f"❌ {e}", ephemeral=True)
            self._build()
            await interaction.response.edit_message(view=self)
        return _cb

    # ── EQ callbacks ──────────────────────────────────────────────────────────

    def _make_eq_cb(self, band: int, delta: float):
        async def _cb(interaction: discord.Interaction):
            if not await self._check(interaction): return
            self._eq_gains[band] = _round2(_clamp(
                self._eq_gains.get(band, 0.0) + delta, EQ_MIN, EQ_MAX
            ))
            self._build()
            await interaction.response.edit_message(view=self)
        return _cb

    async def _eq_apply_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        f = ravelink.Filters()
        bands = [{"band": b, "gain": g} for b, g in self._eq_gains.items() if g != 0.0]
        if bands:
            f.equalizer.set(bands=bands)
        await self.player.set_filters(f, seek=True)
        self._active = None
        self._build()
        await interaction.response.edit_message(view=self)

    async def _eq_reset_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self._eq_gains = {b: 0.0 for _, _, b in EQ_BANDS}
        await self.player.set_filters(None, seek=True)
        self._active = None
        self._build()
        await interaction.response.edit_message(view=self)

    async def _eq_custom_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.send_modal(CustomEQModal(self))

    # ── Timescale callbacks ───────────────────────────────────────────────────

    def _make_ts_cb(self, param: str, delta: float):
        async def _cb(interaction: discord.Interaction):
            if not await self._check(interaction): return
            val = _clamp(_round2(getattr(self, f"_{param}") + delta), TS_MIN, TS_MAX)
            setattr(self, f"_{param}", val)
            self._build()
            await interaction.response.edit_message(view=self)
        return _cb

    async def _ts_apply_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        f = ravelink.Filters()
        f.timescale.set(speed=self._speed, pitch=self._pitch, rate=self._rate)
        await self.player.set_filters(f, seek=True)
        self._active = None
        self._build()
        await interaction.response.edit_message(view=self)

    async def _ts_reset_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self._speed = self._pitch = self._rate = 1.0
        await self.player.set_filters(None, seek=True)
        self._active = None
        self._build()
        await interaction.response.edit_message(view=self)

    # ── Tab navigation ────────────────────────────────────────────────────────

    async def _eq_tab_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self._state = "eq"
        self._build()
        await interaction.response.edit_message(view=self)

    async def _ts_tab_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self._state = "timescale"
        self._build()
        await interaction.response.edit_message(view=self)

    async def _back_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self._state = "presets"
        self._build()
        await interaction.response.edit_message(view=self)

    async def _clear_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await self.player.set_filters(None, seek=True)
        self._active   = None
        self._eq_gains = {b: 0.0 for _, _, b in EQ_BANDS}
        self._speed    = self._pitch = self._rate = 1.0
        self._build()
        await interaction.response.edit_message(view=self)

    async def on_timeout(self):
        pass


# ── Cog ───────────────────────────────────────────────────────────────────────

class FilterCog(commands.Cog, name="Filters"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(
        name="filter",
        aliases=["filters", "fx", "customfilter", "equalizer", "eq"],
        description="Open the interactive Audio Filter Studio.",
    )
    async def filter_(self, ctx: commands.Context):
        player = await voice_check(ctx)
        view   = FiltersView(player, ctx.author)
        if ctx.interaction:
            await ctx.interaction.response.send_message(view=view)
        else:
            await ctx.reply(view=view, mention_author=False)


async def setup(bot):
    await bot.add_cog(FilterCog(bot))
