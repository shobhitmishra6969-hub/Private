const {
    ContainerBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const UserBadges = require('../../schema/userbadges.js');
const UserPrefs = require('../../schema/userpreferences.js');
const UserStats = require('../../schema/userstats.js');
const PremiumUser = require('../../schema/premiumuser.js');
const Liked = require('../../schema/liked.js');
const Playlist = require('../../schema/playlist.js');
const LastFM = require('../../schema/lastfm.js');
const SpotifyProfile = require('../../schema/spotifyprofile.js');
const emoji = require('../../emojis');
const { AVAILABLE_BADGES } = require('../Owner/add-badge.js');

function numFmt(n) {
    const num = parseInt(n) || 0;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
}

function badgeToString(b) {
    if (!b) return null;
    if (b.emoji?.id) {
        const prefix = b.emoji.animated ? '<a:' : '<:';
        return `${prefix}${b.emoji.name}:${b.emoji.id}>`;
    }
    return b.label;
}

function getBadgeDisplay(badges, isPremium) {
    const all = [...(badges || [])];
    if (isPremium && !all.includes('premium')) all.unshift('premium');
    if (all.length === 0) return '-# No badges yet';
    return all.map(id => {
        const b = AVAILABLE_BADGES.find(b => b.id === id);
        return b ? badgeToString(b) : `\`${id}\``;
    }).join('  ');
}

module.exports = {
    name: 'profile',
    aliases: ['prof', 'card'],
    category: 'Utility',
    description: "View your or another user's profile card",
    usage: '[@user]',
    args: false,
    owner: false,
    player: false,
    inVoiceChannel: false,
    sameVoiceChannel: false,
    slashOptions: [
        {
            name: 'user',
            description: 'The user to view',
            type: 6,
            required: false,
        },
    ],

    async slashExecute(interaction, client) {
        const wrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            mentions: { users: { first: () => interaction.options.getUser('user') || null } },
            reply: async (opts) => interaction.replied || interaction.deferred
                ? interaction.editReply(opts)
                : interaction.reply(opts),
        };
        return this.execute(wrapper, [], client);
    },

    async execute(message, args, client) {
        let target = message.mentions?.users?.first();
        if (!target && args[0] && /^\d+$/.test(args[0])) {
            target = await client.users.fetch(args[0]).catch(() => null);
        }
        target = target || message.author;

        const targetFull = await client.users.fetch(target.id, { force: true }).catch(() => target);
        const member = message.guild
            ? await message.guild.members.fetch({ user: target.id, withPresences: true }).catch(() => null)
            : null;

        const [badgeDoc, prefs, stats, premium, likedDoc, playlistDoc, lfm, spotifyDoc] = await Promise.all([
            UserBadges.findOne({ userId: target.id }),
            UserPrefs.findOne({ userId: target.id }),
            UserStats.findOne({ userId: target.id }),
            PremiumUser.findOne({ userId: target.id }),
            Liked.findOne({ userId: target.id }),
            Playlist.findOne({ userId: target.id }),
            LastFM.findOne({ userId: target.id }),
            SpotifyProfile.findOne({ userId: target.id }),
        ]);

        const badges       = Array.isArray(badgeDoc?.badges) ? badgeDoc.badges : [];
        const bio          = prefs?.bio || 'No bio set.';
        const commandsRun  = stats?.commandsRun || 0;
        const isPremium    = premium?.premium === 1;
        const likedCount   = Array.isArray(likedDoc?.songs) ? likedDoc.songs.length : 0;
        const playlists    = Array.isArray(playlistDoc?.playlists) ? playlistDoc.playlists : [];
        const lfmUsername  = lfm?.username || null;

        const avatarURL   = targetFull.displayAvatarURL({ size: 256, extension: 'png' });
        const createdTs   = Math.floor(targetFull.createdTimestamp / 1000);
        const joinedTs    = member?.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;
        const displayName = member?.displayName || targetFull.globalName || targetFull.username;
        const badgeStr    = getBadgeDisplay(badges, isPremium);

        const accentColor = 0x26272F;

        const buildCard = () => {
            const nameBlock = [
                `**${displayName}**`,
                `-# ID: \`${targetFull.id}\``,
            ].join('\n');

            const section = new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(nameBlock)
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(avatarURL)
                );

            const statsLine = [
                `\`${numFmt(likedCount)}\` Liked`,
                `\`${numFmt(commandsRun)}\` Commands`,
                `\`${playlists.length}\` Playlists`,
                lfmUsername ? `[\`last.fm\`](https://www.last.fm/user/${lfmUsername})` : null,
                spotifyDoc?.spotifyUserId ? `[\`Spotify\`](https://open.spotify.com/user/${spotifyDoc.spotifyUserId})` : null,
            ].filter(Boolean).join('  ·  ');

            const footerParts = [
                `<t:${createdTs}:R> account`,
                joinedTs ? `<t:${joinedTs}:R> member` : null,
                isPremium ? '⭐ Premium' : null,
            ].filter(Boolean).join('  ·  ');

            return new ContainerBuilder()
                .setAccentColor(accentColor)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `### 🪪 User Identity Card\n-# Displaying unified identity for <@${targetFull.id}>`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addSectionComponents(section)
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `> ${bio}`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**User Badges**\n${badgeStr}`
                    )
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(statsLine)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `-# ${footerParts}`
                    )
                );
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prof_avatar')
                .setLabel('Avatar')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('prof_banner')
                .setLabel('Banner')
                .setStyle(ButtonStyle.Secondary),
        );

        const sent = await message.channel.send({
            components: [buildCard(), row],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [], roles: [] },
        });

        const collector = sent.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                i.reply({ content: 'Only the command author can use these buttons.', ephemeral: true }).catch(() => {});
                return false;
            },
            time: 120000,
        });

        collector.on('collect', async (i) => {
            await i.deferReply({ ephemeral: true }).catch(() => {});

            if (i.customId === 'prof_avatar') {
                const fullAvatar = targetFull.displayAvatarURL({ size: 1024, extension: 'png' });
                const embed = new EmbedBuilder()
                    .setColor(accentColor)
                    .setAuthor({ name: `${displayName}'s Avatar` })
                    .setImage(fullAvatar);
                return i.editReply({ embeds: [embed] }).catch(() => {});
            }

            if (i.customId === 'prof_banner') {
                const bannerURL = targetFull.bannerURL?.({ size: 1024 }) ?? null;
                if (!bannerURL) {
                    return i.editReply({ content: `**${displayName} has no banner.**` }).catch(() => {});
                }
                const embed = new EmbedBuilder()
                    .setColor(accentColor)
                    .setAuthor({ name: `${displayName}'s Banner` })
                    .setImage(bannerURL);
                return i.editReply({ embeds: [embed] }).catch(() => {});
            }
        });

        collector.on('end', () => {
            sent.edit({ components: [buildCard()] }).catch(() => {});
        });
    },
};
