"""Giveaway system."""
from __future__ import annotations

import asyncio
import json
import random
import time
from typing import Optional

import discord
from discord.ext import commands

import config
from database import get_db, json_load, json_dump, now_ts
from database.models import get_active_giveaways, get_all_active_giveaways

COLOR = config.COLOR
GA_COLOR = 0xFF6B6B


async def _pick_winners(entries: list, count: int) -> list:
    if not entries:
        return []
    count = min(count, len(entries))
    return random.sample(entries, count)


async def _fetch_giveaway_msg(bot, guild_id: str, channel_id: str, message_id: str):
    try:
        channel = bot.get_channel(int(channel_id))
        if channel:
            return await channel.fetch_message(int(message_id))
    except Exception:
        return None


def build_giveaway_embed(prize: str, host_id: str, winner_count: int,
                          ends_at: int, entries: list, ended: bool = False,
                          winners: list = None) -> discord.Embed:
    embed = discord.Embed(color=GA_COLOR)
    embed.title = f"🎁 {prize}"
    if ended:
        if winners:
            winner_mentions = ", ".join(f"<@{w}>" for w in winners)
            embed.description = f"**Winners:** {winner_mentions}"
        else:
            embed.description = "**No valid participants.**"
        embed.color = 0x888888
        embed.set_footer(text=f"Giveaway ended • {len(entries)} participants")
    else:
        embed.description = (
            f"React with 🎉 to enter!\n\n"
            f"**Ends:** <t:{ends_at}:R> (<t:{ends_at}:f>)\n"
            f"**Host:** <@{host_id}>\n"
            f"**Winners:** {winner_count}\n"
            f"**Entries:** {len(entries)}"
        )
        embed.set_footer(text="Click the button below to enter!")
    return embed


class GiveawayEnterView(discord.ui.View):
    def __init__(self, giveaway_id: int):
        super().__init__(timeout=None)
        self.giveaway_id = giveaway_id

    @discord.ui.button(label="🎉 Enter Giveaway", style=discord.ButtonStyle.success,
                        custom_id="giveaway_enter")
    async def enter(self, interaction: discord.Interaction, button: discord.ui.Button):
        db = await get_db()
        async with db.execute("SELECT * FROM giveaway WHERE id=?", [self.giveaway_id]) as cur:
            row = await cur.fetchone()
        if not row:
            return await interaction.response.send_message("Giveaway not found.", ephemeral=True)
        if row["ended"] or row["cancelled"]:
            return await interaction.response.send_message("This giveaway has ended.", ephemeral=True)
        if row["endsAt"] < now_ts():
            return await interaction.response.send_message("This giveaway has ended.", ephemeral=True)

        entries = json_load(row["entries"])
        user_id = str(interaction.user.id)
        if user_id in entries:
            entries.remove(user_id)
            await db.execute(
                "UPDATE giveaway SET entries=?, updatedAt=? WHERE id=?",
                [json_dump(entries), now_ts(), self.giveaway_id]
            )
            await db.commit()
            await interaction.response.send_message("✅ You've left the giveaway.", ephemeral=True)
        else:
            entries.append(user_id)
            await db.execute(
                "UPDATE giveaway SET entries=?, updatedAt=? WHERE id=?",
                [json_dump(entries), now_ts(), self.giveaway_id]
            )
            await db.commit()
            await interaction.response.send_message("🎉 You've entered the giveaway!", ephemeral=True)


class GiveawayCog(commands.Cog, name="GiveawayCog"):

    def __init__(self, bot):
        self.bot = bot
        self._active: dict[int, asyncio.Task] = {}

    # ── background loop ───────────────────────────────────────────────────────

    async def giveaway_loop(self):
        await self.bot.wait_until_ready()
        # Resume any active giveaways
        try:
            rows = await get_all_active_giveaways()
            for row in rows:
                ga_id = row["id"]
                remaining = row["endsAt"] - now_ts()
                if remaining > 0:
                    self._schedule(ga_id, remaining)
        except Exception:
            pass

        while not self.bot.is_closed():
            await asyncio.sleep(30)

    def _schedule(self, ga_id: int, delay: float):
        if ga_id in self._active:
            return
        task = asyncio.create_task(self._end_after(ga_id, delay))
        self._active[ga_id] = task

    async def _end_after(self, ga_id: int, delay: float):
        try:
            await asyncio.sleep(max(0, delay))
            await self._finalize(ga_id)
        except asyncio.CancelledError:
            pass
        finally:
            self._active.pop(ga_id, None)

    async def _finalize(self, ga_id: int, force_winners: list | None = None):
        db = await get_db()
        async with db.execute("SELECT * FROM giveaway WHERE id=?", [ga_id]) as cur:
            row = await cur.fetchone()
        if not row or row["ended"] or row["cancelled"]:
            return

        entries = json_load(row["entries"])
        winners = force_winners if force_winners is not None else await _pick_winners(entries, row["winnerCount"])
        winner_str = json_dump(winners)

        await db.execute(
            "UPDATE giveaway SET ended=1, winners=?, updatedAt=? WHERE id=?",
            [winner_str, now_ts(), ga_id]
        )
        await db.commit()

        channel = self.bot.get_channel(int(row["channelId"]))
        if channel:
            try:
                msg = await channel.fetch_message(int(row["messageId"]))
                embed = build_giveaway_embed(
                    row["prize"], row["hostId"], row["winnerCount"],
                    row["endsAt"], entries, ended=True, winners=winners
                )
                await msg.edit(embed=embed, view=None)
            except Exception:
                pass

            if winners:
                winner_mentions = ", ".join(f"<@{w}>" for w in winners)
                await channel.send(
                    f"🎉 Congratulations {winner_mentions}! You won **{row['prize']}**!\n"
                    f"Hosted by <@{row['hostId']}>"
                )
            else:
                await channel.send(f"😔 No one entered the giveaway for **{row['prize']}**.")

    # ── commands ──────────────────────────────────────────────────────────────

    @commands.hybrid_group(name="giveaway", aliases=["ga"], description="Giveaway management.")
    async def giveaway(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed("Use `giveaway start`, `end`, `reroll`, `cancel`, or `list`."), mention_author=False)

    @giveaway.command(name="start", description="Start a giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_start(self, ctx: commands.Context,
                        duration: str, winners: int, *, prize: str):
        # Parse duration: 1h, 30m, 1d, etc.
        multipliers = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        unit = duration[-1].lower()
        try:
            amount = int(duration[:-1])
            seconds = amount * multipliers.get(unit, 1)
        except ValueError:
            return await ctx.reply(embed=self.bot.err("Invalid duration. Example: `1h`, `30m`, `1d`"), mention_author=False)

        ends_at = now_ts() + seconds
        db = await get_db()
        cur = await db.execute("""
            INSERT INTO giveaway (guildId, channelId, hostId, prize, winnerCount,
                endsAt, entries, winners, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', ?, ?)
        """, [
            str(ctx.guild.id), str(ctx.channel.id), str(ctx.author.id),
            prize, winners, ends_at, now_ts(), now_ts()
        ])
        await db.commit()
        ga_id = cur.lastrowid

        embed = build_giveaway_embed(prize, str(ctx.author.id), winners, ends_at, [])
        view = GiveawayEnterView(ga_id)
        msg = await ctx.channel.send(embed=embed, view=view)

        await db.execute("UPDATE giveaway SET messageId=? WHERE id=?", [str(msg.id), ga_id])
        await db.commit()

        self._schedule(ga_id, seconds)
        await ctx.reply(embed=self.bot.ok(f"Giveaway started! 🎁 **{prize}** — ends <t:{ends_at}:R>"), mention_author=False, delete_after=5)

    @giveaway.command(name="end", description="End a giveaway early.")
    @commands.has_permissions(manage_guild=True)
    async def ga_end(self, ctx: commands.Context, message_id: str):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await ctx.reply(embed=self.bot.err("Giveaway not found."), mention_author=False)
        if row["ended"] or row["cancelled"]:
            return await ctx.reply(embed=self.bot.err("Giveaway already ended."), mention_author=False)
        task = self._active.pop(int(row["id"]), None)
        if task:
            task.cancel()
        await self._finalize(int(row["id"]))
        await ctx.reply(embed=self.bot.ok("Giveaway ended."), mention_author=False)

    @giveaway.command(name="reroll", description="Reroll winners for a giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_reroll(self, ctx: commands.Context, message_id: str, count: int = 1):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await ctx.reply(embed=self.bot.err("Giveaway not found."), mention_author=False)
        entries = json_load(row["entries"])
        winners = await _pick_winners(entries, count)
        db = await get_db()
        await db.execute("UPDATE giveaway SET winners=?, updatedAt=? WHERE messageId=?",
                         [json_dump(winners), now_ts(), message_id])
        await db.commit()
        if winners:
            mentions = ", ".join(f"<@{w}>" for w in winners)
            await ctx.send(f"🔄 New winners: {mentions}! Congrats!")
        else:
            await ctx.reply(embed=self.bot.err("No entries to pick from."), mention_author=False)

    @giveaway.command(name="cancel", description="Cancel an active giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_cancel(self, ctx: commands.Context, message_id: str):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await ctx.reply(embed=self.bot.err("Giveaway not found."), mention_author=False)
        db = await get_db()
        await db.execute("UPDATE giveaway SET cancelled=1, updatedAt=? WHERE messageId=?",
                         [now_ts(), message_id])
        await db.commit()
        task = self._active.pop(int(row["id"]), None)
        if task:
            task.cancel()
        try:
            channel = self.bot.get_channel(int(row["channelId"]))
            if channel:
                msg = await channel.fetch_message(int(message_id))
                embed = msg.embeds[0] if msg.embeds else discord.Embed(color=0x888888)
                embed.color = 0x888888
                embed.set_footer(text="Giveaway cancelled")
                await msg.edit(embed=embed, view=None)
        except Exception:
            pass
        await ctx.reply(embed=self.bot.ok("Giveaway cancelled."), mention_author=False)

    @giveaway.command(name="list", description="List active giveaways.")
    async def ga_list(self, ctx: commands.Context):
        rows = await get_active_giveaways(ctx.guild.id)
        if not rows:
            return await ctx.reply(embed=self.bot.info_embed("No active giveaways."), mention_author=False)
        desc = "\n".join(
            f"• **{r['prize']}** — ends <t:{r['endsAt']}:R> — {r['winnerCount']} winner(s)"
            for r in rows
        )
        embed = discord.Embed(title="🎁 Active Giveaways", description=desc, color=COLOR)
        await ctx.reply(embed=embed, mention_author=False)

    @commands.hybrid_group(name="giveawayconfig", aliases=["gconfig"], description="Giveaway settings.")
    @commands.has_permissions(manage_guild=True)
    async def giveawayconfig(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await ctx.reply(embed=self.bot.info_embed("Use `giveawayconfig dmnotify` or `giveawayconfig roles`."), mention_author=False)

    @giveawayconfig.command(name="dmnotify", description="Toggle DM notifications for winners.")
    async def gc_dmnotify(self, ctx: commands.Context):
        from database import db_get, db_set, now_ts
        row = await db_get("giveawayconfig", {"guildId": str(ctx.guild.id)})
        current = row["dmNotifications"] if row else 0
        new_val = 0 if current else 1
        await db_set("giveawayconfig", {
            "guildId": str(ctx.guild.id),
            "dmNotifications": new_val,
            "updatedAt": now_ts(),
        }, pk="guildId")
        state = "enabled" if new_val else "disabled"
        await ctx.reply(embed=self.bot.ok(f"DM notifications {state}."), mention_author=False)


async def setup(bot):
    await bot.add_cog(GiveawayCog(bot))
