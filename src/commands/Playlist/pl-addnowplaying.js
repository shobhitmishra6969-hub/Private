const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply, MAX_TRACKS } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-addnowplaying',
    aliases: ['planp', 'pladdnp', 'playlist-addnowplaying'],
    category: 'Playlist',
    description: 'Add the currently playing song to a playlist',
    usage: '<name>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const name = args.join(' ').trim();
        if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-addnowplaying <playlist>\``);

        const player = client.manager.players.get(message.guild.id);
        if (!player || !player.queue.current)
            return reply(message, `**${emoji.cross} Nothing is currently playing.**`);

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);
        if (pl.tracks.length >= MAX_TRACKS)
            return reply(message, `**${emoji.cross} Playlist is full (\`${MAX_TRACKS}\` tracks max).**`);

        const song = player.queue.current;
        const alreadyIn = pl.tracks.some(t => t.url === song.uri);
        if (alreadyIn) return reply(message, `**${emoji.warn} \`${song.title}\` is already in \`${name}\`.**`);

        pl.tracks.push({
            title: song.title,
            url: song.uri,
            duration: song.length,
            thumbnail: song.thumbnail,
            author: song.author,
        });
        await doc.save();

        const embed = new EmbedBuilder()
            .setColor(client.color || '#00D4FF')
            .setTitle('➕ Now Playing Added')
            .setDescription(`Added **[${song.title}](${song.uri})** to \`${name}\``)
            .addFields(
                { name: 'Artist', value: song.author || 'Unknown', inline: true },
                { name: 'Playlist size', value: `${pl.tracks.length} track(s)`, inline: true },
            )
            .setThumbnail(song.thumbnail || null)
            .setFooter({ text: `Saved by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
