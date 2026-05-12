'use strict';

const Playlist = require('../schema/playlist');

const MAX_PLAYLISTS = 10;
const MAX_TRACKS = 200;

async function getUserData(userId) {
    let doc = await Playlist.findOne({ userId });
    if (!doc) {
        doc = await Playlist.create({ userId, playlists: [] });
    }
    if (!Array.isArray(doc.playlists)) doc.playlists = [];
    return doc;
}

function findPlaylist(doc, name) {
    return doc.playlists.find(p => p.name.toLowerCase() === name.toLowerCase());
}

function reply(message, content) {
    const {
        ContainerBuilder,
        TextDisplayBuilder,
        MessageFlags,
    } = require('discord.js');
    const display = new TextDisplayBuilder().setContent(content);
    const container = new ContainerBuilder().addTextDisplayComponents(display);
    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = { getUserData, findPlaylist, reply, MAX_PLAYLISTS, MAX_TRACKS };
