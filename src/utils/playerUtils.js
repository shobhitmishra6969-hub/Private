const axios = require('axios');

async function safeDestroyPlayer(player) {
    if (!player) return;
    try {
        await player.destroy();
    } catch (error) {
        if (error.status === 404) {
            console.log(`Player already destroyed or session not found for guild ${player.guildId}`);
        } else {
            console.error(`Error destroying player for guild ${player.guildId}:`, error);
        }
    }
}

async function handleSessionError(error, player, client) {
    if (error.status === 404 && error.message && error.message.includes('Session not found')) {
        console.log(`Session lost for guild ${player.guildId}, cleaning up...`);
        try {
            if (client.manager.players.has(player.guildId)) {
                client.manager.players.delete(player.guildId);
            }
        } catch (cleanupError) {
            console.error(`Error during session cleanup:`, cleanupError);
        }
        return true;
    }
    return false;
}

async function recreatePlayer(client, guildId, voiceId, textId) {
    try {
        if (client.manager.players.has(guildId)) {
            client.manager.players.delete(guildId);
        }
        const newPlayer = await client.manager.createPlayer({
            guildId, voiceId, textId,
            volume: 80,
            deaf: true,
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!newPlayer || !client.manager.players.get(guildId)) {
            throw new Error("Failed to recreate player - connection timeout");
        }
        return newPlayer;
    } catch (error) {
        console.error(`Error recreating player:`, error);
        throw error;
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(str) {
    return (str || '')
        .toLowerCase()
        .replace(/\s*-\s*topic\s*$/gi, '')
        .replace(/\(.*?(official|audio|video|lyrics).*?\)/gi, '')
        .replace(/\[.*?(official|audio|video|lyrics).*?\]/gi, '')
        .replace(/official|audio|video|lyrics|hd|4k|remastered|mv/gi, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractYouTubeId(uri) {
    if (!uri) return null;
    const m = uri.match(/(?:v=|\/vi?\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

function cleanAuthor(author) {
    if (!author) return '';
    return author.replace(/\s*-\s*Topic\s*$/i, '').trim();
}

function isSameTrack(a, b) {
    try {
        if (!a || !b) return false;
        if (a.identifier && b.identifier && a.identifier === b.identifier) return true;
        const aId = extractYouTubeId(a.uri);
        const bId = extractYouTubeId(b.uri);
        if (aId && bId && aId === bId) return true;
        const at = normalize(a.title), bt = normalize(b.title);
        const aa = normalize(a.author), ba = normalize(b.author);
        if (at && bt && at === bt && aa && ba && aa === ba) {
            if (Math.abs(Number(a.length || 0) - Number(b.length || 0)) <= 2000) return true;
        }
    } catch { }
    return false;
}

// ── Platform detection ────────────────────────────────────────────────────────

function detectPlatform(track) {
    if (!track) return 'youtube';
    const uri = (track.uri || '').toLowerCase();
    const src = (track.sourceName || '').toLowerCase();

    if (uri.includes('spotify.com') || src === 'spotify') return 'spotify';
    if (uri.includes('soundcloud.com') || src === 'soundcloud') return 'soundcloud';
    if (uri.includes('deezer.com') || src === 'deezer') return 'deezer';
    if (uri.includes('music.apple.com') || src === 'applemusic') return 'applemusic';
    if (uri.includes('jiosaavn.com') || src === 'jiosaavn') return 'jiosaavn';
    if (uri.includes('youtube.com') || uri.includes('youtu.be') ||
        src === 'youtube' || src === 'youtubemusic') return 'youtube';
    return 'youtube';
}

// Returns Lavalink search engine(s) for a given platform — primary first
function getPlatformEngines(platform) {
    switch (platform) {
        case 'spotify':    return ['spsearch', 'ytmsearch'];
        case 'soundcloud': return ['scsearch', 'ytmsearch'];
        case 'deezer':     return ['dzsearch', 'ytmsearch'];
        case 'applemusic': return ['amsearch', 'ytmsearch'];
        case 'jiosaavn':   return ['jssearch', 'ytmsearch'];
        case 'youtube':
        default:           return ['ytmsearch', 'ytsearch'];
    }
}

// Human-readable platform label (used in NP badge)
function getPlatformLabel(platform) {
    switch (platform) {
        case 'spotify':    return 'Spotify';
        case 'soundcloud': return 'SoundCloud';
        case 'deezer':     return 'Deezer';
        case 'applemusic': return 'Apple Music';
        case 'jiosaavn':   return 'JioSaavn';
        case 'youtube':
        default:           return 'YouTube';
    }
}

module.exports.getPlatformLabel = getPlatformLabel;

// ── Spotify Recommendations API ───────────────────────────────────────────────

let _spotifyToken = null;
let _spotifyTokenExpiresAt = 0;

async function getSpotifyToken(clientId, clientSecret) {
    if (_spotifyToken && Date.now() < _spotifyTokenExpiresAt) return _spotifyToken;
    const res = await axios.post(
        'https://accounts.spotify.com/api/token',
        'grant_type=client_credentials',
        {
            headers: {
                Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 6000,
        }
    );
    _spotifyToken = res.data.access_token;
    _spotifyTokenExpiresAt = Date.now() + (res.data.expires_in - 60) * 1000;
    return _spotifyToken;
}

function extractSpotifyTrackId(uri) {
    if (!uri) return null;
    const http = uri.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
    if (http) return http[1];
    const urn = uri.match(/spotify:track:([a-zA-Z0-9]+)/);
    if (urn) return urn[1];
    return null;
}

async function fetchSpotifyRecommendations(clientId, clientSecret, trackId) {
    if (!clientId || !clientSecret || !trackId) return [];
    try {
        const token = await getSpotifyToken(clientId, clientSecret);
        const res = await axios.get('https://api.spotify.com/v1/recommendations', {
            headers: { Authorization: `Bearer ${token}` },
            params: { seed_tracks: trackId, limit: 10, market: 'US' },
            timeout: 6000,
        });
        return res.data?.tracks || [];
    } catch (e) {
        console.error('[Autoplay] Spotify recommendations error:', e.message);
        return [];
    }
}

// ── Last.fm similar-track recommendation ─────────────────────────────────────

async function fetchLastFmSimilar(title, artist, apiKey) {
    if (!apiKey) return null;
    try {
        const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
            params: {
                method: 'track.getSimilar',
                track: title,
                artist: cleanAuthor(artist),
                api_key: apiKey,
                format: 'json',
                limit: 10,
                autocorrect: 1,
            },
            timeout: 6000,
        });

        const tracks = res.data?.similartracks?.track;
        if (!tracks || !tracks.length) return null;

        const pool = tracks.slice(0, 5);
        const pick = pool[Math.floor(Math.random() * pool.length)];
        const artistName = pick.artist?.name || pick.artist || '';
        if (!pick.name) return null;
        return `${artistName} ${pick.name}`.trim();
    } catch (e) {
        console.error('[Autoplay] Last.fm getSimilar error:', e.message);
        return null;
    }
}

// ── Main autoplay function ────────────────────────────────────────────────────

async function attemptAutoplay(client, player) {
    try {
        if (!player) return;

        const autoplay = player.data?.get('autoplay');
        if (!autoplay) return;

        const loopMode = (player.loop || 'none').toString().toLowerCase();
        if (loopMode === 'track' || loopMode === 'queue') return;

        if (player.queue?.size > 0) return;
        if (player.playing || player.paused) return;
        if (player.data?.get('autoplayInProgress')) return;

        player.data?.set('autoplayInProgress', true);

        const lastTrack = player.data?.get('lastTrack');
        if (!lastTrack?.title) {
            player.data?.delete('autoplayInProgress');
            return;
        }

        // Detect the source platform of the last track
        const platform = detectPlatform(lastTrack);

        // Recent-track memory — avoid repeating the last 25 tracks
        const recentKey = 'recentlyPlayed';
        const recent = player.data?.get(recentKey) || [];

        const remember = (t) => {
            const id = t.identifier || extractYouTubeId(t.uri) || t.uri;
            const next = Array.from(new Set([id, ...recent])).filter(Boolean).slice(0, 25);
            player.data?.set(recentKey, next);
        };

        const isRecent = (t) => {
            const id = t.identifier || extractYouTubeId(t.uri) || t.uri;
            return recent.includes(id);
        };

        const pickBest = (tracks) =>
            tracks.find(t => !isSameTrack(lastTrack, t) && !isRecent(t))
            || tracks.find(t => !isSameTrack(lastTrack, t))
            || null;

        let foundTrack = null;
        let isAiPick = false;
        let autoplaySource = 'unknown';

        // ── Phase 1: Platform-native recommendation ───────────────────────────
        // Spotify → Spotify API → spsearch
        if (platform === 'spotify') {
            const spotifyId = extractSpotifyTrackId(lastTrack.uri);
            const clientId = client.config?.SpotifyID;
            const clientSecret = client.config?.SpotifySecret;

            if (spotifyId && clientId && clientSecret) {
                const spTracks = await fetchSpotifyRecommendations(clientId, clientSecret, spotifyId);

                for (const spTrack of spTracks) {
                    if (!spTrack.name) continue;
                    const query = `${spTrack.artists?.[0]?.name || ''} ${spTrack.name}`.trim();
                    try {
                        const res = await player.search(query, {
                            engine: 'spsearch',
                            requester: lastTrack.requester || client.user,
                        });
                        const best = pickBest(res?.tracks || []);
                        if (best) {
                            foundTrack = best;
                            isAiPick = true;
                            autoplaySource = 'spotify-recommendations';
                            break;
                        }
                    } catch { continue; }
                }
            }
        }

        // YouTube / YouTube Music → Last.fm → ytmsearch / ytsearch
        if (!foundTrack && platform === 'youtube') {
            const apiKey = client.config?.lastfmKey;
            const lastFmQuery = await fetchLastFmSimilar(lastTrack.title, lastTrack.author, apiKey);

            if (lastFmQuery) {
                for (const engine of ['ytmsearch', 'ytsearch']) {
                    try {
                        const res = await player.search(lastFmQuery, {
                            engine,
                            requester: lastTrack.requester || client.user,
                        });
                        const best = pickBest(res?.tracks || []);
                        if (best) {
                            foundTrack = best;
                            isAiPick = true;
                            autoplaySource = `lastfm→${engine}`;
                            break;
                        }
                    } catch { continue; }
                }
            }
        }

        // Other platforms (SoundCloud, Deezer, Apple Music, JioSaavn)
        // → Last.fm similar track → same-platform engine first
        if (!foundTrack && platform !== 'spotify' && platform !== 'youtube') {
            const apiKey = client.config?.lastfmKey;
            const lastFmQuery = await fetchLastFmSimilar(lastTrack.title, lastTrack.author, apiKey);

            if (lastFmQuery) {
                const engines = getPlatformEngines(platform);
                for (const engine of engines) {
                    try {
                        const res = await player.search(lastFmQuery, {
                            engine,
                            requester: lastTrack.requester || client.user,
                        });
                        const best = pickBest(res?.tracks || []);
                        if (best) {
                            foundTrack = best;
                            isAiPick = true;
                            autoplaySource = `lastfm→${engine}`;
                            break;
                        }
                    } catch { continue; }
                }
            }
        }

        // ── Phase 2: Smart query on same-platform engines ─────────────────────
        if (!foundTrack) {
            const smartQuery = `${lastTrack.title} ${cleanAuthor(lastTrack.author)}`.trim();
            const engines = getPlatformEngines(platform);

            for (const engine of engines) {
                try {
                    const res = await player.search(smartQuery, {
                        engine,
                        requester: lastTrack.requester || client.user,
                    });
                    const best = pickBest(res?.tracks || []);
                    if (best) {
                        foundTrack = best;
                        autoplaySource = engine;
                        break;
                    }
                } catch { continue; }
            }
        }

        // ── Phase 3: Last resort — any available engine ───────────────────────
        if (!foundTrack) {
            const smartQuery = `${lastTrack.title} ${cleanAuthor(lastTrack.author)}`.trim();
            for (const engine of ['ytmsearch', 'ytsearch', 'spsearch']) {
                try {
                    const res = await player.search(smartQuery, {
                        engine,
                        requester: lastTrack.requester || client.user,
                    });
                    const best = pickBest(res?.tracks || []);
                    if (best) {
                        foundTrack = best;
                        autoplaySource = `fallback:${engine}`;
                        break;
                    }
                } catch { continue; }
            }
        }

        if (!foundTrack) {
            client.logger?.log(`[Autoplay] No track found for "${lastTrack.title}" in guild ${player.guildId}`, 'debug');
            player.data?.delete('autoplayInProgress');
            return;
        }

        // Mark track so playerStart can show the platform AI badge
        if (isAiPick) {
            player.data?.set('aiRecommendedTrackId', foundTrack.identifier || foundTrack.uri);
        }
        // Always store the platform so the NP badge can reflect it
        player.data?.set('aiAutoplayPlatform', platform);

        player.queue.add(foundTrack);
        remember(foundTrack);

        client.logger?.log(
            `[Autoplay] Queued "${foundTrack.title}" (${isAiPick ? 'AI via ' : ''}${autoplaySource}, platform=${platform}) in guild ${player.guildId}`,
            'log'
        );

        // ── Autoplay announcement card ────────────────────────────────────────
        try {
            const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
            const channel = client.channels.cache.get(player.textId);
            if (channel) {
                const platformLabel = getPlatformLabel(platform);
                const sourceEmoji = {
                    spotify: '🟢', youtube: '▶️', deezer: '🟣',
                    applemusic: '🍎', jiosaavn: '🎵', soundcloud: '🔶',
                }[platform] || '▶️';

                const artistClean = cleanAuthor(foundTrack.author || '');
                const modeTag = isAiPick ? '🤖 AI Pick' : '🔗 Related';
                const announceLine =
                    `### 🎵 Autoplay — ${modeTag}\n` +
                    `**${foundTrack.title}**${artistClean ? ` by **${artistClean}**` : ''}\n` +
                    `-# Source: ${sourceEmoji} ${platformLabel}`;

                const card = new ContainerBuilder()
                    .setAccentColor(0x7B2FBE)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(announceLine));

                await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        } catch { }

        if (!player.playing && !player.paused) {
            await player.play().catch(e => {
                client.logger?.log(`[Autoplay] Play error: ${e.message}`, 'error');
            });
        }
    } catch (err) {
        client.logger?.log(`[Autoplay] Unexpected error: ${err.message}`, 'error');

        try {
            const { ContainerBuilder, TextDisplayBuilder, MessageFlags } = require('discord.js');
            const channel = client.channels.cache.get(player?.textId);
            if (channel) {
                const note = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `⚠️ Autoplay couldn't find a recommendation right now. Queue more songs with \`play\`!`
                    )
                );
                await channel.send({ components: [note], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        } catch { }
    } finally {
        try { player?.data?.delete('autoplayInProgress'); } catch { }
    }
}

async function applyQualityFilters(player) {
    // No-op: quality filters removed so all users get clean, full-speed playback
}

// ── Per-guild recentlyPlayed tracker (called from playerStart) ────────────────

function trackRecentlyPlayed(player, track) {
    if (!player?.data || !track) return;
    const id = track.identifier || extractYouTubeId(track.uri) || track.uri;
    if (!id) return;
    const key = 'recentlyPlayed';
    const recent = player.data.get(key) || [];
    const next = Array.from(new Set([id, ...recent])).filter(Boolean).slice(0, 25);
    player.data.set(key, next);
}

module.exports = {
    safeDestroyPlayer,
    handleSessionError,
    recreatePlayer,
    attemptAutoplay,
    applyQualityFilters,
    detectPlatform,
    getPlatformLabel,
    getPlatformEngines,
    trackRecentlyPlayed,
};
