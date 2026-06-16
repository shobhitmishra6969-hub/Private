'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const config = require('../../config');

async function refreshToken(refreshTok) {
  const credentials = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshTok }).toString(),
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
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
    return {
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**You haven't linked a Spotify account yet.**\n-# Run \`${client?.prefix || '>'}spotify-login\` to link your account.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    };
  }

  const hasOAuthToken = !!(linked.refreshToken || linked.accessToken);
  let accessToken = linked.accessToken;
  let profile = null, playlists = [], topTracks = [];

  if (hasOAuthToken) {
    if (linked.refreshToken) {
      try {
        accessToken = await refreshToken(linked.refreshToken);
        await SpotifyProfile.findOneAndUpdate({ userId }, { accessToken, updatedAt: Date.now() }, { upsert: false });
      } catch { /* use existing token */ }
    }
    try { profile = await spotifyGet('https://api.spotify.com/v1/me', accessToken); } catch {}
    try {
      const pData = await spotifyGet('https://api.spotify.com/v1/me/playlists', accessToken, { limit: 5 });
      playlists = pData.items || [];
    } catch {}
    try {
      const tData = await spotifyGet('https://api.spotify.com/v1/me/top/tracks', accessToken, { limit: 5, time_range: 'short_term' });
      topTracks = tData.items || [];
    } catch {}
  }

  const displayName    = profile?.display_name || linked.displayName || 'Unknown';
  const profileUrl     = profile?.external_urls?.spotify || linked.profileUrl;
  const avatarUrl      = profile?.images?.[0]?.url || linked.avatarUrl || null;
  const followers      = profile?.followers?.total;
  const linkedTs       = Math.floor(new Date(linked.linkedAt).getTime() / 1000);
  const storedPlaylists = Array.isArray(linked.playlists) ? linked.playlists : [];

  const playlistText = playlists.length
    ? playlists.map((p, i) =>
        `\`${i + 1}.\` ${p.external_urls?.spotify ? `[${p.name}](${p.external_urls.spotify})` : p.name} — **${p.tracks?.total ?? '?'}** tracks`
      ).join('\n')
    : storedPlaylists.length
      ? storedPlaylists.slice(0, 5).map((p, i) =>
          `\`${i + 1}.\` [${p.name}](${p.url}) — **${p.trackCount ?? '?'}** tracks`
        ).join('\n')
      : '_No playlists found._';

  const topTrackText = topTracks.length
    ? topTracks.map((t, i) => {
        const artists = t.artists?.map(a => a.name).join(', ') || 'Unknown';
        const url     = t.external_urls?.spotify;
        return `\`${i + 1}.\` ${url ? `[${t.name}](${url})` : t.name} — ${artists}`;
      }).join('\n')
    : '_Top tracks require Spotify OAuth login._';

  const statsLine =
    (followers !== undefined ? `**Followers** — \`${followers.toLocaleString()}\`\n` : '') +
    `**Linked** — <t:${linkedTs}:R>`;

  const headerText = new TextDisplayBuilder().setContent(
    `### <:spotify:1357041816106541156> Spotify Profile\n**[${displayName}](${profileUrl || 'https://spotify.com'})**\n${statsLine}`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);

  if (avatarUrl) {
    const thumb   = new ThumbnailBuilder().setURL(avatarUrl);
    const section = new SectionBuilder().addTextDisplayComponents(headerText).setThumbnailAccessory(thumb);
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Top Playlists (${storedPlaylists.length || playlists.length})**\n${playlistText}`
      )
    );

  if (hasOAuthToken) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Top Songs This Month**\n${topTrackText}`)
      );
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Use \`${client?.prefix || '>'}spotify-myplaylist\` to browse and play your playlists`
      )
    );

  const components = [container];
  if (profileUrl) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open Profile').setStyle(ButtonStyle.Link).setURL(profileUrl).setEmoji('🎵')
      )
    );
  }

  return { components, flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
  name: 'spotify-profile',
  aliases: ['spprofile', 'spotifyprofile', 'spme'],
  category: 'Spotify',
  description: 'View your linked Spotify profile info.',
  cooldown: 5,
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    return interaction.editReply(await buildProfileReply(interaction.user.id, client));
  },

  async execute(message, args, client) {
    return message.reply(await buildProfileReply(message.author.id, client));
  },
};
