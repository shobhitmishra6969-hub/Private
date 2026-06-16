'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { getUserData } = require('../../utils/playlistHelper');

module.exports = {
  name: 'playlist',
  aliases: ['pl'],
  category: 'Playlist',
  description: 'Manage your personal playlists',
  usage: '',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const doc       = await getUserData(message.author.id);
    const playlists = doc.playlists || [];
    const prefix    = client.prefix || '>';

    const buildMain = (list) => {
      const listBody = list.length === 0
        ? `-# No playlists yet. Create one with \`${prefix}pl-create <name>\``
        : list.map((p, i) =>
            `**${i + 1}.** \`${p.name}\` — ${p.tracks.length} track${p.tracks.length !== 1 ? 's' : ''}`
          ).join('\n');

      return new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`### 🎵 ${message.author.username}'s Playlists`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(listBody)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ${list.length}/10 playlists used`)
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pl_list').setLabel('Refresh').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pl_help').setLabel('Commands').setEmoji('❓').setStyle(ButtonStyle.Secondary),
          )
        );
    };

    const sent = await message.reply({
      components: [buildMain(playlists)],
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 60000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'pl_list') {
        const fresh = await getUserData(message.author.id);
        await i.update({ components: [buildMain(fresh.playlists || [])], flags: MessageFlags.IsComponentsV2 });
      } else if (i.customId === 'pl_help') {
        await i.reply({
          content: [
            `**📋 Playlist Commands**`,
            `\`${prefix}pl-create <name>\` — Create`,
            `\`${prefix}pl-delete <name>\` — Delete`,
            `\`${prefix}pl-add <name> <song>\` — Add song`,
            `\`${prefix}pl-addnowplaying <name>\` — Add current`,
            `\`${prefix}pl-addqueue <name>\` — Add queue`,
            `\`${prefix}pl-removetrack <name> <#>\` — Remove track`,
            `\`${prefix}pl-dupes <name>\` — Remove dupes`,
            `\`${prefix}pl-info <name>\` — Info`,
            `\`${prefix}pl-list\` — List all`,
            `\`${prefix}pl-load <name>\` — Load into queue`,
          ].join('\n'),
          ephemeral: true,
        });
      }
    });

    collector.on('end', () => {
      sent.edit({ components: [] }).catch(() => {});
    });
  },
};
