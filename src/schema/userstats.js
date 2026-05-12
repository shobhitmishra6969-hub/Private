'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('userstats', {
    pk: 'userId',
    autoInc: false,
    dates: ['updatedAt'],
});
