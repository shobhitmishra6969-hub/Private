'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const UserPrefs = require('../../schema/userpreferences.js');
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
  name: 'bioset',
  aliases: ['setbio', 'bio'],
  category: 'Profile',
  description: 'Set your profile bio',
  usage: '<bio text>',
  userPerms: [],
  owner: false,

  async execute(message, args, client) {
    const bio = args.join(' ').trim();

    if (!bio) {
      const prefs = await UserPrefs.findOne({ userId: message.author.id });
      const current = prefs?.bio || null;
      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent('### 📝 Your Bio')
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                current
                  ? current
                  : `-# No bio set. Use \`${client.prefix}bioset <text>\` to set one.`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (bio.length > 200) {
      return reply(message, `**${emoji.cross} Bio must be 200 characters or fewer.** Yours is \`${bio.length}\` chars.`);
    }

    await UserPrefs.findOneAndUpdate(
      { userId: message.author.id },
      { userId: message.author.id, bio, updatedAt: Date.now() },
      { upsert: true }
    );

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.check} Bio Updated`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${bio}\n\n-# Updated by ${message.author.username}`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
