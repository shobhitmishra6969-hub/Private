'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('blacklist', {
    pk: 'userId',
    autoInc: false,
    dates: ['timestamp'],
});
