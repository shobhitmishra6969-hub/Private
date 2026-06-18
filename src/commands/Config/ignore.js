'use strict';
const {
  PermissionsBitField,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const IgnoreChannelModel = require('../../schema/ignorechannel');
const emoji = require('../../emojis');

async function buildPanel(guild) {
  const ignored = await IgnoreChannelModel.find({ guildId: guild.id });
  const validIgnored = ignored.filter(d => guild.channels.cache.has(d.channelId));

  const ignoredText = validIgnored.length
    ? validIgnored.map(d => `<#${d.channelId}>`).join('  ')
    : '*None — bot responds in all channels*';

  const headerDisplay = new TextDisplayBuilder().setContent(
    `**🔇 Ignored Channels**\n\n` +
    `Bot will not respond to commands in these channels:\n${ignoredText}\n\n` +
    `-# Use the menus below to add or remove channels.`
  );

  const addMenu = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('ignore_add_select')
      .setPlaceholder('➕  Select channels to ignore...')
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(10)
  );

  const components = [addMenu];

  if (validIgnored.length > 0) {
    const removeMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ignore_remove_select')
        .setPlaceholder('➖  Select channels to unignore...')
        .setMinValues(1)
        .setMaxValues(Math.min(validIgnored.length, 10))
        .addOptions(
          validIgnored.slice(0, 25).map(d => {
            const ch = guild.channels.cache.get(d.channelId);
            return new StringSelectMenuOptionBuilder()
              .setLabel(`#${ch?.name || d.channelId}`)
              .setValue(d.channelId)
              .setEmoji('🔇');
          })
        )
    );
    components.push(removeMenu);
  }

  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ignore_clear')
      .setLabel('Clear All')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(validIgnored.length === 0)
  );
  components.push(btnRow);

  const container = new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(headerDisplay)
    .addSeparatorComponents(new SeparatorBuilder());

  return { container, components };
}

module.exports = {
  buildPanel,
  name: 'ignore',
  aliases: ['ig'],
  category: 'Config',
  description: 'Manage channels where the bot ignores commands.',
  usage: '',
  userPerms: [],
  args: false,
  cooldown: 3,
  slashOptions: [],

  async execute(message, args, client) {
    if (!message.member.permissions.has(PermissionsBitField.resolve('ManageChannels'))) {
      const display = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} You need \`Manage Channels\` permission to use this command.**`);
      const container = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(display);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const { container, components } = await buildPanel(message.guild);
    return message.reply({
      components: [container, ...components],
      flags: MessageFlags.IsComponentsV2,
    });
  },

  async componentsV2(interaction, client) {
    if (interaction.customId === 'ignore_clear') {
      if (!interaction.member.permissions.has(PermissionsBitField.resolve('ManageChannels'))) {
        return interaction.reply({
          content: `**${emoji.warn} You need \`Manage Channels\` permission.**`,
          ephemeral: true,
        });
      }

      await interaction.deferUpdate().catch(() => {});
      await IgnoreChannelModel.deleteMany({ guildId: interaction.guildId });

      const { container, components } = await buildPanel(interaction.guild);
      await interaction.message.edit({
        components: [container, ...components],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});

      await interaction.followUp({
        content: `**${emoji.check} Cleared all ignored channels.**`,
        ephemeral: true,
      }).catch(() => {});
    }
  },
};
