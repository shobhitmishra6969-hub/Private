'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  SectionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const config = require('../../config');
const emoji = require('../../emojis');

// ── Helpers ────────────────────────────────────────────────────────────────────

function reply(target, content) {
  return target.editReply ? target.editReply({
    components: [
      new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
  }) : target.reply({
    components: [
      new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

async function getClientCredentialsToken() {
  const credentials = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    { headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
  );
  return res.data.access_token;
}

async function fetchPublicProfile(spotifyUserId, token) {
  const res = await axios.get(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}`, {
    headers: { Authorization: `Bearer ${token}` }, timeout: 8000,
  });
  return res.data;
}

async function fetchPublicPlaylists(spotifyUserId, token, limit = 50) {
  const res = await axios.get(`https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists`, {
    headers: { Authorization: `Bearer ${token}` }, params: { limit }, timeout: 8000,
  });
  return res.data;
}

async function fetchDisplayNameFromHTML(spotifyUserId) {
  try {
    const res = await axios.get(`https://open.spotify.com/user/${encodeURIComponent(spotifyUserId)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Accept': 'text/html' },
      timeout: 8000,
    });
    const match = res.data.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/);
    return match?.[1] || null;
  } catch { return null; }
}

function parseSpotifyUserId(input) {
  const urlMatch = input.match(/open\.spotify\.com\/user\/([^?/\s]+)/);
  if (urlMatch) return urlMatch[1];
  return input.trim();
}

function buildConnectContainer(prefix = '+') {
  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.spotify} Connect Spotify\n` +
        `Click **Enter Spotify URL** and paste your Spotify profile link.\n\n` +
        `-# After linking, add your playlists with \`${prefix}spotify-addplaylist <url>\``
      )
    );
}

function buildProfileContainer(displayName, playlistCount, avatarUrl, profileUrl, prefix = '+') {
  const playlistLine = playlistCount > 0
    ? `**${playlistCount}** playlist${playlistCount !== 1 ? 's' : ''} linked`
    : `-# No playlists yet — use \`${prefix}spotify-addplaylist <url>\` to add some`;

  const text = new TextDisplayBuilder().setContent(
    `### ${emoji.spotify} Spotify Profile\n**${displayName}**\n${playlistLine}`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);
  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(text).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );
  } else {
    container.addTextDisplayComponents(text);
  }
  return container;
}

function buildProfileButtons(userId, profileUrl) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`spotify-login_playlists_${userId}`).setLabel('View Playlists').setStyle(ButtonStyle.Primary).setEmoji('📋'),
    new ButtonBuilder().setLabel('Open Spotify').setStyle(ButtonStyle.Link).setURL(profileUrl).setEmoji('🔗'),
    new ButtonBuilder().setCustomId(`spotify-login_disconnect_${userId}`).setLabel('Disconnect').setStyle(ButtonStyle.Danger),
  );
}

// ── Module ─────────────────────────────────────────────────────────────────────

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
    await interaction.editReply({ content: `Please use \`${client.prefix}spotify-login\` in a text channel to link your Spotify account.` });
  },

  async execute(message, args, client) {
    const existing = await SpotifyProfile.findOne({ userId: message.author.id }).catch(() => null);
    const prefix   = client.prefix || '+';

    if (existing?.spotifyUserId) {
      let displayName = existing.displayName || existing.spotifyUserId;
      if (!displayName || displayName === existing.spotifyUserId) {
        const htmlName = await fetchDisplayNameFromHTML(existing.spotifyUserId);
        if (htmlName) {
          displayName = htmlName;
          SpotifyProfile.findOneAndUpdate({ userId: message.author.id }, { displayName, updatedAt: Date.now() }, { upsert: false }).catch(() => {});
        }
      }

      const profileUrl   = existing.profileUrl || `https://open.spotify.com/user/${existing.spotifyUserId}`;
      const avatarUrl    = existing.avatarUrl || null;
      const playlistCount = Array.isArray(existing.playlists) ? existing.playlists.length : 0;

      const container = buildProfileContainer(displayName, playlistCount, avatarUrl, profileUrl, prefix);
      const row = buildProfileButtons(message.author.id, profileUrl);
      container.addActionRowComponents(row);

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const container = buildConnectContainer(prefix);
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`spotify-login_enter_url_${message.author.id}`)
          .setLabel('Enter Spotify URL')
          .setStyle(ButtonStyle.Success)
      )
    );

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
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
              .setRequired(true).setMinLength(2).setMaxLength(200)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.customId === `spotify-login_playlists_${userId}`) {
      const {
        buildCard, buildLoadingCard, buildErrorCard, fetchPlaylists, attachCollector,
      } = require('./spotifyMyPlaylists');

      // interaction.message is the real Message object — grab it BEFORE update()
      const sentMsg = interaction.message;

      // 1) Acknowledge immediately (updates the message, < 3s required)
      await interaction.update({
        components: buildLoadingCard('Your'),
        flags: MessageFlags.IsComponentsV2,
      });

      // 2) Async work — safe now, interaction already acknowledged
      const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);

      if (!linked?.spotifyUserId) {
        return sentMsg.edit({
          components: buildErrorCard(
            `**${emoji.cross} You haven't linked a Spotify account yet.**\n` +
            `-# Run \`${client.prefix}spotify-login\` to connect your account.`
          ),
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      const displayName   = linked.displayName || linked.spotifyUserId || 'Your';
      const profileUrl    = linked.profileUrl || `https://open.spotify.com/user/${linked.spotifyUserId}`;
      const avatarUrl     = linked.avatarUrl || null;
      const prefix        = client.prefix || '+';
      const playlistCount = Array.isArray(linked.playlists) ? linked.playlists.length : 0;

      const playlists = await fetchPlaylists(linked);

      if (!playlists.length) {
        return sentMsg.edit({
          components: buildErrorCard(
            `**${emoji.warn} No playlists found.**\n` +
            `-# Your Spotify profile may be private. Add playlists manually with \`${prefix}spotify-addplaylist <url>\``
          ),
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      // 3) Show paginated card + attach collector
      await sentMsg.edit({
        components: buildCard(displayName, playlists, 0),
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});

      const onBack = (i) => {
        const container = buildProfileContainer(displayName, playlistCount, avatarUrl, profileUrl, prefix);
        container.addActionRowComponents(buildProfileButtons(userId, profileUrl));
        return i.update({ components: [container], flags: MessageFlags.IsComponentsV2 });
      };

      attachCollector(sentMsg, { displayName, playlists, userId, client, onBack });
      return;
    }

    if (interaction.customId === `spotify-login_disconnect_${userId}`) {
      await interaction.deferReply({ ephemeral: true });
      try { await SpotifyProfile.deleteOne({ userId }); }
      catch (err) {
        console.error('[Spotify Disconnect] DB error:', err.message);
        return interaction.editReply({ content: '**Failed to disconnect your account. Please try again.**' });
      }
      return interaction.editReply({ content: '**Your Spotify profile has been disconnected.**\nRun `spotify-login` again to reconnect.' });
    }
  },

  async modalHandler(interaction, client) {
    const userId = interaction.user.id;
    await interaction.deferReply();

    const rawInput = interaction.fields.getTextInputValue('spotify_url_input').trim();
    if (!rawInput) return reply(interaction, '**Please enter a valid Spotify profile URL or username.**');

    const spotifyUserId   = parseSpotifyUserId(rawInput);
    const fallbackDisplay = spotifyUserId;
    const fallbackUrl     = `https://open.spotify.com/user/${encodeURIComponent(spotifyUserId)}`;

    let token = null;
    try { token = await getClientCredentialsToken(); }
    catch (err) { console.warn('[Spotify Login] Token error (non-fatal):', err?.response?.data || err.message); }

    let profile = null;
    if (token) {
      try { profile = await fetchPublicProfile(spotifyUserId, token); }
      catch (err) {
        const status = err?.response?.status;
        if (status === 404) return reply(interaction, `**Could not find Spotify user \`${spotifyUserId}\`.**\nMake sure the URL or username is correct.`);
        console.warn(`[Spotify Login] Profile fetch failed (${status}), using URL fallback:`, err?.response?.data?.error?.message || err.message);
      }
    }

    let playlistData = null;
    if (token) {
      try { playlistData = await fetchPublicPlaylists(profile?.id || spotifyUserId, token, 50); } catch {}
    }

    const resolvedId = profile?.id || spotifyUserId;
    let displayName  = profile?.display_name || null;
    if (!displayName) displayName = await fetchDisplayNameFromHTML(resolvedId);
    displayName = displayName || fallbackDisplay;

    const profileUrl     = profile?.external_urls?.spotify || fallbackUrl;
    const avatarUrl      = profile?.images?.[0]?.url || null;
    const playlistsToSave = (playlistData?.items || []).map(p => ({
      name: p.name || 'Untitled Playlist',
      url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
      trackCount: p.tracks?.total ?? 0,
    }));

    try {
      await SpotifyProfile.findOneAndUpdate(
        { userId },
        { userId, spotifyUserId: resolvedId, displayName, profileUrl, avatarUrl, accessToken: null, refreshToken: null, playlists: playlistsToSave, linkedAt: Date.now(), updatedAt: Date.now() },
        { upsert: true }
      );
    } catch (dbErr) {
      console.error('[Spotify Login] DB save error:', dbErr.message);
      return reply(interaction, '**Failed to save your Spotify profile. Please try again.**');
    }

    const prefix    = client?.prefix || '+';
    const container = buildProfileContainer(displayName, playlistsToSave.length, avatarUrl, profileUrl, prefix);
    const row       = buildProfileButtons(userId, profileUrl);
    container.addActionRowComponents(row);

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
