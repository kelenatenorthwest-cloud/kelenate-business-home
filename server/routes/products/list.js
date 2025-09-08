// server/routes/products/list.js
const { db } = require('./db');
const { rowToObj } = require('./helpers');

// Cache the products table columns so we only PRAGMA once
let PRODUCTS_COLS = null;           // Set of lowercase column names
let PRODUCTS_COLS_MAP = null;       // Map: lowercase -> actual column name from DB

function ensureProductsSchema(cb){
  if (PRODUCTS_COLS && PRODUCTS_COLS_MAP) return cb(null, PRODUCTS_COLS, PRODUCTS_COLS_MAP);
  db.all("PRAGMA table_info(products)", [], (err, rows) => {
    if (err) return cb(err);
    const map = new Map();
    for (const r of (rows || [])) {
      const actual = String(r.name || '');
      map.set(actual.toLowerCase(), actual);
    }
    PRODUCTS_COLS_MAP = map;
    PRODUCTS_COLS = new Set(map.keys());
    cb(null, PRODUCTS_COLS, PRODUCTS_COLS_MAP);
  });
}

module.exports = (router) => {
  /*
    Query params:
      - q, category/mainCategory
      - status: all | active | inactive | deleted | stranded
      - includeInactive: true|false   // kept for compatibility (not required by default)
      - limit (1..200), offset (>=0)

    Default behavior:
      - If `status` is omitted → return ALL non-deleted items (both Active and Inactive) *if those columns exist*.
        If a column (e.g. is_deleted/status) doesn't exist, we just skip that predicate.
      - If `status=active|inactive|deleted|stranded|all` → apply that exact filter (when feasible given columns).
  */
  router.get('/products', (req, res) => {
    ensureProductsSchema((_schemaErr, COLS, COLMAP) => {
      const has = (name) => COLS?.has(name.toLowerCase());
      const col = (name) => COLMAP?.get(name.toLowerCase()); // actual column casing

      let { limit = 20, offset = 0, q = '', category = '', mainCategory = '', status = '' } = req.query;
      const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true'; // back-compat

      limit  = Math.max(1, Math.min(1000, Number(limit)  || 20));
      offset = Math.max(0, Number(offset) || 0);

      const where  = [];
      const params = [];

      // Text search (title / sku only if those columns exist)
      const needle = String(q || '').trim().toLowerCase();
      if (needle) {
        const hasTitle = has('title');
        const hasSku   = has('sku');
        if (hasTitle && hasSku) {
          where.push(`(LOWER(${col('title')}) LIKE ? OR LOWER(${col('sku')}) LIKE ?)`);
          params.push(`%${needle}%`, `%${needle}%`);
        } else if (hasTitle) {
          where.push(`LOWER(${col('title')}) LIKE ?`);
          params.push(`%${needle}%`);
        } else if (hasSku) {
          where.push(`LOWER(${col('sku')}) LIKE ?`);
          params.push(`%${needle}%`);
        }
      }

      // Category filter (prefer 'category', fallback to 'mainCategory')
      const catVal = String(mainCategory || category || '').trim();
      if (catVal) {
        if (has('category')) {
          where.push(`${col('category')} = ?`); params.push(catVal);
        } else if (has('mainCategory')) {
          where.push(`${col('mainCategory')} = ?`); params.push(catVal);
        } else if (has('maincategory')) {
          // some schemas may store as lowercase maincategory
          where.push(`${col('maincategory')} = ?`); params.push(catVal);
        }
      }

      const s = String(status || '').toLowerCase();

      // Useful flags
      const hasDeleted = has('is_deleted');
      const hasStatus  = has('status');
      const hasPrice   = has('price');
      const hasMrp     = has('mrp');
      const hasImages  = has('images');

      if (s === 'deleted') {
        if (hasDeleted) {
          where.push(`IFNULL(${col('is_deleted')},0) = 1`);
        } else {
          // No such column -> no "deleted" state; return empty set
          where.push('1 = 0');
        }
      } else if (s === 'inactive') {
        if (hasDeleted) where.push(`IFNULL(${col('is_deleted')},0) = 0`);
        if (hasStatus)  where.push(`LOWER(IFNULL(${col('status')},'active')) = 'inactive'`);
        if (!hasStatus) where.push('1 = 0'); // cannot identify inactive without a status column
      } else if (s === 'active') {
        if (hasDeleted) where.push(`IFNULL(${col('is_deleted')},0) = 0`);
        if (hasStatus)  where.push(`LOWER(IFNULL(${col('status')},'active')) = 'active'`);
        // If no status column, treat all non-deleted as "active-like"
      } else if (s === 'stranded') {
        if (hasDeleted) where.push(`IFNULL(${col('is_deleted')},0) = 0`);
        if (hasStatus)  where.push(`LOWER(IFNULL(${col('status')},'active')) <> 'inactive'`);
        const strandedBits = [];
        if (hasPrice) strandedBits.push(`${col('price')} IS NULL OR ${col('price')} <= 0`);
        if (hasMrp && hasPrice) strandedBits.push(`(${col('mrp')} IS NOT NULL AND ${col('price')} IS NOT NULL AND ${col('mrp')} < ${col('price')})`);
        if (has('category')) strandedBits.push(`${col('category')} IS NULL OR TRIM(${col('category')}) = ''`);
        if (hasImages) strandedBits.push(`${col('images')} IS NULL OR TRIM(${col('images')}) = '' OR TRIM(${col('images')}) = '[]'`);
        if (strandedBits.length) where.push(`(${strandedBits.join(' OR ')})`);
      } else if (s === 'all') {
        if (hasDeleted) where.push(`IFNULL(${col('is_deleted')},0) = 0`);
      } else {
        // DEFAULT: include both Active and Inactive, exclude deleted if column exists
        if (hasDeleted) where.push(`IFNULL(${col('is_deleted')},0) = 0`);
        // No status predicate here (so inactive items are included by default)
        // If you want "active-only unless includeInactive=true", uncomment:
        // if (!includeInactive && hasStatus) where.push(`LOWER(IFNULL(${col('status')},'active')) = 'active'`);
      }

      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sql = `
        SELECT *, rowid AS __rowid
        FROM products
        ${whereSql}
        ORDER BY rowid DESC
        LIMIT ? OFFSET ?
      `;
      params.push(limit, offset);

      db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: String(err) });
        const out = (rows || []).map(rowToObj).filter(Boolean);
        res.json(out);
      });
    });
  });
};
