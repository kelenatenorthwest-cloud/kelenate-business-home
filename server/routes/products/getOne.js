// server/routes/products/getOne.js
const { db } = require('./db');
const { rowToObj } = require('./helpers');

module.exports = (router) => {
  router.get('/products/:id', (req, res) => {
    const id = req.params.id;

    // 1) try numeric rowid
    if (/^\d+$/.test(String(id))) {
      db.get(`SELECT *, rowid AS __rowid FROM products WHERE rowid = ?`, [Number(id)], (e1, r1) => {
        if (e1) return res.status(500).json({ error: String(e1) });
        if (r1) return res.json(rowToObj(r1));

        // 2) fallback to sku if not found
        db.get(`SELECT *, rowid AS __rowid FROM products WHERE sku = ?`, [id], (e2, r2) => {
          if (e2) return res.status(500).json({ error: String(e2) });
          if (!r2) return res.status(404).json({ error: 'Not found' });
          res.json(rowToObj(r2));
        });
      });
      return;
    }

    // non-numeric => treat as sku
    db.get(`SELECT *, rowid AS __rowid FROM products WHERE sku = ?`, [id], (e, r) => {
      if (e) return res.status(500).json({ error: String(e) });
      if (!r) return res.status(404).json({ error: 'Not found' });
      res.json(rowToObj(r));
    });
  });
};
