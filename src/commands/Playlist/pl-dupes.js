'use strict';
const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserData, findPlaylist } = require('../../utils/playlistHelper');

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
  name: 'pl-dupes',
  aliases: ['pldupes', 'playlist-dupes', 'pl-dedup'],
  category: 'Playlist',
  description: 'Remove duplicate tracks from a playlist',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-dupes <playlist>\``);

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

    const before = pl.tracks.length;
    const seen   = new Set();
    pl.tracks = pl.tracks.filter(t => {
      if (seen.has(t.url)) return false;
      seen.add(t.url);
      return true;
    });
    const removed = before - pl.tracks.length;
    await doc.save();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### 🧹 Duplicates Removed`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              removed === 0
                ? `No duplicates found in **\`${name}\`**.`
                : `Removed **${removed}** duplicate${removed !== 1 ? 's' : ''} from **\`${name}\`**.\n` +
                  `**Before** — \`${before}\` tracks\n` +
                  `**After** — \`${pl.tracks.length}\` tracks\n` +
                  `-# Cleaned by ${message.author.username}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
