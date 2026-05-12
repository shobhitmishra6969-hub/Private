const { EmbedBuilder } = require('discord.js');
const { getUserData, reply, MAX_PLAYLISTS } = require('../../utils/playlistHelper');

function msToTime(ms) {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = {
    name: 'pl-list',
    aliases: ['pllist', 'playlist-list', 'playlists'],
    category: 'Playlist',
    description: 'List all of your saved playlists',
    usage: '',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const doc = await getUserData(message.author.id);
        const playlists = doc.playlists || [];

        const embed = new EmbedBuilder()
            .setColor(client.color || '#00D4FF')
            .setAuthor({ name: `${message.author.username}'s Playlists`, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
            .setTitle('📋 Playlist List')
            .setTimestamp();

        if (playlists.length === 0) {
            embed.setDescription(`You have no playlists yet.\nCreate one with \`${client.prefix}pl-create <name>\``);
        } else {
            const lines = playlists.map((p, i) => {
                const totalDur = p.tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
                return `**${i + 1}.** \`${p.name}\` — **${p.tracks.length}** track${p.tracks.length !== 1 ? 's' : ''} • \`${msToTime(totalDur)}\``;
            });
            embed.setDescription(lines.join('\n'));
        }

        embed.setFooter({ text: `${playlists.length}/${MAX_PLAYLISTS} playlists used • Use ${client.prefix}pl-info <name> to view tracks` });

        return message.reply({ embeds: [embed] });
    },
};
