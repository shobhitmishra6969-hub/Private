from __future__ import annotations

import json
import os
import time
from typing import Any

import aiosqlite

_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "bot.db")
_conn: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _conn
    if _conn is None:
        os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
        _conn = await aiosqlite.connect(_DB_PATH)
        _conn.row_factory = aiosqlite.Row
        await _conn.execute("PRAGMA journal_mode=WAL")
        await _conn.execute("PRAGMA synchronous=NORMAL")
        await _init_schema(_conn)
    return _conn


async def _init_schema(db: aiosqlite.Connection) -> None:
    await db.executescript("""
        CREATE TABLE IF NOT EXISTS autoreconnect (
            Guild TEXT PRIMARY KEY, TextId TEXT NOT NULL, VoiceId TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS autorole (
            guildId TEXT PRIMARY KEY, roles TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS blacklist (
            userId TEXT PRIMARY KEY, type TEXT DEFAULT 'user',
            timestamp INTEGER, reason TEXT
        );
        CREATE TABLE IF NOT EXISTS giveaway (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT, channelId TEXT, messageId TEXT,
            hostId TEXT, prize TEXT, winnerCount INTEGER DEFAULT 1,
            endsAt INTEGER, ended INTEGER DEFAULT 0, cancelled INTEGER DEFAULT 0,
            entries TEXT DEFAULT '[]', winners TEXT DEFAULT '[]',
            requiredRole TEXT, createdAt INTEGER, updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS ignorechannel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT, channelId TEXT
        );
        CREATE TABLE IF NOT EXISTS liked (
            userId TEXT PRIMARY KEY, songs TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS noprefix (
            id INTEGER PRIMARY KEY AUTOINCREMENT, noprefix INTEGER DEFAULT 0,
            userId TEXT, guildId TEXT, expiresAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS prefix (
            Guild TEXT PRIMARY KEY, Prefix TEXT, oldPrefix TEXT
        );
        CREATE TABLE IF NOT EXISTS premiumrole (
            Guild TEXT PRIMARY KEY, RoleId TEXT
        );
        CREATE TABLE IF NOT EXISTS premiumuser (
            userId TEXT PRIMARY KEY, premium INTEGER DEFAULT 1,
            addedBy TEXT, addedAt INTEGER, expiresAt INTEGER,
            credits INTEGER DEFAULT 0, activatedGuilds TEXT DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS setup (
            Guild TEXT PRIMARY KEY, Channel TEXT, Message TEXT,
            voiceChannel TEXT, npStyle TEXT DEFAULT 'default',
            updatedAt INTEGER, buttons INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS giveawayconfig (
            guildId TEXT PRIMARY KEY, theme TEXT DEFAULT 'blue',
            dmNotifications INTEGER DEFAULT 0, defaultImage TEXT,
            managerRoles TEXT DEFAULT '[]', updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS spotifyprofile (
            userId TEXT PRIMARY KEY, spotifyUserId TEXT,
            displayName TEXT DEFAULT 'Unknown', profileUrl TEXT,
            avatarUrl TEXT, accessToken TEXT, refreshToken TEXT,
            playlists TEXT DEFAULT '[]', linkedAt INTEGER, updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS userpreferences (
            userId TEXT PRIMARY KEY, musicSource TEXT DEFAULT 'ytmsearch',
            bio TEXT DEFAULT '', createdAt INTEGER, updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS vcstatus (guildId TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS voicerole (guildId TEXT PRIMARY KEY, roleId TEXT);
        CREATE TABLE IF NOT EXISTS afk (
            userId TEXT PRIMARY KEY, guildId TEXT,
            mode TEXT NOT NULL DEFAULT 'server',
            reason TEXT NOT NULL DEFAULT 'AFK',
            createdAt INTEGER NOT NULL, dmNotify INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS userstats (
            userId TEXT PRIMARY KEY, commandsRun INTEGER NOT NULL DEFAULT 0, updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS userbadges (
            userId TEXT PRIMARY KEY, badges TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS playlist (
            userId TEXT PRIMARY KEY, playlists TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS djrole (
            guildId TEXT PRIMARY KEY, roleId TEXT, updatedAt INTEGER
        );
        CREATE TABLE IF NOT EXISTS lastfm (
            userId TEXT PRIMARY KEY, username TEXT NOT NULL, sessionKey TEXT
        );
        CREATE TABLE IF NOT EXISTS userhistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT, userId TEXT NOT NULL,
            title TEXT NOT NULL, uri TEXT NOT NULL, author TEXT DEFAULT 'Unknown',
            duration INTEGER DEFAULT 0, thumbnail TEXT,
            playedAt INTEGER NOT NULL, language TEXT DEFAULT 'English', vibe TEXT DEFAULT 'mixed'
        );
        CREATE TABLE IF NOT EXISTS toggle (
            guildId TEXT PRIMARY KEY, lyrics INTEGER DEFAULT 1,
            autoplay INTEGER DEFAULT 1, announce INTEGER DEFAULT 1
        );
    """)
    await db.commit()

    migrations = [
        "CREATE INDEX IF NOT EXISTS idx_userhistory_userId ON userhistory(userId, playedAt)",
    ]
    for m in migrations:
        try:
            await db.execute(m)
        except Exception:
            pass
    await db.commit()


async def db_get(table: str, where: dict[str, Any]) -> aiosqlite.Row | None:
    db = await get_db()
    cols = " AND ".join(f"{k}=?" for k in where)
    async with db.execute(f"SELECT * FROM {table} WHERE {cols}", list(where.values())) as cur:
        return await cur.fetchone()


async def db_set(table: str, data: dict[str, Any], pk: str) -> None:
    db = await get_db()
    pk_val = data[pk]
    existing = await db_get(table, {pk: pk_val})
    if existing:
        updates = {k: v for k, v in data.items() if k != pk}
        cols = ", ".join(f"{k}=?" for k in updates)
        await db.execute(f"UPDATE {table} SET {cols} WHERE {pk}=?", [*updates.values(), pk_val])
    else:
        cols = ", ".join(data.keys())
        placeholders = ", ".join("?" * len(data))
        await db.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", list(data.values()))
    await db.commit()


async def db_delete(table: str, where: dict[str, Any]) -> None:
    db = await get_db()
    cols = " AND ".join(f"{k}=?" for k in where)
    await db.execute(f"DELETE FROM {table} WHERE {cols}", list(where.values()))
    await db.commit()


async def db_all(table: str, where: dict[str, Any] | None = None) -> list[aiosqlite.Row]:
    db = await get_db()
    if where:
        cols = " AND ".join(f"{k}=?" for k in where)
        async with db.execute(f"SELECT * FROM {table} WHERE {cols}", list(where.values())) as cur:
            return await cur.fetchall()
    async with db.execute(f"SELECT * FROM {table}") as cur:
        return await cur.fetchall()


def json_load(val: str | None, default=None):
    if val is None:
        return default if default is not None else []
    try:
        return json.loads(val)
    except Exception:
        return default if default is not None else []


def json_dump(val) -> str:
    return json.dumps(val, ensure_ascii=False)


def now_ts() -> int:
    return int(time.time())
