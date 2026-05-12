'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('userbadges', {
    pk: 'userId',
    autoInc: false,
    json: ['badges'],
});
