'use strict';
const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'skip',
  aliases: ['s'],
  category: 'Music',
  cooldown: 3,
  description: 'Skip the current song instantly.',
  botPrams: ['EMBED_LINKS'],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
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
    const player = client.manager.players.get(message.guild.id);

    if (!player.queue.current) {
      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`**${emoji.warn} Nothing is playing right now.**`)
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }

    const track = player.queue.current;
    await player.skip();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.skip} Skipped`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**[${track.title}](${track.uri})**\n-# ${track.author}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  },
};
