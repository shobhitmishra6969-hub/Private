'use strict';
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  AttachmentBuilder,
  ComponentType,
} = require('discord.js');
const setup = require('../../schema/setup');
const { generateStylePreview, PREVIEW_DATA } = require('../../utils/styleCards');

const STYLES = [
  { value: 'default',   label: 'Default',      emoji: '🎵', description: 'Classic layout with progress bar' },
  { value: 'basic',     label: 'Basic',         emoji: '✨', description: 'Simple and clean design' },
  { value: 'detailed',  label: 'Detailed',      emoji: '📋', description: 'Extended track information' },
  { value: 'dynamic',   label: 'Dynamic',       emoji: '⚡', description: 'Interactive with queue preview' },
  { value: 'aesthetic', label: 'Aesthetic',     emoji: '🌸', description: 'Visually enhanced layout' },
  { value: 'midnight',  label: 'Midnight',      emoji: '🌙', description: 'Dark console layout with tight stats' },
  { value: 'gallery',   label: 'Gallery',       emoji: '🖼️', description: 'Artwork-first cover showcase' },
  { value: 'broadcast', label: 'Broadcast',     emoji: '📻', description: 'Clean live-radio style card' },
  { value: 'luxe',      label: 'Luxe',          emoji: '💎', description: 'Compact gold-accent premium style' },
  { value: 'card',      label: 'Canvas Luxe',   emoji: '🎨', description: 'Full PNG canvas now-playing card' },
];

function buildPresetEmbed(currentStyle) {
  const current = STYLES.find(s => s.value === currentStyle) || STYLES[0];
  const styleList = STYLES.map(s => `• **${s.label}** — ${s.description}`).join('\n');
  return new EmbedBuilder()
    .setTitle('Player Style Configuration')
    .setDescription(
      `Select a style for the music player from the dropdown below.\n\n` +
      `**Current Style: ${current.label}**\n` +
      `**Available Styles:**\n${styleList}`
    )
    .setColor(0x2b2d31);
}

function buildSelectMenu(currentStyle) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('preset_style_select')
      .setPlaceholder('Select a player style...')
      .addOptions(
        STYLES.map(s =>
          new StringSelectMenuOptionBuilder()
            .setLabel(s.label)
            .setValue(s.value)
            .setDescription(s.description)
            .setEmoji(s.emoji)
            .setDefault(s.value === currentStyle)
        )
      )
  );
}

module.exports = {
  name: 'preset',
  category: 'Config',
  aliases: ['npstyle', 'nowplayingstyle'],
  description: 'Set the now-playing display style for this server.',
  args: false,
  usage: '[style]',
  userPerms: ['ManageGuild'],
  owner: false,
  slashOptions: [],

  async execute(message, args, client) {
    const guild = message.guild;
    const current = await setup.findOne({ Guild: guild.id });
    const currentStyle = current?.npStyle || 'default';

    const sent = await message.reply({
      embeds: [buildPresetEmbed(currentStyle)],
      components: [buildSelectMenu(currentStyle)],
    });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000,
      filter: (i) => i.user.id === message.author.id,
    });

    collector.on('collect', async (interaction) => {
      await interaction.deferUpdate();

      const chosen = interaction.values[0];
      const chosenStyle = STYLES.find(s => s.value === chosen) || STYLES[0];

      // Save to DB and generate canvas preview in parallel
      const [, previewBuf] = await Promise.all([
        setup.findOneAndUpdate(
          { Guild: guild.id },
          { Guild: guild.id, npStyle: chosen, updatedAt: Date.now() },
          { upsert: true, new: true }
        ),
        generateStylePreview(chosen, PREVIEW_DATA).catch(() => null),
      ]);

      const updatedEmbed = buildPresetEmbed(chosen);

      const confirmEmbed = new EmbedBuilder()
        .setDescription(`✅ Player style updated to **${chosenStyle.emoji} ${chosenStyle.label}**!\n-# Preview of how the now-playing card will look is shown below.`)
        .setColor(0x7B2FBE);

      if (previewBuf) {
        confirmEmbed.setImage('attachment://style-preview.png');
        await interaction.editReply({
          embeds: [updatedEmbed, confirmEmbed],
          components: [buildSelectMenu(chosen)],
          files: [new AttachmentBuilder(previewBuf, { name: 'style-preview.png' })],
        });
      } else {
        await interaction.editReply({
          embeds: [updatedEmbed, confirmEmbed],
          components: [buildSelectMenu(chosen)],
        });
      }

      collector.stop('selected');
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        sent.edit({ components: [] }).catch(() => {});
      }
    });
  },
};
