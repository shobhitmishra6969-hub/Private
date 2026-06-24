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
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const config = require('../../config');
const emoji = require('../../emojis');

// ── Spotify API helpers ───────────────────────────────────────────────────────

async function getClientCredToken() {
  const creds = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
  );
  return res.data.access_token;
}

async function fetchPublicPlaylists(spotifyUserId, token, limit = 50) {
  const res = await axios.get(
    `https://api.spotify.com/v1/users/${encodeURIComponent(spotifyUserId)}/playlists`,
    { headers: { Authorization: `Bearer ${token}` }, params: { limit }, timeout: 8000 }
  );
  return res.data;
}

async function fetchOAuthPlaylists(accessToken, limit = 50) {
  const res = await axios.get(
    'https://api.spotify.com/v1/me/playlists',
    { headers: { Authorization: `Bearer ${accessToken}` }, params: { limit }, timeout: 8000 }
  );
  return res.data;
}

async function refreshAccessToken(refreshToken) {
  const creds = Buffer.from(`${config.SpotifyID}:${config.SpotifySecret}`).toString('base64');
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 }
  );
  return res.data.access_token;
}

// Normalize DB-stored playlist to Spotify API shape so buildCard works for both
function normalizeCached(p) {
  return {
    name: p.name || 'Untitled Playlist',
    external_urls: { spotify: p.url || '' },
    tracks: { total: p.trackCount ?? 0 },
    images: [],
    id: null,
    owner: { display_name: 'Unknown' },
  };
}

// ── Fetch playlists (OAuth → public → DB cache) ───────────────────────────────

const FETCH_ERRORS = {
  PRIVATE_PROFILE: 'PRIVATE_PROFILE',
  AUTH_ERROR: 'AUTH_ERROR',
  UNKNOWN: 'UNKNOWN',
};

async function fetchPlaylists(linked) {
  let playlists = [];
  let lastError = null;

  // 1) OAuth token — gets private playlists too
  if (linked.refreshToken || linked.accessToken) {
    let token = linked.accessToken;
    if (linked.refreshToken) {
      try { token = await refreshAccessToken(linked.refreshToken); }
      catch (e) { console.warn('[Spotify] refreshAccessToken failed:', e?.response?.data || e.message); }
    }
    if (token) {
      try {
        const data = await fetchOAuthPlaylists(token);
        playlists = data?.items?.filter(Boolean) || [];
        if (playlists.length && token !== linked.accessToken) {
          SpotifyProfile.findOneAndUpdate(
            { userId: linked.userId },
            { accessToken: token, updatedAt: Date.now() },
            { upsert: false }
          ).catch(() => {});
        }
      } catch (e) {
        const status = e?.response?.status;
        console.warn('[Spotify] fetchOAuthPlaylists failed:', status, e?.response?.data || e.message);
        if (status === 401 || status === 403) lastError = FETCH_ERRORS.AUTH_ERROR;
      }
    }
  }

  // 2) Public playlists via client credentials
  if (!playlists.length && linked.spotifyUserId) {
    let credToken;
    try { credToken = await getClientCredToken(); }
    catch (e) {
      const status = e?.response?.status;
      console.warn('[Spotify] getClientCredToken failed:', status, e?.response?.data || e.message);
      lastError = FETCH_ERRORS.AUTH_ERROR;
    }
    if (credToken) {
      try {
        const data = await fetchPublicPlaylists(linked.spotifyUserId, credToken);
        playlists = data?.items?.filter(Boolean) || [];
      } catch (e) {
        const status = e?.response?.status;
        console.warn('[Spotify] fetchPublicPlaylists failed:', status, e?.response?.data || e.message);
        if (status === 403) lastError = FETCH_ERRORS.PRIVATE_PROFILE;
        else if (status === 401) lastError = FETCH_ERRORS.AUTH_ERROR;
        else lastError = FETCH_ERRORS.UNKNOWN;
      }
    }
  }

  // 3) Fallback: DB-cached playlists (so the UI still works if Spotify API is inaccessible)
  if (!playlists.length && Array.isArray(linked.playlists) && linked.playlists.length) {
    playlists = linked.playlists.map(normalizeCached);
  }

  // Attach lastError to the result so callers can show better messages
  playlists._fetchError = playlists.length ? null : lastError;
  return playlists;
}

// ── Card builder (one playlist at a time) ─────────────────────────────────────

function buildCard(displayName, playlists, page) {
  const pl     = playlists[page];
  const total  = playlists.length;
  const cover  = pl.images?.[0]?.url || null;
  const owner  = pl.owner?.display_name || 'Unknown';
  const tracks = pl.tracks?.total ?? 0;
  const url    = pl.external_urls?.spotify || (pl.id ? `https://open.spotify.com/playlist/${pl.id}` : 'https://spotify.com');

  const infoText = new TextDisplayBuilder().setContent(
    `### ${displayName}'s Playlists\n` +
    `**${(pl.name || 'Untitled Playlist').slice(0, 100)}**\n\n` +
    `Owner: ${owner}\n` +
    `Tracks: ${tracks}\n` +
    `Playlist: ${page + 1} of ${total}\n\n` +
    `-# Playlist · Spotify`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);

  if (cover) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(infoText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(cover))
    );
  } else {
    container.addTextDisplayComponents(infoText);
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

  // ◀  ▶ Play  ▶
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('spmpl_prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('spmpl_play')
        .setLabel('▶ Play')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('spmpl_next')
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= total - 1),
    )
  );

  // Open in Spotify
  if (url && url !== 'https://spotify.com') {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open')
          .setStyle(ButtonStyle.Link)
          .setURL(url)
          .setEmoji('🔗'),
      )
    );
  }

  // Jump to a playlist — max 25 options allowed by Discord
  const jumpOptions = playlists.slice(0, 25).map((p, i) => ({
    label: (p.name || 'Untitled Playlist').slice(0, 100),
    description: `${p.tracks?.total ?? '?'} tracks`,
    value: String(i),
  }));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('spmpl_jump')
        .setPlaceholder('Jump to a playlist')
        .addOptions(jumpOptions)
    )
  );

  // Back
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('spmpl_back')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary),
    )
  );

  return [container];
}

// ── Loading card ──────────────────────────────────────────────────────────────

function buildLoadingCard(displayName) {
  return [
    new ContainerBuilder().setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${displayName}'s Playlists\n-# Fetching your playlists from Spotify...`
        )
      ),
  ];
}

// ── Error card ────────────────────────────────────────────────────────────────

function buildErrorCard(text) {
  return [
    new ContainerBuilder().setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text)),
  ];
}

// ── Attach collector to a message ─────────────────────────────────────────────

function attachCollector(sentMsg, { displayName, playlists, userId, client, onBack }) {
  let page = 0;

  const collector = sentMsg.createMessageComponentCollector({
    filter: i => i.user.id === userId,
    time: 120_000,
  });

  collector.on('collect', async i => {
    try {
      if (i.customId === 'spmpl_prev') {
        page = Math.max(0, page - 1);
        return i.update({ components: buildCard(displayName, playlists, page), flags: MessageFlags.IsComponentsV2 });
      }

      if (i.customId === 'spmpl_next') {
        page = Math.min(playlists.length - 1, page + 1);
        return i.update({ components: buildCard(displayName, playlists, page), flags: MessageFlags.IsComponentsV2 });
      }

      if (i.customId === 'spmpl_jump') {
        page = parseInt(i.values[0], 10);
        return i.update({ components: buildCard(displayName, playlists, page), flags: MessageFlags.IsComponentsV2 });
      }

      if (i.customId === 'spmpl_back') {
        collector.stop('back');
        if (onBack) return onBack(i);
        return i.update({
          components: buildErrorCard(`**${emoji.info} Closed playlist browser.**`),
          flags: MessageFlags.IsComponentsV2,
        });
      }

      if (i.customId === 'spmpl_play') {
        const pl = playlists[page];
        const spotifyUrl = pl.external_urls?.spotify;
        const voiceChannel = i.member?.voice?.channel;

        if (!voiceChannel) {
          return i.reply({ content: `**${emoji.warn} Join a voice channel first to play music.**`, ephemeral: true });
        }
        if (!spotifyUrl) {
          return i.reply({ content: `**${emoji.cross} No Spotify URL for this playlist.**`, ephemeral: true });
        }

        await i.deferUpdate().catch(() => {});

        try {
          let player = client.manager.players.get(i.guildId);
          if (!player) {
            player = await client.manager.createPlayer({
              guildId: i.guildId,
              voiceId: voiceChannel.id,
              textId: i.channelId,
              deaf: true,
              volume: 80,
            });
            try { client.voiceHealthMonitor?.startMonitoring(player); } catch {}
          } else if (player.voiceId !== voiceChannel.id) {
            return i.followUp({ content: `**${emoji.warn} I'm already in a different voice channel.**`, ephemeral: true }).catch(() => {});
          }

          const result = await player.search(spotifyUrl, { requester: i.user, engine: 'spsearch' });
          if (!result?.tracks?.length) {
            return i.followUp({ content: `**${emoji.cross} Couldn't load tracks from this playlist.**`, ephemeral: true }).catch(() => {});
          }

          for (const track of result.tracks) player.queue.add(track);
          if (!player.playing && !player.paused) await player.play().catch(() => {});

          return i.followUp({
            content: `**${emoji.check} Queued \`${result.tracks.length}\` tracks from "${pl.name || 'Untitled'}"**`,
            ephemeral: true,
          }).catch(() => {});
        } catch (err) {
          console.error('[SpotifyMyPl] Play error:', err.message);
          return i.followUp({ content: `**${emoji.cross} Failed to play this playlist.**`, ephemeral: true }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[SpotifyMyPl] Collector error:', err.message);
    }
  });

  return collector;
}

// ── Standalone command ────────────────────────────────────────────────────────

module.exports = {
  name: 'spotify-myplaylist',
  aliases: ['mypls', 'myplaylists', 'spmypl', 'spplaylists'],
  category: 'Spotify',
  description: 'Browse and play your linked Spotify playlists.',
  cooldown: 5,
  args: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const userId = interaction.user.id;

    const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);
    if (!linked?.spotifyUserId) {
      return interaction.editReply({
        components: buildErrorCard(
          `**${emoji.cross} You haven't linked a Spotify account yet.**\n` +
          `-# Run \`${client.prefix}spotify-login\` to connect your account.`
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const playlists = await fetchPlaylists(linked);
    if (!playlists.length) {
      return interaction.editReply({
        components: buildErrorCard(
          `**${emoji.warn} No playlists found.**\n` +
          `-# Your Spotify profile may be private. Try linking via OAuth for full access.`
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const displayName = linked.displayName || 'Your';
    const sentMsg = await interaction.editReply({
      components: buildCard(displayName, playlists, 0),
      flags: MessageFlags.IsComponentsV2,
    });

    attachCollector(sentMsg, { displayName, playlists, userId: interaction.user.id, client });
  },

  async execute(message, args, client) {
    const userId = message.author.id;

    const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);
    if (!linked?.spotifyUserId) {
      return message.reply({
        components: buildErrorCard(
          `**${emoji.cross} You haven't linked a Spotify account yet.**\n` +
          `-# Run \`${client.prefix}spotify-login\` to connect your account.`
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Send loading card first so the interaction is immediate
    const sentMsg = await message.reply({
      components: buildLoadingCard(linked.displayName || 'Your'),
      flags: MessageFlags.IsComponentsV2,
    });

    const playlists = await fetchPlaylists(linked);
    if (!playlists.length) {
      return sentMsg.edit({
        components: buildErrorCard(
          `**${emoji.warn} No playlists found.**\n` +
          `-# Your Spotify profile may be private. Try linking via OAuth for full access.`
        ),
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const displayName = linked.displayName || 'Your';
    await sentMsg.edit({
      components: buildCard(displayName, playlists, 0),
      flags: MessageFlags.IsComponentsV2,
    });

    attachCollector(sentMsg, { displayName, playlists, userId, client });
  },

  // ── Used by spotifyAuth.js "View Playlists" button ────────────────────────
  buildCard,
  buildLoadingCard,
  buildErrorCard,
  fetchPlaylists,
  attachCollector,
  normalizeCached,
};
