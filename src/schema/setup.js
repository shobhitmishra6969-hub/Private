'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('setup', {
    pk: 'Guild',
    autoInc: false,
});
