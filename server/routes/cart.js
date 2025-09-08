// server/routes/cart.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// ---- Schema (and uniqueness for upsert/merge) ----
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      title TEXT,
      image TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 1,
      in_stock INTEGER NOT NULL DEFAULT 1,
      color TEXT DEFAULT '',
      pattern TEXT DEFAULT '',
      updated_at INTEGER
    )
  `);

  // One row per (user, product, variant). If product_id is NULL, no conflict triggers (we handle those manually).
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_unique
          ON cart_items(user_id, product_id, color, pattern)`);
});

// ---- Auth helpers ----
function getDeep(obj, pathArr) {
  return pathArr.reduce((o, k) => (o && o[k] != null ? o[k] : undefined), obj);
}
function getUserId(req) {
  const candidates = [
    getDeep(req, ['user', 'id']),
    getDeep(req, ['user', 'user', 'id']),
    getDeep(req, ['auth', 'id']),
    getDeep(req, ['auth', 'user', 'id']),
    getDeep(req, ['session', 'user', 'id']),
    getDeep(req, ['session', 'user', 'user', 'id']),
    getDeep(req, ['res', 'locals', 'user', 'id']),
    getDeep(req, ['res', 'locals', 'user', 'user', 'id']),
  ].find(v => v != null);
  const uid = Number(candidates);
  return Number.isFinite(uid) ? uid : (candidates ?? null);
}
function ensureAuth(req, res, next) {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });
  req._uid = uid;
  next();
}

// ---- Query helpers ----
function selectCart(userId){
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM cart_items WHERE user_id = ? ORDER BY updated_at DESC, id DESC`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        const items = rows.map(r => ({
          id: r.id,
          productId: r.product_id,
          title: r.title,
          image: r.image,
          price_cents: r.price_cents,
          qty: r.qty,
          inStock: !!r.in_stock,
          color: r.color || '',
          pattern: r.pattern || ''
        }));
        const subtotal_cents = items.reduce((s,i)=> s + i.price_cents * i.qty, 0);
        resolve({ items, count: items.reduce((s,i)=> s + i.qty, 0), subtotal_cents });
      }
    );
  });
}

// Parse JSON for all cart routes
router.use(express.json());

// ---- Routes ----

// GET /api/cart
router.get('/cart', ensureAuth, async (req, res) => {
  try {
    const cart = await selectCart(req._uid);
    res.json(cart);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// PATCH /api/cart/items/:id { qty }
router.patch('/cart/items/:id', ensureAuth, (req, res) => {
  const id  = Number(req.params.id || 0);
  const qty = Math.max(1, Math.min(999, Number(req.body?.qty || 1)));
  const now = Date.now();
  db.run(
    `UPDATE cart_items SET qty = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    [qty, now, id, req._uid],
    async function(err){
      if (err) return res.status(500).json({ error: String(err) });
      const cart = await selectCart(req._uid);
      res.json({ ok:true, cart });
    }
  );
});

// DELETE /api/cart/items/:id
router.delete('/cart/items/:id', ensureAuth, (req, res) => {
  const id = Number(req.params.id || 0);
  db.run(
    `DELETE FROM cart_items WHERE id = ? AND user_id = ?`,
    [id, req._uid],
    async function(err){
      if (err) return res.status(500).json({ error: String(err) });
      const cart = await selectCart(req._uid);
      res.json({ ok:true, cart });
    }
  );
});

// POST /api/cart/items  -> add/upsert item
router.post('/cart/items', ensureAuth, (req, res) => {
  let {
    product_id,
    title,
    image,
    price_cents,
    qty = 1,
    in_stock = 1,
    color = '',
    pattern = ''
  } = req.body || {};

  // Normalize
  const now  = Date.now();
  const pid  = (product_id === '' || product_id === null || product_id === undefined)
                ? null : Number(product_id);
  const q    = Math.max(1, Math.min(999, Number(qty || 1)));
  const pc   = Number(price_cents || 0);
  color      = String(color || '');
  pattern    = String(pattern || '');
  title      = (title || 'Item');
  image      = (image || '');
  in_stock   = in_stock ? 1 : 0;

  // If we have a product_id -> UPSERT using the unique index
  if (pid != null && Number.isFinite(pid)) {
    const sql = `
      INSERT INTO cart_items (user_id, product_id, title, image, price_cents, qty, in_stock, color, pattern, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, product_id, color, pattern)
      DO UPDATE SET
        qty        = MIN(999, cart_items.qty + excluded.qty),
        title      = excluded.title,
        image      = excluded.image,
        price_cents= excluded.price_cents,
        in_stock   = excluded.in_stock,
        updated_at = excluded.updated_at
    `;
    db.run(sql,
      [req._uid, pid, title, image, pc, q, in_stock, color, pattern, now],
      async function(err){
        if (err) return res.status(500).json({ error: String(err) });
        const cart = await selectCart(req._uid);
        res.json({ ok:true, id: this.lastID, cart });
      }
    );
    return;
  }

  // Fallback path (no product_id): best-effort merge on title+price+variant+image
  const findSql = `
    SELECT id, qty FROM cart_items
    WHERE user_id = ? AND product_id IS NULL
      AND title = ? AND price_cents = ? AND color = ? AND pattern = ? AND image = ?
    LIMIT 1
  `;
  db.get(findSql, [req._uid, title, pc, color, pattern, image], (ferr, row) => {
    if (ferr) return res.status(500).json({ error: String(ferr) });

    if (row) {
      // Update existing qty
      const newQty = Math.min(999, Number(row.qty || 0) + q);
      db.run(
        `UPDATE cart_items SET qty=?, updated_at=? WHERE id=? AND user_id=?`,
        [newQty, now, row.id, req._uid],
        async function(uerr){
          if (uerr) return res.status(500).json({ error: String(uerr) });
          const cart = await selectCart(req._uid);
          res.json({ ok:true, id: row.id, cart });
        }
      );
    } else {
      // Insert new row
      db.run(
        `INSERT INTO cart_items (user_id, product_id, title, image, price_cents, qty, in_stock, color, pattern, updated_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req._uid, title, image, pc, q, in_stock, color, pattern, now],
        async function(ierr){
          if (ierr) return res.status(500).json({ error: String(ierr) });
          const cart = await selectCart(req._uid);
          res.json({ ok:true, id: this.lastID, cart });
        }
      );
    }
  });
});

module.exports = router;
