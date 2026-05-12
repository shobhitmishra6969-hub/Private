'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('noprefix', {
    pk: 'id',
    autoInc: true,
    dates: ['expiresAt'],
});
