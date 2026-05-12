'use strict';
const { Model } = require('../database/Model');

module.exports = new Model('giveaway', {
    pk: 'id',
    autoInc: true,
    json: ['entries', 'winners'],
    dates: ['endsAt', 'createdAt', 'updatedAt'],
});
