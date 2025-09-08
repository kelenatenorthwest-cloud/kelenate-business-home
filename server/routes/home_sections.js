// server/routes/home_sections.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// Ensure legacy table (keyed rows) + NEW ordered table
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS home_sections (
      key TEXT PRIMARY KEY,        -- keep | pick | freq
      title TEXT NOT NULL,
      category TEXT DEFAULT ''
    )
  `);
  const seed = [
    ['keep', 'Keep shopping for'],
    ['pick', 'Pick up where you left off'],
    ['freq', 'Frequently reordered items for you'],
  ];
  seed.forEach(([key, title]) => {
    db.run(`INSERT OR IGNORE INTO home_sections (key, title, category) VALUES (?, ?, '')`, [key, title]);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS home_sections_order (
      position INTEGER PRIMARY KEY,    -- 1-based index
      category TEXT NOT NULL
    )
  `);
});

// ---------- Legacy endpoints (back-compat) ----------
router.get('/home-sections', (_req, res) => {
  db.all(`SELECT key, title, category FROM home_sections`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    const out = { keep:{title:'Keep shopping for',category:''}, pick:{title:'Pick up where you left off',category:''}, freq:{title:'Frequently reordered items for you',category:''} };
    rows.forEach(r => { out[r.key] = { title:r.title, category:r.category || '' }; });
    res.json(out);
  });
});

router.put('/home-sections', express.json(), (req, res) => {
  const b = req.body || {};
  const keys = ['keep','pick','freq'];
  const ops = keys.map(k => new Promise((resolve, reject) => {
    const val = typeof b[k] === 'string' ? b[k] : '';
    db.run(`UPDATE home_sections SET category=? WHERE key=?`, [val, k], function(err){
      if (err) reject(err); else resolve();
    });
  }));
  Promise.all(ops).then(()=>res.json({ok:true})).catch(e=>res.status(500).json({error:String(e)}));
});

// ---------- NEW ordered list endpoints ----------
router.get('/home-sections-order', (_req, res) => {
  db.all(`SELECT position, category FROM home_sections_order ORDER BY position ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ order: rows.map(r => r.category) });
  });
});

router.put('/home-sections-order', express.json(), (req, res) => {
  const body = req.body || {};
  const order = Array.isArray(body.order) ? body.order.map(x => String(x || '').trim()).filter(Boolean) : [];

  db.serialize(() => {
    db.run(`DELETE FROM home_sections_order`, [], (delErr) => {
      if (delErr) return res.status(500).json({ error: String(delErr) });

      const stmt = db.prepare(`INSERT INTO home_sections_order (position, category) VALUES (?, ?)`);
      order.forEach((cat, i) => stmt.run(i+1, cat));
      stmt.finalize((insErr) => {
        if (insErr) return res.status(500).json({ error: String(insErr) });
        res.json({ ok: true, count: order.length });
      });
    });
  });
});

module.exports = router;
