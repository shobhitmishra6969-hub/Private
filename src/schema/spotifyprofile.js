'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('spotifyprofile', {
    pk: 'userId',
    autoInc: false,
    json: ['playlists'],
    dates: ['linkedAt', 'updatedAt'],
});

