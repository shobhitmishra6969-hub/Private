'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const emoji = require('../../emojis');

function reply(message, content) {
  return message.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

function parsePlaylistId(input) {
  const match = input.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match?.[1] || null;
}

async function fetchPlaylistViaOembed(url) {
  try {
    const res = await axios.get(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { timeout: 8000 });
    return { name: res.data.title, thumbnail: res.data.thumbnail_url };
  } catch {
    return null;
  }
}

module.exports = {
  name: 'spotify-addplaylist',
  aliases: ['spadd', 'spaddpl', 'spaddplaylist'],
  category: 'Spotify',
  description: 'Add a Spotify playlist to your linked profile',
  args: true,
  usage: '<spotify-playlist-url>',
  userPerms: [],
  owner: false,
  slashOptions: [],

  async execute(message, args, client) {
    const userId = message.author.id;

    const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);
    if (!linked?.spotifyUserId)
      return reply(message, `**${emoji.cross} You haven't linked a Spotify profile yet.**\n-# Use \`${client.prefix}spotify-login\` first.`);

    const input      = args.join(' ').trim();
    const playlistId = parsePlaylistId(input);
    if (!playlistId)
      return reply(message,
        `**${emoji.cross} Invalid Spotify playlist URL.**\n` +
        `-# Please provide a link like: \`https://open.spotify.com/playlist/XXXXX\``
      );

    const playlistUrl       = `https://open.spotify.com/playlist/${playlistId}`;
    const existingPlaylists = Array.isArray(linked.playlists) ? linked.playlists : [];

    if (existingPlaylists.some(p => p.url === playlistUrl || p.url.includes(playlistId)))
      return reply(message, `**${emoji.warn} This playlist is already in your list.**`);

    if (existingPlaylists.length >= 50)
      return reply(message, `**${emoji.warn} You can only have up to 50 playlists linked.**`);

    const oembedData    = await fetchPlaylistViaOembed(playlistUrl);
    const playlistName  = oembedData?.name || `Playlist ${existingPlaylists.length + 1}`;
    const updatedPlaylists = [...existingPlaylists, { name: playlistName, url: playlistUrl, trackCount: 0 }];

    try {
      await SpotifyProfile.findOneAndUpdate(
        { userId },
        { playlists: updatedPlaylists, updatedAt: Date.now() },
        { upsert: false }
      );
    } catch (err) {
      console.error('[spotify-addplaylist] DB error:', err.message);
      return reply(message, `**${emoji.cross} Failed to save playlist. Please try again.**`);
    }

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.spotify} Playlist Added`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**[${playlistName}](${playlistUrl})**\n` +
              `**Total linked** — \`${updatedPlaylists.length}\` playlist${updatedPlaylists.length !== 1 ? 's' : ''}\n` +
              `-# Use \`${client.prefix}spotify-myplaylist\` to browse and play them.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
