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
  name: 'pl-delete',
  aliases: ['pldelete', 'playlist-delete'],
  category: 'Playlist',
  description: 'Delete one of your playlists',
  usage: '<name>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const name = args.join(' ').trim();
    if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-delete <name>\``);

    const doc = await getUserData(message.author.id);
    const pl  = findPlaylist(doc, name);
    if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

    const confirmPanel = new ContainerBuilder()
      .setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### ⚠️ Confirm Deletion')
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Delete **\`${pl.name}\`**? This will remove **${pl.tracks.length} track(s)** permanently.\n` +
          `-# You have 30 seconds to confirm.`
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pl_del_confirm').setLabel('Delete').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('pl_del_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        )
      );

    const sent = await message.reply({ components: [confirmPanel], flags: MessageFlags.IsComponentsV2 });

    const collector = sent.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 30000,
      max: 1,
    });

    collector.on('collect', async i => {
      if (i.customId === 'pl_del_confirm') {
        const fresh = await getUserData(message.author.id);
        fresh.playlists = fresh.playlists.filter(p => p.name.toLowerCase() !== pl.name.toLowerCase());
        await fresh.save();

        await i.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x7B2FBE)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `### 🗑️ Playlist Deleted\n**\`${pl.name}\`** has been permanently deleted.`
                )
              ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        await i.update({
          components: [
            new ContainerBuilder()
              .setAccentColor(0x7B2FBE)
              .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${emoji.cross} Deletion cancelled.**`)
              ),
          ],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') sent.edit({ components: [] }).catch(() => {});
    });
  },
};
