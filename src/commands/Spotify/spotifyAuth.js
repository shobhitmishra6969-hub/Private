const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const config = require('../../config');
const emoji = require('../../emojis');

async function getClientCredentialsToken() {
  const credentials = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 8000,
    }
  );
  return res.data.access_token;
}

async function fetchPublicProfile(spotifyUserId, token) {
  const res = await axios.get(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 8000,
  });
  return res.data;
}

async function fetchPublicPlaylists(spotifyUserId, token, limit = 50) {
  const res = await axios.get(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit },
    timeout: 8000,
  });
  return res.data;
}

function parseSpotifyUserId(input) {
  const urlMatch = input.match(/open\.spotify\.com\/user\/([^?/\s]+)/);
  if (urlMatch) return urlMatch[1];
  return input.trim();
}

function buildConnectEmbed() {
  return new EmbedBuilder()
    .setColor('#1DB954')
    .setTitle(`${emoji.spotify} Connect Spotify`)
    .setDescription('Click the button below to link your Spotify profile');
}

function buildProfileCard(displayName, publicPlaylistCount, avatarUrl) {
  const embed = new EmbedBuilder()
    .setColor('#1DB954')
    .setTitle(`${emoji.spotify} Spotify Profile`)
    .setDescription(`**${displayName}**\n${publicPlaylistCount} public playlist${publicPlaylistCount !== 1 ? 's' : ''}`)
    .setTimestamp();

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return embed;
}

function buildProfileButtons(userId, profileUrl) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`spotify-login_playlists_${userId}`)
      .setLabel('View Playlists')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setLabel('Open Spotify')
      .setStyle(ButtonStyle.Link)
      .setURL(profileUrl)
      .setEmoji('🔗'),
    new ButtonBuilder()
      .setCustomId(`spotify-login_disconnect_${userId}`)
      .setLabel('Disconnect')
      .setStyle(ButtonStyle.Danger),
  );
}

module.exports = {
  name: 'spotify-login',
  aliases: ['splogin', 'spconnect', 'spotlogin', 'splink'],
  category: 'Spotify',
  description: 'Connect your Spotify profile',
  cooldown: 10,
  args: false,
  usage: 'spotify login',

  async slashExecute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
      content: `Please use the prefix command \`${client.prefix}spotify-login\` in a text channel to link your Spotify account.`,
    });
  },

  async execute(message, args, client) {
    const existing = await SpotifyProfile.findOne({ userId: message.author.id }).catch(() => null);

    if (existing?.spotifyUserId) {
      let token;
      try { token = await getClientCredentialsToken(); } catch {}

      let profile = null;
      let playlistData = null;

      if (token) {
        try { profile = await fetchPublicProfile(existing.spotifyUserId, token); } catch {}
        try { playlistData = await fetchPublicPlaylists(existing.spotifyUserId, token, 1); } catch {}
      }

      const displayName = profile?.display_name || existing.displayName || existing.spotifyUserId;
      const profileUrl = profile?.external_urls?.spotify || existing.profileUrl || `https://open.spotify.com/user/${existing.spotifyUserId}`;
      const avatarUrl = profile?.images?.[0]?.url || existing.avatarUrl || null;
      const publicPlaylistCount = playlistData?.total ?? 0;

      const embed = buildProfileCard(displayName, publicPlaylistCount, avatarUrl);
      const row = buildProfileButtons(message.author.id, profileUrl);

      return message.reply({ embeds: [embed], components: [row] });
    }

    const connectEmbed = buildConnectEmbed();
    const connectRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`spotify-login_enter_url_${message.author.id}`)
        .setLabel('Enter Spotify URL')
        .setStyle(ButtonStyle.Success),
    );

    return message.reply({ embeds: [connectEmbed], components: [connectRow] });
  },

  async componentsV2(interaction, client) {
    const userId = interaction.user.id;

    if (interaction.customId === `spotify-login_enter_url_${userId}`) {
      const modal = new ModalBuilder()
        .setCustomId(`spotify-login_modal_${userId}`)
        .setTitle('Connect Spotify')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('spotify_url_input')
              .setLabel('Spotify Profile URL or Username')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('https://open.spotify.com/user/...')
              .setRequired(true)
              .setMinLength(2)
              .setMaxLength(200)
          )
        );

      return interaction.showModal(modal);
    }

    if (interaction.customId === `spotify-login_playlists_${userId}`) {
      await interaction.deferReply({ ephemeral: true });

      const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);
      if (!linked) {
        return interaction.editReply({ content: '**No Spotify profile linked.**' });
      }

      let token;
      try { token = await getClientCredentialsToken(); } catch {}

      if (!token) {
        return interaction.editReply({ content: '**Failed to connect to Spotify API.**' });
      }

      let playlistData;
      try {
        playlistData = await fetchPublicPlaylists(linked.spotifyUserId, token, 50);
      } catch {
        return interaction.editReply({ content: '**Could not fetch playlists. The profile may be private.**' });
      }

      const playlists = playlistData?.items || [];
      if (!playlists.length) {
        return interaction.editReply({ content: '**No public playlists found for this profile.**' });
      }

      const playlistsToSave = playlists.map(p => ({
        name: p.name || 'Untitled Playlist',
        url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
        trackCount: p.tracks?.total ?? 0,
      }));

      SpotifyProfile.findOneAndUpdate(
        { userId },
        { playlists: playlistsToSave, updatedAt: Date.now() },
        { upsert: false }
      ).catch(() => {});

      const showCount = Math.min(playlists.length, 10);
      const listText = playlists.slice(0, showCount)
        .map((p, i) => `\`${i + 1}.\` [${p.name}](${p.external_urls?.spotify}) — ${p.tracks?.total ?? '?'} tracks`)
        .join('\n');

      const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle(`${emoji.spotify} Public Playlists`)
        .setDescription(listText)
        .setFooter({ text: `Showing ${showCount} of ${playlistData.total} public playlists` });

      return interaction.editReply({ embeds: [embed] });
    }

    if (interaction.customId === `spotify-login_disconnect_${userId}`) {
      await interaction.deferReply({ ephemeral: true });

      try {
        await SpotifyProfile.deleteOne({ userId });
      } catch (err) {
        console.error('[Spotify Disconnect] DB error:', err.message);
        return interaction.editReply({ content: '**Failed to disconnect your account. Please try again.**' });
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor('#1DB954')
            .setDescription(`**Your Spotify profile has been disconnected.**\nRun \`spotify-login\` again to reconnect.`),
        ],
      });
    }
  },

  async modalHandler(interaction, client) {
    const userId = interaction.user.id;

    await interaction.deferReply();

    const rawInput = interaction.fields.getTextInputValue('spotify_url_input').trim();
    if (!rawInput) {
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E31B23').setDescription('**Please enter a valid Spotify profile URL or username.**')],
      });
    }

    const spotifyUserId = parseSpotifyUserId(rawInput);

    // Fallback values derived purely from the URL — used if the API is unavailable
    const fallbackDisplayName = spotifyUserId;
    const fallbackProfileUrl = `https://open.spotify.com/user/${encodeURIComponent(spotifyUserId)}`;

    let token = null;
    try {
      token = await getClientCredentialsToken();
    } catch (err) {
      console.warn('[Spotify Login] Token error (non-fatal):', err?.response?.data || err.message);
    }

    let profile = null;
    if (token) {
      try {
        profile = await fetchPublicProfile(spotifyUserId, token);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          return interaction.editReply({
            embeds: [new EmbedBuilder().setColor('#E31B23').setDescription(
              `**Could not find Spotify user \`${spotifyUserId}\`.**\nMake sure the URL or username is correct.`
            )],
          });
        }
        // 403 / 429 / network error — fall back to URL-derived data
        console.warn(`[Spotify Login] Profile fetch failed (${status}), using URL fallback:`, err?.response?.data?.error?.message || err.message);
      }
    }

    let playlistData = null;
    if (token) {
      try {
        playlistData = await fetchPublicPlaylists(profile?.id || spotifyUserId, token, 50);
      } catch {
        // Non-fatal — playlists just won't be stored
      }
    }

    const resolvedId = profile?.id || spotifyUserId;
    const displayName = profile?.display_name || fallbackDisplayName;
    const profileUrl = profile?.external_urls?.spotify || fallbackProfileUrl;
    const avatarUrl = profile?.images?.[0]?.url || null;
    const publicPlaylistCount = playlistData?.total ?? 0;

    const playlistsToSave = (playlistData?.items || []).map(p => ({
      name: p.name || 'Untitled Playlist',
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
      trackCount: p.tracks?.total ?? 0,
    }));

    try {
      await SpotifyProfile.findOneAndUpdate(
        { userId },
        {
          userId,
          spotifyUserId: resolvedId,
          displayName,
          profileUrl,
          avatarUrl,
          accessToken: null,
          refreshToken: null,
          playlists: playlistsToSave,
          linkedAt: Date.now(),
          updatedAt: Date.now(),
        },
        { upsert: true }
      );
    } catch (dbErr) {
      console.error('[Spotify Login] DB save error:', dbErr.message);
      return interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#E31B23').setDescription('**Failed to save your Spotify profile. Please try again.**')],
      });
    }

    const embed = buildProfileCard(displayName, publicPlaylistCount, avatarUrl);
    const row = buildProfileButtons(userId, profileUrl);

    return interaction.editReply({ embeds: [embed], components: [row] });
  },
};
