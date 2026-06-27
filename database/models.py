"""High-level async helpers for common DB operations."""
from __future__ import annotations

import json
import time
from typing import Any

from database import db_get, db_set, db_delete, db_all, json_load, json_dump, now_ts, get_db


# ── Prefix ────────────────────────────────────────────────────────────────────

async def get_guild_prefix(guild_id: int | str) -> str | None:
    row = await db_get("prefix", {"Guild": str(guild_id)})
    return row["Prefix"] if row else None


async def set_guild_prefix(guild_id: int | str, prefix: str) -> None:
    await db_set("prefix", {"Guild": str(guild_id), "Prefix": prefix, "oldPrefix": prefix}, pk="Guild")


# ── Premium ───────────────────────────────────────────────────────────────────

async def get_premium(user_id: int | str):
    return await db_get("premiumuser", {"userId": str(user_id)})


async def set_premium(user_id: int | str, data: dict) -> None:
    data["userId"] = str(user_id)
    await db_set("premiumuser", data, pk="userId")


# ── Liked Songs ───────────────────────────────────────────────────────────────

async def get_liked(user_id: int | str) -> list:
    row = await db_get("liked", {"userId": str(user_id)})
    return json_load(row["songs"] if row else None, [])


async def set_liked(user_id: int | str, songs: list) -> None:
    await db_set("liked", {"userId": str(user_id), "songs": json_dump(songs)}, pk="userId")


# ── AFK ───────────────────────────────────────────────────────────────────────

async def get_afk(user_id: int | str):
    return await db_get("afk", {"userId": str(user_id)})


async def set_afk(user_id: int | str, guild_id: int | str, reason: str = "AFK",
                  mode: str = "server") -> None:
    await db_set("afk", {
        "userId": str(user_id),
        "guildId": str(guild_id),
        "mode": mode,
        "reason": reason,
        "createdAt": now_ts(),
    }, pk="userId")


async def clear_afk(user_id: int | str) -> None:
    await db_delete("afk", {"userId": str(user_id)})


# ── User Stats ────────────────────────────────────────────────────────────────

async def increment_commands(user_id: int | str) -> None:
    db = await get_db()
    await db.execute("""
        INSERT INTO userstats (userId, commandsRun, updatedAt) VALUES (?, 1, ?)
        ON CONFLICT(userId) DO UPDATE SET commandsRun = commandsRun + 1, updatedAt = ?
    """, [str(user_id), now_ts(), now_ts()])
    await db.commit()


async def get_user_stats(user_id: int | str):
    return await db_get("userstats", {"userId": str(user_id)})


# ── User Badges ───────────────────────────────────────────────────────────────

async def get_badges(user_id: int | str) -> list:
    row = await db_get("userbadges", {"userId": str(user_id)})
    return json_load(row["badges"] if row else None, [])


# ── User Preferences ─────────────────────────────────────────────────────────

async def get_prefs(user_id: int | str):
    return await db_get("userpreferences", {"userId": str(user_id)})


async def set_prefs(user_id: int | str, **kwargs) -> None:
    row = await get_prefs(user_id)
    data: dict[str, Any] = dict(row) if row else {"userId": str(user_id), "createdAt": now_ts()}
    data.update(kwargs)
    data["updatedAt"] = now_ts()
    await db_set("userpreferences", data, pk="userId")


# ── Giveaway ──────────────────────────────────────────────────────────────────

async def get_giveaway(message_id: int | str):
    db = await get_db()
    async with db.execute("SELECT * FROM giveaway WHERE messageId=?", [str(message_id)]) as cur:
        return await cur.fetchone()


async def get_active_giveaways(guild_id: int | str) -> list:
    db = await get_db()
    async with db.execute(
        "SELECT * FROM giveaway WHERE guildId=? AND ended=0 AND cancelled=0", [str(guild_id)]
    ) as cur:
        return await cur.fetchall()


async def get_all_active_giveaways() -> list:
    db = await get_db()
    async with db.execute(
        "SELECT * FROM giveaway WHERE ended=0 AND cancelled=0"
    ) as cur:
        return await cur.fetchall()


# ── History ───────────────────────────────────────────────────────────────────

async def add_history(user_id: int | str, track_data: dict) -> None:
    db = await get_db()
    await db.execute("""
        INSERT INTO userhistory (userId, title, uri, author, duration, thumbnail, playedAt, language, vibe)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        str(user_id),
        track_data.get("title", "Unknown"),
        track_data.get("uri", ""),
        track_data.get("author", "Unknown"),
        track_data.get("duration", 0),
        track_data.get("thumbnail", ""),
        now_ts(),
        track_data.get("language", "English"),
        track_data.get("vibe", "mixed"),
    ])
    await db.commit()


async def get_history(user_id: int | str, limit: int = 25) -> list:
    db = await get_db()
    async with db.execute(
        "SELECT * FROM userhistory WHERE userId=? ORDER BY playedAt DESC LIMIT ?",
        [str(user_id), limit]
    ) as cur:
        return await cur.fetchall()


# ── Playlist ──────────────────────────────────────────────────────────────────

async def get_playlists(user_id: int | str) -> list:
    row = await db_get("playlist", {"userId": str(user_id)})
    return json_load(row["playlists"] if row else None, [])


async def set_playlists(user_id: int | str, playlists: list) -> None:
    await db_set("playlist", {"userId": str(user_id), "playlists": json_dump(playlists)}, pk="userId")


# ── Last.fm ───────────────────────────────────────────────────────────────────

async def get_lastfm(user_id: int | str):
    return await db_get("lastfm", {"userId": str(user_id)})


async def set_lastfm(user_id: int | str, username: str, session_key: str = "") -> None:
    await db_set("lastfm", {
        "userId": str(user_id),
        "username": username,
        "sessionKey": session_key,
    }, pk="userId")


# ── Blacklist ─────────────────────────────────────────────────────────────────

async def get_blacklist(user_id: int | str):
    return await db_get("blacklist", {"userId": str(user_id)})


async def set_blacklist(user_id: int | str, reason: str = "", added_by: int | str = "") -> None:
    await db_set("blacklist", {
        "userId": str(user_id),
        "type": "user",
        "timestamp": now_ts(),
        "reason": reason,
    }, pk="userId")


async def remove_blacklist(user_id: int | str) -> None:
    await db_delete("blacklist", {"userId": str(user_id)})


# ── Toggle ────────────────────────────────────────────────────────────────────

async def get_toggle(guild_id: int | str) -> dict:
    row = await db_get("toggle", {"guildId": str(guild_id)})
    if not row:
        return {"lyrics": 1, "autoplay": 1, "announce": 1}
    return dict(row)


async def set_toggle(guild_id: int | str, **kwargs) -> None:
    row = await get_toggle(guild_id)
    row.update(kwargs)
    row["guildId"] = str(guild_id)
    await db_set("toggle", row, pk="guildId")
