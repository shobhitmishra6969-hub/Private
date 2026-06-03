const emoji = require('../../emojis');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { getUserData, findPlaylist, reply } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-delete',
    aliases: ['pldelete', 'playlist-delete'],
    category: 'Playlist',
    description: 'Delete one of your playlists',
    usage: '<name>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const name = args.join(' ').trim();
        if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-delete <name>\``);

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

        const embed = new EmbedBuilder()
            .setColor('#7B2FBE')
            .setTitle('⚠️ Confirm Deletion')
            .setDescription(`Are you sure you want to delete **\`${pl.name}\`**?\nThis will remove **${pl.tracks.length} track(s)** permanently.`)
            .setFooter({ text: 'You have 30 seconds to confirm.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pl_del_confirm').setLabel('Delete').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('pl_del_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );

        const sent = await message.reply({ embeds: [embed], components: [row] });

        const collector = sent.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 30000,
            max: 1,
        });

        collector.on('collect', async i => {
            if (i.customId === 'pl_del_confirm') {
                const fresh = await getUserData(message.author.id);
                fresh.playlists = fresh.playlists.filter(p => p.name.toLowerCase() !== pl.name.toLowerCase());
                await fresh.save();

                const done = new EmbedBuilder()
                    .setColor(client.color || '#7B2FBE')
                    .setTitle('🗑️ Playlist Deleted')
                    .setDescription(`**\`${pl.name}\`** has been deleted.`)
                    .setTimestamp();
                await i.update({ embeds: [done], components: [] });
            } else {
                const cancelled = new EmbedBuilder()
                    .setColor(client.color || '#7B2FBE')
                    .setDescription(`**${emoji.cross} Deletion cancelled.**`);
                await i.update({ embeds: [cancelled], components: [] });
            }
        });

        collector.on('end', (_, reason) => {
            if (reason === 'time') sent.edit({ components: [] }).catch(() => {});
        });
    },
};
