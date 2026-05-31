'use strict';

const express = require('express');
const axios = require('axios');
const config = require('./config');
const { resolvePending, rejectPending, getRedirectUri } = require('./spotifyOAuth');
const { getCard } = require('./utils/cardStore');

const app = express();
const PORT = config.webPort || 3000;

app.get('/np-card/:id', (req, res) => {
  const buf = getCard(req.params.id);
  if (!buf) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store');
  res.send(buf);
});

app.get('/auth/spotify/callback', async (req, res) => {
    const { code, state, error } = req.query;

    if (error) {
        rejectPending(state, new Error(error));
        return res.send(callbackPage('❌ Authorization Denied', 'You denied access to Spotify. You can close this tab and try again in Discord.', false));
    }

    if (!code || !state) {
        return res.status(400).send(callbackPage('❌ Invalid Request', 'Missing code or state parameter.', false));
    }

    const redirectUri = getRedirectUri();
    const credentials = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');

    let tokens;
    try {
        const tokenRes = await axios.post(
            'https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            }).toString(),
            {
                headers: {
                    Authorization: `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                timeout: 10000,
            }
        );
        tokens = tokenRes.data;
        console.log('[Spotify OAuth] Token exchange OK — token_type:', tokens.token_type, '| scope:', tokens.scope);
    } catch (err) {
        const status = err.response?.status;
        const errData = err.response?.data;
        console.error(`[Spotify OAuth] Token exchange failed — HTTP ${status}:`, JSON.stringify(errData));
        rejectPending(state, new Error('token_exchange_failed'));
        return res.send(callbackPage('❌ Authorization Failed', `Could not exchange the authorization code (HTTP ${status || 'network error'}). Please try again in Discord.`, false));
    }

    let profile = null;
    try {
        const profileRes = await axios.get('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
            timeout: 8000,
        });
        profile = profileRes.data;
    } catch (err) {
        const status = err.response?.status;
        const errData = err.response?.data;
        console.warn(`[Spotify OAuth] Profile fetch failed — HTTP ${status}:`, JSON.stringify(errData), '(proceeding without profile)');
    }

    const resolved = resolvePending(state, { tokens, profile });
    if (!resolved) {
        return res.send(callbackPage('⚠️ Session Expired', 'This authorization link has expired. Please run the login command again in Discord.', false));
    }

    const displayLabel = profile?.display_name || profile?.id || 'your account';
    return res.send(callbackPage(
        '✅ Spotify Linked!',
        `You're now linked as <strong>${displayLabel}</strong>. You can close this tab and return to Discord.`,
        true
    ));
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

function callbackPage(title, message, success) {
    const color = success ? '#1DB954' : '#E31B23';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #121212; color: #fff; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: #1e1e1e; border-radius: 16px; padding: 40px;
            max-width: 440px; width: 100%; text-align: center;
            border-top: 4px solid ${color}; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; color: ${color}; }
    p { color: #aaa; line-height: 1.6; }
    strong { color: #fff; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '🎵' : '⚠️'}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function startWebServer() {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[WebServer] Listening on port ${PORT} — Spotify OAuth callback ready.`);
    });
}

module.exports = { startWebServer };
