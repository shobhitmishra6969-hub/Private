const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply, MAX_TRACKS } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-addqueue',
    aliases: ['pladdq', 'playlist-addqueue'],
    category: 'Playlist',
    description: 'Add all songs from the current queue to a playlist',
    usage: '<name>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const name = args.join(' ').trim();
        if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-addqueue <playlist>\``);

        const player = client.manager.players.get(message.guild.id);
        if (!player) return reply(message, `**${emoji.cross} No music is playing.**`);

        const queueTracks = [];
        if (player.queue.current) queueTracks.push(player.queue.current);
        if (player.queue.length > 0) queueTracks.push(...player.queue.toArray ? player.queue.toArray() : [...player.queue]);

        if (queueTracks.length === 0)
            return reply(message, `**${emoji.cross} The queue is empty.**`);

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);

        const space = MAX_TRACKS - pl.tracks.length;
        if (space <= 0) return reply(message, `**${emoji.cross} Playlist \`${name}\` is already full.**`);

        let added = 0, skipped = 0;
        for (const song of queueTracks) {
            if (added >= space) { skipped += queueTracks.length - added - skipped; break; }
            const alreadyIn = pl.tracks.some(t => t.url === song.uri);
            if (alreadyIn) { skipped++; continue; }
            pl.tracks.push({
                title: song.title,
                url: song.uri,
                duration: song.length,
                thumbnail: song.thumbnail,
                author: song.author,
            });
            added++;
        }
        await doc.save();

        const embed = new EmbedBuilder()
            .setColor(client.color || '#00D4FF')
            .setTitle('➕ Queue Added to Playlist')
            .setDescription(`Saved tracks from the queue into **\`${name}\`**`)
            .addFields(
                { name: 'Added', value: `${added}`, inline: true },
                { name: 'Skipped (dupes/full)', value: `${skipped}`, inline: true },
                { name: 'Total tracks', value: `${pl.tracks.length}`, inline: true },
            )
            .setFooter({ text: `Saved by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
