'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('ignorechannel', {
    pk: 'id',
    autoInc: true,
});
