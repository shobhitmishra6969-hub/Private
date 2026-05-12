const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    PermissionFlagsBits,
} = require('discord.js');
const GiveawayConfig = require('../../schema/giveawayconfig');
const GiveawayModel = require('../../schema/giveaway');
const emoji = require('../../emojis');
const { buildGiveawayEmbed } = require('./giveaway');

// ── Helpers ─────────────────────────────────────────────────────────────────

// Update all active giveaway messages in a guild to reflect the new config
async function syncActiveGiveawayEmbeds(client, guild, cfg) {
    try {
        const active = await GiveawayModel.find({ guildId: guild.id, ended: false, cancelled: false });
        for (const giveaway of active) {
            try {
                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (!channel) continue;
                const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (!msg) continue;
                await msg.edit({
                    content: `🎪 Ongoing Giveaway 🎪`,
                    embeds: [buildGiveawayEmbed(giveaway, guild, cfg)],
                    components: [],
                }).catch(() => {});
            } catch {}
        }
    } catch {}
}

async function getConfig(guildId) {
    let cfg = await GiveawayConfig.findOne({ guildId });
    if (!cfg) {
        cfg = await GiveawayConfig.create({
            guildId,
            theme: 'blue',
            dmNotifications: 0,
            defaultImage: null,
            managerRoles: [],
            updatedAt: Date.now(),
        });
    }
    return cfg;
}

function buildConfigDisplay(cfg, guild) {
    const themeEmoji   = cfg.theme === 'blue' ? '🟢' : '⚪';
    const themeName    = cfg.theme === 'blue' ? 'Blue Theme' : 'White Theme';
    const dmEmoji      = cfg.dmNotifications ? '🟢 Enabled' : '🔴 Disabled';
    const imageVal     = cfg.defaultImage ? `[Click to view](${cfg.defaultImage})` : 'None set';
    const roles        = Array.isArray(cfg.managerRoles) ? cfg.managerRoles : [];
    const rolesVal     = roles.length > 0 ? roles.map(r => `<@&${r}>`).join(', ') : 'None set';

    const configText =
        `### 🎁 Giveaway Configuration\n\n` +
        `**▷ Current Configuration:**\n\n` +
        `• **Theme:** ${themeEmoji} ${themeName}\n` +
        `• **DM Notifications:** ${dmEmoji}\n` +
        `• **Default Image:** ${imageVal}\n` +
        `• **Manager Roles:** ${rolesVal}\n\n` +
        `**📋 Features:**\n` +
        `— Choose between White or Blue giveaway theme\n` +
        `— Toggle DM notifications for entries/wins\n` +
        `— Set default image for all giveaways\n` +
        `— Configure manager roles for giveaway permissions\n` +
        `— Manager roles can create/manage giveaways`;

    return new TextDisplayBuilder().setContent(configText);
}

function buildNavRows(userId, guildId, cfg) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_theme_${userId}_${guildId}`)
            .setLabel(`Theme: ${cfg.theme === 'blue' ? 'Blue' : 'White'}`)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_toggledm_${userId}_${guildId}`)
            .setLabel('Toggle DM')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_setimage_${userId}_${guildId}`)
            .setLabel('Default Image')
            .setStyle(ButtonStyle.Secondary),
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_viewroles_${userId}_${guildId}`)
            .setLabel('Manager Roles')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_addroles_${userId}_${guildId}`)
            .setLabel('Add Manager Roles')
            .setStyle(ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_removeroles_${userId}_${guildId}`)
            .setLabel('Remove Manager Roles')
            .setStyle(ButtonStyle.Secondary),
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_resetimage_${userId}_${guildId}`)
            .setLabel('Reset Default Image')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`giveawayconfig_resetroles_${userId}_${guildId}`)
            .setLabel('Reset Manager Roles')
            .setStyle(ButtonStyle.Danger),
    );

    return [row1, row2, row3, row4];
}

function makeReply(text) {
    const display = new TextDisplayBuilder().setContent(text);
    const container = new ContainerBuilder().addTextDisplayComponents(display);
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
}

// ── Module ───────────────────────────────────────────────────────────────────

module.exports = {
    name: 'giveawayconfig',
    aliases: ['gwconfig', 'gcfg'],
    description: 'Configure giveaway settings for this server.',
    category: 'Giveaway',
    usage: '',
    args: false,
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const isManager = message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
            message.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!isManager) {
            return message.reply(makeReply(`**${emoji.cross} You need \`Manage Server\` permission to use this command.**`));
        }

        const cfg = await getConfig(message.guild.id);
        const display = buildConfigDisplay(cfg, message.guild);
        const sep = new SeparatorBuilder().setDivider(true);
        const container = new ContainerBuilder()
            .addTextDisplayComponents(display)
            .addSeparatorComponents(sep);

        const rows = buildNavRows(message.author.id, message.guild.id, cfg);

        return message.reply({
            components: [container, ...rows],
            flags: MessageFlags.IsComponentsV2,
        });
    },

    async componentsV2(interaction, client) {
        const parts   = interaction.customId.split('_');
        const action  = parts[1];
        const userId  = parts[2];
        const guildId = parts[3];

        if (interaction.user.id !== userId) {
            return interaction.reply({
                content: `**${emoji.cross} This menu belongs to someone else.**`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const isManager = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
            interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

        if (!isManager) {
            return interaction.reply({
                content: `**${emoji.cross} You need \`Manage Server\` permission.**`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const cfg = await getConfig(guildId);

        // ── Theme toggle ──
        if (action === 'theme') {
            cfg.theme = cfg.theme === 'blue' ? 'white' : 'blue';
            cfg.updatedAt = Date.now();
            await cfg.save();

            syncActiveGiveawayEmbeds(client, interaction.guild, cfg).catch(() => {});
            return refreshPanel(interaction, cfg);
        }

        // ── Toggle DM ──
        if (action === 'toggledm') {
            cfg.dmNotifications = cfg.dmNotifications ? 0 : 1;
            cfg.updatedAt = Date.now();
            await cfg.save();

            return refreshPanel(interaction, cfg);
        }

        // ── View Manager Roles ──
        if (action === 'viewroles') {
            const roles = Array.isArray(cfg.managerRoles) ? cfg.managerRoles : [];
            const val   = roles.length > 0 ? roles.map(r => `<@&${r}>`).join('\n') : 'No manager roles set.';

            return interaction.reply({
                content: `**Manager Roles:**\n${val}`,
                flags: MessageFlags.Ephemeral,
            });
        }

        // ── Add Manager Roles ──
        if (action === 'addroles') {
            await interaction.reply({
                content: `**Mention the role(s) you want to add as giveaway managers.** (e.g. \`@GiveawayManager\`)\nYou have 30 seconds.`,
                flags: MessageFlags.Ephemeral,
            });

            const filter = (m) => m.author.id === userId && m.mentions.roles.size > 0;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
                .catch(() => null);

            if (!collected) {
                return interaction.followUp({ content: `**Timed out. No roles added.**`, flags: MessageFlags.Ephemeral });
            }

            const msg      = collected.first();
            const newRoles = [...(Array.isArray(cfg.managerRoles) ? cfg.managerRoles : [])];

            msg.mentions.roles.each(role => {
                if (!newRoles.includes(role.id)) newRoles.push(role.id);
            });

            cfg.managerRoles = newRoles;
            cfg.updatedAt = Date.now();
            await cfg.save();
            msg.delete().catch(() => {});

            const added = msg.mentions.roles.map(r => `<@&${r.id}>`).join(', ');
            await interaction.followUp({
                content: `**${emoji.check} Added ${added} as manager role(s).**`,
                flags: MessageFlags.Ephemeral,
            });

            return refreshPanel(interaction, cfg, true);
        }

        // ── Remove Manager Roles ──
        if (action === 'removeroles') {
            const roles = Array.isArray(cfg.managerRoles) ? cfg.managerRoles : [];
            if (roles.length === 0) {
                return interaction.reply({
                    content: `**No manager roles are set.**`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            await interaction.reply({
                content: `**Mention the role(s) you want to remove.** (e.g. \`@GiveawayManager\`)\nYou have 30 seconds.`,
                flags: MessageFlags.Ephemeral,
            });

            const filter = (m) => m.author.id === userId && m.mentions.roles.size > 0;
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
                .catch(() => null);

            if (!collected) {
                return interaction.followUp({ content: `**Timed out. No roles removed.**`, flags: MessageFlags.Ephemeral });
            }

            const msg      = collected.first();
            const toRemove = msg.mentions.roles.map(r => r.id);
            cfg.managerRoles = (Array.isArray(cfg.managerRoles) ? cfg.managerRoles : []).filter(r => !toRemove.includes(r));
            cfg.updatedAt = Date.now();
            await cfg.save();
            msg.delete().catch(() => {});

            const removed = msg.mentions.roles.map(r => `<@&${r.id}>`).join(', ');
            await interaction.followUp({
                content: `**${emoji.check} Removed ${removed} from manager roles.**`,
                flags: MessageFlags.Ephemeral,
            });

            return refreshPanel(interaction, cfg, true);
        }

        // ── Set Default Image ──
        if (action === 'setimage') {
            await interaction.reply({
                content: `**Send the image URL you want to use as the default giveaway image.**\nYou have 30 seconds.`,
                flags: MessageFlags.Ephemeral,
            });

            const filter = (m) => m.author.id === userId && (m.content.startsWith('http') || m.attachments.size > 0);
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
                .catch(() => null);

            if (!collected) {
                return interaction.followUp({ content: `**Timed out. Image not updated.**`, flags: MessageFlags.Ephemeral });
            }

            const msg = collected.first();
            const url = msg.attachments.first()?.proxyURL || msg.attachments.first()?.url || msg.content.trim();
            cfg.defaultImage = url;
            cfg.updatedAt = Date.now();
            await cfg.save();
            msg.delete().catch(() => {});

            await interaction.followUp({
                content: `**${emoji.check} Default image updated.**`,
                flags: MessageFlags.Ephemeral,
            });

            await syncActiveGiveawayEmbeds(client, interaction.guild, cfg);
            return refreshPanel(interaction, cfg, true);
        }

        // ── Reset Default Image ──
        if (action === 'resetimage') {
            cfg.defaultImage = null;
            cfg.updatedAt = Date.now();
            await cfg.save();

            await interaction.reply({
                content: `**${emoji.check} Default image has been reset.**`,
                flags: MessageFlags.Ephemeral,
            });

            await syncActiveGiveawayEmbeds(client, interaction.guild, cfg);
            return refreshPanel(interaction, cfg, true);
        }

        // ── Reset Manager Roles ──
        if (action === 'resetroles') {
            cfg.managerRoles = [];
            cfg.updatedAt = Date.now();
            await cfg.save();

            await interaction.reply({
                content: `**${emoji.check} All manager roles have been cleared.**`,
                flags: MessageFlags.Ephemeral,
            });

            return refreshPanel(interaction, cfg, true);
        }

        return interaction.deferUpdate().catch(() => {});
    },
};

// ── Panel refresh helper ─────────────────────────────────────────────────────

async function refreshPanel(interaction, cfg, followUp = false) {
    const display   = buildConfigDisplay(cfg, interaction.guild);
    const sep       = new SeparatorBuilder().setDivider(true);
    const container = new ContainerBuilder()
        .addTextDisplayComponents(display)
        .addSeparatorComponents(sep);

    const rows = buildNavRows(interaction.user.id, cfg.guildId, cfg);

    const payload = {
        components: [container, ...rows],
        flags: MessageFlags.IsComponentsV2,
    };

    if (followUp) {
        return interaction.message.edit(payload).catch(() => {});
    }

    return interaction.update(payload).catch(() => {});
}
