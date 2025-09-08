// server/routes/products/create.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, uploadDir } = require('./db');
const { safeParseJSON, toNum, rowToObj } = require('./helpers');
// NEW: downloader (auto-download URL images into /server/uploads)
const { downloadImagesFromUrls } = require('./download_image_from_url');

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
  router.post(
    '/products',
    upload.fields([{ name:'images',maxCount:100 },{ name:'videos',maxCount:50 }]),
    // made async so we can await optional downloads
    async (req, res) => {
      try {
        const b = req.body || {};
        if (!b.sku || !b.category) return res.status(400).json({ error:'sku and category are mandatory' });

        const title = (b.title || '').trim();
        const mrp   = toNum(b.mrp);
        const price = toNum(b.price);
        const sku   = String(b.sku).trim();
        const category = String(b.category).trim();
        const moq   = Math.max(1, parseInt(b.moq || '1', 10));
        const status = (b.status === 'inactive') ? 'inactive' : 'active';

        // bullets
        let bullets = [];
        if (b.bullets) {
          bullets = safeParseJSON(b.bullets, []);
        } else {
          for (let i=1;i<=7;i++){
            const v = (b['bullet'+i] || '').trim();
            if (v) bullets.push(v);
          }
        }

        const description = (b.description || '').toString();

        // ---- IMAGES ----
        const uploadedImgs = (req.files?.images || []).map(f => `/uploads/${f.filename}`);
        const bodyImageUrls = [
          ...toArray(b.imageUrls), // supports CSV/newline/JSON
          ...toArray(b.images)     // also accept 'images' as URLs/JSON
        ];

        // Optional auto-download step (when autoDownload=true or 1)
        const autoDownload =
          String(b.autoDownload || '').toLowerCase() === 'true' || b.autoDownload === '1';

        let finalImages = [];
        if (autoDownload && Array.isArray(bodyImageUrls) && bodyImageUrls.length) {
          try {
            // ensure uploads directory exists (usually already ensured)
            fs.mkdirSync(uploadDir, { recursive: true });

            const picks = await downloadImagesFromUrls(bodyImageUrls, uploadDir, { webBase: '/uploads' });

            // Map successfully downloaded source URL -> local webPath
            const okMap = new Map();
            for (const p of picks) {
              if (p && p.ok && p.webPath && p.url) {
                okMap.set(String(p.url).trim(), String(p.webPath).trim());
              }
            }

            // STRICT MODE: keep only locals (uploaded or downloaded)
            finalImages = dedupeClean([
              ...uploadedImgs,
              ...Array.from(okMap.values())
            ]);

            // If nothing local at all (e.g., all downloads failed), keep empty array
            // (avoids remote blanks). You can change this to fall back to bodyImageUrls
            // if you prefer having remote images instead of none.
          } catch (e) {
            // if download step errors, fall back to just uploaded files (locals only)
            finalImages = dedupeClean([...uploadedImgs]);
          }
        } else {
          // No autodownload requested: keep original behavior
          finalImages = dedupeClean([...uploadedImgs, ...bodyImageUrls]);
        }

        // ---- VIDEOS ----
        const uploadedVids = (req.files?.videos || []).map(f => `/uploads/${f.filename}`);
        const bodyVideoUrls = [
          ...toArray(b.videoUrls),
          ...toArray(b.videos)
        ];
        const videos = dedupeClean([...uploadedVids, ...bodyVideoUrls]);

        db.run(
          `INSERT INTO products
           (title,mrp,price,sku,category,moq,bullets,description,images,videos,status,is_deleted,deleted_at,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,0,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`,
          [
            title, mrp, price, sku, category, moq,
            JSON.stringify(bullets),
            description,
            JSON.stringify(finalImages),
            JSON.stringify(videos),
            status
          ],
          function(err){
            if (err) {
              const msg = String(err);
              if (/UNIQUE constraint failed.*sku/i.test(msg)) return res.status(400).json({ error:'SKU already exists' });
              return res.status(500).json({ error: msg });
            }
            // lastID is rowid
            db.get(`SELECT *, rowid AS __rowid FROM products WHERE rowid=?`, [this.lastID], (e2, row) => {
              if (e2) return res.status(500).json({ error:String(e2) });
              if (!row) return res.status(500).json({ error:'Insert ok but row missing' });
              res.status(201).json(rowToObj(row));
            });
          }
        );
      } catch (e) {
        res.status(500).json({ error:String(e) });
      }
    }
  );
};
