const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    EmbedBuilder,
} = require('discord.js');
const { getUserData } = require('../../utils/playlistHelper');

module.exports = {
    name: 'playlist',
    aliases: ['pl'],
    category: 'Playlist',
    description: 'Manage your personal playlists',
    usage: '',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const doc = await getUserData(message.author.id);
        const playlists = doc.playlists || [];

        const prefix = client.prefix || '>';
        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setAuthor({ name: `${message.author.username}'s Playlists`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTitle('🎵 Playlist Manager')
            .setDescription(
                playlists.length === 0
                    ? `You have no playlists yet. Create one with \`${prefix}pl-create <name>\``
                    : playlists.map((p, i) =>
                        `**${i + 1}.** \`${p.name}\` — ${p.tracks.length} track${p.tracks.length !== 1 ? 's' : ''}`
                    ).join('\n')
            )
            .addFields(
                { name: '📋 Commands', value: [
                    `\`${prefix}pl-create <name>\` — Create a playlist`,
                    `\`${prefix}pl-delete <name>\` — Delete a playlist`,
                    `\`${prefix}pl-add <name> <url/query>\` — Add a song`,
                    `\`${prefix}pl-addnowplaying <name>\` — Add current song`,
                    `\`${prefix}pl-addqueue <name>\` — Add entire queue`,
                    `\`${prefix}pl-removetrack <name> <#>\` — Remove a track`,
                    `\`${prefix}pl-dupes <name>\` — Remove duplicates`,
                    `\`${prefix}pl-info <name>\` — View playlist details`,
                    `\`${prefix}pl-list\` — List all playlists`,
                    `\`${prefix}pl-load <name>\` — Load playlist into queue`,
                ].join('\n'), inline: false }
            )
            .setFooter({ text: `${playlists.length}/10 playlists used • ${message.author.username}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('pl_list')
                .setLabel('My Playlists')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('pl_help')
                .setLabel('Commands')
                .setEmoji('❓')
                .setStyle(ButtonStyle.Secondary),
        );

        const sent = await message.reply({ embeds: [embed], components: [row] });

        const collector = sent.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 60000,
        });

        collector.on('collect', async i => {
            if (i.customId === 'pl_list') {
                const fresh = await getUserData(message.author.id);
                const list = fresh.playlists || [];
                const desc = list.length === 0
                    ? `No playlists found. Create one with \`${prefix}pl-create <name>\``
                    : list.map((p, idx) =>
                        `**${idx + 1}.** \`${p.name}\` — ${p.tracks.length} tracks`
                    ).join('\n');

                embed.setDescription(desc);
                embed.setFooter({ text: `${list.length}/10 playlists used • ${message.author.username}` });
                await i.update({ embeds: [embed], components: [row] });
            } else if (i.customId === 'pl_help') {
                await i.reply({
                    content: [
                        `**Playlist Commands:**`,
                        `\`${prefix}pl-create <name>\` — Create`,
                        `\`${prefix}pl-delete <name>\` — Delete`,
                        `\`${prefix}pl-add <name> <song>\` — Add song`,
                        `\`${prefix}pl-addnowplaying <name>\` — Add current`,
                        `\`${prefix}pl-addqueue <name>\` — Add queue`,
                        `\`${prefix}pl-removetrack <name> <#>\` — Remove track`,
                        `\`${prefix}pl-dupes <name>\` — Remove dupes`,
                        `\`${prefix}pl-info <name>\` — Info`,
                        `\`${prefix}pl-list\` — List all`,
                        `\`${prefix}pl-load <name>\` — Load into queue`,
                    ].join('\n'),
                    ephemeral: true,
                });
            }
        });

        collector.on('end', () => {
            sent.edit({ components: [] }).catch(() => {});
        });
    },
};
