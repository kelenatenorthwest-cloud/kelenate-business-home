// server/routes/products/trash.js
const { db } = require('./db');
const { rowToObj, byIdOrSkuParam } = require('./helpers');
const crypto = require('crypto'); // 🔐 added

// ---------- 🔐 Basic Admin Guard (env-based) ----------
function timingSafeEqualStr(a, b) {
  const A = Buffer.from(String(a), 'utf8');
  const B = Buffer.from(String(b), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}
function parseBasicAuth(header) {
  if (!header || typeof header !== 'string') return null;
  const pfx = 'Basic ';
  if (!header.startsWith(pfx)) return null;
  let decoded;
  try { decoded = Buffer.from(header.slice(pfx.length).trim(), 'base64').toString('utf8'); }
  catch { return null; }
  const i = decoded.indexOf(':');
  if (i === -1) return null;
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}
function requireAdminAuth(req, res, next) {
  const envUser = process.env.ADMIN_USER;
  const envPass = process.env.ADMIN_PASS;

  if (!envUser || !envPass) {
    res
      .status(503)
      .set('Cache-Control', 'no-store')
      .json({ error: 'Admin auth not configured. Set ADMIN_USER and ADMIN_PASS and restart.' });
    return;
  }
  const creds = parseBasicAuth(req.headers.authorization);
  if (!creds) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="Admin Area", charset="UTF-8"')
      .set('Cache-Control', 'no-store')
      .json({ error: 'Authentication required' });
    return;
  }
  const okUser = timingSafeEqualStr(creds.user, envUser);
  const okPass = timingSafeEqualStr(creds.pass, envPass);
  if (!okUser || !okPass) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Basic realm="Admin Area", charset="UTF-8"')
      .set('Cache-Control', 'no-store')
      .json({ error: 'Invalid credentials' });
    return;
  }
  return next();
}
// ------------------------------------------------------

module.exports = (router) => {
  // DELETE /products/:id (soft delete)  🔐 guarded
  router.delete('/products/:id', requireAdminAuth, (req, res) => {
    const sel = byIdOrSkuParam(req.params.id);
    const sql = `UPDATE products SET is_deleted=1, deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE ${sel.col}=?`;
    db.run(sql, [sel.val], function(err){
      if (err) return res.status(500).json({ error:String(err) });
      if (this.changes === 0) return res.status(404).json({ error:'Not found' });
      db.get(`SELECT *, rowid AS __rowid FROM products WHERE ${sel.col}=?`, [sel.val], (e2, row) => {
        if (e2) return res.status(500).json({ error:String(e2) });
        res.json({ ok:true, product: rowToObj(row) });
      });
    });
  });

  // POST /products/:id/delete (fallback soft delete)  🔐 guarded
  router.post('/products/:id/delete', requireAdminAuth, (req, res) => {
    const sel = byIdOrSkuParam(req.params.id);
    const sql = `UPDATE products SET is_deleted=1, deleted_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE ${sel.col}=?`;
    db.run(sql, [sel.val], function(err){
      if (err) return res.status(500).json({ error:String(err) });
      if (this.changes === 0) return res.status(404).json({ error:'Not found' });
      db.get(`SELECT *, rowid AS __rowid FROM products WHERE ${sel.col}=?`, [sel.val], (e2, row) => {
        if (e2) return res.status(500).json({ error:String(e2) });
        res.json({ ok:true, product: rowToObj(row) });
      });
    });
  });

  // POST /products/:id/restore  🔐 guarded
  router.post('/products/:id/restore', requireAdminAuth, (req, res) => {
    const sel = byIdOrSkuParam(req.params.id);
    const sql = `UPDATE products SET is_deleted=0, deleted_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE ${sel.col}=?`;
    db.run(sql, [sel.val], function(err){
      if (err) return res.status(500).json({ error:String(err) });
      if (this.changes === 0) return res.status(404).json({ error:'Not found' });
      db.get(`SELECT *, rowid AS __rowid FROM products WHERE ${sel.col}=?`, [sel.val], (e2, row) => {
        if (e2) return res.status(500).json({ error:String(e2) });
        res.json({ ok:true, product: rowToObj(row) });
      });
    });
  });
};
