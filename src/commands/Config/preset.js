const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const setup = require('../../schema/setup');
const emoji = require('../../emojis');

const VALID_STYLES = ['default', 'card'];

const STYLE_NAMES = {
  default: 'Default (Components UI)',
  card: 'Card (Canvas Image)',
};

const STYLE_DESC = {
  default: 'Discord Components UI',
  card: 'Canvas Image Card',
};

module.exports = {
  name: 'preset',
  category: 'Config',
  aliases: ['npstyle', 'nowplayingstyle'],
  description: 'Set the now-playing display style for this server.',
  args: false,
  usage: '[default|card]',
  userPerms: [],
  owner: false,
  slashOptions: [],

  async execute(message, args, client) {
    const guild = message.guild;
    const style = args[0]?.toLowerCase();

    const current = await setup.findOne({ Guild: guild.id });
    const currentStyle = current?.npStyle || 'default';

    if (!style) {
      const infoText =
        `**<:Arrow_arrow:1484506070935273563> Current Now-Playing Style**\n\n` +
        `<:dots:1484507998695985173> **Style:** ${STYLE_NAMES[currentStyle]}\n\n` +
        `**<:dots:1484507998695985173> Available Styles:**\n` +
        VALID_STYLES.map(s => `• \`${s}\` - ${STYLE_DESC[s]}`).join('\n') +
        `\n\n**<:dots:1484507998695985173> Usage:** \`${client.prefix}preset <style>\`\n\n` +
        `**<:dots:1484507998695985173> Examples:**\n` +
        `\`${client.prefix}preset card\`\n` +
        `\`${client.prefix}preset default\``;

      const display = new TextDisplayBuilder().setContent(infoText);
      const container = new ContainerBuilder().addTextDisplayComponents(display);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (!VALID_STYLES.includes(style)) {
      const errorText =
        `**${emoji.cross} Invalid style \`${style}\`.**\n\n` +
        `Available styles: ${VALID_STYLES.map(s => `\`${s}\``).join(', ')}`;

      const display = new TextDisplayBuilder().setContent(errorText);
      const container = new ContainerBuilder().addTextDisplayComponents(display);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (style === currentStyle) {
      const sameText =
        `**${emoji.info} The now-playing style is already set to \`${STYLE_NAMES[style]}\`.**`;

      const display = new TextDisplayBuilder().setContent(sameText);
      const container = new ContainerBuilder().addTextDisplayComponents(display);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    await setup.findOneAndUpdate(
      { Guild: guild.id },
      { Guild: guild.id, npStyle: style, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    const featureLines = {
      default: [
        '<:dots:1484507998695985173> Rich Discord Components layout',
        '<:dots:1484507998695985173> Inline track thumbnail',
        '<:dots:1484507998695985173> Playback control buttons',
        '<:dots:1484507998695985173> Live progress updates',
      ],
      card: [
        '<:dots:1484507998695985173> Professional canvas image',
        '<:dots:1484507998695985173> Album artwork display',
        '<:dots:1484507998695985173> Visual progress bar',
        '<:dots:1484507998695985173> Modern gradient design',
      ],
    };

    const successText =
      `**${emoji.check} Now-Playing Style Updated**\n\n` +
      `**Old Style:** ${STYLE_NAMES[currentStyle]}\n` +
      `**New Style:** ${STYLE_NAMES[style]}\n\n` +
      `<:Arrow_arrow:1484506070935273563> The new ${style === 'card' ? 'canvas card' : 'components'} style will be used for the next track!\n\n` +
      `**Features:**\n` +
      featureLines[style].join('\n');

    const display = new TextDisplayBuilder().setContent(successText);
    const sep = new SeparatorBuilder().setDivider(true);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(display)
      .addSeparatorComponents(sep);

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
