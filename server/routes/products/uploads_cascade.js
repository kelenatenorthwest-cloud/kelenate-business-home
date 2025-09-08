// server/routes/products/uploads_cascade.js
// Real-time cascade delete: when a file disappears from /uploads,
// remove its path from any product.images JSON.

const fs = require('fs');
const path = require('path');
const { db, uploadDir } = require('./db');

// Convert /uploads/foo.jpg -> absolute path inside uploadDir
function toAbs(uploadDir, webPath) {
  const base = path.basename(webPath);        // foo.jpg
  return path.join(uploadDir, base);
}

// Remove a single web path from a product row if present
function removeImageFromRow(rowid, imagesJson, webPath, cb) {
  cb = cb || (()=>{});
  let arr;
  try { arr = JSON.parse(imagesJson || '[]'); } catch { arr = []; }
  const next = (Array.isArray(arr) ? arr : []).filter(p => String(p).trim() !== String(webPath).trim());
  if (next.length === arr.length) return cb(null, false); // nothing to do
  db.run(
    `UPDATE products
     SET images=?, updated_at=CURRENT_TIMESTAMP
     WHERE rowid=?`,
    [JSON.stringify(next), rowid],
    (err) => cb(err, !err)
  );
}

// Query all rows that reference the web path (simple LIKE works for our JSON arrays)
function removeImageFromAllProducts(webPath, done) {
  db.all(
    `SELECT rowid, images FROM products WHERE images LIKE ?`,
    [`%${webPath}%`],
    (err, rows) => {
      if (err || !Array.isArray(rows) || rows.length === 0) return done && done(err, 0);
      let changed = 0, pending = rows.length, failed = false;
      rows.forEach(row => {
        removeImageFromRow(row.rowid, row.images, webPath, (e, didChange) => {
          if (e) failed = true;
          if (didChange) changed++;
          if (--pending === 0) done && done(failed ? new Error('some updates failed') : null, changed);
        });
      });
    }
  );
}

function startUploadsCascade() {
  // Guard: ensure dir exists so fs.watch doesn't throw
  try { fs.mkdirSync(uploadDir, { recursive: true }); } catch {}

  // Watch the uploads directory; on delete, scrub product refs
  try {
    const watcher = fs.watch(uploadDir, { persistent: true }, (_event, filename) => {
      if (!filename) return;
      // fs.watch reports "rename" both for add and remove; check existence
      const abs = path.join(uploadDir, filename);
      fs.stat(abs, (err) => {
        if (!err) return;                   // file exists => probably a create/rename
        if (err && err.code !== 'ENOENT') return;
        // Treat as deletion:
        const webPath = path.posix.join('/uploads', path.posix.basename(filename));
        removeImageFromAllProducts(webPath, () => {});
      });
    });

    watcher.on('error', () => {/* ignore */});
    return watcher;
  } catch {
    // If fs.watch is not available on this platform, we silently no-op
    return null;
  }
}

// One-off sweep: remove any /uploads/* that no longer exist on disk
function pruneMissingImages(done) {
  db.all(`SELECT rowid, images FROM products WHERE images IS NOT NULL AND images != '[]'`, [], (err, rows) => {
    if (err) return done && done(err, { scanned:0, updated:0, removed:0 });

    let scanned = 0, updated = 0, removed = 0, pending = rows.length;
    if (pending === 0) return done && done(null, { scanned, updated, removed });

    rows.forEach(row => {
      scanned++;
      let arr;
      try { arr = JSON.parse(row.images || '[]'); } catch { arr = []; }
      const keep = [];
      const drop = [];
      for (const p of (Array.isArray(arr) ? arr : [])) {
        const s = String(p || '').trim();
        if (s.startsWith('/uploads/')) {
          const abs = toAbs(uploadDir, s);
          if (fs.existsSync(abs)) keep.push(s); else drop.push(s);
        } else {
          // Non-local (remote) URLs we keep untouched
          keep.push(s);
        }
      }
      if (drop.length === 0) {
        if (--pending === 0) done && done(null, { scanned, updated, removed });
        return;
      }
      db.run(
        `UPDATE products SET images=?, updated_at=CURRENT_TIMESTAMP WHERE rowid=?`,
        [JSON.stringify(keep), row.rowid],
        (e2) => {
          if (!e2) { updated++; removed += drop.length; }
          if (--pending === 0) done && done(null, { scanned, updated, removed });
        }
      );
    });
  });
}

module.exports = {
  startUploadsCascade,
  pruneMissingImages,
};
