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
  name: 'pl-addqueue',
  aliases: ['pladdq', 'playlist-addqueue'],
  category: 'Playlist',
  description: 'Add all songs from the current queue to a playlist',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-addqueue <playlist>\``);

    const player = client.manager.players.get(message.guild.id);
    if (!player) return reply(message, `**${emoji.cross} No music is playing.**`);

    const queueTracks = [];
    if (player.queue.current) queueTracks.push(player.queue.current);
    if (player.queue.length > 0) queueTracks.push(...(player.queue.toArray ? player.queue.toArray() : [...player.queue]));
    if (queueTracks.length === 0) return reply(message, `**${emoji.cross} The queue is empty.**`);

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

    const space = MAX_TRACKS - pl.tracks.length;
    if (space <= 0) return reply(message, `**${emoji.cross} Playlist \`${name}\` is already full.**`);

    let added = 0, skipped = 0;
    for (const song of queueTracks) {
      if (added >= space) { skipped += queueTracks.length - added - skipped; break; }
      if (pl.tracks.some(t => t.url === song.uri)) { skipped++; continue; }
      pl.tracks.push({ title: song.title, url: song.uri, duration: song.length, thumbnail: song.thumbnail, author: song.author });
      added++;
    }
    await doc.save();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.pl_addqueue} Queue Saved to Playlist`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Playlist** — \`${name}\`\n` +
              `**Added** — \`${added}\` tracks\n` +
              `**Skipped** — \`${skipped}\` (dupes/limit)\n` +
              `**Total** — \`${pl.tracks.length}\` tracks\n` +
              `-# Saved by ${message.author.username}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
