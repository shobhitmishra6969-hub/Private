'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('giveawayconfig', {
    pk: 'guildId',
    autoInc: false,
    json: ['managerRoles'],
    dates: ['updatedAt'],
});
