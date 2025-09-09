// server/routes/products/index.js
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto'); // 🔐 added

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

// Mount split routes
require('./list')(router);
require('./create')(router);
require('./update')(router);

// 🔐 Guard destructive sub-routes before mounting them
// These are defined in trash.js as POST /products/:idOrSku/delete and /restore
router.use(['/products/:idOrSku/delete', '/products/:idOrSku/restore'], requireAdminAuth);

require('./trash')(router);

// Mount export/import BEFORE getOne to avoid /products/:id catching "export"/"import"
router.use(require('./export_import'));

require('./getOne')(router);

/* ──────────────────────────────────────────────────────────────────────────────
   NEW: Hard-delete a product everywhere (cascades & file cleanup)
   - DELETE /products/:idOrSku
   - Accepts numeric product id OR SKU string in :idOrSku
   - Removes:
       • products row
       • cart_items (by product_id)
       • product_home_categories (by product_id TEXT and SKU)
       • product_images (legacy; by product_id TEXT and SKU)
       • uploaded image files referenced by products.images JSON
   - Returns JSON summary of deletions
   ─────────────────────────────────────────────────────────────────────────── */
const path = require('path');
const fs   = require('fs');
const { db, uploadDir } = require('./db');

function run(sql, params = []) {
  return new Promise((resolve) => {
    db.run(sql, params, function onDone(err) {
      if (err) return resolve({ err: String(err), changes: 0 });
      resolve({ err: null, changes: this.changes | 0 });
    });
  });
}
function get(sql, params = []) {
  return new Promise((resolve) => {
    db.get(sql, params, (err, row) => resolve(err ? { err: String(err), row: null } : { err: null, row }));
  });
}
function all(sql, params = []) {
  return new Promise((resolve) => {
    db.all(sql, params, (err, rows) => resolve(err ? { err: String(err), rows: [] } : { err: null, rows }));
  });
}
function toArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(String(val)); return Array.isArray(p) ? p : []; } catch { /* */ }
  if (typeof val === 'string') {
    return val.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}
function imageDiskPathFromWeb(u) {
  // We only delete files under /uploads; map to server/uploads/<basename>
  try {
    let s = String(u || '').trim();
    if (!s) return null;
    // strip leading slash and query/hash
    s = s.replace(/^[\\/]+/, '').split('?')[0].split('#')[0];
    // if it’s not inside uploads/, just ignore
    const base = path.posix.basename(s);
    if (!base) return null;
    return path.join(uploadDir, base);
  } catch { return null; }
}

// 🔐 Guard the hard-delete endpoint itself
router.delete('/products/:idOrSku', requireAdminAuth, express.json({ limit: '1kb' }), async (req, res) => {
  try {
    const key = String(req.params.idOrSku || '').trim();
    if (!key) return res.status(400).json({ error: 'Missing id or sku' });

    // Find product by numeric id OR SKU (case-insensitive)
    const { row: product } = await get(
      `SELECT * FROM products WHERE id = ? OR UPPER(sku) = UPPER(?) LIMIT 1`,
      [ key, key ]
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const prodId = product.id;
    const sku    = String(product.sku || '').trim();

    // Collect images from products.images JSON (web paths)
    const imageUrls = toArray(product.images);
    // Pre-calc distinct disk paths under /server/uploads
    const filePaths = Array.from(new Set(
      imageUrls.map(imageDiskPathFromWeb).filter(Boolean)
    ));

    // Begin cascades
    const out = { ok: true, productId: prodId, sku, deleted: {} };

    // Legacy tables & cart
    out.deleted.cart_items = await run(
      `DELETE FROM cart_items WHERE product_id = ?`,
      [ prodId ]
    );

    // product_home_categories uses TEXT product_id in older schema, so match a few possibilities
    out.deleted.product_home_categories = await run(
      `DELETE FROM product_home_categories WHERE product_id = ? OR product_id = ?`,
      [ String(prodId), String(sku) ]
    );

    // product_images (legacy)
    out.deleted.product_images = await run(
      `DELETE FROM product_images WHERE product_id = ? OR product_id = ?`,
      [ String(prodId), String(sku) ]
    );

    // Delete the product row last
    out.deleted.products = await run(
      `DELETE FROM products WHERE id = ?`,
      [ prodId ]
    );

    // Attempt file removals (best-effort)
    let filesRemoved = 0, filesMissing = 0, filesErrors = 0;
    for (const fp of filePaths) {
      try {
        if (fp && fp.startsWith(uploadDir) && fs.existsSync(fp)) {
          fs.unlinkSync(fp);
          filesRemoved++;
        } else {
          filesMissing++;
        }
      } catch {
        filesErrors++;
      }
    }
    out.files = { tried: filePaths.length, removed: filesRemoved, missing: filesMissing, errors: filesErrors };

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

module.exports = router;
