'use strict';
const { getDb } = require('../database/index');
const { detectLanguage, detectVibe } = require('../utils/languageDetect');

const MAX_HISTORY = 50;

module.exports = {
    save(userId, track) {
        if (!userId || !track?.title) return;
        const db = getDb();
        const lang = detectLanguage(track.title || '', track.author || '');
        const vibe = detectVibe(track.title || '', track.author || '');
        try {
            db.prepare(`
                INSERT INTO userhistory (userId, title, uri, author, duration, thumbnail, language, vibe, playedAt)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                userId,
                track.title  || 'Unknown',
                track.uri    || '',
                track.author || 'Unknown',
                track.length || track.duration || 0,
                track.thumbnail || track.artworkUrl || null,
                lang,
                vibe,
                Date.now()
            );
            db.prepare(`
                DELETE FROM userhistory WHERE userId = ? AND id NOT IN (
                    SELECT id FROM userhistory WHERE userId = ? ORDER BY playedAt DESC LIMIT ?
                )
            `).run(userId, userId, MAX_HISTORY);
        } catch (e) {
            console.error('[UserHistory] save error:', e.message);
        }
    },

    getHistory(userId, limit = MAX_HISTORY) {
        const db = getDb();
        return db.prepare(
            `SELECT * FROM userhistory WHERE userId = ? ORDER BY playedAt DESC LIMIT ?`
        ).all(userId, limit);
    },

    getCount(userId) {
        const db = getDb();
        return db.prepare(
            `SELECT COUNT(*) as count FROM userhistory WHERE userId = ?`
        ).get(userId)?.count || 0;
    },

    clearHistory(userId) {
        const db = getDb();
        db.prepare(`DELETE FROM userhistory WHERE userId = ?`).run(userId);
    },

    getTopArtists(userId, n = 2) {
        const db = getDb();
        const rows = db.prepare(`
            SELECT author, COUNT(*) as plays
            FROM userhistory
            WHERE userId = ? AND author IS NOT NULL AND author != '' AND author != 'Unknown'
            GROUP BY author
            ORDER BY plays DESC
            LIMIT ?
        `).all(userId, n);
        return rows.map(r => r.author.replace(/\s*-\s*Topic\s*$/i, '').trim());
    },

    getLanguagePreference(userId) {
        const db = getDb();
        const row = db.prepare(`
            SELECT language, COUNT(*) as cnt
            FROM userhistory
            WHERE userId = ? AND language IS NOT NULL AND language != '' AND language != 'English'
            GROUP BY language
            ORDER BY cnt DESC
            LIMIT 1
        `).get(userId);
        if (!row || row.cnt < 3) return null;
        return row.language;
    },

    getVibePreference(userId) {
        const db = getDb();
        const row = db.prepare(`
            SELECT vibe, COUNT(*) as cnt
            FROM userhistory
            WHERE userId = ? AND vibe IS NOT NULL AND vibe != 'mixed'
            GROUP BY vibe
            ORDER BY cnt DESC
            LIMIT 1
        `).get(userId);
        return row?.vibe || null;
    },

    getLanguageBreakdown(userId) {
        const db = getDb();
        return db.prepare(`
            SELECT language, COUNT(*) as count
            FROM userhistory
            WHERE userId = ? AND language IS NOT NULL
            GROUP BY language
            ORDER BY count DESC
        `).all(userId);
    },
};
