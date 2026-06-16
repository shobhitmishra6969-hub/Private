'use strict';
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require('discord.js');
const setup = require('../../schema/setup');

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
  userPerms: [],
  owner: false,
  slashOptions: [],

  async execute(message, args, client) {
    const guild = message.guild;
    const current = await setup.findOne({ Guild: guild.id });
    const currentStyle = current?.npStyle || 'default';

    return message.reply({
      embeds: [buildPresetEmbed(currentStyle)],
      components: [buildSelectMenu(currentStyle)],
    });
  },
};
