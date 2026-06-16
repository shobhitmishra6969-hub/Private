const { Kazagumo, Plugins, KazagumoTrack } = require("kazagumo");
const { Connectors, LoadType } = require("shoukaku");
const axios = require("axios");
const { getBestNode } = require("../../utils/nodeUtils");

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

const searchEngines = {
  DEEZER: "dzsearch",
  SPOTIFY: "spsearch",
  YOUTUBE: "ytsearch",
  SOUNDCLOUD: "scsearch",
  JIO_SAAVAN: "jssearch",
  APPLE_MUSIC: "amsearch",
  YOUTUBE_MUSIC: "ytmsearch",
  LAST_FM: "lfsearch"
};

const fallbackEngines = ["ytmsearch", "ytsearch"];

async function searchLastFm(query, apiKey) {
  try {
    const res = await axios.get(LASTFM_BASE, {
      params: {
        method: "track.search",
        track: query,
        api_key: apiKey,
        format: "json",
        limit: 5
      },
      timeout: 5000
    });

    const tracks = res.data?.results?.trackmatches?.track;
    if (!tracks || !Array.isArray(tracks) || tracks.length === 0) return null;

    const top = tracks[0];
    return `${top.artist} - ${top.name}`;
  } catch {
    return null;
  }
}

module.exports = function loadPlayerManager(client) {
  const manager = new Kazagumo(
    {
      defaultSearchEngine: client.config.node_source,
      send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
      }
    },
    new Connectors.DiscordJS(client),
    client.config.nodes,
    client.config.node_options
  );

  manager.shoukaku.on("ready", (name, resumed) => {
    const node = manager.shoukaku.nodes.get(name);
    console.log(`[LAVALINK DEBUG] Node "${name}" is ready. Resumed: ${resumed}. SessionID: ${node?.sessionId}`);
  });

  manager.searchEngines = searchEngines;

  manager.defaultSearchEngine = client.config.node_source;

  manager.search = async function (query, options = {}) {
    const node = getBestNode(this);
    if (!node) return { type: "SEARCH", tracks: [] };

    const isUrl = /^https?:\/\//.test(query);

    const quickResolve = (q) =>
      Promise.race([
        node.rest.resolve(q).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 7000)),
      ]);

    if (isUrl) {
      const directRes = await quickResolve(query);
      if (directRes && directRes.loadType !== LoadType.ERROR) {
        return processSearchResult(directRes, options.requester);
      }

      if (query.includes('youtube.com') || query.includes('youtu.be')) {
        const videoId = query.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/)?.[1];
        if (videoId) {
          query = `intitle:${videoId}`;
        }
      }
    }

    const selectedEngine = options.engine || this.defaultSearchEngine;

    if (selectedEngine === "lfsearch") {
      const apiKey = client.config.lastfmKey;
      if (apiKey) {
        const lfmQuery = await searchLastFm(query, apiKey);
        if (lfmQuery) {
          const res = await quickResolve(`ytmsearch:${lfmQuery}`);
          if (res && res.loadType !== LoadType.ERROR && res.data) {
            return processSearchResult(res, options.requester);
          }
        }
      }
      const fallbackRes = await quickResolve(`ytmsearch:${query}`);
      if (fallbackRes && fallbackRes.loadType !== LoadType.ERROR && fallbackRes.data) {
        return processSearchResult(fallbackRes, options.requester);
      }
      return { type: "SEARCH", tracks: [] };
    }

    // ── Per-request timeout wrapper (7s hard cap per engine) ─────────────────
    const timedResolve = (searchQuery) =>
      Promise.race([
        node.rest.resolve(searchQuery).catch(() => null),
        new Promise(resolve => setTimeout(() => resolve(null), 7000)),
      ]);

    // ── Race primary engine vs ytmsearch in parallel ──────────────────────────
    const engines = [...new Set([selectedEngine, ...fallbackEngines])];
    const primary   = engines[0];
    const secondary = engines[1] || 'ytsearch';

    const [res1, res2] = await Promise.all([
      timedResolve(`${primary}:${query}`),
      timedResolve(`${secondary}:${query}`),
    ]);

    for (const res of [res1, res2]) {
      if (res && res.loadType !== LoadType.ERROR && res.data) {
        return processSearchResult(res, options.requester);
      }
    }

    return { type: "SEARCH", tracks: [] };
  };

  function processSearchResult(res, requester) {
    switch (res.loadType) {
      case LoadType.TRACK:
        return {
          type: "TRACK",
          tracks: [new KazagumoTrack(res.data, requester)]
        };
      case LoadType.PLAYLIST:
        return {
          type: "PLAYLIST",
          playlistName: res.data.info.name,
          tracks: res.data.tracks.map((track) => new KazagumoTrack(track, requester))
        };
      case LoadType.SEARCH:
        return {
          type: "SEARCH",
          tracks: res.data.map((track) => new KazagumoTrack(track, requester))
        };
      default:
        return { type: "SEARCH", tracks: [] };
    }
  }

  client.manager = manager;
  return manager;
};
