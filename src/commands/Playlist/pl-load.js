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
  name: 'pl-load',
  aliases: ['plload', 'playlist-load', 'plplay'],
  category: 'Playlist',
  description: 'Load a playlist into the current queue',
  usage: '<name>',
  userPerms: [],
  owner: false,
  inVoiceChannel: true,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-load <playlist>\``);
    if (!message.member.voice.channel)
      return reply(message, `**${emoji.cross} You must be in a voice channel to load a playlist.**`);

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl)                  return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);
    if (pl.tracks.length === 0) return reply(message, `**${emoji.warn} Playlist \`${name}\` is empty.**`);

    try {
      let player = client.manager.players.get(message.guild.id);
      if (!player) {
        player = await client.manager.createPlayer({
          guildId: message.guild.id,
          voiceId: message.member.voice.channel.id,
          textId:  message.channel.id,
          volume:  80,
          deaf:    true,
        });
      }

      const wasEmpty = !player.playing && player.queue.size === 0;
      let loaded = 0, failed = 0;

      for (let i = 0; i < pl.tracks.length; i += 5) {
        const batch = pl.tracks.slice(i, i + 5);
        const results = await Promise.all(batch.map(async song => {
          try {
            const res = await player.search(song.url || song.title, { requester: message.author });
            if (res?.tracks?.length) { player.queue.add(res.tracks[0]); return true; }
            return false;
          } catch { return false; }
        }));
        results.forEach(ok => ok ? loaded++ : failed++);
      }

      if (wasEmpty && loaded > 0 && !player.playing && !player.paused) await player.play();

      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`### ▶️ Playlist Loaded`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**Playlist** — \`${name}\`\n` +
                `**Loaded** — \`${loaded}\` tracks\n` +
                (failed > 0 ? `**Failed** — \`${failed}\` tracks\n` : '') +
                `**Status** — ${wasEmpty ? '▶️ Now Playing' : '📋 Added to Queue'}\n` +
                `-# Loaded by ${message.author.username}`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      console.error('[pl-load]', err);
      return reply(message, `**${emoji.cross} Failed to load playlist. Please try again.**`);
    }
  },
};
