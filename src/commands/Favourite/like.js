'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const Liked = require('../../schema/liked.js');
const emoji = require('../../emojis');

function reply(message, content) {
  return message.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

module.exports = {
  name: 'like',
  category: 'Favourite',
  description: 'Add current song to your favorites',
  args: false,
  usage: '',
  aliases: ['fav', 'favourite', 'favorite'],
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
      return reply(message, `**${emoji.cross} Nothing is playing right now.**`);
    }

    const song   = player.queue.current;
    const userId = message.author.id;

    try {
      let userLiked = await Liked.findOne({ userId });
      if (!userLiked) {
        await Liked.create({ userId, songs: JSON.stringify([]) });
        userLiked = await Liked.findOne({ userId });
      }

      const songExists = userLiked.songs.find(s => s.url === song.uri);
      if (songExists) {
        return reply(message, `**${emoji.info} Already in your favourites!**\n-# [${song.title}](${song.uri})`);
      }

      userLiked.songs.push({
        title:     song.title,
        url:       song.uri,
        duration:  song.length || song.duration,
        thumbnail: song.thumbnail,
        author:    song.author,
      });
      await userLiked.save();

      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`### ${emoji.like} Added to Favourites`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**[${song.title}](${song.uri})**\n-# ${song.author}`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (err) {
      console.error(err);
      return reply(message, `**${emoji.cross} An error occurred while saving to favourites.**`);
    }
  },
};
