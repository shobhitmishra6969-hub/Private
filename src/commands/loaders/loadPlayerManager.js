const { Kazagumo, Plugins, KazagumoTrack } = require("kazagumo");
const { Connectors, LoadType } = require("shoukaku");
const axios = require("axios");
const { getBestNode } = require("../../utils/nodeUtils");

const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0/";

const searchEngines = {
  DEEZER: "dzsearch",
  SPOTIFY: "spsearch",
  YOUTUBE: "ytsearch",
  JIO_SAAVAN: "jssearch",
  APPLE_MUSIC: "amsearch",
  YOUTUBE_MUSIC: "ytmsearch",
  LAST_FM: "lfsearch"
};

const fallbackEngines = ["ytmsearch", "amsearch", "spsearch", "ytsearch"];

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

    if (isUrl) {
      const directRes = await node.rest.resolve(query).catch(() => null);
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
          const res = await node.rest.resolve(`ytmsearch:${lfmQuery}`).catch(() => null);
          if (res && res.loadType !== LoadType.ERROR && res.data) {
            return processSearchResult(res, options.requester);
          }
        }
      }
      const fallbackRes = await node.rest.resolve(`ytmsearch:${query}`).catch(() => null);
      if (fallbackRes && fallbackRes.loadType !== LoadType.ERROR && fallbackRes.data) {
        return processSearchResult(fallbackRes, options.requester);
      }
      return { type: "SEARCH", tracks: [] };
    }

    let searchEngineList = [selectedEngine];
    searchEngineList = [...new Set([...searchEngineList, ...fallbackEngines])];

    for (const engine of searchEngineList) {
      const searchQuery = `${engine}:${query}`;
      const res = await node.rest.resolve(searchQuery).catch(() => null);

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
