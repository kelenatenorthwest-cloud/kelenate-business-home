// server/routes/products/update.js
const multer = require('multer');
const { db, uploadDir } = require('./db');
const { safeParseJSON, toNum, rowToObj } = require('./helpers');

// --- Multer storage ---
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});

// Accept only image/video mimetypes, per field
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'
]);
const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'
]);

const fileFilter = (_req, file, cb) => {
  if (file.fieldname === 'images') {
    return cb(null, ALLOWED_IMAGE_MIME.has(file.mimetype));
  }
  if (file.fieldname === 'videos') {
    return cb(null, ALLOWED_VIDEO_MIME.has(file.mimetype));
  }
  // ignore other unexpected fields
  return cb(null, false);
};

const upload = multer({ storage, fileFilter });

// helpers to normalize body inputs to arrays
function toArray(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return [];
    // try JSON array
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    // split by newline or comma
    return s.split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
  }
  return [];
}

function dedupeClean(arr) {
  const seen = new Set();
  const out = [];
  for (const x of (arr || [])) {
    const s = String(x || '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

module.exports = (router) => {
  router.put(
    '/products/:id',
    upload.fields([{ name: 'images', maxCount: 100 }, { name: 'videos', maxCount: 50 }]),
    (req, res) => {
      const id = req.params.id;

      // load existing by rowid or sku
      const selSql = /^\d+$/.test(String(id))
        ? `SELECT *, rowid AS __rowid FROM products WHERE rowid = ?`
        : `SELECT *, rowid AS __rowid FROM products WHERE sku = ?`;
      const selParam = /^\d+$/.test(String(id)) ? [Number(id)] : [id];

      db.get(selSql, selParam, (err, existing) => {
        if (err) return res.status(500).json({ error: String(err) });
        if (!existing) return res.status(404).json({ error: 'Not found' });

        try {
          const b = req.body || {};

          const sku      = (b.sku ?? existing.sku).toString().trim();
          const category = (b.category ?? existing.category).toString().trim();
          if (!sku || !category) {
            return res.status(400).json({ error: 'sku and category are mandatory' });
          }

          const title  = (b.title ?? existing.title) || '';
          const mrp    = (b.mrp   !== undefined) ? toNum(b.mrp)   : existing.mrp;
          const price  = (b.price !== undefined) ? toNum(b.price) : existing.price;
          const moq    = (b.moq   !== undefined) ? Math.max(1, parseInt(b.moq,10)||1) : (existing.moq ?? 1);
          const status = (b.status !== undefined) ? (b.status === 'inactive' ? 'inactive' : 'active')
                                                  : (existing.status || 'active');

          // bullets
          let bullets;
          if (b.bullets) {
            bullets = safeParseJSON(b.bullets, []);
          } else {
            const arr = [];
            for (let i = 1; i <= 7; i++) {
              const v = (b['bullet' + i] || '').trim();
              if (v) arr.push(v);
            }
            bullets = arr.length ? arr : safeParseJSON(existing.bullets, []);
          }

          const description = (b.description !== undefined)
            ? (b.description || '').toString()
            : (existing.description || '');

          // ---- IMAGES ----
          const uploadedImgs = (req.files?.images || []).map(f => `/uploads/${f.filename}`);
          const bodyImageUrls = [
            ...toArray(b.imageUrls),  // supports CSV/newline/JSON
            ...toArray(b.images)      // also accept 'images' as URLs/JSON
          ];

          // start from existing (JSON array) unless replaceImages=true
          let images = (String(b.replaceImages).toLowerCase() === 'true')
            ? []
            : safeParseJSON(existing.images, []);

          // apply optional removals
          const removeImages = new Set(toArray(b.removeImages));
          images = images.filter(u => !removeImages.has(String(u).trim()));

          // add new uploads + URLs
          images = dedupeClean([...images, ...uploadedImgs, ...bodyImageUrls]);

          // ---- VIDEOS ----
          const uploadedVids = (req.files?.videos || []).map(f => `/uploads/${f.filename}`);
          const bodyVideoUrls = [
            ...toArray(b.videoUrls),
            ...toArray(b.videos)
          ];

          let videos = (String(b.replaceVideos).toLowerCase() === 'true')
            ? []
            : safeParseJSON(existing.videos, []);

          const removeVideos = new Set(toArray(b.removeVideos));
          videos = videos.filter(u => !removeVideos.has(String(u).trim()));

          videos = dedupeClean([...videos, ...uploadedVids, ...bodyVideoUrls]);

          // update by rowid (we have it in existing.__rowid)
          db.run(
            `UPDATE products
               SET title=?, mrp=?, price=?, sku=?, category=?, moq=?, bullets=?, description=?, images=?, videos=?, status=?, updated_at=CURRENT_TIMESTAMP
             WHERE rowid = ?`,
            [
              title, mrp, price, sku, category, moq,
              JSON.stringify(bullets),
              description,
              JSON.stringify(images),
              JSON.stringify(videos),
              status,
              existing.__rowid
            ],
            function (e2) {
              if (e2) {
                const msg = String(e2);
                if (/UNIQUE constraint failed.*sku/i.test(msg)) {
                  return res.status(400).json({ error: 'SKU already exists' });
                }
                return res.status(500).json({ error: msg });
              }
              db.get(
                `SELECT *, rowid AS __rowid FROM products WHERE rowid = ?`,
                [existing.__rowid],
                (e3, updated) => {
                  if (e3) return res.status(500).json({ error: String(e3) });
                  if (!updated) return res.status(404).json({ error: 'Not found after update' });
                  res.json(rowToObj(updated));
                }
              );
            }
          );
        } catch (e) {
          return res.status(500).json({ error: String(e) });
        }
      });
    }
  );
};
