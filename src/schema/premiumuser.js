'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('premiumuser', {
    pk: 'userId',
    autoInc: false,
    dates: ['addedAt', 'expiresAt'],
});
