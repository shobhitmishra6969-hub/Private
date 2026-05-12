const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');
const SpotifyProfile = require('../../schema/spotifyprofile');

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
      const notLinkedEmbed = new EmbedBuilder()
        .setColor('#E31B23')
        .setDescription("**You don't have a Spotify account linked to the bot.**\n\nRun `" + client.prefix + "spotify-login` to link one.");
      return message.reply({ embeds: [notLinkedEmbed] });
    }

    const displayName = existing.displayName || existing.spotifyUserId || 'your account';
    const profileUrl = existing.profileUrl || `https://open.spotify.com/user/${existing.spotifyUserId}`;

    const confirmEmbed = new EmbedBuilder()
      .setColor('#E31B23')
      .setTitle('⚠️ Unlink Spotify Account?')
      .setDescription(
        `Are you sure you want to unlink **[${displayName}](${profileUrl})** from the bot?\n\n` +
        `This will remove your saved Spotify data. You can re-link at any time with \`${client.prefix}spotify-login\`.`
      )
      .setThumbnail(existing.avatarUrl || null)
      .setFooter({ text: 'This confirmation expires in 30 seconds.' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('spotify_logout_confirm')
        .setLabel('Yes, Unlink')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️'),
      new ButtonBuilder()
        .setCustomId('spotify_logout_cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary),
    );

    const prompt = await message.reply({ embeds: [confirmEmbed], components: [row] });

    let interaction;
    try {
      interaction = await prompt.awaitMessageComponent({
        filter: i => i.user.id === message.author.id,
        time: 30_000,
      });
    } catch {
      return prompt.edit({
        embeds: [new EmbedBuilder().setColor('#5c5c5c').setDescription('**Unlink cancelled** — confirmation timed out.')],
        components: [],
      }).catch(() => {});
    }

    await interaction.deferUpdate();

    if (interaction.customId === 'spotify_logout_cancel') {
      return prompt.edit({
        embeds: [new EmbedBuilder().setColor('#5c5c5c').setDescription('**Unlink cancelled.**')],
        components: [],
      }).catch(() => {});
    }

    try {
      await SpotifyProfile.deleteOne({ userId: message.author.id });
    } catch (err) {
      console.error('[Spotify Logout] DB delete error:', err.message);
      return prompt.edit({
        embeds: [new EmbedBuilder().setColor('#E31B23').setDescription('**Failed to unlink your account. Please try again.**')],
        components: [],
      }).catch(() => {});
    }

    const successEmbed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('✅ Spotify Unlinked')
      .setDescription(
        `**${displayName}** has been unlinked from your Discord account.\n\n` +
        `-# Run \`${client.prefix}spotify-login\` to link a new account.`
      );

    return prompt.edit({ embeds: [successEmbed], components: [] }).catch(() => {});
  },
};
