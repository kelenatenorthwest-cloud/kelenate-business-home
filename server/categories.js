// server/routes/categories.js
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

// Helpers
function tableFor(type) {
  if (type === 'home') return 'home_categories';
  return 'main_categories';
}

// GET /categories?type=main|home
router.get('/categories', (req, res) => {
  const type = (req.query.type || 'main').toLowerCase();
  const table = tableFor(type);
  db.all(`SELECT name FROM ${table} ORDER BY name ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(rows.map(r => ({ name: r.name })));
  });
});

// POST /categories  {type, value}
router.post('/categories', express.json(), (req, res) => {
  const type = (req.body.type || 'main').toLowerCase();
  const value = (req.body.value || '').trim();
  if (!value) return res.status(400).json({ error: 'value required' });
  const table = tableFor(type);
  db.run(`INSERT OR IGNORE INTO ${table}(name) VALUES(?)`, [value], function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    res.status(201).json({ ok: true, name: value });
  });
});

// PUT /categories/rename  {type, oldName, newName}
router.put('/categories/rename', express.json(), (req, res) => {
  const type = (req.body.type || 'main').toLowerCase();
  const oldName = (req.body.oldName || '').trim();
  const newName = (req.body.newName || '').trim();
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName & newName required' });
  const table = tableFor(type);
  db.run(`UPDATE ${table} SET name=? WHERE name=?`, [newName, oldName], function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ ok: true, changed: this.changes });
  });
});

// DELETE /categories/:type/:name
router.delete('/categories/:type/:name', (req, res) => {
  const type = (req.params.type || 'main').toLowerCase();
  const name = (req.params.name || '').trim();
  const table = tableFor(type);
  db.run(`DELETE FROM ${table} WHERE name=?`, [name], function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ ok: true, deleted: this.changes });
  });
});

module.exports = router;
