/**
 * autoplayManager.js — Taste-aware autoplay hook class
 *
 * Attaches supplemental listeners to the Kazagumo player manager so that
 * every track play/end/skip is automatically fed into the taste engine.
 *
 * Usage: call AutoplayManager.instance.init(client) once after the
 * Kazagumo manager is set up (done in loadPlayers.js).
 *
 * Signal rules:
 *   • trackStart → stamp tasteTrackStartTime on the player
 *   • trackEnd   → if played < 30 s → SKIP signal
 *                  if played ≥ 75 % of duration → FINISH signal
 *   • np_like    → LIKE signal (wired in interactionCreate.js)
 */

'use strict';

const { processInteraction, scoreCandidates } = require('./tasteEngine');

const SKIP_THRESHOLD_MS    = 30_000;   // skipped within 30 s  → SKIP
const FINISH_THRESHOLD_PCT = 0.75;     // listened to ≥ 75 %   → FINISH

class AutoplayManager {
  constructor() {
    this._initialized = false;
  }

  // ── Singleton ─────────────────────────────────────────────────────────────

  static get instance() {
    if (!AutoplayManager._inst) AutoplayManager._inst = new AutoplayManager();
    return AutoplayManager._inst;
  }

  // ── Init (call once after client.manager is ready) ────────────────────────

  /**
   * Attach taste-tracking listeners to the Kazagumo manager.
   * Safe to call multiple times — subsequent calls are no-ops.
   * @param {import('../structures/MusicClient')} client
   */
  init(client) {
    if (this._initialized) return;
    if (!client?.manager) {
      console.warn('[AutoplayManager] client.manager not ready — skipping init');
      return;
    }

    // ── playerStart: record when this track began playing ──────────────────
    client.manager.on('playerStart', (player, track) => {
      try {
        player.data.set('tasteTrackStartTime', Date.now());
        player.data.set('tasteCurrentTrack', track);
      } catch { /* non-critical */ }
    });

    // ── playerEnd: classify the ended track as SKIP or FINISH ──────────────
    client.manager.on('playerEnd', (player, track) => {
      try {
        const startTime  = player.data.get('tasteTrackStartTime');
        const endedTrack = track || player.data.get('tasteCurrentTrack') || player.data.get('lastTrack');

        if (!startTime || !endedTrack) return;

        const playedMs   = Date.now() - startTime;
        const durationMs = Number(endedTrack.length || 0);
        const userId     = endedTrack.requester?.id || null;

        if (!userId) return;

        const trackMeta = {
          title:  endedTrack.title,
          author: endedTrack.author,
          uri:    endedTrack.uri,
        };

        if (playedMs < SKIP_THRESHOLD_MS) {
          processInteraction(userId, trackMeta, 'SKIP');
          console.log(`[AutoplayManager] SKIP   → user=${userId} "${endedTrack.title}" (played ${(playedMs / 1000).toFixed(1)}s)`);
        } else if (durationMs > 0 && playedMs >= durationMs * FINISH_THRESHOLD_PCT) {
          processInteraction(userId, trackMeta, 'FINISH');
          console.log(`[AutoplayManager] FINISH → user=${userId} "${endedTrack.title}" (played ${Math.round(playedMs / durationMs * 100)}%)`);
        }

        player.data.delete('tasteTrackStartTime');
        player.data.delete('tasteCurrentTrack');
      } catch (e) {
        console.warn('[AutoplayManager] playerEnd signal error:', e.message);
      }
    });

    this._initialized = true;
    console.log('[AutoplayManager] Initialized — taste tracking active on all players.');
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /**
   * Return the non-bot Discord user IDs currently in the voice channel
   * of the given player (used to build the aggregate taste score).
   * @param {import('../structures/MusicClient')} client
   * @param {object} player  Kazagumo player instance
   * @returns {string[]}
   */
  static getActiveVCUsers(client, player) {
    try {
      const guild = client.guilds.cache.get(player.guildId);
      const vc    = guild?.channels?.cache?.get(player.voiceId);
      if (!vc) return [];
      return vc.members
        .filter(m => !m.user.bot)
        .map(m => m.user.id);
    } catch {
      return [];
    }
  }

  /**
   * Sort an array of candidate tracks by aggregate taste score across all
   * active VC members, then return the sorted array.
   * Thin wrapper around tasteEngine.scoreCandidates for use in playerUtils.
   * @param {object[]} candidates
   * @param {import('../structures/MusicClient')} client
   * @param {object} player
   * @returns {object[]}
   */
  static rankByTaste(candidates, client, player) {
    if (!candidates || !candidates.length) return candidates;
    const userIds = AutoplayManager.getActiveVCUsers(client, player);
    return scoreCandidates(candidates, userIds);
  }
}

module.exports = { AutoplayManager };
