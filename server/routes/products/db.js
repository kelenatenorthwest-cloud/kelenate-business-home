// server/routes/products/db.js
const path    = require('path');
const fs      = require('fs');                    // ✅ added
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// ✅ shared uploads directory (…/server/uploads) and ensure it exists
const uploadDir = path.join(__dirname, '..', '..', 'uploads');   // ✅ added
if (!fs.existsSync(uploadDir)) {                                  // ✅ added
  fs.mkdirSync(uploadDir, { recursive: true });                   // ✅ added
}

/**
 * Ensure/migrate columns helper
 * Now supports an optional callback `done` that fires AFTER all ALTER/UPDATE ops finish.
 * Signature stays backward-compatible: ensureColumns(table, colDefs [, done])
 */
function ensureColumns(table, colDefs, done) {
  // allow (table, colDefs) without callback
  const onDone = typeof done === 'function' ? done : null;

  db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
    if (err) {
      console.error('PRAGMA error', err);
      if (onDone) onDone(err);
      return;
    }

    const have = new Set((rows || []).map(r => String(r.name || '').toLowerCase()));

    // Build tasks for missing columns (run serially)
    const tasks = [];
    for (const [name, decl] of (colDefs || [])) {
      if (have.has(String(name).toLowerCase())) continue;

      let safeDecl = decl || '';
      const needsBackfillTS = /\bDEFAULT\s+CURRENT_TIMESTAMP\b/i.test(safeDecl);
      if (needsBackfillTS) {
        // SQLite can't set DEFAULT CURRENT_TIMESTAMP on ALTER TABLE in older versions;
        // add the column, then backfill CURRENT_TIMESTAMP manually.
        safeDecl = safeDecl.replace(/\s+DEFAULT\s+CURRENT_TIMESTAMP\b/i, '');
      }

      tasks.push((next) => {
        const sql = `ALTER TABLE ${table} ADD COLUMN ${name} ${safeDecl}`;
        db.run(sql, [], (e) => {
          if (e) {
            console.error(`Failed: ${sql}`, e.message);
            // continue even on error
          }
          if (needsBackfillTS) {
            const backfill = `UPDATE ${table}
                              SET ${name} = COALESCE(NULLIF(${name}, ''), CURRENT_TIMESTAMP)
                              WHERE ${name} IS NULL OR ${name} = ''`;
            db.run(backfill, [], (e2) => {
              if (e2) console.error(`Backfill failed for ${name}:`, e2.message);
              next();
            });
          } else {
            next();
          }
        });
      });
    }

    // Run tasks serially; when done, call onDone
    let i = 0;
    const runNext = () => {
      if (i >= tasks.length) {
        if (onDone) onDone(null);
        return;
      }
      const task = tasks[i++];
      try { task(runNext); } catch (e) { console.error('ensureColumns task error:', e); runNext(); }
    };

    if (tasks.length) runNext();
    else if (onDone) onDone(null);
  });
}

// Schema + indices
db.serialize(() => {
  // base table (covers fresh DBs)
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      mrp REAL,
      price REAL,
      sku TEXT UNIQUE NOT NULL,
      category TEXT,
      moq INTEGER DEFAULT 1,
      bullets TEXT,
      description TEXT,
      images TEXT,
      videos TEXT,
      status TEXT DEFAULT 'active',
      is_deleted INTEGER DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Ensure columns (for existing DBs missing some fields), THEN create indexes.
  ensureColumns('products', [
    ['title',       'TEXT'],
    ['mrp',         'REAL'],
    ['price',       'REAL'],
    ['sku',         'TEXT'],
    ['category',    'TEXT'],
    ['moq',         'INTEGER DEFAULT 1'],
    ['bullets',     'TEXT'],
    ['description', 'TEXT'],
    ['images',      'TEXT'],
    ['videos',      'TEXT'],
    ['status',      "TEXT DEFAULT 'active'"],
    ['is_deleted',  'INTEGER DEFAULT 0'],
    ['deleted_at',  'TEXT'],
    ['created_at',  'TEXT DEFAULT CURRENT_TIMESTAMP'],
    ['updated_at',  'TEXT DEFAULT CURRENT_TIMESTAMP'],
  ], () => {
    // ✅ run AFTER columns exist, so index creation can't fail
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique ON products (sku)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_products_deleted ON products (is_deleted)`);
  });

  // For "stranded" checks (as in your original)
  db.run(`CREATE TABLE IF NOT EXISTS main_categories (name TEXT PRIMARY KEY)`);
});

// ✅ now exports uploadDir as well
module.exports = { db, ensureColumns, uploadDir };
