'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('vcstatus', {
    pk: 'guildId',
    autoInc: false,
});
