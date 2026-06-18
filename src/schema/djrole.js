'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('djrole', {
    pk: 'guildId',
    autoInc: false,
});
