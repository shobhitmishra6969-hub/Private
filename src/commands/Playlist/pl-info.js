'use strict';
const emoji = require('../../emojis');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserData, findPlaylist } = require('../../utils/playlistHelper');

const PER_PAGE = 10;

function msToTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function buildPage(pl, page, author) {
  const totalPages   = Math.max(1, Math.ceil(pl.tracks.length / PER_PAGE));
  const start        = page * PER_PAGE;
  const slice        = pl.tracks.slice(start, start + PER_PAGE);
  const totalDur     = pl.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
  const createdTs    = pl.createdAt ? `<t:${Math.floor(pl.createdAt / 1000)}:R>` : 'Unknown';

  const trackList = slice.length === 0
    ? '-# No tracks yet.'
    : slice.map((t, i) =>
        `**${start + i + 1}.** [${t.title}](${t.url}) \`${msToTime(t.duration)}\``
      ).join('\n');

  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### 🎵 ${pl.name}\n` +
        `**Tracks** — \`${pl.tracks.length}\` • **Duration** — \`${msToTime(totalDur)}\` • **Created** — ${createdTs}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(trackList)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Page ${page + 1}/${totalPages} • Requested by ${author.username}`
      )
    );
}

function navRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pli_prev').setLabel('⏪').setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId('pli_page').setLabel(`${page + 1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId('pli_next').setLabel('⏩').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
  );
}

module.exports = {
  name: 'pl-info',
  aliases: ['plinfo', 'playlist-info'],
  category: 'Playlist',
  description: 'View details and track list of a playlist',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.cross} Usage:** \`${client.prefix}pl-info <playlist>\``))],
      flags: MessageFlags.IsComponentsV2,
    });

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl) return message.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.cross} Playlist \`${name}\` not found.**`))],
      flags: MessageFlags.IsComponentsV2,
    });

    let page = 0;
    const totalPages = Math.max(1, Math.ceil(pl.tracks.length / PER_PAGE));

    const payload = () => ({
      components: totalPages > 1
        ? [buildPage(pl, page, message.author).addActionRowComponents(navRow(page, totalPages))]
        : [buildPage(pl, page, message.author)],
      flags: MessageFlags.IsComponentsV2,
    });

    const sent = await message.reply(payload());
    if (totalPages <= 1) return;

    const collector = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'pli_prev') page = Math.max(0, page - 1);
      if (i.customId === 'pli_next') page = Math.min(totalPages - 1, page + 1);
      await i.update(payload());
    });

    collector.on('end', () => sent.edit({ components: [] }).catch(() => {}));
  },
};
