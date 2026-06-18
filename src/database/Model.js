'use strict';

const { getDb } = require('./index');

class Model {
    /**
     * @param {string} tableName
     * @param {object} opts
     * @param {string}   opts.pk        Primary key column name (default: 'id')
     * @param {boolean}  opts.autoInc   Whether pk is autoincrement INTEGER (default: false)
     * @param {string[]} opts.json      Fields to store as JSON text
     * @param {string[]} opts.dates     Fields to store as INTEGER ms timestamps
     */
    constructor(tableName, { pk = 'id', autoInc = false, json = [], dates = [] } = {}) {
        this.tableName = tableName;
        this.pk = pk;
        this.autoInc = autoInc;
        this.jsonFields = new Set(json);
        this.dateFields = new Set(dates);
    }

    get db() {
        return getDb();
    }

    // ── Serialization ──────────────────────────────────────────────────────────

    _serializeVal(field, value) {
        if (value === null || value === undefined) return null;
        if (this.jsonFields.has(field)) {
            return typeof value === 'string' ? value : JSON.stringify(value);
        }
        if (this.dateFields.has(field)) {
            if (value instanceof Date) return value.getTime();
            if (typeof value === 'number') return value;
            if (typeof value === 'string') return new Date(value).getTime();
            return null;
        }
        if (typeof value === 'boolean') return value ? 1 : 0;
        return value;
    }

    _deserializeRow(row) {
        if (!row) return null;
        const obj = {};
        for (const [key, value] of Object.entries(row)) {
            if (key === 'id') {
                obj.id = value;
                obj._id = value;
            } else if (this.jsonFields.has(key)) {
                try { obj[key] = JSON.parse(value ?? '[]'); } catch { obj[key] = []; }
            } else if (this.dateFields.has(key)) {
                obj[key] = value != null ? new Date(value) : null;
            } else {
                obj[key] = value;
            }
        }
        return obj;
    }

    _attach(data) {
        if (!data) return null;
        const model = this;
        const doc = Object.assign(Object.create(null), data);
        doc.save = async function () {
            return model._upsert(this);
        };
        return doc;
    }

    // ── WHERE builder ──────────────────────────────────────────────────────────

    _buildConditions(filter) {
        const conditions = [];
        const values = [];

        for (const [key, value] of Object.entries(filter)) {
            if (key === '$or') {
                const orParts = [];
                for (const branch of value) {
                    const { conditions: bc, values: bv } = this._buildConditions(branch);
                    if (bc.length) {
                        orParts.push(`(${bc.join(' AND ')})`);
                        values.push(...bv);
                    }
                }
                if (orParts.length) conditions.push(`(${orParts.join(' OR ')})`);
            } else if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
                // Comparison operators: $lt, $lte, $gt, $gte, $ne
                for (const [op, opVal] of Object.entries(value)) {
                    const opMap = { $lt: '<', $lte: '<=', $gt: '>', $gte: '>=', $ne: '!=' };
                    const sqlOp = opMap[op];
                    if (!sqlOp) continue;
                    if (opVal === null || opVal === undefined) {
                        conditions.push(op === '$ne' ? `"${key}" IS NOT NULL` : `"${key}" IS NULL`);
                    } else {
                        conditions.push(`"${key}" ${sqlOp} ?`);
                        values.push(this._serializeVal(key, opVal));
                    }
                }
            } else if (value === null || value === undefined) {
                conditions.push(`"${key}" IS NULL`);
            } else if (typeof value === 'boolean') {
                conditions.push(`"${key}" = ?`);
                values.push(value ? 1 : 0);
            } else if (this.dateFields.has(key) && value instanceof Date) {
                conditions.push(`"${key}" = ?`);
                values.push(value.getTime());
            } else {
                conditions.push(`"${key}" = ?`);
                values.push(value);
            }
        }

        return { conditions, values };
    }

    _buildWhere(filter) {
        const { conditions, values } = this._buildConditions(filter);
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        return { where, values };
    }

    // ── Upsert (used by doc.save()) ────────────────────────────────────────────

    _upsert(doc) {
        const raw = Object.assign({}, doc);
        delete raw.save;
        delete raw._id;

        if (this.autoInc && raw.id != null) {
            const id = raw.id;
            const cols = Object.keys(raw).filter(k => k !== 'id');
            const vals = cols.map(k => this._serializeVal(k, raw[k]));
            const set = cols.map(c => `"${c}" = ?`).join(', ');
            this.db.prepare(`UPDATE "${this.tableName}" SET ${set} WHERE id = ?`).run(...vals, id);
        } else {
            const cols = Object.keys(raw).filter(k => k !== 'id' || !this.autoInc);
            const filteredCols = this.autoInc ? cols.filter(k => k !== 'id') : cols;
            const vals = filteredCols.map(k => this._serializeVal(k, raw[k]));
            const placeholders = filteredCols.map(() => '?').join(', ');
            this.db.prepare(
                `INSERT OR REPLACE INTO "${this.tableName}" (${filteredCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
            ).run(...vals);
        }
    }

    // ── MongoDB update operator support ────────────────────────────────────────

    _applyUpdate(base, update) {
        const result = Object.assign({}, base);
        delete result.save;

        const hasOp = update.$set || update.$push || update.$pull || update.$addToSet || update.$unset;

        if (update.$set) {
            Object.assign(result, update.$set);
        }
        if (update.$unset) {
            for (const k of Object.keys(update.$unset)) {
                result[k] = null;
            }
        }
        if (update.$push) {
            for (const [k, v] of Object.entries(update.$push)) {
                if (!Array.isArray(result[k])) result[k] = [];
                result[k] = [...result[k], v];
            }
        }
        if (update.$addToSet) {
            for (const [k, v] of Object.entries(update.$addToSet)) {
                if (!Array.isArray(result[k])) result[k] = [];
                if (!result[k].includes(v)) result[k] = [...result[k], v];
            }
        }
        if (update.$pull) {
            for (const [k, matcher] of Object.entries(update.$pull)) {
                if (!Array.isArray(result[k])) result[k] = [];
                if (typeof matcher === 'object' && matcher !== null) {
                    result[k] = result[k].filter(item =>
                        !Object.entries(matcher).every(([pk, pv]) => item[pk] === pv)
                    );
                } else {
                    result[k] = result[k].filter(item => item !== matcher);
                }
            }
        }

        if (!hasOp) {
            for (const [k, v] of Object.entries(update)) {
                if (!k.startsWith('$')) result[k] = v;
            }
        }

        return result;
    }

    // ── Public Mongoose-compatible API ─────────────────────────────────────────

    async findOne(filter = {}) {
        const { where, values } = this._buildWhere(filter);
        const row = this.db.prepare(`SELECT * FROM "${this.tableName}" ${where} LIMIT 1`).get(...values);
        return this._attach(this._deserializeRow(row));
    }

    async find(filter = {}) {
        const { where, values } = this._buildWhere(filter);
        const rows = this.db.prepare(`SELECT * FROM "${this.tableName}" ${where}`).all(...values);
        return rows.map(r => this._attach(this._deserializeRow(r)));
    }

    async findById(id) {
        const row = this.db.prepare(`SELECT * FROM "${this.tableName}" WHERE id = ?`).get(id);
        return this._attach(this._deserializeRow(row));
    }

    async create(data) {
        const raw = Object.assign({}, data);
        delete raw._id;
        if (this.autoInc) delete raw.id;

        const cols = Object.keys(raw);
        const vals = cols.map(k => this._serializeVal(k, raw[k]));
        const placeholders = cols.map(() => '?').join(', ');

        const info = this.db.prepare(
            `INSERT INTO "${this.tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
        ).run(...vals);

        const newId = this.autoInc ? info.lastInsertRowid : undefined;
        const built = this._deserializeRow(newId != null ? { ...raw, id: newId } : raw);
        return this._attach(built);
    }

    async findOneAndUpdate(filter, update, opts = {}) {
        let existing = await this.findOne(filter);

        if (!existing) {
            if (!opts.upsert) return null;
            const newData = this._applyUpdate({ ...filter }, update);
            return this.create(newData);
        }

        const updated = this._applyUpdate(existing, update);
        this._upsert(updated);
        return this._attach(updated);
    }

    async findOneAndDelete(filter) {
        const existing = await this.findOne(filter);
        if (!existing) return null;
        const { where, values } = this._buildWhere(filter);
        this.db.prepare(
            `DELETE FROM "${this.tableName}" WHERE rowid = (SELECT rowid FROM "${this.tableName}" ${where} LIMIT 1)`
        ).run(...values);
        return existing;
    }

    async deleteOne(filter) {
        const { where, values } = this._buildWhere(filter);
        const info = this.db.prepare(
            `DELETE FROM "${this.tableName}" WHERE rowid = (SELECT rowid FROM "${this.tableName}" ${where} LIMIT 1)`
        ).run(...values);
        return { deletedCount: info.changes };
    }

    async deleteMany(filter = {}) {
        const { where, values } = this._buildWhere(filter);
        const info = this.db.prepare(
            `DELETE FROM "${this.tableName}" ${where}`
        ).run(...values);
        return { deletedCount: info.changes };
    }

    async updateOne(filter, update) {
        return this.findOneAndUpdate(filter, update);
    }

    async countDocuments(filter = {}) {
        const { where, values } = this._buildWhere(filter);
        const row = this.db.prepare(`SELECT COUNT(*) as n FROM "${this.tableName}" ${where}`).get(...values);
        return row?.n ?? 0;
    }
}

module.exports = { Model };
