const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const Blacklist = require('../../schema/blacklist.js');
const config = require('../../config.js');
const emoji = require('../../emojis');
const { blacklistCache } = require('../../utils/cache');

const ITEMS_PER_PAGE = 10;

function err(message, text) {
    return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
        flags: MessageFlags.IsComponentsV2,
    });
}

function buildListPage(entries, page, totalPages, client) {
    const start = page * ITEMS_PER_PAGE;
    const slice = entries.slice(start, start + ITEMS_PER_PAGE);

    const header = new TextDisplayBuilder()
        .setContent(`### 🚫 Blacklisted Users\n-# ${entries.length} total blacklisted user${entries.length !== 1 ? 's' : ''}`);

    const sep = new SeparatorBuilder().setDivider(true);

    const lines = slice.map((entry, i) => {
        const ts = entry.timestamp ? `<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:R>` : 'Unknown';
        const reason = entry.reason || 'No reason given';
        return `**${start + i + 1}.** <@${entry.userId}> (\`${entry.userId}\`)\n-# ${reason} • ${ts}`;
    }).join('\n\n');

    const listDisplay = new TextDisplayBuilder()
        .setContent(lines || '*No blacklisted users.*');

    const footer = new TextDisplayBuilder()
        .setContent(`-# Page ${page + 1} of ${totalPages}`);

    return new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(header)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(listDisplay)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(footer);
}

function buildNavRow(page, totalPages) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bl_prev')
            .setLabel('◀ Prev')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('bl_next')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
    );
}

module.exports = {
    name: 'blacklist',
    aliases: ['bl', 'ban-user'],
    category: 'Owner',
    description: 'Manage the bot blacklist (Owner only)',
    usage: '<add|remove|removeall|list|check> [@user] [reason]',
    args: false,
    userPerms: [],
    owner: true,

    async execute(message, args, client) {
        if (!config.ownerID.includes(message.author.id))
            return err(message, `**${emoji.cross} This command is restricted to bot owners.**`);

        const sub = args[0]?.toLowerCase();

        // ── LIST ──────────────────────────────────────────────────────────────
        if (!sub || sub === 'list') {
            const entries = await Blacklist.find({});
            if (entries.length === 0)
                return err(message, `**${emoji.info} The blacklist is empty.**`);

            const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);
            let page = 0;

            const container = buildListPage(entries, page, totalPages, client);
            const navRow = buildNavRow(page, totalPages);

            const sent = await message.reply({
                components: totalPages > 1 ? [container, navRow] : [container],
                flags: MessageFlags.IsComponentsV2,
            });

            if (totalPages <= 1) return;

            const collector = sent.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 60000,
            });

            collector.on('collect', async i => {
                if (i.customId === 'bl_prev') page = Math.max(0, page - 1);
                else if (i.customId === 'bl_next') page = Math.min(totalPages - 1, page + 1);

                await i.update({
                    components: [buildListPage(entries, page, totalPages, client), buildNavRow(page, totalPages)],
                    flags: MessageFlags.IsComponentsV2,
                });
            });

            collector.on('end', () => {
                sent.edit({ components: [buildListPage(entries, page, totalPages, client)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            });

            return;
        }

        // ── ADD ───────────────────────────────────────────────────────────────
        if (sub === 'add') {
            let target = message.mentions.users.first();
            if (!target && args[1] && /^\d+$/.test(args[1])) {
                target = await client.users.fetch(args[1]).catch(() => null);
            }
            if (!target)
                return err(message, `**${emoji.cross} Usage:** \`${client.prefix}blacklist add @user [reason]\``);

            if (config.ownerID.includes(target.id))
                return err(message, `**${emoji.cross} You cannot blacklist a bot owner.**`);

            const existing = await Blacklist.findOne({ userId: target.id });
            if (existing)
                return err(message, `**${emoji.warn} \`${target.username}\` is already blacklisted.**`);

            const reasonStart = message.mentions.users.size > 0 ? 2 : (args[1] && /^\d+$/.test(args[1]) ? 2 : 1);
            const reason = args.slice(reasonStart).join(' ') || 'No reason given';

            const doc = { userId: target.id, type: 'user', reason, timestamp: new Date() };
            const entry = await Blacklist.create(doc);

            try {
                await target.send({
                    components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                        .addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(
                                `**${emoji.cross} You have been blacklisted from using **${client.user.username}**.**\n\n` +
                                `**Reason:** ${reason}\n` +
                                `-# If you believe this is a mistake, contact the bot owner.`
                            ))],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            } catch (_) {}

            const targetFull = await client.users.fetch(target.id, { force: true }).catch(() => target);
            const header = new TextDisplayBuilder().setContent(`**${emoji.check} User Blacklisted**`);
            const sep = new SeparatorBuilder().setDivider(true);
            const thumbnail = new ThumbnailBuilder().setURL(targetFull.displayAvatarURL({ dynamic: true }));
            const section = new SectionBuilder()
                .addTextDisplayComponents(header)
                .setThumbnailAccessory(thumbnail);
            const info = new TextDisplayBuilder().setContent(
                `**User:** <@${target.id}> (\`${target.username}\`)\n` +
                `**Reason:** ${reason}\n` +
                `**Blacklisted:** <t:${Math.floor(Date.now() / 1000)}:R>\n` +
                `-# Added by ${message.author.username}`
            );

            return message.reply({
                components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                    .addSectionComponents(section)
                    .addSeparatorComponents(sep)
                    .addTextDisplayComponents(info)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        // ── REMOVE ────────────────────────────────────────────────────────────
        if (sub === 'remove' || sub === 'unblacklist' || sub === 'unbl') {
            let target = message.mentions.users.first();
            if (!target && args[1] && /^\d+$/.test(args[1])) {
                target = await client.users.fetch(args[1]).catch(() => null);
            }
            if (!target)
                return err(message, `**${emoji.cross} Usage:** \`${client.prefix}blacklist remove @user\``);

            const existing = await Blacklist.findOne({ userId: target.id });
            if (!existing)
                return err(message, `**${emoji.warn} \`${target.username}\` is not blacklisted.**`);

            await Blacklist.deleteOne({ userId: target.id });
            blacklistCache.del(target.id);

            try {
                await target.send({
                    components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                        .addTextDisplayComponents(new TextDisplayBuilder()
                            .setContent(
                                `**${emoji.check} You have been removed from the **${client.user.username}** blacklist.**\n` +
                                `-# You can now use the bot again.`
                            ))],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
            } catch (_) {}

            const targetFull = await client.users.fetch(target.id, { force: true }).catch(() => target);
            const header = new TextDisplayBuilder().setContent(`**${emoji.check} User Unblacklisted**`);
            const sep = new SeparatorBuilder().setDivider(true);
            const thumbnail = new ThumbnailBuilder().setURL(targetFull.displayAvatarURL({ dynamic: true }));
            const section = new SectionBuilder()
                .addTextDisplayComponents(header)
                .setThumbnailAccessory(thumbnail);
            const info = new TextDisplayBuilder().setContent(
                `**User:** <@${target.id}> (\`${target.username}\`)\n` +
                `**Previously blacklisted for:** ${existing.reason || 'No reason given'}\n` +
                `-# Removed by ${message.author.username}`
            );

            return message.reply({
                components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                    .addSectionComponents(section)
                    .addSeparatorComponents(sep)
                    .addTextDisplayComponents(info)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        // ── CHECK ─────────────────────────────────────────────────────────────
        if (sub === 'check' || sub === 'info') {
            let target = message.mentions.users.first();
            if (!target && args[1] && /^\d+$/.test(args[1])) {
                target = await client.users.fetch(args[1]).catch(() => null);
            }
            if (!target)
                return err(message, `**${emoji.cross} Usage:** \`${client.prefix}blacklist check @user\``);

            const entry = await Blacklist.findOne({ userId: target.id });
            const targetFull = await client.users.fetch(target.id, { force: true }).catch(() => target);
            const thumbnail = new ThumbnailBuilder().setURL(targetFull.displayAvatarURL({ dynamic: true }));

            if (!entry) {
                const header = new TextDisplayBuilder().setContent(`**${emoji.check} Not Blacklisted**`);
                const sep = new SeparatorBuilder().setDivider(true);
                const section = new SectionBuilder()
                    .addTextDisplayComponents(header)
                    .setThumbnailAccessory(thumbnail);
                const info = new TextDisplayBuilder().setContent(
                    `**User:** <@${target.id}> (\`${target.username}\`)\n` +
                    `**Status:** ✅ Clear — not on the blacklist`
                );
                return message.reply({
                    components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                        .addSectionComponents(section)
                        .addSeparatorComponents(sep)
                        .addTextDisplayComponents(info)],
                    flags: MessageFlags.IsComponentsV2,
                });
            }

            const ts = entry.timestamp
                ? `<t:${Math.floor(new Date(entry.timestamp).getTime() / 1000)}:F>`
                : 'Unknown';

            const header = new TextDisplayBuilder().setContent(`**${emoji.cross} Blacklisted**`);
            const sep = new SeparatorBuilder().setDivider(true);
            const section = new SectionBuilder()
                .addTextDisplayComponents(header)
                .setThumbnailAccessory(thumbnail);
            const info = new TextDisplayBuilder().setContent(
                `**User:** <@${target.id}> (\`${target.username}\`)\n` +
                `**Status:** 🚫 Blacklisted\n` +
                `**Reason:** ${entry.reason || 'No reason given'}\n` +
                `**Since:** ${ts}`
            );

            return message.reply({
                components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                    .addSectionComponents(section)
                    .addSeparatorComponents(sep)
                    .addTextDisplayComponents(info)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        // ── REMOVE ALL ────────────────────────────────────────────────────────
        if (sub === 'removeall' || sub === 'clearall' || sub === 'wipebl') {
            const entries = await Blacklist.find({});
            const count = entries.length;

            if (count === 0)
                return err(message, `**${emoji.info} The blacklist is already empty.**`);

            // Confirmation step — send a button prompt
            const confirmContainer = new ContainerBuilder().setAccentColor(0x7B2FBE)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**${emoji.warn} Are you sure you want to remove ALL ${count} blacklisted user${count !== 1 ? 's' : ''}?**\n` +
                        `-# This action cannot be undone.`
                    )
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('bl_removeall_confirm')
                            .setLabel('Yes, clear all')
                            .setStyle(ButtonStyle.Danger),
                        new ButtonBuilder()
                            .setCustomId('bl_removeall_cancel')
                            .setLabel('Cancel')
                            .setStyle(ButtonStyle.Secondary),
                    )
                );

            const sent = await message.reply({
                components: [confirmContainer],
                flags: MessageFlags.IsComponentsV2,
            });

            const collector = sent.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 30_000,
                max: 1,
            });

            collector.on('collect', async i => {
                if (i.customId === 'bl_removeall_cancel') {
                    return i.update({
                        components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.info} Cancelled. No users were removed.**`))],
                        flags: MessageFlags.IsComponentsV2,
                    });
                }

                // Confirmed — wipe the entire blacklist
                const allEntries = await Blacklist.find({});
                for (const entry of allEntries) blacklistCache.del(entry.userId);
                await Blacklist.deleteMany({});

                return i.update({
                    components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                            `**${emoji.check} Done. Removed all ${count} user${count !== 1 ? 's' : ''} from the blacklist.**\n` +
                            `-# All users can now use the bot again.`
                        ))],
                    flags: MessageFlags.IsComponentsV2,
                });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    sent.edit({
                        components: [new ContainerBuilder().setAccentColor(0x7B2FBE)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.warn} Timed out. No users were removed.**`))],
                        flags: MessageFlags.IsComponentsV2,
                    }).catch(() => {});
                }
            });

            return;
        }

        // ── UNKNOWN SUBCOMMAND ────────────────────────────────────────────────
        return err(message,
            `**${emoji.cross} Unknown subcommand \`${sub}\`.**\n` +
            `**Usage:** \`${client.prefix}blacklist <add|remove|removeall|list|check> [@user] [reason]\``
        );
    },
};
