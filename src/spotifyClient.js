const axios = require("axios");

class SpotifyClient {
  constructor() {
    const config = require("./config");
    this.clientId = config.SpotifyID;
    this.clientSecret = config.SpotifySecret;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async authenticate() {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const placeholders = [
      "SPOTIFY_CLIENT_ID_HERE",
      "SPOTIFY_CLIENT_SECRET_HERE",
      "c25d0c7be17541d18f31d0d768cb5a91",
      "f1b1b45676d54073944282ed1638dae7",
      "",
      undefined,
      null
    ];

    if (placeholders.includes(this.clientId) || placeholders.includes(this.clientSecret)) {
      throw new Error(
        "Spotify credentials are not configured. Please set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in your environment."
      );
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");

    try {
      const response = await axios.post(
        "https://accounts.spotify.com/api/token",
        "grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded"
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + response.data.expires_in * 1000;
      return this.accessToken;
    } catch (err) {
      if (err.response?.status === 400 || err.response?.status === 401) {
        throw new Error(
          "Invalid Spotify credentials. Please check your `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`."
        );
      }
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        throw new Error("Cannot reach Spotify servers. Check your internet connection.");
      }
      throw new Error(`Spotify authentication failed: ${err.message}`);
    }
  }

  async _get(url, params = {}) {
    const token = await this.authenticate();
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });
      return response.data;
    } catch (err) {
      if (err.response?.status === 401) {
        this.accessToken = null;
        const token2 = await this.authenticate();
        const retry = await axios.get(url, {
          headers: { Authorization: `Bearer ${token2}` },
          params
        });
        return retry.data;
      }
      if (err.response?.status === 404) {
        throw new Error("Not found on Spotify. The ID or URL may be incorrect.");
      }
      if (err.response?.status === 429) {
        throw new Error("Spotify rate limit hit. Please try again in a moment.");
      }
      throw new Error(`Spotify API error: ${err.response?.data?.error?.message || err.message}`);
    }
  }

  extractUserIdFromUrl(url) {
    const clean = url.split("?")[0].trim();

    const patterns = [
      /open\.spotify\.com\/user\/([a-zA-Z0-9_]+)/,
      /spotify:user:([a-zA-Z0-9_]+)/
    ];

    for (const pattern of patterns) {
      const match = clean.match(pattern);
      if (match) return match[1];
    }

    if (/^[a-zA-Z0-9_]+$/.test(clean)) return clean;

    return null;
  }

  extractPlaylistIdFromUrl(url) {
    const clean = url.split("?")[0].trim();

    const patterns = [
      /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
      /spotify:playlist:([a-zA-Z0-9]+)/
    ];

    for (const pattern of patterns) {
      const match = clean.match(pattern);
      if (match) return match[1];
    }

    if (/^[a-zA-Z0-9]+$/.test(clean)) return clean;

    return null;
  }

  async getProfile(idOrUrl) {
    const id = this.extractUserIdFromUrl(idOrUrl) || idOrUrl;
    return await this._get(`https://api.spotify.com/v1/users/${encodeURIComponent(id)}`);
  }

  async getUserPlaylists(idOrUrl, limit = 50) {
    const id = this.extractUserIdFromUrl(idOrUrl) || idOrUrl;
    const data = await this._get(`https://api.spotify.com/v1/users/${encodeURIComponent(id)}/playlists`, {
      limit: Math.min(limit, 50)
    });
    return data.items || [];
  }

  async getPlaylist(idOrUrl) {
    const id = this.extractPlaylistIdFromUrl(idOrUrl) || idOrUrl;
    return await this._get(`https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}`);
  }

  async getPlaylistTracks(idOrUrl, limit = 50) {
    const id = this.extractPlaylistIdFromUrl(idOrUrl) || idOrUrl;
    const data = await this._get(`https://api.spotify.com/v1/playlists/${encodeURIComponent(id)}/tracks`, {
      limit: Math.min(limit, 50),
      fields: "items(track(name,artists,duration_ms,uri,external_urls))"
    });
    return (data.items || [])
      .map((item) => item.track)
      .filter(Boolean);
  }

  async searchTrack(query, limit = 10) {
    const data = await this._get("https://api.spotify.com/v1/search", {
      q: query,
      type: "track",
      limit: Math.min(limit, 50)
    });
    return data.tracks?.items || [];
  }

  async searchAlbum(query, limit = 10) {
    const data = await this._get("https://api.spotify.com/v1/search", {
      q: query,
      type: "album",
      limit: Math.min(limit, 50)
    });
    return data.albums?.items || [];
  }

  async searchArtist(query, limit = 10) {
    const data = await this._get("https://api.spotify.com/v1/search", {
      q: query,
      type: "artist",
      limit: Math.min(limit, 50)
    });
    return data.artists?.items || [];
  }
}

module.exports = { SpotifyClient };
