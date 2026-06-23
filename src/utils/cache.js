'use strict';

class TTLCache {
    constructor(ttlMs = 30_000) {
        this.ttl = ttlMs;
        this.store = new Map();
    }

    get(key) {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.exp) {
            this.store.delete(key);
            return undefined;
        }
        return entry.val;
    }

    set(key, val) {
        this.store.set(key, { val, exp: Date.now() + this.ttl });
    }

    del(key) {
        this.store.delete(key);
    }

    has(key) {
        return this.get(key) !== undefined;
    }
}

module.exports = {
    prefixCache:      new TTLCache(60_000),
    ignoreCache:      new TTLCache(30_000),
    blacklistCache:   new TTLCache(30_000),
    noprefixCache:    new TTLCache(30_000),
};
