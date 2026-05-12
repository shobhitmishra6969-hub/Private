'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('autorole', {
    pk: 'guildId',
    autoInc: false,
    json: ['roles'],
});
