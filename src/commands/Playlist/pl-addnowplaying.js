'use strict';
const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserData, findPlaylist, MAX_TRACKS } = require('../../utils/playlistHelper');

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

module.exports = {
  name: 'pl-addnowplaying',
  aliases: ['planp', 'pladdnp', 'playlist-addnowplaying'],
  category: 'Playlist',
  description: 'Add the currently playing song to a playlist',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-addnowplaying <playlist>\``);

    const player = client.manager.players.get(message.guild.id);
    if (!player?.queue?.current)
      return reply(message, `**${emoji.cross} Nothing is currently playing.**`);

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl)                          return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);
    if (pl.tracks.length >= MAX_TRACKS) return reply(message, `**${emoji.cross} Playlist is full (\`${MAX_TRACKS}\` tracks max).**`);

    const song = player.queue.current;
    if (pl.tracks.some(t => t.url === song.uri))
      return reply(message, `**${emoji.warn} \`${song.title}\` is already in \`${name}\`.**`);

    pl.tracks.push({
      title:     song.title,
      url:       song.uri,
      duration:  song.length,
      thumbnail: song.thumbnail,
      author:    song.author,
    });
    await doc.save();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.pl_addnowplaying} Now Playing Added`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**[${song.title}](${song.uri})**\n` +
              `**Artist** — ${song.author || 'Unknown'}\n` +
              `**Playlist** — \`${name}\` (${pl.tracks.length} tracks)\n` +
              `-# Saved by ${message.author.username}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
