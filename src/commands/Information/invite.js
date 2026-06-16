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

module.exports = {
  name: 'invite',
  category: 'Information',
  description: "Get the bot's invite link",
  aliases: ['inv'],
  cooldown: 5,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) return interaction.editReply(options);
        else if (interaction.replied) return interaction.followUp(options);
        else return interaction.reply(options);
      },
    };
    return this.execute(interactionWrapper, [], client);
  },

  async execute(message, args, client) {
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '### 📨 Invite Tone Vibes\n' +
              '-# Add the bot to your server and start listening instantly.'
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${emoji.dot} **Lag-free** high-quality audio streaming\n` +
              `${emoji.dot} **Smart filters** — bass, treble, 8D, and more\n` +
              `${emoji.dot} **Playlists**, favourites & Spotify support\n` +
              `${emoji.dot} **24/7** with autoplay & sleep timer`
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel('Invite Bot')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
