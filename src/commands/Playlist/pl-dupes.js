const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-dupes',
    aliases: ['pldupes', 'playlist-dupes', 'pl-dedup'],
    category: 'Playlist',
    description: 'Remove duplicate tracks from a playlist',
    usage: '<name>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const name = args.join(' ').trim();
        if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-dupes <playlist>\``);

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

        const before = pl.tracks.length;
        const seen = new Set();
        pl.tracks = pl.tracks.filter(t => {
            if (seen.has(t.url)) return false;
            seen.add(t.url);
            return true;
        });
        const removed = before - pl.tracks.length;
        await doc.save();

        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setTitle('🧹 Duplicates Removed')
            .setDescription(
                removed === 0
                    ? `No duplicate tracks found in **\`${name}\`**.`
                    : `Removed **${removed}** duplicate track${removed !== 1 ? 's' : ''} from **\`${name}\`**.`
            )
            .addFields(
                { name: 'Before', value: `${before}`, inline: true },
                { name: 'After', value: `${pl.tracks.length}`, inline: true },
                { name: 'Removed', value: `${removed}`, inline: true },
            )
            .setFooter({ text: `Cleaned by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
