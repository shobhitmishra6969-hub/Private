'use strict';
const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserData, findPlaylist, MAX_PLAYLISTS } = require('../../utils/playlistHelper');

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
  name: 'pl-create',
  aliases: ['plcreate', 'playlist-create'],
  category: 'Playlist',
  description: 'Create a new playlist',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-create <name>\``);
    if (name.length > 32) return reply(message, `**${emoji.cross} Playlist name must be 32 characters or fewer.**`);

    const doc = await getUserData(message.author.id);

    if (doc.playlists.length >= MAX_PLAYLISTS)
      return reply(message, `**${emoji.cross} You can only have up to \`${MAX_PLAYLISTS}\` playlists.**`);

    if (findPlaylist(doc, name))
      return reply(message, `**${emoji.warn} A playlist named \`${name}\` already exists.**`);

    doc.playlists.push({ name, tracks: [], createdAt: Date.now() });
    await doc.save();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.pl_create} Playlist Created`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Name** — \`${name}\`\n` +
              `**Tracks** — \`0\`\n` +
              `**Slot** — \`${doc.playlists.length} / ${MAX_PLAYLISTS}\`\n\n` +
              `-# Use \`${client.prefix}pl-add ${name} <song>\` to add tracks.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
