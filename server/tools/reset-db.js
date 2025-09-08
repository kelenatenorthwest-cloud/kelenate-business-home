// tools/reset-db.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

function exec(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err); else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

(async () => {
  try {
    db.serialize();

    // Make sure tables exist so DELETE won't fail on fresh DBs
    await exec(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT, mrp REAL, price REAL, sku TEXT UNIQUE,
      category TEXT, moq INTEGER DEFAULT 1, bullets TEXT,
      description TEXT, images TEXT, videos TEXT,
      status TEXT DEFAULT 'active',
      is_deleted INTEGER DEFAULT 0, deleted_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    await exec(`CREATE TABLE IF NOT EXISTS main_categories (name TEXT PRIMARY KEY)`);
    await exec(`CREATE TABLE IF NOT EXISTS home_categories (name TEXT PRIMARY KEY)`);

    // Truncate-style delete
    await exec(`PRAGMA foreign_keys=OFF`);
    await exec(`BEGIN`);
    await exec(`DELETE FROM products`);
    await exec(`DELETE FROM sqlite_sequence WHERE name IN ('products')`);
    await exec(`DELETE FROM main_categories`);
    await exec(`DELETE FROM home_categories`);
    await exec(`COMMIT`);
    await exec(`VACUUM`);

    const rows = await all(`
      SELECT 'products' AS tbl, COUNT(*) AS cnt FROM products
      UNION ALL
      SELECT 'main_categories', COUNT(*) FROM main_categories
      UNION ALL
      SELECT 'home_categories', COUNT(*) FROM home_categories
    `);

    console.table(rows);
    console.log('\n✅ Reset complete:', dbPath);
  } catch (e) {
    console.error('❌ Reset failed:', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();
