'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('userpreferences', {
    pk: 'userId',
    autoInc: false,
    dates: ['createdAt', 'updatedAt'],
});
