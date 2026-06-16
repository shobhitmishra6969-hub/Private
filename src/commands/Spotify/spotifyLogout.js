'use strict';
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const SpotifyProfile = require('../../schema/spotifyprofile');

function reply(payload, content) {
  return payload.edit({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content)),
    ],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

module.exports = {
  name: 'spotify-logout',
  aliases: ['spotifylogout', 'sp-logout', 'spunlink', 'spotify-unlink'],
  category: 'Spotify',
  description: 'Unlink your Spotify account from the bot.',
  cooldown: 5,
  args: false,
  usage: '',

  async slashExecute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: `Please use the prefix command \`${client.prefix}spotify-logout\` in a text channel.` });
  },

  async execute(message, args, client) {
    const existing = await SpotifyProfile.findOne({ userId: message.author.id });

    if (!existing) {
      return message.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**You don't have a Spotify account linked.**\n-# Run \`${client.prefix}spotify-login\` to link one.`
              )
            ),
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const displayName = existing.displayName || existing.spotifyUserId || 'your account';
    const profileUrl  = existing.profileUrl || `https://open.spotify.com/user/${existing.spotifyUserId}`;

    const confirmPanel = new ContainerBuilder()
      .setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('### ⚠️ Unlink Spotify Account?')
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `Unlink **[${displayName}](${profileUrl})** from your Discord account?\n` +
          `This removes your saved Spotify data. You can re-link anytime.\n` +
          `-# This confirmation expires in 30 seconds.`
        )
      )
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('spotify_logout_confirm').setLabel('Yes, Unlink').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
          new ButtonBuilder().setCustomId('spotify_logout_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        )
      );

    const prompt = await message.reply({ components: [confirmPanel], flags: MessageFlags.IsComponentsV2 });

    let interaction;
    try {
      interaction = await prompt.awaitMessageComponent({
        filter: i => i.user.id === message.author.id,
        time: 30_000,
      });
    } catch {
      return reply(prompt, '**Unlink cancelled** — confirmation timed out.');
    }

    await interaction.deferUpdate();

    if (interaction.customId === 'spotify_logout_cancel') {
      return reply(prompt, '**Unlink cancelled.**');
    }

    try {
      await SpotifyProfile.deleteOne({ userId: message.author.id });
    } catch (err) {
      console.error('[Spotify Logout] DB delete error:', err.message);
      return reply(prompt, '**Failed to unlink your account. Please try again.**');
    }

    return prompt.edit({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### ✅ Spotify Unlinked')
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${displayName}** has been unlinked from your Discord account.\n` +
              `-# Run \`${client.prefix}spotify-login\` to link a new account.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  },
};
