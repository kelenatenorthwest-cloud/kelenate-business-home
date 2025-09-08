// File: E:\amazon-business-home\server\routes\categories.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// Ensure tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS main_categories (name TEXT PRIMARY KEY)`);
  db.run(`CREATE TABLE IF NOT EXISTS home_categories (name TEXT PRIMARY KEY)`);
});

const VALID_TYPES = new Set(['main', 'home', 'both']);
const tableFor = (type) => (type === 'home' ? 'home_categories' : 'main_categories');
const sanitizeName = (s) => String(s || '').trim();

/**
 * Convert to strict Title Case:
 * - Collapses multiple spaces
 * - Uppercases the first letter of each word
 * - Keeps hyphenated segments correctly cased (e.g. "usb-c hub" -> "Usb-C Hub")
 */
function toTitleCaseStrict(raw) {
  const s = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .map(w =>
      w
        .split('-')
        .map(seg => (seg ? seg[0].toUpperCase() + seg.slice(1).toLowerCase() : seg))
        .join('-')
    )
    .join(' ');
}

/** Find actual stored name by case-insensitive match; returns the stored row name or null */
function getExistingCaseInsensitive(table, name, cb) {
  db.get(
    `SELECT name FROM ${table} WHERE LOWER(name)=LOWER(?) LIMIT 1`,
    [name],
    (err, row) => cb(err, row ? row.name : null)
  );
}

// Small helper to read distinct product categories (safe empty on errors)
function getDistinctProductCategories(cb) {
  db.all(
    `SELECT DISTINCT category AS name
       FROM products
      WHERE category IS NOT NULL AND TRIM(category) <> ''
      ORDER BY name ASC`,
    [],
    (e, rows) => {
      if (e || !rows) return cb(null, []);
      const out = [];
      const seen = new Set();
      for (const r of rows) {
        const t = toTitleCaseStrict(r.name || '');
        if (!t) continue;
        const k = t.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ name: t });
      }
      cb(null, out);
    }
  );
}

// JSON parser for this router (body may be tiny)
router.use(express.json());

/* ========= GET /categories?type=main|home|both ========= */
router.get('/categories', (req, res) => {
  const type = String(req.query.type || 'main').toLowerCase();
  if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'type must be main|home|both' });

  if (type === 'both') {
    db.serialize(() => {
      db.all(`SELECT name FROM main_categories ORDER BY name ASC`, [], (e1, rows1) => {
        if (e1) return res.status(500).json({ error: String(e1) });

        // Fallback for main: use products.category if main_categories is empty
        const emitBoth = (mainRows, homeRows) => {
          res.json({
            main: (mainRows || []).map(r => ({ name: r.name })),
            home: (homeRows || []).map(r => ({ name: r.name })),
          });
        };

        const finishWithHome = (mainRows) => {
          db.all(`SELECT name FROM home_categories ORDER BY name ASC`, [], (e2, rows2) => {
            if (e2) return res.status(500).json({ error: String(e2) });
            emitBoth(mainRows, rows2 || []);
          });
        };

        if (rows1 && rows1.length) {
          finishWithHome(rows1);
        } else {
          getDistinctProductCategories((_e, prodRows) => finishWithHome(prodRows || []));
        }
      });
    });
    return;
  }

  const table = tableFor(type);
  db.all(`SELECT name FROM ${table} ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });

    // For type=main, fallback to products if admin table is empty
    if (type === 'main' && (!rows || rows.length === 0)) {
      return getDistinctProductCategories((_e, prodRows) => {
        return res.json(prodRows || []);
      });
    }

    res.json((rows || []).map(r => ({ name: r.name })));
  });
});

/* ========= POST /categories  {type,value} =========
   - Always store Title Case; merge/rename if a case-insensitive variant already exists.
*/
router.post('/categories', (req, res) => {
  const type = String(req.body.type || 'main').toLowerCase();
  const raw = sanitizeName(req.body.value);
  if (!VALID_TYPES.has(type) || type === 'both') return res.status(400).json({ error: 'type must be main|home' });
  if (!raw) return res.status(400).json({ error: 'value required' });

  const table = tableFor(type);
  const normalized = toTitleCaseStrict(raw);

  getExistingCaseInsensitive(table, normalized, (findErr, existingName) => {
    if (findErr) return res.status(500).json({ error: String(findErr) });

    if (existingName) {
      // If different case stored, normalize it to canonical Title Case
      if (existingName !== normalized) {
        db.run(`UPDATE ${table} SET name=? WHERE name=?`, [normalized, existingName], function (uErr) {
          if (uErr) return res.status(500).json({ error: String(uErr) });
          return res.status(200).json({ ok: true, name: normalized, inserted: 0, normalizedFrom: existingName });
        });
      } else {
        return res.status(200).json({ ok: true, name: normalized, inserted: 0 });
      }
    } else {
      db.run(`INSERT INTO ${table}(name) VALUES(?)`, [normalized], function (iErr) {
        if (iErr) return res.status(500).json({ error: String(iErr) });
        return res.status(201).json({ ok: true, name: normalized, inserted: this.changes });
      });
    }
  });
});

/* ========= PUT /categories/rename  {type,oldName,newName} =========
   - For type=main: merge-friendly rename; updates products.category, and
     merges the category if the target already exists.
   - All names are normalized to Title Case.
*/
router.put('/categories/rename', (req, res) => {
  const type = String(req.body.type || 'main').toLowerCase();
  const oldRaw = sanitizeName(req.body.oldName);
  const newRaw = sanitizeName(req.body.newName);
  if (!VALID_TYPES.has(type) || type === 'both') return res.status(400).json({ error: 'type must be main|home' });
  if (!oldRaw || !newRaw) return res.status(400).json({ error: 'oldName & newName required' });

  const table = tableFor(type);
  const newName = toTitleCaseStrict(newRaw);

  // Resolve the actually stored old name (case-insensitive)
  getExistingCaseInsensitive(table, oldRaw, (err, oldStored) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!oldStored) return res.status(404).json({ error: `Category "${oldRaw}" not found` });

    // If names are effectively the same (after normalization), only fix casing if needed
    if (oldStored.toLowerCase() === newName.toLowerCase()) {
      if (oldStored === newName) {
        return res.json({ ok: true, changed: 0, productsUpdated: 0 });
      }
      // Just update casing on the same row
      db.run(`UPDATE ${table} SET name=? WHERE name=?`, [newName, oldStored], function (e0) {
        if (e0) return res.status(500).json({ error: String(e0) });
        return res.json({ ok: true, changed: this.changes || 0, productsUpdated: 0 });
      });
      return;
    }

    if (type === 'home') {
      // Simple rename with merge for home
      getExistingCaseInsensitive(table, newName, (e1, targetStored) => {
        if (e1) return res.status(500).json({ error: String(e1) });
        if (targetStored && targetStored !== oldStored) {
          // Merge by deleting the old one
          db.run(`DELETE FROM ${table} WHERE name=?`, [oldStored], function (e2) {
            if (e2) return res.status(500).json({ error: String(e2) });
            return res.json({ ok: true, changed: this.changes || 0, productsUpdated: 0 });
          });
        } else {
          // Update/rename (and fix casing)
          db.run(`UPDATE ${table} SET name=? WHERE name=?`, [newName, oldStored], function (e2) {
            if (e2) return res.status(500).json({ error: String(e2) });
            return res.json({ ok: true, changed: this.changes || 0, productsUpdated: 0 });
          });
        }
      });
      return;
    }

    // type === 'main' -> rename & update products.category, merge if needed
    getExistingCaseInsensitive('main_categories', newName, (e3, targetStored) => {
      if (e3) return res.status(500).json({ error: String(e3) });

      db.serialize(() => {
        // Ensure the target exists (canonical Title Case)
        if (!targetStored) {
          db.run(`INSERT OR IGNORE INTO main_categories(name) VALUES(?)`, [newName]);
        }

        // Update products to point to canonical newName (case-insensitive source)
        db.run(
          `UPDATE products SET category=? WHERE LOWER(category)=LOWER(?)`,
          [newName, oldStored],
          function (e4) {
            if (e4) return res.status(500).json({ error: String(e4) });
            const productsUpdated = this.changes || 0;

            if (targetStored && targetStored !== oldStored) {
              // Merge: delete the old row
              db.run(`DELETE FROM main_categories WHERE name=?`, [oldStored], function (e5) {
                if (e5) return res.status(500).json({ error: String(e5) });
                return res.json({ ok: true, changed: this.changes || 0, productsUpdated });
              });
            } else {
              // Straight rename/case-fix of the row itself
              db.run(`UPDATE main_categories SET name=? WHERE name=?`, [newName, oldStored], function (e6) {
                if (e6) return res.status(500).json({ error: String(e6) });
                return res.json({ ok: true, changed: this.changes || 0, productsUpdated });
              });
            }
          }
        );
      });
    });
  });
});

/* ========= DELETE /categories/:type/:name =========
   - If type=main, clear products.category to NULL so they appear as Stranded
   - Case-insensitive delete with Title Case normalization for consistency
*/
router.delete('/categories/:type/:name', (req, res) => {
  const type = String(req.params.type || 'main').toLowerCase();
  const raw = sanitizeName(req.params.name);
  if (!VALID_TYPES.has(type) || type === 'both') return res.status(400).json({ error: 'type must be main|home' });
  if (!raw) return res.status(400).json({ error: 'name required' });

  const table = tableFor(type);

  getExistingCaseInsensitive(table, raw, (err, storedName) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!storedName) return res.json({ ok: true, deleted: 0, productsCleared: 0 });

    db.run(`DELETE FROM ${table} WHERE name=?`, [storedName], function (dErr) {
      if (dErr) return res.status(500).json({ error: String(dErr) });
      const catDeleted = this.changes || 0;

      if (type !== 'main') {
        return res.json({ ok: true, deleted: catDeleted, productsCleared: 0 });
      }

      db.run(
        `UPDATE products SET category=NULL WHERE LOWER(category)=LOWER(?)`,
        [storedName],
        function (perr) {
          if (perr) return res.status(500).json({ error: String(perr) });
          res.json({ ok: true, deleted: catDeleted, productsCleared: this.changes || 0 });
        }
      );
    });
  });
});

/* ========= NEW: GET /categories/tree =========
   Returns a flat "root" tree the sidebar can render:
   - Prefer names from main_categories
   - Fallback to DISTINCT products.category
   Shape: [ { name: "Category Name" }, ... ]
*/
router.get('/categories/tree', (req, res) => {
  const emit = (names = []) =>
    res.json(names
      .map(n => toTitleCaseStrict(n))
      .filter(Boolean)
      .map(n => ({ name: n }))
    );

  // 1) Prefer explicit admin-managed main categories
  db.all(`SELECT name FROM main_categories ORDER BY name ASC`, [], (e1, rows1) => {
    if (!e1 && rows1 && rows1.length) {
      return emit(rows1.map(r => r.name));
    }

    // 2) Fallback: derive from products.category if table/column exists
    db.all(
      `SELECT DISTINCT category AS name FROM products
       WHERE category IS NOT NULL AND TRIM(category) <> ''
       ORDER BY name ASC`,
      [],
      (e2, rows2) => {
        if (e2 || !rows2) return emit([]); // graceful empty list
        emit(rows2.map(r => r.name));
      }
    );
  });
});

module.exports = router;
