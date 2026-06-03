const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const axios = require("axios");
const SpotifyProfile = require("../../schema/spotifyprofile");
const config = require("../../config");

module.exports = {
  name: "spotify-profile",
  aliases: ["spprofile", "spotifyprofile", "spme"],
  category: "Spotify",
  description: "View your linked Spotify profile info.",
  cooldown: 5,
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const { embeds, components } = await buildProfileReply(interaction.user.id, client);
    return interaction.editReply({ embeds, components });
  },

  async execute(message, args, client) {
    const { embeds, components } = await buildProfileReply(message.author.id, client);
    return message.reply({ embeds, components });
  }
};

async function refreshToken(refreshTok) {
  const credentials = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString("base64");
  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshTok }).toString(),
    { headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" }, timeout: 8000 }
  );
  return res.data.access_token;
}

async function spotifyGet(url, accessToken, params = {}) {
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params,
    timeout: 8000,
  });
  return res.data;
}

async function buildProfileReply(userId, client) {
  const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);

  if (!linked) {
    const embed = new EmbedBuilder()
      .setColor("#7B2FBE")
      .setDescription(
        `**You haven't linked a Spotify account yet.**\n` +
        `Run \`${client?.prefix || ">"}spotify-login\` to link your account.`
      );
    return { embeds: [embed], components: [] };
  }

  const hasOAuthToken = !!(linked.refreshToken || linked.accessToken);

  let accessToken = linked.accessToken;
  let profile = null;
  let playlists = [];
  let topTracks = [];

  if (hasOAuthToken) {
    if (linked.refreshToken) {
      try {
        accessToken = await refreshToken(linked.refreshToken);
        await SpotifyProfile.findOneAndUpdate(
          { userId },
          { accessToken, updatedAt: Date.now() },
          { upsert: false }
        );
      } catch {
        // use existing token
      }
    }

    try {
      profile = await spotifyGet("https://api.spotify.com/v1/me", accessToken);
    } catch (err) {
      console.warn("[SpotifyProfile] /v1/me failed:", err.response?.status, err.response?.data?.error?.message || err.message);
    }

    try {
      const pData = await spotifyGet("https://api.spotify.com/v1/me/playlists", accessToken, { limit: 5 });
      playlists = pData.items || [];
    } catch (err) {
      console.warn("[SpotifyProfile] /v1/me/playlists failed:", err.response?.status);
    }

    try {
      const tData = await spotifyGet("https://api.spotify.com/v1/me/top/tracks", accessToken, { limit: 5, time_range: "short_term" });
      topTracks = tData.items || [];
    } catch (err) {
      console.warn("[SpotifyProfile] /v1/me/top/tracks failed:", err.response?.status);
    }
  }

  const displayName = profile?.display_name || linked.displayName || "Unknown";
  const profileUrl = profile?.external_urls?.spotify || linked.profileUrl;
  const avatarUrl = profile?.images?.[0]?.url || linked.avatarUrl || null;
  const followers = profile?.followers?.total;
  const linkedTs = Math.floor(new Date(linked.linkedAt).getTime() / 1000);

  const storedPlaylists = Array.isArray(linked.playlists) ? linked.playlists : [];

  const playlistText = playlists.length
    ? playlists.map((p, i) =>
        `\`${i + 1}.\` ${p.external_urls?.spotify ? `[${p.name}](${p.external_urls.spotify})` : p.name} — **${p.tracks?.total ?? "?"}** tracks`
      ).join("\n")
    : storedPlaylists.length
      ? storedPlaylists.slice(0, 5).map((p, i) =>
          `\`${i + 1}.\` [${p.name}](${p.url}) — **${p.trackCount ?? "?"}** tracks`
        ).join("\n")
      : "_No playlists found._";

  const topTrackText = topTracks.length
    ? topTracks.map((t, i) => {
        const artists = t.artists?.map(a => a.name).join(", ") || "Unknown";
        const url = t.external_urls?.spotify;
        return `\`${i + 1}.\` ${url ? `[${t.name}](${url})` : t.name} — ${artists}`;
      }).join("\n")
    : "_Top tracks require Spotify OAuth login._";

  const embed = new EmbedBuilder()
    .setColor("#7B2FBE")
    .setTitle("<:spotify:1357041816106541156> Spotify Profile")
    .setDescription(`**[${displayName}](${profileUrl || "https://spotify.com"})**`)
    .setThumbnail(avatarUrl);

  if (followers !== undefined) {
    embed.addFields({ name: "Followers", value: followers.toLocaleString(), inline: true });
  }
  embed.addFields(
    { name: "Linked", value: `<t:${linkedTs}:R>`, inline: true },
  );

  embed.addFields({ name: `Top Playlists (${storedPlaylists.length || playlists.length})`, value: playlistText, inline: false });
  if (hasOAuthToken) {
    embed.addFields({ name: "Top Songs This Month", value: topTrackText, inline: false });
  }

  embed.setFooter({ text: `Use ${client?.prefix || ">"}spotify-myplaylist to browse and play your playlists` });

  const components = [];
  if (profileUrl) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Open Profile")
          .setStyle(ButtonStyle.Link)
          .setURL(profileUrl)
          .setEmoji("🎵")
      )
    );
  }

  return { embeds: [embed], components };
}
