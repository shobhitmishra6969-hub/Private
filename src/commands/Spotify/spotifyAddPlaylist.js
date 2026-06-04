const {
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const axios = require('axios');
const SpotifyProfile = require('../../schema/spotifyprofile');
const emoji = require('../../emojis');

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
  aliases: ['spadd', 'spaddpl', 'spadd', 'spaddplaylist'],
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
    if (!linked?.spotifyUserId) {
      const display = new TextDisplayBuilder().setContent(
        `**${emoji.cross} You haven't linked a Spotify profile yet.**\nUse \`${client.prefix}spotify-login\` first.`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const input = args.join(' ').trim();
    const playlistId = parsePlaylistId(input);

    if (!playlistId) {
      const display = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Invalid Spotify playlist URL.**\n` +
        `Please provide a link like: \`https://open.spotify.com/playlist/XXXXX\``
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;

    const existingPlaylists = Array.isArray(linked.playlists) ? linked.playlists : [];
    if (existingPlaylists.some(p => p.url === playlistUrl || p.url.includes(playlistId))) {
      const display = new TextDisplayBuilder().setContent(
        `**${emoji.warn} This playlist is already in your list.**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (existingPlaylists.length >= 50) {
      const display = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You can only have up to 50 playlists linked. Remove one with \`${client.prefix}spotify-removeplaylist\`.**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const oembedData = await fetchPlaylistViaOembed(playlistUrl);
    const playlistName = oembedData?.name || `Playlist ${existingPlaylists.length + 1}`;

    const newPlaylist = {
      name: playlistName,
      url: playlistUrl,
      trackCount: 0,
    };

    const updatedPlaylists = [...existingPlaylists, newPlaylist];

    try {
      await SpotifyProfile.findOneAndUpdate(
        { userId },
        { playlists: updatedPlaylists, updatedAt: Date.now() },
        { upsert: false }
      );
    } catch (err) {
      console.error('[spotify-addplaylist] DB error:', err.message);
      const display = new TextDisplayBuilder().setContent(`**${emoji.cross} Failed to save playlist. Please try again.**`);
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const embed = new EmbedBuilder()
      .setColor('#7B2FBE')
      .setTitle(`${emoji.spotify} Playlist Added`)
      .setDescription(
        `**[${playlistName}](${playlistUrl})** has been added to your Spotify profile.\n\n` +
        `You now have **${updatedPlaylists.length}** playlist${updatedPlaylists.length !== 1 ? 's' : ''} linked.\n` +
        `Use \`${client.prefix}spotify-myplaylist\` to browse and play them.`
      );

    if (oembedData?.thumbnail) embed.setThumbnail(oembedData.thumbnail);

    return message.reply({ embeds: [embed] });
  },
};
