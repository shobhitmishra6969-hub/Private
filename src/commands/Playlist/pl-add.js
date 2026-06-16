'use strict';
const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserData, findPlaylist, MAX_TRACKS } = require('../../utils/playlistHelper');

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

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
  name: 'pl-add',
  aliases: ['pladd', 'playlist-add'],
  category: 'Playlist',
  description: 'Add a song to a playlist by URL or search query',
  usage: '<name> <url or query>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    if (args.length < 2)
      return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-add <playlist> <url or query>\``);

    const name  = args[0];
    const query = args.slice(1).join(' ');

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.** Create it with \`${client.prefix}pl-create ${name}\``);
    if (pl.tracks.length >= MAX_TRACKS)
      return reply(message, `**${emoji.cross} Playlist \`${name}\` is full (\`${MAX_TRACKS}\` tracks max).**`);

    try {
      const result = await client.manager.search(query, { requester: message.author });
      if (!result?.tracks?.length)
        return reply(message, `**${emoji.cross} No results found for \`${query}\`.**`);

      const track = result.tracks[0];
      pl.tracks.push({
        title:     track.title,
        url:       track.uri,
        duration:  track.length,
        thumbnail: track.thumbnail,
        author:    track.author,
      });
      await doc.save();

      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`### ${emoji.pl_add} Track Added`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**[${track.title}](${track.uri})**\n` +
                `**Artist** — ${track.author || 'Unknown'}\n` +
                `**Duration** — \`${msToTime(track.length)}\`\n` +
                `**Playlist** — \`${pl.name}\` (${pl.tracks.length} tracks)\n` +
                `-# Requested by ${message.author.username}`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      console.error('[pl-add]', err);
      return reply(message, `**${emoji.cross} Failed to search. Please try again.**`);
    }
  },
};
