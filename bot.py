"""ToneVibes — Python rewrite using discord.py + ravelink."""
from __future__ import annotations

import asyncio
import os
import traceback
from typing import Any

import discord
import ravelink
from discord.ext import commands

import config
import emojis as E
from database import get_db
from database.models import get_guild_prefix, increment_commands, get_blacklist
from events.player_events import setup_events
from utils import logger
from cogs.information import InfoLayoutView
import utils.v2 as v2

COGS = [
    "cogs.music",
    "cogs.filters",
    "cogs.config_cog",
    "cogs.giveaway",
    "cogs.information",
    "cogs.utility",
    "cogs.owner",
    "cogs.favourite",
    "cogs.spotify",
    "cogs.playlist",
    "cogs.lastfm",
    "cogs.lyrics",
]

COLOR = config.COLOR


async def get_prefix(bot: "ToneVibes", message: discord.Message) -> list[str]:
    base = [config.PREFIX]
    if message.guild:
        custom = await get_guild_prefix(message.guild.id)
        if custom and custom not in base:
            base.append(custom)
    base.append(bot.user.mention if bot.user else "<@!0>")
    return base


class ToneVibes(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.voice_states = True
        intents.members = True

        super().__init__(
            command_prefix=get_prefix,
            intents=intents,
            help_command=None,
            allowed_mentions=discord.AllowedMentions(replied_user=False, everyone=False),
        )
        self.color = COLOR
        self.owners: list[int] = config.OWNER_IDS
        self.spam_map: dict[int, int] = {}
        self._giveaway_task: asyncio.Task | None = None

    # ── startup ───────────────────────────────────────────────────────────────

    async def setup_hook(self) -> None:
        try:
            await get_db()
            logger.log("[DB] SQLite connected", "ready")
        except Exception as e:
            logger.log(f"[DB] Error: {e}", "error")

        setup_events(self)

        for cog in COGS:
            try:
                await self.load_extension(cog)
                logger.log(f"Loaded cog: {cog}", "log")
            except Exception:
                logger.log(f"Failed to load cog {cog}:\n{traceback.format_exc()}", "error")

        try:
            synced = await self.tree.sync()
            logger.log(f"Synced {len(synced)} slash commands.", "cmd")
        except Exception as e:
            logger.log(f"Slash command sync failed: {e}", "error")

    async def on_ready(self) -> None:
        logger.log("ToneVibes is now online.", "ready")
        logger.log(
            f"Ready on {len(self.guilds)} servers, {sum(g.member_count or 0 for g in self.guilds):,} users",
            "ready",
        )

        nodes = [
            ravelink.Node(
                identifier=n["identifier"],
                uri=n["uri"],
                password=n["password"],
                retries=n.get("retries", 5),
                resume_timeout=n.get("resume_timeout", 60),
                request_timeout=n.get("request_timeout", 15.0),
                inactive_player_timeout=300,
            )
            for n in config.NODES
        ]
        if not ravelink.Pool.nodes:
            await ravelink.Pool.connect(nodes=nodes, client=self, cache_capacity=512)

        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.listening,
                name=f"music on {len(self.guilds)} servers | {config.PREFIX}help",
            )
        )

        from cogs.giveaway import GiveawayCog
        cog = self.get_cog("GiveawayCog")
        if cog:
            self._giveaway_task = asyncio.create_task(cog.giveaway_loop())

    # ── event hooks ──────────────────────────────────────────────────────────

    async def on_guild_join(self, guild: discord.Guild) -> None:
        logger.log(f"Joined guild: {guild.name} ({guild.id})", "info")
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.listening,
                name=f"music on {len(self.guilds)} servers | {config.PREFIX}help",
            )
        )

    async def on_guild_remove(self, guild: discord.Guild) -> None:
        logger.log(f"Left guild: {guild.name} ({guild.id})", "info")

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        if self.user:
            content = message.content.strip()
            is_mention = content in (
                f"<@{self.user.id}>",
                f"<@!{self.user.id}>",
            )
            if is_mention:
                try:
                    voice = getattr(message.author, "voice", None)
                    vc_channel = voice.channel if voice and voice.channel else None
                    if vc_channel:
                        # Send into the voice channel's own text chat
                        await vc_channel.send(view=InfoLayoutView(self))
                    else:
                        # Fallback: reply in the text channel where the mention happened
                        await message.reply(view=InfoLayoutView(self), mention_author=False)
                except Exception:
                    pass
                return

        try:
            bl = await get_blacklist(message.author.id)
            if bl:
                return

            from database.models import get_afk, clear_afk
            afk = await get_afk(message.author.id)
            if afk:
                try:
                    await clear_afk(message.author.id)
                    lv = discord.ui.LayoutView(timeout=None)
                    lv.add_item(v2.container(
                        f"{E.check} Welcome back {message.author.mention}! Your AFK status has been removed."
                    ))
                    await message.reply(
                        view=lv,
                        delete_after=8,
                        mention_author=False,
                    )
                except Exception:
                    pass

            if message.mentions:
                for user in message.mentions:
                    try:
                        mentioned_afk = await get_afk(user.id)
                        if mentioned_afk:
                            import datetime
                            ts = mentioned_afk["createdAt"]
                            afk_dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
                            since = discord.utils.format_dt(afk_dt, "R")
                            lv2 = discord.ui.LayoutView(timeout=None)
                            lv2.add_item(v2.container(
                                f"💤 **{user.display_name}** is AFK\n"
                                f"**Reason:** {mentioned_afk['reason']}\n"
                                f"**Since:** {since}"
                            ))
                            await message.reply(
                                view=lv2,
                                delete_after=10,
                                mention_author=False,
                            )
                            break
                    except Exception:
                        pass

        except Exception as e:
            logger.log(f"[on_message] Error: {e}", "error")

        await self.process_commands(message)

    async def on_command(self, ctx: commands.Context) -> None:
        try:
            await increment_commands(ctx.author.id)
        except Exception:
            pass
        logger.log(f"{ctx.author} ({ctx.author.id}) ran {ctx.command} in {ctx.guild}", "cmd")

    async def on_command_error(self, ctx: commands.Context, error: commands.CommandError) -> None:
        if isinstance(error, commands.CommandNotFound):
            return
        if isinstance(error, commands.NotOwner):
            return await v2.send(ctx, v2.err("This command is owner-only."))
        if isinstance(error, commands.MissingPermissions):
            return await v2.send(ctx, v2.err(f"You're missing permissions: `{', '.join(error.missing_permissions)}`"))
        if isinstance(error, commands.CheckFailure):
            return await v2.send(ctx, v2.err(str(error)))
        if isinstance(error, commands.MissingRequiredArgument):
            return await v2.send(ctx, v2.err(f"Missing argument: `{error.param.name}`"))
        if isinstance(error, commands.CommandOnCooldown):
            return await v2.send(ctx, v2.err(f"⏳ Cooldown! Try again in `{error.retry_after:.1f}s`"), delete_after=5)
        if isinstance(error, commands.BadArgument):
            return await v2.send(ctx, v2.err(f"Bad argument: {error}"))

        logger.log(f"Unhandled error in {ctx.command}: {error}\n{traceback.format_exc()}", "error")
        try:
            await v2.send(ctx, v2.err(f"An error occurred: `{error}`"))
        except Exception:
            pass

    # ── helpers ──────────────────────────────────────────────────────────────

    def ok(self, text: str) -> discord.ui.Container:
        return v2.ok(text)

    def err(self, text: str) -> discord.ui.Container:
        return v2.err(text)

    def info_embed(self, text: str) -> discord.ui.Container:
        return v2.info(text)
