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

const AVAILABLE_BADGES = [
    { id: 'developer',   label: 'Developer',   emoji: { id: '1484568861960306839',  name: 'Owner',       animated: false }, description: 'Bot Developer' },
    { id: 'staff',       label: 'Staff',        emoji: { id: '1484966780517613778',  name: 'Staff',       animated: false }, description: 'Bot Staff Member' },
    { id: 'partner',     label: 'Partner',      emoji: { id: '1484968448357568512',  name: 'DR_Partner',  animated: true  }, description: 'Official Partner' },
    { id: 'premium',     label: 'Premium',      emoji: { id: '1484968323191144601',  name: 'premium',     animated: true  }, description: 'Premium User' },
    { id: 'supporter',   label: 'Supporter',    emoji: { id: '1484968098543964331',  name: 'supporter',   animated: false }, description: 'Bot Supporter' },
    { id: 'artist',      label: 'Artist',       emoji: { id: '1484967994256920687',  name: 'DJ_artist',   animated: false }, description: 'Creative Artist' },
    { id: 'beta',        label: 'Beta Tester',  emoji: { id: '1484967567687680292',  name: 'Beta_Tester', animated: false }, description: 'Early Beta Tester' },
    { id: 'og',          label: 'OG',           emoji: { id: '1484967413484355806',  name: 'bhaichara',   animated: false }, description: 'OG Early User' },
    { id: 'bug_hunter',  label: 'Bug Hunter',   emoji: { id: '1484967161935171634',  name: 'bug_hunter',  animated: true  }, description: 'Found & Reported Bugs' },
    { id: 'contributor', label: 'Contributor',  emoji: { id: '1484967734885355592',  name: 'trophy',      animated: false }, description: 'Project Contributor' },
    { id: 'dj',          label: 'DJ',           emoji: { id: '1484967052740661278',  name: 'DJ',          animated: false }, description: 'Music Expert' },
    { id: 'booster',     label: 'Booster',      emoji: { id: '1484966900940411060',  name: 'booster',     animated: false }, description: 'Server Booster' },
];

function err(message, text) {
    return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
        flags: MessageFlags.IsComponentsV2,
    });
}

function badgeToString(b) {
    if (!b) return '';
    if (b.emoji?.id) {
        const prefix = b.emoji.animated ? '<a:' : '<:';
        return `${prefix}${b.emoji.name}:${b.emoji.id}> ${b.label}`;
    }
    return b.label;
}

function buildSuccess(target, addedBadges, skippedBadges, totalBadges, addedBy) {
    const header = new TextDisplayBuilder()
        .setContent(`**${emoji.check} Badge${addedBadges.length > 1 ? 's' : ''} Added**`);
    const sep = new SeparatorBuilder().setDivider(true);
    const thumbnail = new ThumbnailBuilder().setURL(target.displayAvatarURL({ dynamic: true }));
    const section = new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(thumbnail);

    let infoText =
        `**Added:** ${addedBadges.map(badgeToString).join(' • ')}\n` +
        `**Given to:** <@${target.id}> (\`${target.username}\`)\n` +
        `**Total Badges:** \`${totalBadges}\``;
    if (skippedBadges.length > 0) {
        infoText += `\n**Skipped (already owned):** ${skippedBadges.map(badgeToString).join(' • ')}`;
    }
    infoText += `\n-# Added by ${addedBy}`;

    const info = new TextDisplayBuilder().setContent(infoText);

    return new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addSectionComponents(section)
        .addSeparatorComponents(sep)
        .addTextDisplayComponents(info);
}

module.exports = {
    name: 'add-badge',
    aliases: ['addbadge', 'givebadge'],
    category: 'Owner',
    description: 'Add a badge to a user (Owner only)',
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
        if (!target) return err(message, `**${emoji.cross} Usage:** \`${client.prefix}add-badge @user [badge]\``);

        let doc = await UserBadges.findOne({ userId: target.id });
        if (!doc) doc = await UserBadges.create({ userId: target.id, badges: [] });
        if (!Array.isArray(doc.badges)) doc.badges = [];

        const badgeArg = args[1]?.toLowerCase();
        if (badgeArg) {
            const badge = AVAILABLE_BADGES.find(b => b.id === badgeArg);
            if (!badge) return err(message, `**${emoji.cross} Unknown badge \`${badgeArg}\`. Available: ${AVAILABLE_BADGES.map(b => `\`${b.id}\``).join(', ')}**`);
            if (doc.badges.includes(badge.id)) return err(message, `**${emoji.warn} ${target.username} already has the ${badgeToString(badge)} badge.**`);

            doc.badges.push(badge.id);
            await doc.save();

            return message.reply({
                components: [buildSuccess(target, [badge], [], doc.badges.length, message.author.username)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const currentBadgesText = doc.badges.length > 0
            ? doc.badges.map(id => badgeToString(AVAILABLE_BADGES.find(b => b.id === id)) || id).join(' • ')
            : 'None';

        const owned = new Set(doc.badges);

        const select = new StringSelectMenuBuilder()
            .setCustomId('badge_select')
            .setPlaceholder('Choose badges to add')
            .setMinValues(1)
            .setMaxValues(AVAILABLE_BADGES.length)
            .addOptions(AVAILABLE_BADGES.map(b => ({
                label: b.label,
                value: b.id,
                description: owned.has(b.id) ? `✓ Already owned — ${b.description}` : b.description,
                emoji: b.emoji,
            })));

        const row = new ActionRowBuilder().addComponents(select);

        const headerDisplay = new TextDisplayBuilder()
            .setContent(`### 🏅 Add Badge\n-# Select one or more badges to give to **${target.username}**`);
        const thumbnail = new ThumbnailBuilder().setURL(target.displayAvatarURL({ dynamic: true }));
        const section = new SectionBuilder()
            .addTextDisplayComponents(headerDisplay)
            .setThumbnailAccessory(thumbnail);

        const badgesInfo = new TextDisplayBuilder()
            .setContent(`**Current Badges:** ${currentBadgesText}`);

        const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
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
            if (!Array.isArray(freshDoc.badges)) freshDoc.badges = [];

            const selected = i.values.map(id => AVAILABLE_BADGES.find(b => b.id === id)).filter(Boolean);
            const alreadyOwned = selected.filter(b => freshDoc.badges.includes(b.id));
            const toAdd = selected.filter(b => !freshDoc.badges.includes(b.id));

            if (toAdd.length === 0) {
                const alreadyContainer = new ContainerBuilder().setAccentColor(0x7B2FBE)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**${emoji.warn} ${target.username} already has all selected badges.**`
                    ));
                return i.update({ components: [alreadyContainer], flags: MessageFlags.IsComponentsV2 });
            }

            freshDoc.badges.push(...toAdd.map(b => b.id));
            await freshDoc.save();

            await i.update({
                components: [buildSuccess(target, toAdd, alreadyOwned, freshDoc.badges.length, message.author.username)],
                flags: MessageFlags.IsComponentsV2,
            });
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') {
                const timeoutContainer = new ContainerBuilder().setAccentColor(0x7B2FBE)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${emoji.warn} Badge selection timed out.**`));
                sent.edit({ components: [timeoutContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
        });
    },
};

module.exports.AVAILABLE_BADGES = AVAILABLE_BADGES;
