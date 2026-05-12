const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const AfkSchema = require('../../schema/afk');
const emoji = require('../../emojis');

module.exports = {
  name: 'afk',
  aliases: ['away'],
  description: 'Set your AFK status with Server or Global mode.',
  category: 'Utility',
  args: false,
  usage: '[reason]',
  userPerms: [],
  owner: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) return await interaction.editReply(options);
        if (interaction.replied) return await interaction.followUp(options);
        return await interaction.reply(options);
      },
    };

    const args = [];
    if (interaction.options) {
      for (const option of interaction.options.data) {
        if (option.value !== undefined) args.push(option.value.toString());
      }
    }

    return this.execute(interactionWrapper, args, client);
  },

  async execute(message, args, client) {
    const rawReason = args.length > 0 ? args.join(' ') : 'AFK';
    const reason = rawReason.slice(0, 70);
    const userId = message.author.id;
    const guild = message.guild;

    const existing = await AfkSchema.findOne({ userId });

    const header = new TextDisplayBuilder().setContent(
      `### ${client.user.username} • AFK Setup\n` +
      `-# Please choose how you want your AFK to work.`
    );

    const sep1 = new SeparatorBuilder().setDivider(true);

    const infoLines = [
      `**Current Info:**`,
      `>  **Reason:** ${existing ? existing.reason : reason}`,
    ];
    if (existing) {
      infoLines.push(`>  **Mode:** ${existing.mode === 'global' ? 'Global AFK' : 'Server AFK'}`);
      infoLines.push(`>  **Set:** <t:${Math.floor(existing.createdAt.getTime() / 1000)}:R>`);
    }

    const infoText = new TextDisplayBuilder().setContent(infoLines.join('\n'));

    const sep2 = new SeparatorBuilder().setDivider(true);

    const modesText = new TextDisplayBuilder().setContent(
      `**Available Modes:**\n` +
      ` **Server AFK:** Only in ${guild.name}\n` +
      ` **Global AFK:** In all shared servers`
    );

    const sep3 = new SeparatorBuilder().setDivider(true);

    const footer = new TextDisplayBuilder().setContent(
      `-# AFK System • ${guild.name} | <t:${Math.floor(Date.now() / 1000)}:t>`
    );

    const serverBtnId = `afk_server_${userId}_${reason}`;
    const globalBtnId = `afk_global_${userId}_${reason}`;
    const closeBtnId  = `afk_close_${userId}`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(serverBtnId.slice(0, 100))
        .setLabel('Server AFK')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(globalBtnId.slice(0, 100))
        .setLabel('Global AFK')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(closeBtnId)
        .setLabel('✕')
        .setStyle(ButtonStyle.Danger),
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(sep1)
      .addTextDisplayComponents(infoText)
      .addSeparatorComponents(sep2)
      .addTextDisplayComponents(modesText)
      .addSeparatorComponents(sep3)
      .addTextDisplayComponents(footer);

    await message.reply({
      components: [container, row],
      flags: MessageFlags.IsComponentsV2,
    });
  },

  async componentsV2(interaction, client) {
    const parts  = interaction.customId.split('_');
    const action = parts[1];
    const userId = parts[2];

    if (interaction.user.id !== userId) {
      return interaction.reply({
        content: `**${emoji.cross} This is not your AFK menu.**`,
        ephemeral: true,
      });
    }

    if (action === 'close') {
      return interaction.message.delete().catch(() => {});
    }

    // Step 1: user chose server or global → ask about DM notifications
    if (action === 'server' || action === 'global') {
      const reason = parts.slice(3).join('_') || 'AFK';
      const mode   = action;
      const modeLabel = mode === 'global' ? 'Global AFK' : `Server AFK`;

      const dmHeader = new TextDisplayBuilder().setContent(
        `### ${emoji.check} ${modeLabel} Selected\n\n` +
        `Did you want to get messages in your **DM** while you're AFK?\n\n` +
        `> Choose your preference below`
      );

      const sep = new SeparatorBuilder().setDivider(true);

      const footer = new TextDisplayBuilder().setContent(
        `-# Requested by: ${interaction.user.username}`
      );

      const yesBtnId = `afk_dmyes_${userId}_${mode}_${reason}`.slice(0, 100);
      const noBtnId  = `afk_dmno_${userId}_${mode}_${reason}`.slice(0, 100);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(yesBtnId)
          .setLabel('Yes')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(noBtnId)
          .setLabel('No')
          .setStyle(ButtonStyle.Danger),
      );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(dmHeader)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(footer);

      return interaction.update({
        components: [container, row],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // Step 2: user chose Yes or No for DM notifications
    if (action === 'dmyes' || action === 'dmno') {
      const mode     = parts[3];
      const reason   = parts.slice(4).join('_') || 'AFK';
      const dmNotify = action === 'dmyes' ? 1 : 0;
      const guildId  = mode === 'server' ? interaction.guild.id : null;

      const existing = await AfkSchema.findOne({ userId });
      if (existing) {
        existing.guildId   = guildId;
        existing.mode      = mode;
        existing.reason    = reason;
        existing.dmNotify  = dmNotify;
        existing.createdAt = new Date();
        await existing.save();
      } else {
        await AfkSchema.create({
          userId,
          guildId,
          mode,
          reason,
          dmNotify,
          createdAt: Date.now(),
        });
      }

      const modeLabel    = mode === 'global' ? 'Global AFK' : `Server AFK`;
      const dmStatus     = dmNotify ? 'Enabled' : 'Disabled';

      const confirmText = new TextDisplayBuilder().setContent(
        `### ${emoji.check} AFK Activated\n\n` +
        `**${interaction.user.username}** Your AFK status is now set to **${modeLabel}**\n` +
        `**Reason:** ${reason}\n` +
        `**DM Notifications:** ${dmStatus}\n\n` +
        `> You are now away from keyboard.`
      );

      const sep = new SeparatorBuilder().setDivider(true);

      const footer = new TextDisplayBuilder().setContent(
        `-# AFK System • ${interaction.guild.name}`
      );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(confirmText)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(footer);

      await interaction.update({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      setTimeout(() => interaction.message.delete().catch(() => {}), 6000);
    }
  },
};
