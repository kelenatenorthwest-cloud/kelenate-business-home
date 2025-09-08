// server/routes/products/trash.js
const { db } = require('./db');
const { rowToObj, byIdOrSkuParam } = require('./helpers');

module.exports = (router) => {
  // DELETE /products/:id (soft delete)
  router.delete('/products/:id', (req, res) => {
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

  // POST /products/:id/delete (fallback soft delete)
  router.post('/products/:id/delete', (req, res) => {
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

  // POST /products/:id/restore
  router.post('/products/:id/restore', (req, res) => {
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
