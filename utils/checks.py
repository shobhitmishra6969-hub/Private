from __future__ import annotations

import time
from typing import Callable

import discord
from discord.ext import commands

import config
from database import get_db, db_get


async def is_premium(user_id: int) -> bool:
    row = await db_get("premiumuser", {"userId": str(user_id)})
    if not row:
        return False
    if not row["premium"]:
        return False
    expires_at = row["expiresAt"]
    if expires_at and expires_at < int(time.time()):
        return False
    return True


async def is_blacklisted(user_id: int) -> bool:
    row = await db_get("blacklist", {"userId": str(user_id)})
    return row is not None


async def get_prefix(user_id: int, guild_id: int | None) -> str:
    if guild_id:
        row = await db_get("prefix", {"Guild": str(guild_id)})
        if row and row["Prefix"]:
            return row["Prefix"]
    return config.PREFIX


async def get_dj_role(guild_id: int) -> int | None:
    row = await db_get("djrole", {"guildId": str(guild_id)})
    if row and row["roleId"]:
        try:
            return int(row["roleId"])
        except (TypeError, ValueError):
            return None
    return None


async def has_dj(member: discord.Member) -> bool:
    dj_role_id = await get_dj_role(member.guild.id)
    if not dj_role_id:
        return True
    return any(r.id == dj_role_id for r in member.roles)


async def get_music_source(user_id: int) -> str:
    row = await db_get("userpreferences", {"userId": str(user_id)})
    if row and row["musicSource"]:
        return row["musicSource"]
    return config.NODE_SOURCE


def owner_only():
    async def predicate(ctx: commands.Context) -> bool:
        if ctx.author.id not in config.OWNER_IDS:
            raise commands.NotOwner("This command is owner-only.")
        return True
    return commands.check(predicate)


def dj_or_manage():
    async def predicate(ctx: commands.Context) -> bool:
        if ctx.author.id in config.OWNER_IDS:
            return True
        if ctx.author.guild_permissions.manage_guild:
            return True
        if await has_dj(ctx.author):
            return True
        raise commands.CheckFailure("You need the DJ role or Manage Server permission.")
    return commands.check(predicate)


def premium_only():
    async def predicate(ctx: commands.Context) -> bool:
        if await is_premium(ctx.author.id):
            return True
        raise commands.CheckFailure("This command requires premium. Use `/premium` for more info.")
    return commands.check(predicate)
