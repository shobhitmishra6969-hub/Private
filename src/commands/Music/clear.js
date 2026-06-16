'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const emoji = require('../../emojis');

module.exports = {
  name: 'clear',
  aliases: ['cq'],
  category: 'Music',
  cooldown: 3,
  description: 'Removes all songs in the music queue.',
  args: false,
  usage: '',
  userPerms: [],
  owner: false,
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
      });
    }

    const count = player.queue.size;
    player.queue.clear();

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.clear} Queue Cleared`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `Removed **${count}** track${count !== 1 ? 's' : ''} from the queue.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
