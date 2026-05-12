'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('liked', {
    pk: 'userId',
    autoInc: false,
    json: ['songs'],
});
