"""Giveaway system."""
from __future__ import annotations

import asyncio
import random
from typing import Optional

import discord
from discord.ext import commands

import config
import utils.v2 as v2
from database import get_db, json_load, json_dump, now_ts
from database.models import get_active_giveaways, get_all_active_giveaways

COLOR = config.COLOR
GA_COLOR = 0xFF6B6B


async def _pick_winners(entries: list, count: int) -> list:
    if not entries:
        return []
    count = min(count, len(entries))
    return random.sample(entries, count)


def _build_ga_container(prize: str, host_id: str, winner_count: int,
                         ends_at: int, entries: list, ended: bool = False,
                         winners: list = None) -> discord.ui.Container:
    if ended:
        if winners:
            winner_mentions = ", ".join(f"<@{w}>" for w in winners)
            body = f"**Winners:** {winner_mentions}\n\n**Participants:** {len(entries)}"
        else:
            body = "**No valid participants.**"
        return v2.container(body, header=f"🎁 {prize}", color=0x888888,
                            footer="Giveaway ended")
    else:
        body = (
            f"React or click **Enter** to participate!\n\n"
            f"**Ends:** <t:{ends_at}:R> (<t:{ends_at}:f>)\n"
            f"**Host:** <@{host_id}>\n"
            f"**Winners:** {winner_count}\n"
            f"**Entries:** {len(entries)}"
        )
        return v2.container(body, header=f"🎁 {prize}", color=GA_COLOR,
                            footer="Click the button below to enter!")


class GiveawayEnterView(discord.ui.LayoutView):
    def __init__(self, giveaway_id: int, prize: str, host_id: str,
                 winner_count: int, ends_at: int, entries: list):
        super().__init__(timeout=None)
        self.giveaway_id = giveaway_id
        self.prize = prize
        self.host_id = host_id
        self.winner_count = winner_count
        self.ends_at = ends_at
        self.entries = entries
        self._build()

    def _build(self, ended: bool = False, winners: list = None):
        self.clear_items()
        self.add_item(_build_ga_container(
            self.prize, self.host_id, self.winner_count,
            self.ends_at, self.entries, ended, winners
        ))
        if not ended:
            enter_btn = discord.ui.Button(
                label="🎉 Enter Giveaway",
                style=discord.ButtonStyle.success,
                custom_id=f"giveaway_enter_{self.giveaway_id}",
            )
            enter_btn.callback = self._enter_cb
            self.add_item(enter_btn)

    async def _enter_cb(self, interaction: discord.Interaction):
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
            self.entries = entries
            self._build()
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("✅ You've left the giveaway.", ephemeral=True)
        else:
            entries.append(user_id)
            await db.execute(
                "UPDATE giveaway SET entries=?, updatedAt=? WHERE id=?",
                [json_dump(entries), now_ts(), self.giveaway_id]
            )
            await db.commit()
            self.entries = entries
            self._build()
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("🎉 You've entered the giveaway!", ephemeral=True)


class GiveawayCog(commands.Cog, name="GiveawayCog"):

    def __init__(self, bot):
        self.bot = bot
        self._active: dict[int, asyncio.Task] = {}

    async def giveaway_loop(self):
        await self.bot.wait_until_ready()
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
                # Rebuild the view as ended (no enter button)
                ended_view = discord.ui.LayoutView(timeout=None)
                ended_view.add_item(_build_ga_container(
                    row["prize"], row["hostId"], row["winnerCount"],
                    row["endsAt"], entries, ended=True, winners=winners
                ))
                await msg.edit(view=ended_view)
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

    @commands.hybrid_group(name="giveaway", aliases=["ga"], description="Giveaway management.")
    async def giveaway(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info(
                "Use `giveaway start`, `end`, `reroll`, `cancel`, or `list`."
            ))

    @giveaway.command(name="start", description="Start a giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_start(self, ctx: commands.Context, duration: str, winners: int, *, prize: str):
        multipliers = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        unit = duration[-1].lower()
        try:
            amount = int(duration[:-1])
            seconds = amount * multipliers.get(unit, 1)
        except ValueError:
            return await v2.send(ctx, v2.err("Invalid duration. Example: `1h`, `30m`, `1d`"))

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

        enter_view = GiveawayEnterView(ga_id, prize, str(ctx.author.id), winners, ends_at, [])
        msg = await ctx.channel.send(view=enter_view)

        await db.execute("UPDATE giveaway SET messageId=? WHERE id=?", [str(msg.id), ga_id])
        await db.commit()

        self._schedule(ga_id, seconds)
        await v2.send(ctx, v2.ok(
            f"Giveaway started! 🎁 **{prize}** — ends <t:{ends_at}:R>"
        ), delete_after=5)

    @giveaway.command(name="end", description="End a giveaway early.")
    @commands.has_permissions(manage_guild=True)
    async def ga_end(self, ctx: commands.Context, message_id: str):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await v2.send(ctx, v2.err("Giveaway not found."))
        if row["ended"] or row["cancelled"]:
            return await v2.send(ctx, v2.err("Giveaway already ended."))
        task = self._active.pop(int(row["id"]), None)
        if task:
            task.cancel()
        await self._finalize(int(row["id"]))
        await v2.send(ctx, v2.ok("Giveaway ended."))

    @giveaway.command(name="reroll", description="Reroll winners for a giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_reroll(self, ctx: commands.Context, message_id: str, count: int = 1):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await v2.send(ctx, v2.err("Giveaway not found."))
        entries = json_load(row["entries"])
        winners = await _pick_winners(entries, count)
        db = await get_db()
        await db.execute("UPDATE giveaway SET winners=?, updatedAt=? WHERE messageId=?",
                         [json_dump(winners), now_ts(), message_id])
        await db.commit()
        if winners:
            mentions = ", ".join(f"<@{w}>" for w in winners)
            await v2.send(ctx, v2.container(f"🔄 New winners: {mentions}! Congratulations!"))
        else:
            await v2.send(ctx, v2.err("No entries to pick from."))

    @giveaway.command(name="cancel", description="Cancel an active giveaway.")
    @commands.has_permissions(manage_guild=True)
    async def ga_cancel(self, ctx: commands.Context, message_id: str):
        from database.models import get_giveaway
        row = await get_giveaway(message_id)
        if not row:
            return await v2.send(ctx, v2.err("Giveaway not found."))
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
                cancelled_view = discord.ui.LayoutView(timeout=None)
                cancelled_view.add_item(v2.container(
                    "This giveaway has been cancelled.",
                    header=f"🎁 {row['prize']}",
                    color=0x888888,
                    footer="Giveaway cancelled",
                ))
                await msg.edit(view=cancelled_view)
        except Exception:
            pass
        await v2.send(ctx, v2.ok("Giveaway cancelled."))

    @giveaway.command(name="list", description="List active giveaways.")
    async def ga_list(self, ctx: commands.Context):
        rows = await get_active_giveaways(ctx.guild.id)
        if not rows:
            return await v2.send(ctx, v2.info("No active giveaways."))
        desc = "\n".join(
            f"• **{r['prize']}** — ends <t:{r['endsAt']}:R> — {r['winnerCount']} winner(s)"
            for r in rows
        )
        await v2.send(ctx, v2.container(desc, header="🎁 Active Giveaways"))

    @commands.hybrid_group(name="giveawayconfig", aliases=["gconfig"], description="Giveaway settings.")
    @commands.has_permissions(manage_guild=True)
    async def giveawayconfig(self, ctx: commands.Context):
        if ctx.invoked_subcommand is None:
            await v2.send(ctx, v2.info("Use `giveawayconfig dmnotify` or `giveawayconfig roles`."))

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
        await v2.send(ctx, v2.ok(f"DM notifications {state}."))


async def setup(bot):
    await bot.add_cog(GiveawayCog(bot))
