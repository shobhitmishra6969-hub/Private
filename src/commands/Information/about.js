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
const config = require('../../config.js');

module.exports = {
  name: 'sourcecode',
  aliases: ['about', 'src', 'source'],
  description: 'Get the source code download link.',
  category: 'Information',
  args: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    await interaction.editReply(this._build());
  },

  async execute(message, args, client) {
    return message.reply(this._build());
  },

  _build() {
    const url = config.links?.sourcecode || 'https://github.com/';
    return {
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '### 💾 Source Code\n' +
              '-# Download or explore the bot\'s full source code.'
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              'Click the button below to access the source code repository.'
            )
          )
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel('Download Source')
                .setStyle(ButtonStyle.Link)
                .setURL(url)
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    };
  },
};
