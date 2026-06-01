const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
} = require('discord.js');

module.exports = {
  name: "setup",
  category: "Information",
  aliases: ["botinfo", "bi"],
  cooldown: 5,
  description: "Displays the bot's info panel with features and quick-action buttons.",
  slashOptions: [],

  async componentsV2(interaction, client) {
    const [, action] = interaction.customId.split('_');

    if (action === 'getstarted') {
      const replyDisplay = new TextDisplayBuilder()
        .setContent(
          `🎉 **Welcome to Tone Vibes!**\n\n` +
          `Join a voice channel and use \`/play <song name or URL>\` to start streaming.\n` +
          `Use \`/help\` to browse all ${client.commands.size} available commands.`
        );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(replyDisplay);

      return interaction.reply({
        components: [container],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      }).catch(() => {});
    }
  },

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) {
          return await interaction.editReply(options);
        } else if (interaction.replied) {
          return await interaction.followUp(options);
        } else {
          return await interaction.reply(options);
        }
      },
    };
    return this.execute(interactionWrapper, [], client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const inviteUrl =
      client.config.links?.invite ||
      `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot%20applications.commands`;

    const supportUrl =
      client.config.links?.support || 'https://discord.gg/your-invite-code';

    const imageUrl = client.config.links?.BG || null;

    const embed = new EmbedBuilder()
      .setColor(client.color || '#00D4FF')
      .setTitle(`🎵 Tone Vibes Info`)
      .setDescription(
        `Tone Vibes is the easiest way to listen to music with your friends on Discord.\n` +
        `Use \`/play\` to add tracks to the queue & \`/help\` to see the list of all commands.`
      )
      .addFields({
        name: 'Features:',
        value: [
          `🔵 High-quality music streaming`,
          `🔷 Easy-to-use commands`,
          `🟡 Optional no-command button system`,
          `🟢 24/7 uptime`,
        ].join('\n'),
      })
      .setFooter({
        text: `Tone Vibes • Vibe with the tone`,
        iconURL: client.user?.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    if (imageUrl) embed.setImage(imageUrl);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_getstarted')
        .setLabel('Get Started')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎵'),
      new ButtonBuilder()
        .setLabel('Add To Server')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl),
    );

    return message.reply({
      embeds: [embed],
      components: [row1, row2],
    });
  },
};
