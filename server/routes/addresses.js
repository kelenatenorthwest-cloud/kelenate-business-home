// server/routes/addresses.js
const express  = require('express');
const router   = express.Router();
const path     = require('path');
const sqlite3  = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '..', 'app.db');
const db     = new sqlite3.Database(dbPath);

/* -------------------------------------------------------------------------- */
/* Schema (idempotent)                                                        */
/* -------------------------------------------------------------------------- */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      full_name  TEXT,
      phone      TEXT,
      pincode    TEXT,
      city       TEXT,
      state      TEXT,
      line1      TEXT,
      line2      TEXT,
      landmark   TEXT,
      last_used  INTEGER DEFAULT 0,
      created_at INTEGER
    )
  `);

  // Best-effort migrations if table already existed (SQLite ignores dup-column errs)
  db.run(`ALTER TABLE addresses ADD COLUMN full_name  TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN phone      TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN pincode    TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN city       TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN state      TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN line1      TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN line2      TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN landmark   TEXT`,                () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN last_used  INTEGER DEFAULT 0`,   () => {});
  db.run(`ALTER TABLE addresses ADD COLUMN created_at INTEGER`,             () => {});

  db.run(`CREATE INDEX IF NOT EXISTS idx_addr_user ON addresses(user_id)`);
});

/* -------------------------------------------------------------------------- */
/* Auth helpers (same style as your cart routes)                               */
/* -------------------------------------------------------------------------- */
function getDeep(o, k){ try { return k.split('.').reduce((a,c)=>a?.[c], o); } catch { return undefined; } }
function getUserId(req){
  const c = [
    getDeep(req,'user.id'), getDeep(req,'user.user.id'),
    getDeep(req,'auth.id'), getDeep(req,'auth.user.id'),
    getDeep(req,'session.user.id'), getDeep(req,'session.user.user.id'),
    getDeep(req,'res.locals.user.id'), getDeep(req,'res.locals.user.user.id')
  ].find(v => v != null);
  const n = Number(c);
  return Number.isFinite(n) ? n : (c ?? null);
}
function ensureAuth(req, res, next){
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });
  req._uid = uid; next();
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */
function summarizeAddress(row){
  if (!row) return { bottom: '', city: '', state: '', pincode: '' };
  const city    = (row.city || '').trim();
  const state   = (row.state || '').trim();
  const pincode = (row.pincode || '').trim();
  const bottom  = [city, state, pincode].filter(Boolean).join(', ').replace(', ' + pincode, ' ' + pincode);
  return { bottom, city, state, pincode };
}

function augmentRow(row) {
  if (!row) return row;
  // Provide a UI-friendly alias expected by checkout.js
  return { ...row, name: row.full_name };
}

router.use(express.json());

/* -------------------------------------------------------------------------- */
/* Routes                                                                     */
/* -------------------------------------------------------------------------- */

/** GET /api/addresses  -> list (ordered) + default_id
 *  Compatibility: returns BOTH { list, items } so old/new UIs work.
 */
router.get('/addresses', ensureAuth, (req, res) => {
  db.all(
    `SELECT * FROM addresses
     WHERE user_id=?
     ORDER BY last_used DESC, created_at DESC`,
    [req._uid],
    (err, rows = []) => {
      if (err) return res.status(500).json({ error: String(err) });
      const list = rows.map(augmentRow);
      const default_id = list.length ? list[0].id : null;
      res.json({ list, items: list, default_id });
    }
  );
});

/** GET /api/addresses/active -> latest used
 *  Compatibility: returns a raw address object (with {name}) AND legacy { address, summary }.
 */
router.get('/addresses/active', ensureAuth, (req, res) => {
  db.get(
    `SELECT * FROM addresses
     WHERE user_id=?
     ORDER BY last_used DESC, created_at DESC
     LIMIT 1`,
    [req._uid],
    (err, row) => {
      if (err)  return res.status(500).json({ error: String(err) });
      if (!row) return res.status(404).json({ error: 'No address' });
      const aug = augmentRow(row);
      const summary = summarizeAddress(aug);

      // Merge forms: top-level fields for new UIs + legacy nested object for older code
      res.json({ ...aug, summary, address: { ...aug } });
    }
  );
});

/** NEW: GET /api/addresses/:id -> single (for edit prefill) */
router.get('/addresses/:id', ensureAuth, (req, res) => {
  const id = Number(req.params.id || 0);
  db.get(
    `SELECT * FROM addresses WHERE id=? AND user_id=?`,
    [id, req._uid],
    (err, row) => {
      if (err)  return res.status(500).json({ error: String(err) });
      if (!row) return res.status(404).json({ error: 'Not found' });
      const aug = augmentRow(row);
      res.json({ address: aug });
    }
  );
});

/** POST /api/addresses -> create + mark last_used */
router.post('/addresses', ensureAuth, (req, res) => {
  const a = req.body || {};
  if (!a.full_name || !a.pincode || !a.city || !a.state || !a.line1) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const now = Date.now();
  const sql = `
    INSERT INTO addresses
      (user_id, full_name, phone, pincode, city, state, line1, line2, landmark, last_used, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const params = [
    req._uid,
    String(a.full_name||'').trim(),
    String(a.phone||'').trim(),
    String(a.pincode||'').trim(),
    String(a.city||'').trim(),
    String(a.state||'').trim(),
    String(a.line1||'').trim(),
    String(a.line2||'').trim(),
    String(a.landmark||'').trim(),
    now, now
  ];
  db.run(sql, params, function(err){
    if (err) return res.status(500).json({ error: String(err) });
    db.get(`SELECT * FROM addresses WHERE id=?`, [this.lastID], (gerr, row) => {
      if (gerr) return res.status(500).json({ error: String(gerr) });
      const aug = augmentRow(row);
      res.status(201).json({ address: aug, summary: summarizeAddress(aug) });
    });
  });
});

/** POST /api/addresses/:id/use -> set chosen as last_used (becomes default) */
router.post('/addresses/:id/use', ensureAuth, (req, res) => {
  const id  = Number(req.params.id || 0);
  const now = Date.now();
  db.run(
    `UPDATE addresses SET last_used=? WHERE id=? AND user_id=?`,
    [now, id, req._uid],
    function(err){
      if (err) return res.status(500).json({ error: String(err) });
      if (!this.changes) return res.status(404).json({ error: 'Not found' });
      db.get(`SELECT * FROM addresses WHERE id=?`, [id], (gerr, row) => {
        if (gerr) return res.status(500).json({ error: String(gerr) });
        const aug = augmentRow(row);
        res.json({ address: aug, summary: summarizeAddress(aug) });
      });
    }
  );
});

/** PUT /api/addresses/:id -> edit */
router.put('/addresses/:id', ensureAuth, (req, res) => {
  const id = Number(req.params.id || 0);
  const a  = req.body || {};
  const fields = {
    full_name: (a.full_name ?? null),
    phone:     (a.phone ?? null),
    pincode:   (a.pincode ?? null),
    city:      (a.city ?? null),
    state:     (a.state ?? null),
    line1:     (a.line1 ?? null),
    line2:     (a.line2 ?? null),
    landmark:  (a.landmark ?? null),
  };
  // Only overwrite provided values; keep existing when null/undefined
  const sets   = Object.keys(fields).map(k => `${k}=COALESCE(?,${k})`);
  const params = [...Object.values(fields), id, req._uid];

  db.run(
    `UPDATE addresses SET ${sets.join(', ')} WHERE id=? AND user_id=?`,
    params,
    function(err){
      if (err) return res.status(500).json({ error: String(err) });
      if (!this.changes) return res.status(404).json({ error: 'Not found' });
      db.get(`SELECT * FROM addresses WHERE id=?`, [id], (gerr, row) => {
        if (gerr) return res.status(500).json({ error: String(gerr) });
        const aug = augmentRow(row);
        res.json({ address: aug, summary: summarizeAddress(aug) });
      });
    }
  );
});

/** DELETE /api/addresses/:id -> remove */
router.delete('/addresses/:id', ensureAuth, (req, res) => {
  const id = Number(req.params.id || 0);
  db.run(
    `DELETE FROM addresses WHERE id=? AND user_id=?`,
    [id, req._uid],
    function(err){
      if (err) return res.status(500).json({ error: String(err) });
      res.json({ ok:true, deleted:this.changes });
    }
  );
});

module.exports = router;
