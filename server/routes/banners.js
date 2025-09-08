// server/routes/banners.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const rateLimit = require('express-rate-limit'); // added for route-level limits

// Optional image processing (auto-rotate + downscale big files + crops)
let sharp = null;
try { sharp = require('sharp'); } catch (_) { sharp = null; }

const dbPath = path.join(__dirname, '..', 'app.db');
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const db = new sqlite3.Database(dbPath);

// Ensure tables
db.serialize(() => {
  // Images/Videos table
  db.run(`
    CREATE TABLE IF NOT EXISTS banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'image',     -- 'image' | 'video'
      mime TEXT,                              -- e.g., image/jpeg, video/mp4
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Best-effort migrations for existing installs
  db.run(`ALTER TABLE banners ADD COLUMN type TEXT NOT NULL DEFAULT 'image'`, () => {});
  db.run(`ALTER TABLE banners ADD COLUMN mime TEXT`, () => {});

  // Settings table (single row)
  db.run(`
    CREATE TABLE IF NOT EXISTS banner_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auto_rotate INTEGER NOT NULL DEFAULT 1,
      interval_ms INTEGER NOT NULL DEFAULT 5000,
      transition TEXT NOT NULL DEFAULT 'fade',       -- 'fade' or 'slide'
      transition_ms INTEGER NOT NULL DEFAULT 400,
      show_arrows INTEGER NOT NULL DEFAULT 1,
      loop INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Saved crops per preset
  db.run(`
    CREATE TABLE IF NOT EXISTS banner_crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banner_id INTEGER NOT NULL,
      preset TEXT NOT NULL,            -- 'desktop1440','laptop1200','tablet1024','wide1920'
      focus_x REAL NOT NULL,           -- 0..100 (%)
      focus_y REAL NOT NULL,           -- 0..100 (%)
      width INTEGER NOT NULL,          -- target width (px)
      height INTEGER NOT NULL,         -- target height (px)
      file TEXT NOT NULL,              -- generated cropped filename in /uploads
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (banner_id, preset)
    )
  `);

  // Seed singleton row if missing
  db.get(`SELECT id FROM banner_settings WHERE id=1`, [], (err, row) => {
    if (err) return;
    if (!row) {
      db.run(`
        INSERT INTO banner_settings (id, auto_rotate, interval_ms, transition, transition_ms, show_arrows, loop)
        VALUES (1, 1, 5000, 'fade', 400, 1, 1)
      `);
    }
  });
});

// ---------- security helpers (added) ----------
// Require a logged-in user (attachUser is mounted globally in server.js)
function ensureAuth(req, res, next) {
  if (req.user && req.user.id) return next();
  return res.status(401).json({ error: 'auth required' });
}

// Per-route rate limits (in addition to global API limits)
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.BANNERS_UPLOAD_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false
});
const mutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.BANNERS_MUTATE_RATE_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false
});

// Multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});

// Accept images + videos; size limit raised for videos
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.ogg']);

function extAllowedForMime(ext, mime) {
  ext = String(ext || '').toLowerCase();
  mime = String(mime || '').toLowerCase();
  if (ALLOWED_IMAGE_MIME.has(mime)) return ALLOWED_IMAGE_EXT.has(ext);
  if (ALLOWED_VIDEO_MIME.has(mime)) return ALLOWED_VIDEO_EXT.has(ext);
  return false;
}

const upload = multer({
  storage,
  limits: { fileSize: 64 * 1024 * 1024 }, // up to 64 MB to allow short promos
  fileFilter: (_req, file, cb) => {
    const m = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImage = ALLOWED_IMAGE_MIME.has(m);
    const isVideo = ALLOWED_VIDEO_MIME.has(m);

    if (!isImage && !isVideo) return cb(new Error('Only image or video files are allowed'));
    if (!extAllowedForMime(ext, m)) return cb(new Error('File extension does not match allowed type'));
    return cb(null, true);
  }
});

/* -------------------- helpers (for crops) -------------------- */
const imgUrl = (f) => `/uploads/${f}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function roundBox(b) {
  return {
    left: Math.max(0, Math.floor(b.left)),
    top: Math.max(0, Math.floor(b.top)),
    width: Math.max(1, Math.floor(b.width)),
    height: Math.max(1, Math.floor(b.height)),
  };
}

// Adjust an arbitrary rect to the target aspect ratio by expanding/contracting around its center,
// then clamp to image bounds. Returns a box that fits within [0,ow]x[0,oh] and matches target AR.
// (Kept for back-compat; no longer used when client provides an explicit crop box.)
function adjustRectToAspect(ow, oh, rect, targetAR) {
  let { left, top, width, height } = rect;
  width = Math.max(1, width);
  height = Math.max(1, height);

  const cx = left + width / 2;
  const cy = top + height / 2;
  const curAR = width / height;

  if (Math.abs(curAR - targetAR) > 1e-3) {
    if (curAR < targetAR) {
      // too tall; expand width
      width = height * targetAR;
    } else {
      // too wide; expand height
      height = width / targetAR;
    }
  }

  // Re-center
  left = cx - width / 2;
  top  = cy - height / 2;

  // Clamp to image bounds
  if (left < 0) left = 0;
  if (top  < 0) top  = 0;
  if (left + width  > ow) left = ow - width;
  if (top  + height > oh) top  = oh - height;

  // If still out of bounds due to size, shrink to fit
  if (width > ow)  { width = ow; left = 0; height = width / targetAR; }
  if (height > oh) { height = oh; top  = 0;  width  = height * targetAR; }

  // Final clamp
  if (left < 0) left = 0;
  if (top  < 0) top  = 0;
  if (left + width  > ow) left = ow - width;
  if (top  + height > oh) top  = oh - height;

  return roundBox({ left, top, width, height });
}

// Build a crop box that matches target AR using a focus point (percent-based)
function computeCropBoxFromFocus(origW, origH, targetW, targetH) {
  const ar = targetW / targetH;

  // largest box of aspect ar that fits inside original
  let cropW = Math.min(origW, Math.floor(ar * origH));
  let cropH = Math.floor(cropW / ar);
  if (cropH > origH) { cropH = origH; cropW = Math.floor(cropH * ar); }

  const cx = (focusX / 100) * origW;
  const cy = (focusY / 100) * origH;

  let left = Math.round(cx - cropW / 2);
  let top  = Math.round(cy - cropH / 2);
  left = clamp(left, 0, Math.max(0, origW - cropW));
  top  = clamp(top,  0, Math.max(0, origH - cropH));

  return roundBox({ left, top, width: cropW, height: cropH });
}

async function cropFromBoxAndResize(originalPath, outPath, box, targetW, targetH) {
  if (!sharp) throw new Error('Cropping not available (sharp not installed)');
  const buf = await sharp(originalPath)
    .rotate()
    .extract(box)
    .resize(targetW, targetH)
    .toBuffer();
  await fs.promises.writeFile(outPath, buf);
  return true;
}

// Width-only presets (height becomes dynamic from the crop box)
const PRESETS = {
  wide1920:    { width: 1920 },
  desktop1440: { width: 1440 },
  laptop1200:  { width: 1200 },
  tablet1024:  { width: 1024 },
};

/* -------------------- LIST -------------------- */

// GET /banners -> [{id, url, file, type, mime, created_at}]
router.get('/banners', (_req, res) => {
  db.all(`SELECT id, file, type, mime, created_at FROM banners ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(rows.map(r => ({
      id: r.id,
      file: r.file,
      type: r.type || 'image',
      mime: r.mime || null,
      url: imgUrl(r.file),
      created_at: r.created_at
    })));
  });
});

/* -------------------- UPLOAD -------------------- */

// POST /banners (multipart: image)  — now accepts images OR videos
router.post('/banners', ensureAuth, uploadLimiter, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const msg = String((err && err.message) || err);
      const status = /too large/i.test(msg) ? 413 : 400;
      return res.status(status).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'image file required' });

    const filename = req.file.filename;
    const mimetype = String(req.file.mimetype || '').toLowerCase();
    const isImage  = ALLOWED_IMAGE_MIME.has(mimetype);
    const isVideo  = ALLOWED_VIDEO_MIME.has(mimetype);
    if (!isImage && !isVideo) return res.status(400).json({ error: 'Unsupported file type' });

    const fpath = path.join(uploadDir, filename);

    // Optional: auto-rotate + downscale very large images (no aspect change).
    // Skip for videos.
    if (isImage && sharp) {
      try {
        const inst = sharp(fpath).rotate();
        const meta = await inst.metadata();
        const MAX_WIDTH = 2400;
        const buf = (meta.width || 0) > MAX_WIDTH
          ? await inst.resize({ width: MAX_WIDTH, withoutEnlargement: true }).toBuffer()
          : await inst.toBuffer();
        await fs.promises.writeFile(fpath, buf);
      } catch { /* keep original */ }
    }

    const kind = isVideo ? 'video' : 'image';
    db.run(
      `INSERT INTO banners (file, type, mime) VALUES (?, ?, ?)`,
      [filename, kind, mimetype],
      function (dbErr) {
        if (dbErr) return res.status(500).json({ error: String(dbErr) });
        const id = this.lastID;
        res.status(201).json({ id, file: filename, type: kind, mime: mimetype, url: imgUrl(filename) });
      }
    );
  });
});

/* -------------------- DELETE -------------------- */

router.delete('/banners/:id', ensureAuth, mutateLimiter, (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  db.get(`SELECT file FROM banners WHERE id=?`, [id], (err, row) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!row) return res.status(404).json({ error: 'not found' });

    // Also delete any derived crop variants
    db.all(`SELECT file FROM banner_crops WHERE banner_id=?`, [id], async (_e2, crops) => {
      try { fs.unlinkSync(path.join(uploadDir, row.file)); } catch {}
      if (Array.isArray(crops)) {
        for (const c of crops) { try { fs.unlinkSync(path.join(uploadDir, c.file)); } catch {} }
      }
      db.run(`DELETE FROM banner_crops WHERE banner_id=?`, [id], () => {
        db.run(`DELETE FROM banners WHERE id=?`, [id], (err2) => {
          if (err2) return res.status(500).json({ error: String(err2) });
          res.json({ ok: true });
        });
      });
    });
  });
});

/* -------------------- SETTINGS -------------------- */

// GET /banner-settings -> single settings object
router.get('/banner-settings', (_req, res) => {
  db.get(`SELECT * FROM banner_settings WHERE id=1`, [], (err, row) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!row) return res.json({
      autoRotate: true, intervalMs: 5000, transition: 'fade', transitionMs: 400, showArrows: true, loop: true
    });

    res.json({
      autoRotate: !!row.auto_rotate,
      intervalMs: row.interval_ms,
      transition: row.transition,
      transitionMs: row.transition_ms,
      showArrows: !!row.show_arrows,
      loop: !!row.loop,
      updatedAt: row.updated_at
    });
  });
});

// PUT /banner-settings  (JSON body)
router.put('/banner-settings', ensureAuth, mutateLimiter, (req, res) => {
  const b = req.body || {};
  const autoRotate   = b.autoRotate   ? 1 : 0;
  const intervalMs   = Number.isFinite(+b.intervalMs)   ? Math.max(1000, +b.intervalMs) : 5000;
  const transition   = (b.transition === 'slide' ? 'slide' : 'fade');
  const transitionMs = Number.isFinite(+b.transitionMs) ? Math.max(50, +b.transitionMs) : 400;
  const showArrows   = b.showArrows   ? 1 : 0;
  const loop         = b.loop         ? 1 : 0;

  db.run(`
    UPDATE banner_settings
       SET auto_rotate=?, interval_ms=?, transition=?, transition_ms=?, show_arrows=?, loop=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=1
  `, [autoRotate, intervalMs, transition, transitionMs, showArrows, loop], function (err) {
    if (err) return res.status(500).json({ error: String(err) });
    res.json({ ok: true });
  });
});

/* -------------------- Crops API -------------------- */
/** GET /banners/:id/crops -> { crops: [{preset,width,height,focusX,focusY,url,file}] } */
router.get('/banners/:id/crops', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  db.all(
    `SELECT preset, width, height, focus_x AS focusX, focus_y AS focusY, file
       FROM banner_crops WHERE banner_id=?`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: String(err) });
      const crops = (rows || []).map(r => ({ ...r, url: imgUrl(r.file) }));
      res.json({ crops });
    }
  );
});

/**
 * PUT /banners/:id/crop
 * Body supports:
 *  A) Focus mode (back-compat):
 *     { preset, width?, height?, focusX, focusY }
 *  B) Rect modes (preferred):
 *     { preset, width?,            rectPerc:{x,y,w,h} }  // perc (0..100) of original
 *     { preset, width?,            rectPx:{x,y,w,h} }    // absolute pixels in original
 *     { preset, width?,            box:{left,top,width,height} } // absolute pixels (admin preview)
 *
 * - If a rect/box is provided, its aspect is preserved EXACTLY and height is computed from it.
 * - If no rect/box is provided, we fall back to focus mode and use a default aspect unless height is supplied.
 */
router.put('/banners/:id/crop', ensureAuth, mutateLimiter, (req, res) => {
  if (!sharp) return res.status(501).json({ error: 'Cropping requires the "sharp" package on server' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid id' });

  const { preset, width, height, focusX, focusY, rectPerc, rectPx, box } = req.body || {};
  if (!preset) return res.status(400).json({ error: 'preset required' });

  const def = PRESETS[preset] || {};
  const targetW = Math.max(100, Math.floor(+width  || def.width  || 1200));

  // Check banner type; videos cannot be cropped here
  db.get(`SELECT file, type FROM banners WHERE id=?`, [id], async (err, row) => {
    if (err)  return res.status(500).json({ error: String(err) });
    if (!row) return res.status(404).json({ error: 'banner not found' });
    if ((row.type || 'image') === 'video') {
      return res.status(400).json({ error: 'Cannot crop video banners' });
    }

    const originalPath = path.join(uploadDir, row.file);

    try {
      // Load image meta once
      const meta = await sharp(originalPath).rotate().metadata();
      const ow = meta.width || 0, oh = meta.height || 0;
      if (!ow || !oh) return res.status(500).json({ error: 'Failed to read image dimensions' });

      // Build the crop box either from rects (preferred) or focus fallback
      const clampRectToImage = (r) => roundBox({
        left:   clamp(Math.floor(+r.left  ?? 0), 0, Math.max(0, ow - 1)),
        top:    clamp(Math.floor(+r.top   ?? 0), 0, Math.max(0, oh - 1)),
        width:  Math.max(1, Math.min(Math.floor(+r.width  ?? 1), ow - Math.floor(+r.left  ?? 0))),
        height: Math.max(1, Math.min(Math.floor(+r.height ?? 1), oh - Math.floor(+r.top   ?? 0))),
      });

      let cropBox = null;

      // 1) Preferred: explicit pixel rect "box" from admin preview (NO aspect forcing)
      if (box && Number.isFinite(+box.left) && Number.isFinite(+box.top) &&
               Number.isFinite(+box.width) && Number.isFinite(+box.height)) {
        cropBox = clampRectToImage(box);
      }
      // 2) rectPx
      else if (rectPx && Number.isFinite(+rectPx.x) && Number.isFinite(+rectPx.y) &&
                        Number.isFinite(+rectPx.w) && Number.isFinite(+rectPx.h)) {
        cropBox = clampRectToImage({ left:+rectPx.x, top:+rectPx.y, width:+rectPx.w, height:+rectPx.h });
      }
      // 3) rectPerc
      else if (rectPerc && Number.isFinite(+rectPerc.x) && Number.isFinite(+rectPerc.y) &&
                         Number.isFinite(+rectPerc.w) && Number.isFinite(+rectPerc.h)) {
        const raw = {
          left:   (clamp(+rectPerc.x, 0, 100) / 100) * ow,
          top:    (clamp(+rectPerc.y, 0, 100) / 100) * oh,
          width:  (clamp(+rectPerc.w, 0, 100) / 100) * ow,
          height: (clamp(+rectPerc.h, 0, 100) / 100) * oh,
        };
        cropBox = clampRectToImage(raw);
      }

      let targetH;

      if (cropBox) {
        // Compute height from your drawn box aspect
        const ar = cropBox.width / cropBox.height;
        targetH = Math.max(50, Math.round(targetW / ar));
      } else {
        // 4) Fallback: focus mode (center a box of an aspect around focus)
        const fx = clamp(+focusX || 50, 0, 100);
        const fy = clamp(+focusY || 50, 0, 100);

        // If height not provided, use a gentle default aspect (~4.5:1)
        const fallbackH = Math.max(50, Math.floor(+height || Math.round(targetW / 4.5)));
        // NOTE: computeCropBoxFromFocus references focusX/focusY; define locally:
        function computeCropBoxFromFocusLocal(origW, origH, tW, tH, fX, fY) {
          const ar = tW / tH;
          let cropW = Math.min(origW, Math.floor(ar * origH));
          let cropH = Math.floor(cropW / ar);
          if (cropH > origH) { cropH = origH; cropW = Math.floor(cropH * ar); }
          const cx = (fX / 100) * origW;
          const cy = (fY / 100) * origH;
          let left = Math.round(cx - cropW / 2);
          let top  = Math.round(cy - cropH / 2);
          left = clamp(left, 0, Math.max(0, origW - cropW));
          top  = clamp(top,  0, Math.max(0, origH - cropH));
          return roundBox({ left, top, width: cropW, height: cropH });
        }
        const cropB = computeCropBoxFromFocusLocal(ow, oh, targetW, fallbackH, fx, fy);
        cropBox = cropB;
        targetH = fallbackH;
      }

      // Generate output
      const ext = (path.extname(row.file) || '.jpg').toLowerCase();
      const outFile = `${id}-${preset}-${Date.now()}${ext}`;
      const outPath = path.join(uploadDir, outFile);

      await cropFromBoxAndResize(originalPath, outPath, cropBox, targetW, targetH);

      // Derive a reasonable focus point for DB back-compat (center of the box)
      const fxSave = clamp(((cropBox.left + cropBox.width / 2) / ow) * 100, 0, 100);
      const fySave = clamp(((cropBox.top  + cropBox.height/ 2) / oh) * 100, 0, 100);

      // Upsert DB row
      db.get(
        `SELECT file FROM banner_crops WHERE banner_id=? AND preset=?`,
        [id, preset],
        (e2, prev) => {
          const sql = `
            INSERT INTO banner_crops (banner_id, preset, focus_x, focus_y, width, height, file)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (banner_id, preset) DO UPDATE SET
              focus_x=excluded.focus_x,
              focus_y=excluded.focus_y,
              width  =excluded.width,
              height =excluded.height,
              file   =excluded.file,
              created_at=CURRENT_TIMESTAMP
          `;
          db.run(sql, [id, preset, fxSave, fySave, targetW, targetH, outFile], (e3) => {
            if (e3) return res.status(500).json({ error: String(e3) });
            if (prev && prev.file && prev.file !== outFile) {
              try { fs.unlinkSync(path.join(uploadDir, prev.file)); } catch {}
            }
            res.json({
              ok: true,
              preset,
              width: targetW,
              height: targetH,
              focusX: fxSave,
              focusY: fySave,
              url: imgUrl(outFile),
              file: outFile
            });
          });
        }
      );
    } catch (e) {
      return res.status(500).json({ error: String((e && e.message) || e) });
    }
  });
});

module.exports = router;
