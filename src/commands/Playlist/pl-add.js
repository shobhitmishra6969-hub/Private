const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply, MAX_TRACKS } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-add',
    aliases: ['pladd', 'playlist-add'],
    category: 'Playlist',
    description: 'Add a song to a playlist by URL or search query',
    usage: '<name> <url or query>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        if (args.length < 2)
            return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-add <playlist> <url or query>\``);

        const name = args[0];
        const query = args.slice(1).join(' ');

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found. Create it with \`${client.prefix}pl-create ${name}\`**`);
        if (pl.tracks.length >= MAX_TRACKS)
            return reply(message, `**${emoji.cross} Playlist \`${name}\` is full (\`${MAX_TRACKS}\` tracks max).**`);

        try {
            const result = await client.manager.search(query, { requester: message.author });
            if (!result || !result.tracks || result.tracks.length === 0)
                return reply(message, `**${emoji.cross} No results found for \`${query}\`.**`);

            const track = result.tracks[0];
            pl.tracks.push({
                title: track.title,
                url: track.uri,
                duration: track.length,
                thumbnail: track.thumbnail,
                author: track.author,
            });
            await doc.save();

            const embed = new EmbedBuilder()
                .setColor(client.color || '#7B2FBE')
                .setTitle('➕ Track Added')
                .setDescription(`Added **[${track.title}](${track.uri})** to \`${pl.name}\``)
                .addFields(
                    { name: 'Artist', value: track.author || 'Unknown', inline: true },
                    { name: 'Duration', value: msToTime(track.length), inline: true },
                    { name: 'Playlist size', value: `${pl.tracks.length} track(s)`, inline: true },
                )
                .setThumbnail(track.thumbnail || null)
                .setFooter({ text: `Requested by ${message.author.username}` })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('[pl-add]', err);
            return reply(message, `**${emoji.cross} Failed to search. Please try again.**`);
        }
    },
};

function msToTime(ms) {
    if (!ms) return '0:00';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return `${m}:${String(s % 60).padStart(2, '0')}`;
}
