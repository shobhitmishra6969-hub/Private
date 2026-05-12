'use strict';
const { getDb } = require('../database/index');

const MAX_HISTORY = 500;

module.exports = {
    save(userId, track) {
        const db = getDb();
        db.prepare(`
            INSERT INTO userhistory (userId, title, uri, author, duration, thumbnail, playedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            userId,
            track.title || 'Unknown',
            track.uri || '',
            track.author || 'Unknown',
            track.length || track.duration || 0,
            track.thumbnail || track.artworkUrl || null,
            Date.now()
        );

        db.prepare(`
            DELETE FROM userhistory WHERE userId = ? AND id NOT IN (
                SELECT id FROM userhistory WHERE userId = ? ORDER BY playedAt DESC LIMIT ?
            )
        `).run(userId, userId, MAX_HISTORY);
    },

    getHistory(userId) {
        const db = getDb();
        return db.prepare(`
            SELECT * FROM userhistory WHERE userId = ? ORDER BY playedAt DESC
        `).all(userId);
    },

    getCount(userId) {
        const db = getDb();
        return db.prepare(`SELECT COUNT(*) as count FROM userhistory WHERE userId = ?`).get(userId)?.count || 0;
    },

    clearHistory(userId) {
        const db = getDb();
        db.prepare(`DELETE FROM userhistory WHERE userId = ?`).run(userId);
    },
};
