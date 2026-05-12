const {
  WebhookClient,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  AuditLogEvent
} = require("discord.js");
const config = require("../../config.js");
const {
  Webhooks: { guild_join },
  links: { support }
} = config;

const moment = require("moment");

module.exports = {
  name: "guildCreate",
  run: async (client, guild) => {
    const own = await guild.fetchOwner().catch(() => null);

    const vanity = guild.vanityURLCode
      ? `[Here is ${guild.name} invite](https://discord.gg/${guild.vanityURLCode})`
      : `No vanity URL`;

    const embed = new EmbedBuilder()
      .setColor(client.color)
      .setThumbnail(guild.iconURL({ size: 1024 }))
      .setDescription(
        `**${client.emoji.check} Joined a Guild**\n\n` +
        `**${client.emoji.dot} Server Name:** \`${guild.name}\` \n` +
        `**${client.emoji.dot} Server ID:** \`${guild.id}\` \n` +
        `**${client.emoji.dot} Server Owner:** \`${own?.user?.username || "Unknown"}\` (${own?.id || "N/A"}) \n` +
        `**${client.emoji.dot} Member Count:** \`${guild.memberCount}\` Members \n` +
        `**${client.emoji.dot} Creation Date:** \`${moment.utc(guild.createdAt).format("DD/MMM/YYYY")}\` \n` +
        `**${client.emoji.dot} Guild Invite:** ${vanity} \n` +
        `**${client.emoji.dot} Total Servers:** \`${client.guilds.cache.size}\``
      )
      .setFooter({
        text: `Total Server Count [ ${client.guilds.cache.size} ]`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setTimestamp();

    if (guild_join && guild_join.startsWith("https://discord.com/api/webhooks/")) {
      const web = new WebhookClient({ url: guild_join });
      web.send({ embeds: [embed] }).catch(() => { });
    }

    try {
      if (own && own.user) {
        const recipient = own.user;

        const welcomeHeader = new TextDisplayBuilder()
          .setContent(`### ${client.emoji.check} Thank you for choosing ${client.user.username}!`);

        const separator1 = new SeparatorBuilder();

        const infoDisplay = new TextDisplayBuilder()
          .setContent(
            `${client.user.username} has been successfully added to \`${guild.name}\`\n\n` +
            `You can report any issues at my **[Support Server](${support})** following the needed steps. You can also reach out to my **[Developers](${support})** if you want to know more about me.`
          );

        const separator2 = new SeparatorBuilder();

        const supportButton = new ButtonBuilder()
          .setLabel('Support Server')
          .setStyle(ButtonStyle.Link)
          .setURL(support);

        const buttonRow = new ActionRowBuilder()
          .addComponents(supportButton);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(welcomeHeader)
          .addSeparatorComponents(separator1)
          .addTextDisplayComponents(infoDisplay)
          .addSeparatorComponents(separator2)
          .addActionRowComponents(buttonRow);

        await recipient.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        }).catch((err) => {
          console.log(`Could not send welcome DM to ${recipient.username}: ${err.message}`);
        });
      }
    } catch (error) {
      console.error('Error sending welcome DM:', error);
    }

    try {
      const prefix = config.prefix || ">";
      const inviteUrl = config.links?.invite || "https://discord.com/api/oauth2/authorize";
      const botName = client.user.username;

      const channelHeader = new TextDisplayBuilder()
        .setContent(`### Thanks for adding me to your server!`);

      const channelBody = new TextDisplayBuilder()
        .setContent(
          `To get started, join a voice channel and type \`/play\` to play a song.\n\n` +
          `If you have any questions or need help, join my **[Support Server](${support})**.\n\n` +
          `-# ${botName} • High Quality Music`
        );

      const supportBtn = new ButtonBuilder()
        .setLabel('Support Server')
        .setURL(support)
        .setStyle(ButtonStyle.Link);

      const btnComponents = [supportBtn];

      if (inviteUrl && inviteUrl.startsWith('https://')) {
        const inviteBtn = new ButtonBuilder()
          .setLabel('Invite Bot')
          .setURL(inviteUrl)
          .setStyle(ButtonStyle.Link);
        btnComponents.push(inviteBtn);
      }

      const channelContainer = new ContainerBuilder()
        .addTextDisplayComponents(channelHeader)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(channelBody)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(...btnComponents)
        );

      const systemChannel = guild.systemChannel
        || guild.channels.cache
            .filter(c => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('SendMessages'))
            .sort((a, b) => a.rawPosition - b.rawPosition)
            .first();

      if (systemChannel) {
        await systemChannel.send({
          components: [channelContainer],
          flags: MessageFlags.IsComponentsV2,
        }).catch((err) => {
          console.log(`Could not send welcome channel message: ${err.message}`);
        });
      }
    } catch (error) {
      console.error('Error sending welcome channel message:', error);
    }
  },
};
