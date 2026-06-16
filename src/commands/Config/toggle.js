'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const setup = require('../../schema/setup');
const emoji = require('../../emojis');

function makeContainer(content) {
  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
}

module.exports = {
  name: 'toggle',
  aliases: ['togglebuttons', 'tb'],
  category: 'Config',
  description: 'Toggle various bot settings for your server.',
  usage: '[247|preset|buttons]',
  userPerms: ['ManageGuild'],
  owner: false,
  slashOptions: [
    {
      name: 'setting',
      description: 'Which setting to toggle',
      type: 3,
      required: false,
      choices: [
        { name: '247 Mode',          value: '247'     },
        { name: 'Now-Playing Preset', value: 'preset'  },
        { name: 'Button Controls',   value: 'buttons'  },
      ],
    },
  ],

  async slashExecute(interaction, client) {
    const setting = interaction.options.getString('setting') || null;
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      reply: async (opts) => {
        if (interaction.deferred || interaction.replied) return interaction.editReply(opts);
        return interaction.reply(opts);
      },
    };
    return this.execute(wrapper, setting ? [setting] : [], client);
  },

  async execute(message, args, client) {
    const prefix = client.prefix || '-';
    const sub = args[0]?.toLowerCase();

    const menuPayload = {
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### ⚙️ Toggle Settings')
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${emoji.dot} \`${prefix}toggle 247\` — Toggle 24/7 mode\n` +
              `${emoji.dot} \`${prefix}toggle preset\` — Switch Now-Playing style\n` +
              `${emoji.dot} \`${prefix}toggle buttons\` — Toggle player button controls`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    };

    if (!sub) return message.reply(menuPayload);

    if (sub === '247') {
      const cmd = client.commands?.get('247');
      if (cmd) return cmd.execute(message, [], client, prefix);
      return message.reply({ components: [makeContainer(`${emoji.dot} Use \`${prefix}247\` to manage 24/7 mode.`)], flags: MessageFlags.IsComponentsV2 });
    }

    if (sub === 'preset') {
      const cmd = client.commands?.get('preset');
      if (cmd) return cmd.execute(message, [], client, prefix);
      return message.reply({ components: [makeContainer(`${emoji.dot} Use \`${prefix}preset\` to manage the now-playing style.`)], flags: MessageFlags.IsComponentsV2 });
    }

    if (sub === 'buttons') {
      const current = await setup.findOne({ Guild: message.guild.id });
      const buttonsEnabled = current?.buttons === undefined || current?.buttons === null
        ? true
        : Boolean(current.buttons);

      const buildPanel = (enabled) => new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent('### 🎛️ Button Controls')
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**Status** — ${enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
            `-# Toggle the interactive player buttons shown with now-playing messages.`
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('toggle_buttons_enable').setLabel('Enable').setStyle(ButtonStyle.Secondary).setDisabled(enabled),
            new ButtonBuilder().setCustomId('toggle_buttons_disable').setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!enabled),
          )
        );

      const sent = await message.reply({
        components: [buildPanel(buttonsEnabled)],
        flags: MessageFlags.IsComponentsV2,
      });

      const collector = sent.createMessageComponentCollector({
        componentType: ComponentType.Button,
        max: 1,
        time: 60000,
        filter: (i) => i.user.id === message.author.id,
      });

      collector.on('collect', async (i) => {
        await i.deferUpdate();
        const enabling = i.customId === 'toggle_buttons_enable';
        await setup.findOneAndUpdate(
          { Guild: message.guild.id },
          { Guild: message.guild.id, buttons: enabling ? 1 : 0, updatedAt: Date.now() },
          { upsert: true, new: true }
        );

        const updated = new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### 🎛️ Button Controls')
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**Status** — ${enabling ? '✅ Enabled' : '❌ Disabled'}\n` +
              `-# Updated by ${i.user.username}`
            )
          )
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('toggle_buttons_enable').setLabel('Enable').setStyle(ButtonStyle.Secondary).setDisabled(enabling),
              new ButtonBuilder().setCustomId('toggle_buttons_disable').setLabel('Disable').setStyle(ButtonStyle.Danger).setDisabled(!enabling),
            )
          );

        await i.editReply({ components: [updated], flags: MessageFlags.IsComponentsV2 });
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          sent.edit({
            components: [buildPanel(buttonsEnabled)],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      });

      return;
    }

    return message.reply(menuPayload);
  },
};
