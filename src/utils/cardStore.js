'use strict';

const { randomBytes } = require('crypto');

const store = new Map();

function storeCard(buf, ttlMs = 10 * 60 * 1000) {
  const id = randomBytes(10).toString('hex');
  const expires = Date.now() + ttlMs;
  store.set(id, { buf, expires });
  for (const [k, v] of store) {
    if (v.expires < Date.now()) store.delete(k);
  }
  return id;
}

function getCard(id) {
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expires < Date.now()) { store.delete(id); return null; }
  return entry.buf;
}

function getPublicUrl(id) {
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (!domain) return null;
  return `https://${domain}/np-card/${id}`;
}

module.exports = { storeCard, getCard, getPublicUrl };
