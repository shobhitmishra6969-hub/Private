"""Giveaway system + GiveawayConfig interactive panel."""
from __future__ import annotations

import asyncio
import json
import random
from typing import Optional

import discord
from discord.ext import commands

import config
import utils.v2 as v2
from database import get_db, db_get, db_set, json_load, json_dump, now_ts
from database.models import get_active_giveaways, get_all_active_giveaways

COLOR    = config.COLOR
GA_COLOR = 0xFF6B6B
GA_GREEN = 0x57F287
GA_DARK  = 0x2B2D31


# ── helpers ───────────────────────────────────────────────────────────────────

async def _pick_winners(entries: list, count: int) -> list:
    if not entries:
        return []
    count = min(count, len(entries))
    return random.sample(entries, count)


async def get_ga_config(guild_id: int | str) -> dict:
    row = await db_get("giveawayconfig", {"guildId": str(guild_id)})
    if not row:
        return {
            "guildId": str(guild_id),
            "theme": "blue",
            "dmNotifications": 0,
            "defaultImage": None,
            "managerRoles": "[]",
        }
    return dict(row)


async def save_ga_config(guild_id: int | str, data: dict) -> None:
    data["guildId"] = str(guild_id)
    data["updatedAt"] = now_ts()
    await db_set("giveawayconfig", data, pk="guildId")


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


# ── Giveaway Enter View ───────────────────────────────────────────────────────

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
            self.add_item(discord.ui.ActionRow(enter_btn))

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


# ── GiveawayConfig Modals ─────────────────────────────────────────────────────

class SetImageModal(discord.ui.Modal, title="Set Default Giveaway Image"):
    url = discord.ui.TextInput(
        label="Image URL",
        placeholder="https://i.imgur.com/example.png",
        style=discord.TextStyle.short,
        required=True,
        max_length=500,
    )

    def __init__(self, view: "GiveawayConfigView"):
        super().__init__()
        self._view = view

    async def on_submit(self, interaction: discord.Interaction):
        cfg = self._view.cfg
        cfg["defaultImage"] = self.url.value.strip()
        await save_ga_config(self._view.guild_id, cfg)
        self._view.cfg = cfg
        self._view._build()
        await interaction.response.edit_message(view=self._view)


class AddRoleModal(discord.ui.Modal, title="Add Manager Role"):
    role_id = discord.ui.TextInput(
        label="Role ID",
        placeholder="Paste the role ID here (e.g. 123456789012345678)",
        style=discord.TextStyle.short,
        required=True,
        max_length=25,
    )

    def __init__(self, view: "GiveawayConfigView"):
        super().__init__()
        self._view = view

    async def on_submit(self, interaction: discord.Interaction):
        raw = self.role_id.value.strip()
        if not raw.isdigit():
            return await interaction.response.send_message(
                "❌ Please enter a valid role ID (numbers only).", ephemeral=True
            )
        guild = interaction.guild
        role = guild.get_role(int(raw)) if guild else None
        if not role:
            return await interaction.response.send_message(
                "❌ Role not found in this server.", ephemeral=True
            )
        cfg = self._view.cfg
        roles = json_load(cfg.get("managerRoles", "[]"))
        if raw in roles:
            return await interaction.response.send_message(
                f"❌ {role.mention} is already a manager role.", ephemeral=True
            )
        roles.append(raw)
        cfg["managerRoles"] = json_dump(roles)
        await save_ga_config(self._view.guild_id, cfg)
        self._view.cfg = cfg
        self._view._build()
        await interaction.response.edit_message(view=self._view)


class RemoveRoleModal(discord.ui.Modal, title="Remove Manager Role"):
    role_id = discord.ui.TextInput(
        label="Role ID to Remove",
        placeholder="Paste the role ID here",
        style=discord.TextStyle.short,
        required=True,
        max_length=25,
    )

    def __init__(self, view: "GiveawayConfigView"):
        super().__init__()
        self._view = view

    async def on_submit(self, interaction: discord.Interaction):
        raw = self.role_id.value.strip()
        cfg = self._view.cfg
        roles = json_load(cfg.get("managerRoles", "[]"))
        if raw not in roles:
            return await interaction.response.send_message(
                "❌ That role ID is not in the manager roles list.", ephemeral=True
            )
        roles.remove(raw)
        cfg["managerRoles"] = json_dump(roles)
        await save_ga_config(self._view.guild_id, cfg)
        self._view.cfg = cfg
        self._view._build()
        await interaction.response.edit_message(view=self._view)


# ── GiveawayConfig View ───────────────────────────────────────────────────────

class GiveawayConfigView(discord.ui.LayoutView):
    """
    Interactive giveaway configuration panel.
    Layout:
      [Card 1] Current config display
      [Card 2] Features list
      [Card 3] Action buttons
    """

    def __init__(self, author: discord.Member, guild_id: int | str, cfg: dict):
        super().__init__(timeout=180)
        self.author   = author
        self.guild_id = str(guild_id)
        self.cfg      = cfg
        self._build()

    def _build(self):
        self.clear_items()

        theme    = self.cfg.get("theme", "blue")
        dm_on    = bool(self.cfg.get("dmNotifications", 0))
        img      = self.cfg.get("defaultImage") or None
        roles_raw = json_load(self.cfg.get("managerRoles", "[]"))

        theme_label  = "White Theme" if theme == "white" else "Blue Theme"
        theme_dot    = "🟢" if theme == "white" else "🔵"
        dm_dot       = "🟢" if dm_on else "🔴"
        dm_label     = "Enabled" if dm_on else "Disabled"
        img_label    = img[:45] + "…" if img and len(img) > 45 else (img or "Not set")
        roles_label  = f"{len(roles_raw)} role(s) set" if roles_raw else "None set"

        # ── Card 1: Current config ────────────────────────────────────────────
        cfg_card = discord.ui.Container(accent_color=COLOR)
        cfg_card.add_item(discord.ui.TextDisplay("## 🎉 Giveaway Configuration"))
        cfg_card.add_item(discord.ui.Separator())
        cfg_card.add_item(discord.ui.TextDisplay(
            "**▷ Current Configuration:**\n\n"
            f"**• Theme:** {theme_dot} {theme_label}\n"
            f"**• DM Notifications:** {dm_dot} {dm_label}\n"
            f"**• Default Image:** {img_label}\n"
            f"**• Manager Roles:** {roles_label}"
        ))
        self.add_item(cfg_card)

        # ── Card 2: Features ──────────────────────────────────────────────────
        feat_card = discord.ui.Container(accent_color=GA_DARK)
        feat_card.add_item(discord.ui.TextDisplay(
            "**📋 Features:**\n"
            "**—** Choose between White or Blue giveaway theme\n"
            "**—** Toggle DM notifications for entries/wins\n"
            "**—** Set default image for all giveaways\n"
            "**—** Configure manager roles for giveaway permissions\n"
            "**—** Manager roles can create/manage giveaways"
        ))
        self.add_item(feat_card)

        # ── Card 3: Buttons ───────────────────────────────────────────────────
        btn_card = discord.ui.Container(accent_color=GA_DARK)

        # Row 1: Theme toggle + DM toggle
        theme_btn = discord.ui.Button(
            label=f"Theme: {'White' if theme == 'white' else 'Blue'}",
            style=discord.ButtonStyle.primary if theme == "white" else discord.ButtonStyle.secondary,
            custom_id="gc_theme",
        )
        dm_btn = discord.ui.Button(
            label="Toggle DM",
            style=discord.ButtonStyle.success if dm_on else discord.ButtonStyle.secondary,
            custom_id="gc_dm",
        )
        theme_btn.callback = self._theme_cb
        dm_btn.callback    = self._dm_cb
        btn_card.add_item(discord.ui.ActionRow(theme_btn, dm_btn))

        # Row 2: Default Image + Manager Roles view
        img_btn   = discord.ui.Button(label="Default Image",  style=discord.ButtonStyle.secondary, custom_id="gc_img")
        roles_btn = discord.ui.Button(label="Manager Roles",  style=discord.ButtonStyle.secondary, custom_id="gc_roles")
        img_btn.callback   = self._img_cb
        roles_btn.callback = self._roles_cb
        btn_card.add_item(discord.ui.ActionRow(img_btn, roles_btn))

        # Row 3: Add / Remove Manager Role
        add_role_btn = discord.ui.Button(label="Add Manager Role",    style=discord.ButtonStyle.success,   custom_id="gc_add_role")
        rem_role_btn = discord.ui.Button(label="Remove Manager Role", style=discord.ButtonStyle.danger,    custom_id="gc_rem_role", disabled=not roles_raw)
        add_role_btn.callback = self._add_role_cb
        rem_role_btn.callback = self._rem_role_cb
        btn_card.add_item(discord.ui.ActionRow(add_role_btn, rem_role_btn))

        # Row 4: Reset Image + Reset Roles
        rst_img_btn   = discord.ui.Button(label="Reset Default Image",  style=discord.ButtonStyle.danger, custom_id="gc_rst_img",   disabled=not img)
        rst_roles_btn = discord.ui.Button(label="Reset Manager Roles",  style=discord.ButtonStyle.danger, custom_id="gc_rst_roles", disabled=not roles_raw)
        rst_img_btn.callback   = self._rst_img_cb
        rst_roles_btn.callback = self._rst_roles_cb
        btn_card.add_item(discord.ui.ActionRow(rst_img_btn, rst_roles_btn))

        self.add_item(btn_card)

    # ── auth check ────────────────────────────────────────────────────────────

    async def _check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.author.id:
            await interaction.response.send_message("This panel belongs to someone else.", ephemeral=True)
            return False
        return True

    # ── callbacks ─────────────────────────────────────────────────────────────

    async def _theme_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.cfg["theme"] = "blue" if self.cfg.get("theme") == "white" else "white"
        await save_ga_config(self.guild_id, self.cfg)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _dm_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.cfg["dmNotifications"] = 0 if self.cfg.get("dmNotifications") else 1
        await save_ga_config(self.guild_id, self.cfg)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _img_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.send_modal(SetImageModal(self))

    async def _roles_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        roles_raw = json_load(self.cfg.get("managerRoles", "[]"))
        guild = interaction.guild
        if not roles_raw:
            return await interaction.response.send_message(
                "No manager roles have been set yet. Use **Add Manager Role** to add one.", ephemeral=True
            )
        mentions = []
        for rid in roles_raw:
            role = guild.get_role(int(rid)) if guild else None
            mentions.append(role.mention if role else f"`{rid}` (not found)")
        await interaction.response.send_message(
            f"**Current Manager Roles:**\n" + "\n".join(f"• {m}" for m in mentions),
            ephemeral=True,
        )

    async def _add_role_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.send_modal(AddRoleModal(self))

    async def _rem_role_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        await interaction.response.send_modal(RemoveRoleModal(self))

    async def _rst_img_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.cfg["defaultImage"] = None
        await save_ga_config(self.guild_id, self.cfg)
        self._build()
        await interaction.response.edit_message(view=self)

    async def _rst_roles_cb(self, interaction: discord.Interaction):
        if not await self._check(interaction): return
        self.cfg["managerRoles"] = "[]"
        await save_ga_config(self.guild_id, self.cfg)
        self._build()
        await interaction.response.edit_message(view=self)

    async def on_timeout(self):
        pass


# ── Cog ───────────────────────────────────────────────────────────────────────

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

    # ── Giveaway commands ─────────────────────────────────────────────────────

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

        # Send the giveaway embed as the single command response — no extra confirmation
        if ctx.interaction:
            await ctx.interaction.response.send_message(view=enter_view)
            resp = await ctx.interaction.original_response()
            msg  = resp
        else:
            msg = await ctx.reply(view=enter_view, mention_author=False)

        await db.execute("UPDATE giveaway SET messageId=? WHERE id=?", [str(msg.id), ga_id])
        await db.commit()

        self._schedule(ga_id, seconds)

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

    # ── GiveawayConfig ────────────────────────────────────────────────────────

    @commands.hybrid_command(name="giveawayconfig", aliases=["gconfig", "gaconfig"],
                              description="Configure giveaway settings for this server.")
    @commands.has_permissions(manage_guild=True)
    async def giveawayconfig(self, ctx: commands.Context):
        cfg  = await get_ga_config(ctx.guild.id)
        view = GiveawayConfigView(ctx.author, ctx.guild.id, cfg)
        await ctx.reply(view=view, mention_author=False)


async def setup(bot):
    await bot.add_cog(GiveawayCog(bot))
