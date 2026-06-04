const {
  ContainerBuilder,
  TextDisplayBuilder,
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
    const container = this._build();
    const row = this._row();
    await interaction.editReply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client) {
    const container = this._build();
    const row = this._row();
    return message.reply({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
  },

  _build() {
    const text = new TextDisplayBuilder().setContent(
      'Click Below Button To Download My Source Code'
    );
    return new ContainerBuilder().addTextDisplayComponents(text);
  },

  _row() {
    const url = config.links?.sourcecode || 'https://github.com/';
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Download')
        .setStyle(ButtonStyle.Link)
        .setURL(url),
    );
  },
};
