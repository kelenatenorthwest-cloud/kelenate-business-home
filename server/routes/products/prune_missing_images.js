// server/routes/products/prune_missing_images.js
// POST /products/prune-missing-images -> scans all products and removes
// any /uploads/* paths that no longer exist on disk.

const express = require('express');
const router = express.Router();
const { pruneMissingImages } = require('./uploads_cascade');

router.post('/products/prune-missing-images', (_req, res) => {
  pruneMissingImages((err, stats) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(Object.assign({ ok: true }, stats || {}));
  });
});

module.exports = router;
