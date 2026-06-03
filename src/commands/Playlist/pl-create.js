const emoji = require('../../emojis');
const { EmbedBuilder } = require('discord.js');
const { getUserData, findPlaylist, reply, MAX_PLAYLISTS } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-create',
    aliases: ['plcreate', 'playlist-create'],
    category: 'Playlist',
    description: 'Create a new playlist',
    usage: '<name>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const name = args.join(' ').trim();
        if (!name) return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-create <name>\``);
        if (name.length > 32) return reply(message, `**${emoji.cross} Playlist name must be 32 characters or fewer.**`);

        const doc = await getUserData(message.author.id);

        if (doc.playlists.length >= MAX_PLAYLISTS)
            return reply(message, `**${emoji.cross} You can only have up to \`${MAX_PLAYLISTS}\` playlists.**`);

        if (findPlaylist(doc, name))
            return reply(message, `**${emoji.warn} A playlist named \`${name}\` already exists.**`);

        doc.playlists.push({ name, tracks: [], createdAt: Date.now() });
        await doc.save();

        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setTitle('🎵 Playlist Created')
            .setDescription(`Successfully created playlist **\`${name}\`**!`)
            .addFields(
                { name: 'Tracks', value: '0', inline: true },
                { name: 'Slot', value: `${doc.playlists.length}/${MAX_PLAYLISTS}`, inline: true },
            )
            .setFooter({ text: `Use ${client.prefix}pl-add ${name} <song> to add tracks` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
