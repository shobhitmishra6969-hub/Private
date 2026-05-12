'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('voicerole', {
    pk: 'guildId',
    autoInc: false,
});
