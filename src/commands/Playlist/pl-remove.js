const emoji = require('../../emojis');
const { getUserData, findPlaylist, reply } = require('../../utils/playlistHelper');

module.exports = {
    name: 'pl-remove',
    aliases: ['plremove', 'playlist-remove'],
    category: 'Playlist',
    description: 'Remove a track from a playlist (alias for pl-removetrack)',
    usage: '<name> <track number>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const removeTrackCmd = client.commands.get('pl-removetrack');
        if (removeTrackCmd) return removeTrackCmd.execute(message, args, client);
        return reply(message, `**${emoji.cross} Usage:** \`${client.prefix}pl-removetrack <playlist> <track #>\``);
    },
};
