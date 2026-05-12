'use strict';

const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const pendingStates = new Map();

const SCOPES = [
    'user-read-email',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-recently-played',
    'user-library-read',
].join(' ');

function getRedirectUri() {
    if (config.spotifyRedirectUri) return config.spotifyRedirectUri;
    const domain = process.env.REPLIT_DEV_DOMAIN;
    if (domain) return `https://${domain}/auth/spotify/callback`;
    return `http://localhost:${config.webPort || 3000}/auth/spotify/callback`;
}

function buildAuthUrl(state) {
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.SpotifyID,
        scope: SCOPES,
        redirect_uri: getRedirectUri(),
        state,
        show_dialog: 'true',
    });
    return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

function waitForCallback(userId) {
    const state = uuidv4();

    const promise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingStates.delete(state);
            reject(new Error('timeout'));
        }, 300_000);

        pendingStates.set(state, { userId, resolve, reject, timeout });
    });

    return { state, promise };
}

function resolvePending(state, data) {
    const pending = pendingStates.get(state);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    pendingStates.delete(state);
    pending.resolve(data);
    return true;
}

function rejectPending(state, err) {
    const pending = pendingStates.get(state);
    if (!pending) return false;
    clearTimeout(pending.timeout);
    pendingStates.delete(state);
    pending.reject(err);
    return true;
}

module.exports = { buildAuthUrl, waitForCallback, resolvePending, rejectPending, getRedirectUri };
