'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('playlist', {
    pk: 'userId',
    autoInc: false,
    json: ['playlists'],
});
