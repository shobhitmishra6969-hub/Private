'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const DJRole = require('../../schema/djrole');
const emoji = require('../../emojis');

module.exports = {
  name: 'djrole',
  category: 'Config',
  description: 'Set, remove, or view the DJ role for this server.',
  aliases: ['dj'],
  args: false,
  usage: '[@role | remove]',
  userPerms: ['ManageGuild'],
  owner: false,
  cooldown: 3,
  slashOptions: [
    {
      name: 'role',
      description: 'The role to set as DJ (leave empty to view current)',
      type: 8,
      required: false,
    },
    {
      name: 'remove',
      description: 'Remove the current DJ role',
      type: 5,
      required: false,
    },
  ],

  async slashExecute(interaction, client) {
    const role = interaction.options.getRole('role');
    const remove = interaction.options.getBoolean('remove');
    const args = [];
    if (remove) args.push('remove');
    else if (role) args.push(role.id);

    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      mentions: { roles: interaction.guild.roles.cache },
      reply: async (opts) => {
        if (interaction.deferred) return interaction.editReply(opts);
        if (interaction.replied) return interaction.followUp(opts);
        return interaction.reply(opts);
      },
    };
    return this.execute(wrapper, args, client, client.prefix);
  },

  async execute(message, args, client) {
    const guildId = message.guild.id;
    const current = await DJRole.findOne({ guildId });

    // ── No args: show current DJ role ────────────────────────────────────────
    if (!args.length) {
      let desc;
      if (current?.roleId) {
        const role = message.guild.roles.cache.get(current.roleId);
        desc = role
          ? `**${emoji.info} Current DJ role: ${role.toString()}**\n-# Members with this role can use music commands freely.`
          : `**${emoji.warn} DJ role is set but the role no longer exists. Use \`djrole remove\` to clear it.**`;
      } else {
        desc = `**${emoji.info} No DJ role set.**\n-# All members can use music commands.\nUse \`djrole @role\` to restrict music commands to a specific role.`;
      }

      const display = new TextDisplayBuilder().setContent(desc);
      const container = new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(display);

      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ── Remove ────────────────────────────────────────────────────────────────
    if (args[0].toLowerCase() === 'remove') {
      if (!current?.roleId) {
        const display = new TextDisplayBuilder()
          .setContent(`**${emoji.warn} No DJ role is currently set.**`);
        const container = new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(display);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }

      await DJRole.findOneAndUpdate(
        { guildId },
        { guildId, roleId: null, updatedAt: Date.now() },
        { upsert: true }
      );

      const display = new TextDisplayBuilder()
        .setContent(`**${emoji.check} DJ role removed. All members can now use music commands.**`);
      const container = new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(display);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    // ── Set role ──────────────────────────────────────────────────────────────
    const mentioned = message.mentions?.roles?.first?.()
      || (args[0] ? message.guild.roles.cache.get(args[0]) : null);

    if (!mentioned) {
      const display = new TextDisplayBuilder()
        .setContent(
          `**${emoji.warn} Please mention a valid role.**\n` +
          `-# Usage: \`djrole @role\` • \`djrole remove\` • \`djrole\` (view)`
        );
      const container = new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(display);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (mentioned.id === message.guild.id) {
      const display = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} You cannot set \`@everyone\` as the DJ role.**`);
      const container = new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(display);
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    await DJRole.findOneAndUpdate(
      { guildId },
      { guildId, roleId: mentioned.id, updatedAt: Date.now() },
      { upsert: true }
    );

    const display = new TextDisplayBuilder()
      .setContent(
        `**${emoji.check} DJ role set to ${mentioned.toString()}**\n` +
        `-# Only members with this role (and admins) can use music commands.`
      );
    const container = new ContainerBuilder()
      .setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(display);
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
