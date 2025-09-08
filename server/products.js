// server/routes/products.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

// DB
const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// Ensure table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sku TEXT,
      price REAL DEFAULT 0,
      description TEXT,
      mainCategory TEXT,
      image TEXT,
      images TEXT,           -- JSON string of array
      createdAt INTEGER
    )
  `);
});

// Uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage });

// Helpers
const rowToJson = (r) => ({
  id: r.id,
  title: r.title,
  sku: r.sku,
  price: Number(r.price || 0),
  description: r.description || '',
  mainCategory: r.mainCategory || '',
  image: r.image || '',
  images: (() => { try { return JSON.parse(r.images || '[]'); } catch { return []; } })(),
  createdAt: Number(r.createdAt || 0)
});

// List with search/filter/pagination
router.get('/products', (req, res) => {
  let { limit = 20, offset = 0, q = '', mainCategory = '' } = req.query;
  limit = Math.max(1, Math.min(200, Number(limit) || 20));
  offset = Math.max(0, Number(offset) || 0);

  const where = [];
  const params = [];
  if (q) {
    where.push('(title LIKE ? OR sku LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (mainCategory) {
    where.push('mainCategory = ?');
    params.push(mainCategory);
  }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sql = `
    SELECT * FROM products
    ${whereSql}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(rows.map(rowToJson));
  });
});

// Get by id
router.get('/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id=?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(rowToJson(row));
  });
});

// Create
router.post('/products', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 20 }]), (req, res) => {
  const { title = '', sku = '', price = 0, description = '', mainCategory = '' } = req.body;
  if (!title.trim()) return res.status(400).json({ error: 'title is required' });

  const img = (req.files?.image?.[0]) ? `/uploads/${req.files.image[0].filename}` : '';
  const gallery = (req.files?.images || []).map(f => `/uploads/${f.filename}`);
  const createdAt = Date.now();

  const sql = `
    INSERT INTO products (title, sku, price, description, mainCategory, image, images, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [title.trim(), sku.trim(), Number(price || 0), description || '', mainCategory || '', img, JSON.stringify(gallery), createdAt];

  db.run(sql, params, function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    db.get('SELECT * FROM products WHERE id=?', [this.lastID], (err2, row) => {
      if (err2) return res.status(500).json({ error: String(err2) });
      res.status(201).json(rowToJson(row));
    });
  });
});

// Update (fields optional; gallery replaces if provided)
router.put('/products/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'images', maxCount: 50 }]), (req, res) => {
  const id = req.params.id;

  db.get('SELECT * FROM products WHERE id=?', [id], (err, cur) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!cur) return res.status(404).json({ error: 'Not found' });

    const body = req.body || {};
    const next = {
      title: (body.title ?? cur.title).trim(),
      sku: (body.sku ?? cur.sku) || '',
      price: Number(body.price ?? cur.price || 0),
      description: body.description ?? cur.description || '',
      mainCategory: body.mainCategory ?? cur.mainCategory || '',
      image: cur.image,
      images: (() => { try { return JSON.parse(cur.images || '[]'); } catch { return []; } })()
    };

    if (req.files?.image?.[0]) next.image = `/uploads/${req.files.image[0].filename}`;
    if (req.files?.images?.length) next.images = req.files.images.map(f => `/uploads/${f.filename}`);

    const sql = `
      UPDATE products
      SET title=?, sku=?, price=?, description=?, mainCategory=?, image=?, images=?
      WHERE id=?
    `;
    const params = [next.title, next.sku, next.price, next.description, next.mainCategory, next.image, JSON.stringify(next.images), id];

    db.run(sql, params, function (uerr) {
      if (uerr) return res.status(500).json({ error: String(uerr) });
      db.get('SELECT * FROM products WHERE id=?', [id], (gerr, row) => {
        if (gerr) return res.status(500).json({ error: String(gerr) });
        res.json(rowToJson(row));
      });
    });
  });
});

// Delete
router.delete('/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ ok: true, deleted: this.changes });
  });
});

module.exports = router;
