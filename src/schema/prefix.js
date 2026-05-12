'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('prefix', {
    pk: 'Guild',
    autoInc: false,
});
