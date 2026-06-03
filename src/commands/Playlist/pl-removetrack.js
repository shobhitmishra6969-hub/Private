const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-removetrack',
    aliases: ['plremovetrack', 'plrt', 'playlist-removetrack'],
    category: 'Playlist',
    description: 'Remove a track from a playlist by its position number',
    usage: '<name> <track number>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        if (args.length < 2)
            return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-removetrack <playlist> <track #>\``);

        const num = parseInt(args[args.length - 1]);
        const name = args.slice(0, -1).join(' ').trim();

        if (isNaN(num) || num < 1)
            return reply(message, `**${emoji.cross} Please provide a valid track number.**`);

        const doc = await getUserData(message.author.id);
        const pl = findPlaylist(doc, name);
        if (!pl) return reply(message, `**${emoji.cross} Playlist \`${name}\` not found.**`);
        if (num > pl.tracks.length)
            return reply(message, `**${emoji.cross} Track #${num} doesn't exist. Playlist has ${pl.tracks.length} track(s).**`);

        const removed = pl.tracks.splice(num - 1, 1)[0];
        await doc.save();

        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setTitle('🗑️ Track Removed')
            .setDescription(`Removed **[${removed.title}](${removed.url})** from \`${name}\``)
            .addFields(
                { name: 'Position', value: `#${num}`, inline: true },
                { name: 'Remaining', value: `${pl.tracks.length} track(s)`, inline: true },
            )
            .setFooter({ text: `Removed by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
