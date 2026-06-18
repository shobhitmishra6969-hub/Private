'use strict';

const Database = require('better-sqlite3');
const path = require('path');

let _db = null;

function getDb() {
    if (_db) return _db;

    const dataDir = path.join(__dirname, '..', '..', 'data');
    if (!require('fs').existsSync(dataDir)) {
        require('fs').mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'bot.db');
    _db = new Database(dbPath);
    _db.pragma('journal_mode = WAL');
    _db.pragma('synchronous = NORMAL');

    _db.exec(`
        CREATE TABLE IF NOT EXISTS autoreconnect (
            Guild     TEXT PRIMARY KEY,
            TextId    TEXT NOT NULL,
            VoiceId   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS autorole (
            guildId TEXT PRIMARY KEY,
            roles   TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS blacklist (
            userId    TEXT PRIMARY KEY,
            type      TEXT DEFAULT 'user',
            timestamp INTEGER
        );

        CREATE TABLE IF NOT EXISTS giveaway (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId      TEXT,
            channelId    TEXT,
            messageId    TEXT,
            hostId       TEXT,
            prize        TEXT,
            winnerCount  INTEGER DEFAULT 1,
            endsAt       INTEGER,
            ended        INTEGER DEFAULT 0,
            cancelled    INTEGER DEFAULT 0,
            entries      TEXT DEFAULT '[]',
            winners      TEXT DEFAULT '[]',
            requiredRole TEXT,
            createdAt    INTEGER,
            updatedAt    INTEGER
        );

        CREATE TABLE IF NOT EXISTS ignorechannel (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId   TEXT,
            channelId TEXT
        );

        CREATE TABLE IF NOT EXISTS liked (
            userId TEXT PRIMARY KEY,
            songs  TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS noprefix (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            noprefix  INTEGER DEFAULT 0,
            userId    TEXT,
            guildId   TEXT,
            expiresAt INTEGER
        );

        CREATE TABLE IF NOT EXISTS prefix (
            Guild     TEXT PRIMARY KEY,
            Prefix    TEXT,
            oldPrefix TEXT
        );

        CREATE TABLE IF NOT EXISTS premiumrole (
            Guild  TEXT PRIMARY KEY,
            RoleId TEXT
        );

        CREATE TABLE IF NOT EXISTS premiumuser (
            userId   TEXT PRIMARY KEY,
            premium  INTEGER DEFAULT 1,
            addedBy  TEXT,
            addedAt  INTEGER,
            expiresAt INTEGER
        );

        CREATE TABLE IF NOT EXISTS setup (
            Guild        TEXT PRIMARY KEY,
            Channel      TEXT,
            Message      TEXT,
            voiceChannel TEXT
        );

        CREATE TABLE IF NOT EXISTS giveawayconfig (
            guildId          TEXT PRIMARY KEY,
            theme            TEXT DEFAULT 'blue',
            dmNotifications  INTEGER DEFAULT 0,
            defaultImage     TEXT,
            managerRoles     TEXT DEFAULT '[]',
            updatedAt        INTEGER
        );

        CREATE TABLE IF NOT EXISTS spotifyprofile (
            userId        TEXT PRIMARY KEY,
            spotifyUserId TEXT,
            displayName   TEXT DEFAULT 'Unknown',
            profileUrl    TEXT,
            avatarUrl     TEXT,
            accessToken   TEXT,
            refreshToken  TEXT,
            playlists     TEXT DEFAULT '[]',
            linkedAt      INTEGER,
            updatedAt     INTEGER
        );

        CREATE TABLE IF NOT EXISTS userpreferences (
            userId      TEXT PRIMARY KEY,
            musicSource TEXT DEFAULT 'ytmsearch',
            bio         TEXT DEFAULT '',
            createdAt   INTEGER,
            updatedAt   INTEGER
        );

        CREATE TABLE IF NOT EXISTS vcstatus (
            guildId TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS voicerole (
            guildId TEXT PRIMARY KEY,
            roleId  TEXT
        );

        CREATE TABLE IF NOT EXISTS afk (
            userId    TEXT PRIMARY KEY,
            guildId   TEXT,
            mode      TEXT NOT NULL DEFAULT 'server',
            reason    TEXT NOT NULL DEFAULT 'AFK',
            createdAt INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS userstats (
            userId        TEXT PRIMARY KEY,
            commandsRun   INTEGER NOT NULL DEFAULT 0,
            updatedAt     INTEGER
        );

        CREATE TABLE IF NOT EXISTS userbadges (
            userId  TEXT PRIMARY KEY,
            badges  TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS playlist (
            userId    TEXT PRIMARY KEY,
            playlists TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS djrole (
            guildId   TEXT PRIMARY KEY,
            roleId    TEXT,
            updatedAt INTEGER
        );

        CREATE TABLE IF NOT EXISTS lastfm (
            userId     TEXT PRIMARY KEY,
            username   TEXT NOT NULL,
            sessionKey TEXT
        );

        CREATE TABLE IF NOT EXISTS userhistory (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            userId    TEXT NOT NULL,
            title     TEXT NOT NULL,
            uri       TEXT NOT NULL,
            author    TEXT DEFAULT 'Unknown',
            duration  INTEGER DEFAULT 0,
            thumbnail TEXT,
            playedAt  INTEGER NOT NULL
        );
    `);

    try {
        _db.exec(`CREATE INDEX IF NOT EXISTS idx_userhistory_userId ON userhistory(userId, playedAt)`);
    } catch (_) {}

    try {
        _db.exec(`ALTER TABLE blacklist ADD COLUMN reason TEXT`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE premiumuser ADD COLUMN credits INTEGER DEFAULT 0`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE premiumuser ADD COLUMN activatedGuilds TEXT DEFAULT '[]'`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE setup ADD COLUMN npStyle TEXT DEFAULT 'default'`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE setup ADD COLUMN updatedAt INTEGER`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE setup ADD COLUMN buttons INTEGER DEFAULT 1`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE spotifyprofile ADD COLUMN avatarUrl TEXT`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE spotifyprofile ADD COLUMN accessToken TEXT`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE spotifyprofile ADD COLUMN refreshToken TEXT`);
    } catch (_) {}
    try {
        _db.exec(`ALTER TABLE afk ADD COLUMN dmNotify INTEGER DEFAULT 0`);
    } catch (_) {}

    return _db;
}

module.exports = { getDb };
