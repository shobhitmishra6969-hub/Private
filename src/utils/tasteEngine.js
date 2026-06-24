/**
 * tasteEngine.js — Persistent user-taste profile engine
 *
 * Stores per-user artist & genre affinity weights in data/user_tastes.json
 * so profiles survive Replit container restarts.
 *
 * Weights are updated by three interaction signals:
 *   LIKE   → +4   (green heart button pressed on NP card)
 *   SKIP   → -3   (track skipped within first 30 s)
 *   FINISH → +1.5 (track played to ≥ 75 % of its duration)
 *
 * All weights are clamped to [-15, +30].
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const STORAGE_PATH = path.join(__dirname, '../../data/user_tastes.json');

const DELTA = { LIKE: 4, SKIP: -3, FINISH: 1.5 };
const CAP_MIN = -15;
const CAP_MAX  =  30;

// ── Persistence ───────────────────────────────────────────────────────────────

let _store = null;
let _dirty = false;
let _saveTimer = null;

function _load() {
  if (_store) return;
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      _store = JSON.parse(fs.readFileSync(STORAGE_PATH, 'utf8'));
    } else {
      _store = {};
    }
  } catch {
    _store = {};
  }
}

function _scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    if (!_dirty) return;
    try {
      fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(_store, null, 2), 'utf8');
      _dirty = false;
    } catch (e) {
      console.warn('[TasteEngine] Save failed:', e.message);
    }
  }, 2000);
}

// ── Genre detection via keyword matching ──────────────────────────────────────

const GENRE_RULES = [
  { re: /bollywood|hindi film/i,                                                        genre: 'bollywood'      },
  { re: /\b(arijit|neha kakkar|shreya ghoshal|jubin nautiyal|atif aslam|armaan malik|sonu nigam|lata mangeshkar|kishore kumar|kumar sanu)\b/i, genre: 'bollywood' },
  { re: /\b(punjabi|bhangra|diljit dosanjh|sidhu moose|ap dhillon|b praak|ammy virk|karan aujla|gurnam bhullar|babbal rai)\b/i, genre: 'punjabi' },
  { re: /\b(rap|hip.?hop|drill|trap|freestyle)\b/i,                                    genre: 'hiphop'         },
  { re: /\b(lo.?fi|lofi|chill beats?|study beats?|beats? to study)\b/i,                genre: 'lofi'           },
  { re: /\b(edm|electronic|techno|house|dubstep|trance|d[jn] )\b/i,                    genre: 'edm'            },
  { re: /\b(k.?pop|bts|blackpink|stray kids|twice|exo|nct|ive|aespa)\b/i,             genre: 'kpop'           },
  { re: /\b(r&b|rnb|neo.?soul)\b/i,                                                   genre: 'rnb'            },
  { re: /\b(rock|metal|grunge|punk|indie|alternative|alt)\b/i,                         genre: 'rock'           },
  { re: /\b(classical|instrumental|orchestral|symphony|piano solo|violin solo)\b/i,    genre: 'classical'      },
  { re: /\b(jazz|blues|swing|bebop)\b/i,                                               genre: 'jazz'           },
  { re: /\b(pop)\b/i,                                                                  genre: 'pop'            },
  { re: /\b(telugu|tamil|kannada|malayalam|marathi|odia|bengali film)\b/i,             genre: 'regional-india' },
];

function extractGenres(trackMeta) {
  const haystack = `${trackMeta.title || ''} ${trackMeta.author || ''}`;
  const found = [];
  for (const { re, genre } of GENRE_RULES) {
    if (re.test(haystack) && !found.includes(genre)) found.push(genre);
  }
  return found;
}

// ── Profile access ────────────────────────────────────────────────────────────

/**
 * Return the taste profile for a user, creating a fresh one if absent.
 * @param {string} userId
 * @returns {{ artists: Record<string,number>, genres: Record<string,number>, totalInteractions: number }}
 */
function getProfile(userId) {
  _load();
  if (!_store[userId]) {
    _store[userId] = { artists: {}, genres: {}, totalInteractions: 0 };
    _dirty = true;
    _scheduleSave();
  }
  return _store[userId];
}

// ── Interaction processor ─────────────────────────────────────────────────────

/**
 * Record a playback interaction and update the user's taste profile.
 *
 * @param {string} userId
 * @param {{ title?: string, author?: string, uri?: string }} trackMeta
 * @param {'LIKE'|'SKIP'|'FINISH'} interactionType
 */
function processInteraction(userId, trackMeta, interactionType) {
  if (!userId || !trackMeta || !interactionType) return;

  const delta = DELTA[interactionType];
  if (delta == null) return;

  _load();
  const profile = getProfile(userId);

  const artistKey = (trackMeta.author || '').toLowerCase().replace(/\s*-\s*topic\s*$/i, '').trim();
  if (artistKey) {
    const current = profile.artists[artistKey] || 0;
    profile.artists[artistKey] = Math.max(CAP_MIN, Math.min(CAP_MAX, current + delta));
  }

  for (const genre of extractGenres(trackMeta)) {
    const current = profile.genres[genre] || 0;
    profile.genres[genre] = Math.max(CAP_MIN, Math.min(CAP_MAX, current + delta));
  }

  profile.totalInteractions = (profile.totalInteractions || 0) + 1;
  _store[userId] = profile;
  _dirty = true;
  _scheduleSave();
}

// ── Candidate scoring ─────────────────────────────────────────────────────────

/**
 * Score one candidate track against one user profile.
 * @private
 */
function _scoreOne(track, profile) {
  let score = 0;

  const artistKey = (track.author || '').toLowerCase().replace(/\s*-\s*topic\s*$/i, '').trim();
  if (artistKey && profile.artists[artistKey] != null) {
    score += profile.artists[artistKey] * 2.0;
  }

  for (const genre of extractGenres(track)) {
    if (profile.genres[genre] != null) {
      score += profile.genres[genre] * 1.5;
    }
  }

  return score;
}

/**
 * Score an array of candidate tracks against ALL active voice-channel users,
 * accumulate an aggregate baseline, then add a small random entropy (+0…+3)
 * to avoid repetitive loop traps.
 *
 * Returns the candidates sorted best-first (highest aggregate score first).
 *
 * @param {object[]} candidates   - Array of Kazagumo track objects
 * @param {string[]} activeUserIds - Discord user IDs currently in the voice channel
 * @returns {object[]} candidates sorted by descending taste score
 */
function scoreCandidates(candidates, activeUserIds) {
  if (!candidates || candidates.length === 0) return candidates;
  if (!activeUserIds || activeUserIds.length === 0) return candidates;

  _load();

  const profiles = activeUserIds
    .map(id => _store[id])
    .filter(Boolean);

  if (profiles.length === 0) return candidates;

  return candidates
    .map(track => {
      let aggregate = 0;
      for (const profile of profiles) aggregate += _scoreOne(track, profile);
      aggregate += Math.random() * 3;
      return { track, score: aggregate };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ track }) => track);
}

module.exports = { getProfile, processInteraction, scoreCandidates, extractGenres };
