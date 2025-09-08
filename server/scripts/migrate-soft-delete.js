// scripts/migrate-soft-delete.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '..', 'app.db'));

function exec(sql) {
  return new Promise((resolve, reject) => db.run(sql, [], function (err) {
    if (err) return reject(err);
    resolve();
  }));
}
function hasCol(table, name) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => String(r.name).toLowerCase() === name.toLowerCase()));
    });
  });
}

(async () => {
  try {
    if (!(await hasCol('products', 'is_deleted'))) {
      await exec(`ALTER TABLE products ADD COLUMN is_deleted INTEGER DEFAULT 0`);
      console.log('Added products.is_deleted');
    } else {
      console.log('products.is_deleted already exists');
    }

    if (!(await hasCol('products', 'deleted_at'))) {
      await exec(`ALTER TABLE products ADD COLUMN deleted_at TEXT`);
      console.log('Added products.deleted_at');
    } else {
      console.log('products.deleted_at already exists');
    }

    await exec(`CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(is_deleted)`);
    console.log('Index ok: idx_products_deleted');

    console.log('Migration complete ✅');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exit(1);
  } finally {
    db.close();
  }
})();
