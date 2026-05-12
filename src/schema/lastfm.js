'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('lastfm', {
    pk: 'userId',
    autoInc: false,
    json: [],
});
