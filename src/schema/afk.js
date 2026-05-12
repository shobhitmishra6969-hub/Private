'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('afk', {
    pk: 'userId',
    autoInc: false,
    dates: ['createdAt'],
});
