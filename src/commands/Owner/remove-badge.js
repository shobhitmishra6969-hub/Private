const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    SeparatorBuilder,
} = require('discord.js');
const UserBadges = require('../../schema/userbadges.js');
const config = require('../../config.js');
const emoji = require('../../emojis');
const { AVAILABLE_BADGES } = require('./add-badge.js');

const REMOVE_ALL_VALUE = '__remove_all__';

function err(message, text) {
    return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
        flags: MessageFlags.IsComponentsV2,
    });
}

function buildSuccess(target, removedBadges, remaining, removedBy) {
    const isAll = remaining === 0 && removedBadges.length > 1;
    const header = new TextDisplayBuilder()
        .setContent(isAll
            ? `**${emoji.check} All Badges Removed**`
            : `**${emoji.check} Badge${removedBadges.length > 1 ? 's' : ''} Removed**`
        );
    const sep = new SeparatorBuilder().setDivider(true);
    const thumbnail = new ThumbnailBuilder().setURL(target.displayAvatarURL({ dynamic: true }));
    const section = new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(thumbnail);

    const info = new TextDisplayBuilder().setContent(
        `**Removed:** ${removedBadges.map(b => b?.label || b).join(' • ')}\n` +
        `**From:** <@${target.id}> (\`${target.username}\`)\n` +
        `**Remaining Badges:** \`${remaining}\`\n` +
        `-# Removed by ${removedBy}`
    );

    return new ContainerBuilder()
        .addSectionComponents(section)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(info);
}

module.exports = {
    name: 'remove-badge',
    aliases: ['removebadge', 'takebadge'],
    category: 'Owner',
    description: 'Remove a badge from a user (Owner only)',
    usage: '@user [badge_id]',
    userPerms: [],
    owner: true,

    async execute(message, args, client) {
        if (!config.ownerID.includes(message.author.id))
            return err(message, `**${emoji.cross} This command is restricted to bot owners.**`);

        let target = message.mentions.users.first();
        if (!target && args[0] && /^\d+$/.test(args[0])) {
            target = await client.users.fetch(args[0]).catch(() => null);
        }
        if (!target) return err(message, `**${emoji.cross} Usage:** \`${client.prefix}remove-badge @user [badge]\``);

        const doc = await UserBadges.findOne({ userId: target.id });
        const currentBadges = Array.isArray(doc?.badges) ? doc.badges : [];

        if (currentBadges.length === 0)
            return err(message, `**${emoji.warn} ${target.username} has no badges to remove.**`);

        const badgeArg = args[1]?.toLowerCase();
        if (badgeArg) {
            if (!currentBadges.includes(badgeArg))
                return err(message, `**${emoji.cross} ${target.username} doesn't have the \`${badgeArg}\` badge.**`);

            const badge = AVAILABLE_BADGES.find(b => b.id === badgeArg);
            doc.badges = currentBadges.filter(b => b !== badgeArg);
            await doc.save();

            return message.reply({
                components: [buildSuccess(target, [badge || { label: badgeArg }], doc.badges.length, message.author.username)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const ownedBadges = AVAILABLE_BADGES.filter(b => currentBadges.includes(b.id));
        const unknownBadges = currentBadges.filter(id => !AVAILABLE_BADGES.find(b => b.id === id));

        const badgeOptions = [
            ...ownedBadges.map(b => ({ label: b.label, value: b.id, description: b.description })),
            ...unknownBadges.map(id => ({ label: id, value: id, description: 'Custom badge' })),
        ].slice(0, 24);

        const allOptions = [
            { label: '🗑️ Remove All Badges', value: REMOVE_ALL_VALUE, description: `Remove all ${currentBadges.length} badges at once` },
            ...badgeOptions,
        ];

        const currentBadgesText = ownedBadges.map(b => b.label).join(' • ') || currentBadges.join(', ');

        const select = new StringSelectMenuBuilder()
            .setCustomId('badge_remove_select')
            .setPlaceholder('Choose badges to remove')
            .setMinValues(1)
            .setMaxValues(allOptions.length)
            .addOptions(allOptions);

        const row = new ActionRowBuilder().addComponents(select);

        const headerDisplay = new TextDisplayBuilder()
            .setContent(`### 🗑️ Remove Badge\n-# Select one or more badges to remove from **${target.username}**`);
        const thumbnail = new ThumbnailBuilder().setURL(target.displayAvatarURL({ dynamic: true }));
        const section = new SectionBuilder()
            .addTextDisplayComponents(headerDisplay)
            .setThumbnailAccessory(thumbnail);

        const badgesInfo = new TextDisplayBuilder()
            .setContent(`**Current Badges:** ${currentBadgesText}`);

        const container = new ContainerBuilder()
            .addSectionComponents(section)
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(badgesInfo)
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(row);

        const sent = await message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = sent.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 30000,
            max: 1,
        });

        collector.on('collect', async i => {
            const freshDoc = await UserBadges.findOne({ userId: target.id });
            if (!Array.isArray(freshDoc?.badges)) return i.update({ components: [], flags: MessageFlags.IsComponentsV2 });

            const removeAll = i.values.includes(REMOVE_ALL_VALUE);
            let removedBadges;

            if (removeAll) {
                const allOwned = [
                    ...AVAILABLE_BADGES.filter(b => freshDoc.badges.includes(b.id)),
                    ...freshDoc.badges.filter(id => !AVAILABLE_BADGES.find(b => b.id === id)).map(id => ({ label: id })),
                ];
                removedBadges = allOwned;
                freshDoc.badges = [];
            } else {
                const chosen = i.values;
                removedBadges = chosen.map(id => AVAILABLE_BADGES.find(b => b.id === id) || { label: id });
                freshDoc.badges = freshDoc.badges.filter(b => !chosen.includes(b));
            }

            await freshDoc.save();

            await i.update({
                components: [buildSuccess(target, removedBadges, freshDoc.badges.length, message.author.username)],
                flags: MessageFlags.IsComponentsV2,
            });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                const timeoutContainer = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.warn} Badge selection timed out.**`));
                sent.edit({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        });
    },
};
