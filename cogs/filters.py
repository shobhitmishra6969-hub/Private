"""Audio filter commands."""
from __future__ import annotations

import discord
import ravelink
from discord.ext import commands

import config
from cogs.music import voice_check
from utils.checks import is_premium

COLOR = config.COLOR

FILTER_PRESETS = {
    "nightcore": lambda f: f.timescale.set(speed=1.18, pitch=1.12, rate=1.0),
    "vaporwave": lambda f: f.timescale.set(speed=0.8, pitch=0.88, rate=1.0),
    "bassboost": lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": 0.3}, {"band": 1, "gain": 0.25},
        {"band": 2, "gain": 0.2}, {"band": 3, "gain": 0.1},
    ]),
    "8d": lambda f: f.rotation.set(rotation_hz=0.2),
    "tremolo": lambda f: f.tremolo.set(frequency=4.0, depth=0.75),
    "vibrato": lambda f: f.vibrato.set(frequency=4.0, depth=1.0),
    "pop": lambda f: f.equalizer.set(bands=[
        {"band": 2, "gain": 0.15}, {"band": 3, "gain": 0.15},
        {"band": 5, "gain": 0.2}, {"band": 7, "gain": 0.1},
    ]),
    "soft": lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": -0.2}, {"band": 7, "gain": 0.15},
        {"band": 8, "gain": 0.25}, {"band": 9, "gain": 0.2},
    ]),
    "superbass": lambda f: f.equalizer.set(bands=[
        {"band": 0, "gain": 0.6}, {"band": 1, "gain": 0.5},
        {"band": 2, "gain": 0.3},
    ]),
    "karaoke": lambda f: f.karaoke.set(level=1.0, mono_level=1.0, filter_band=220.0, filter_width=100.0),
    "lowpass": lambda f: f.low_pass.set(smoothing=20.0),
    "piano": lambda f: (
        f.equalizer.set(bands=[
            {"band": 2, "gain": 0.3}, {"band": 3, "gain": 0.3},
            {"band": 5, "gain": 0.25}, {"band": 6, "gain": 0.2},
        ]),
        f.timescale.set(speed=0.95, pitch=1.0, rate=1.0),
    ),
    "metal": lambda f: f.equalizer.set(bands=[
        {"band": 4, "gain": 0.4}, {"band": 5, "gain": 0.4},
        {"band": 6, "gain": 0.3}, {"band": 0, "gain": -0.2},
    ]),
    "clear": None,
}


class FilterCog(commands.Cog, name="Filters"):

    def __init__(self, bot):
        self.bot = bot

    @commands.hybrid_command(name="filter", description="Apply an audio filter preset.")
    async def filter_(self, ctx: commands.Context, preset: str):
        player = await voice_check(ctx)
        preset = preset.lower()

        if preset == "list":
            names = ", ".join(f"`{k}`" for k in FILTER_PRESETS)
            embed = discord.Embed(title="🎚️ Available Filters", description=names, color=COLOR)
            return await ctx.reply(embed=embed, mention_author=False)

        if preset == "clear":
            await player.set_filters(None, seek=True)
            return await ctx.reply(embed=discord.Embed(description="✅ Filters cleared.", color=COLOR), mention_author=False)

        if preset not in FILTER_PRESETS:
            names = ", ".join(f"`{k}`" for k in FILTER_PRESETS)
            embed = discord.Embed(description=f"❌ Unknown filter. Available: {names}", color=0xFF5555)
            return await ctx.reply(embed=embed, mention_author=False)

        filters = ravelink.Filters()
        try:
            FILTER_PRESETS[preset](filters)
        except Exception as e:
            return await ctx.reply(embed=self.bot.err(f"Filter error: {e}"), mention_author=False)

        await player.set_filters(filters, seek=True)
        await ctx.reply(embed=discord.Embed(description=f"🎚️ Applied filter: **{preset}**", color=COLOR), mention_author=False)

    @commands.hybrid_command(name="equalizer", aliases=["eq"], description="Set a custom equalizer band.")
    async def equalizer(self, ctx: commands.Context, band: int, gain: float):
        player = await voice_check(ctx)
        if not 0 <= band <= 14:
            return await ctx.reply(embed=self.bot.err("Band must be 0–14."), mention_author=False)
        if not -0.25 <= gain <= 1.0:
            return await ctx.reply(embed=self.bot.err("Gain must be between -0.25 and 1.0."), mention_author=False)

        filters = player.filters
        filters.equalizer.set(bands=[{"band": band, "gain": gain}])
        await player.set_filters(filters, seek=True)
        await ctx.reply(embed=discord.Embed(
            description=f"🎵 EQ band **{band}** set to **{gain:+.2f}**", color=COLOR
        ), mention_author=False)

    @commands.hybrid_command(name="customfilter", description="Apply a custom timescale filter.")
    async def customfilter(self, ctx: commands.Context,
                           speed: float = 1.0,
                           pitch: float = 1.0,
                           rate: float = 1.0):
        player = await voice_check(ctx)
        for name, val, lo, hi in [
            ("speed", speed, 0.1, 3.0),
            ("pitch", pitch, 0.1, 3.0),
            ("rate", rate, 0.1, 3.0),
        ]:
            if not lo <= val <= hi:
                return await ctx.reply(embed=self.bot.err(f"{name} must be between {lo} and {hi}."), mention_author=False)

        filters = ravelink.Filters()
        filters.timescale.set(speed=speed, pitch=pitch, rate=rate)
        await player.set_filters(filters, seek=True)
        await ctx.reply(embed=discord.Embed(
            description=f"🎛️ Custom filter: speed=**{speed}** pitch=**{pitch}** rate=**{rate}**",
            color=COLOR
        ), mention_author=False)


async def setup(bot):
    await bot.add_cog(FilterCog(bot))
