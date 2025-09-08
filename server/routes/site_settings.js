// server/routes/site_settings.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const axios = require('axios');
const rateLimit = require('express-rate-limit'); // added for route-level limits

// DB
const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);
});

// uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ---- security: allowlists for images (MIME + extension)
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);
const ALLOWED_IMAGE_EXT  = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || 'logo').replace(/[^\w.\-]+/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
function fileFilter(_req, file, cb) {
  const mime = String(file.mimetype || '').toLowerCase();
  const ext  = String(path.extname(file.originalname || '') || '').toLowerCase();
  const ok   = ALLOWED_IMAGE_MIME.has(mime) && ALLOWED_IMAGE_EXT.has(ext);
  if (!ok) return cb(new Error('Only image files are allowed (png, jpg, gif, webp).'));
  cb(null, true);
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ---- security helpers
function ensureAuth(req, res, next) {
  if (req.user && req.user.id) return next();
  return res.status(401).json({ error: 'auth required' });
}
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SITESET_UPLOAD_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false
});
const mutateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.SITESET_MUTATE_RATE_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false
});

// ===== helpers (unchanged core, plus a few new ones) =====
function getAllSettings(cb) {
  db.all('SELECT key, value FROM settings', [], (err, rows) => {
    if (err) return cb(err);
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    cb(null, out);
  });
}
function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}
function setSetting(key, val, cb) {
  db.run(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, val],
    cb
  );
}
function delSetting(key, cb) {
  db.run('DELETE FROM settings WHERE key = ?', [key], cb);
}

// --- NEW: grid defaults + utilities
const DEFAULT_GRID = { home: 6, category: 5, search: 4 };

function clampInt(x, lo, hi, fallback) {
  const n = Number(x);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
function parseCardGrid(rawStr) {
  try {
    const obj = typeof rawStr === 'string' ? JSON.parse(rawStr) : (rawStr || {});
    const merged = { ...DEFAULT_GRID, ...(obj || {}) };
    return {
      home: clampInt(merged.home, 1, 8, DEFAULT_GRID.home),
      category: clampInt(merged.category, 1, 8, DEFAULT_GRID.category),
      search: clampInt(merged.search, 1, 8, DEFAULT_GRID.search),
    };
  } catch {
    return { ...DEFAULT_GRID };
  }
}
function normalizeColor(v) {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  if (/^#?[0-9a-f]{6}$/i.test(s)) return s.startsWith('#') ? s : ('#' + s);
  return s;
}
const hasVal = (v) => v != null && String(v).trim() !== '';

// ===== Routes =====

// GET /api/site-settings  (ENHANCED to include parsed cardGrid with defaults)
router.get('/site-settings', (_req, res) => {
  getAllSettings((err, obj) => {
    if (err) return res.status(500).json({ error: String(err) });

    // Keep existing flat keys + add structured cardGrid
    const out = {
      header_logo:       obj.header_logo || '',
      header_color:      obj.header_color || '',
      nav_color:         obj.nav_color || '',
      header_text_color: obj.header_text_color || '',
      nav_text_color:    obj.nav_text_color || ''
    };

    const grid = parseCardGrid(obj.cardGrid || null);
    out.cardGrid = grid;

    res.json(out);
  });
});

// GET only color values (unchanged)
router.get('/site-settings/colors', async (_req, res) => {
  try {
    const header = await getSetting('header_color');
    const nav    = await getSetting('nav_color');
    const htext  = await getSetting('header_text_color');
    const ntext  = await getSetting('nav_text_color');
    const hsmall = await getSetting('header_text_small');
    const hstrong= await getSetting('header_text_strong');
    res.json({
      header_color:       header  || '',
      nav_color:          nav     || '',
      header_text_color:  htext   || '',
      nav_text_color:     ntext   || '',
      header_text_small:  hsmall  || '',
      header_text_strong: hstrong || ''
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// POST /api/site-settings/logo (unchanged)
router.post('/site-settings/logo', ensureAuth, uploadLimiter, upload.single('logo'), async (req, res) => {
  try {
    let webPath = '';
    if (req.file) {
      webPath = '/uploads/' + req.file.filename;
      console.log('[site-settings] Uploaded logo:', webPath);
    } else {
      const { logoUrl = '' } = req.body || {};
      const url = String(logoUrl || '').trim();
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ error: 'Provide a file in "logo" or a valid http(s) "logoUrl".' });
      }
      console.log('[site-settings] Downloading logo URL:', url);
      const resp = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxContentLength: 5 * 1024 * 1024,
        headers: { 'Accept': 'image/*' },
        validateStatus: (s) => s >= 200 && s < 300
      });
      const rawType = (resp.headers['content-type'] || '').toLowerCase();
      const ctype = rawType.split(';')[0];
      if (!ALLOWED_IMAGE_MIME.has(ctype)) {
        return res.status(400).json({ error: 'Unsupported image type from URL' });
      }
      // pick safe extension
      const mapExt = ctype.includes('png') ? '.png'
                  : ctype.includes('webp') ? '.webp'
                  : ctype.includes('gif') ? '.gif'
                  : '.jpg';
      const urlBase = path.basename((url.split('?')[0] || 'logo'));
      const baseNoExt = urlBase.replace(/[^\w.\-]+/g, '_').replace(/\.[^.]+$/, '');
      let ext = path.extname(urlBase).toLowerCase();
      if (!ALLOWED_IMAGE_EXT.has(ext)) ext = mapExt; // force allowed ext
      const filename = `${Date.now()}-${baseNoExt}${ext}`;
      const full = path.join(uploadDir, filename);
      fs.writeFileSync(full, Buffer.from(resp.data));
      webPath = '/uploads/' + filename;
      console.log('[site-settings] Saved URL logo as:', webPath);
    }

    await new Promise((resolve, reject) => setSetting('header_logo', webPath, err => err ? reject(err) : resolve()));
    res.json({ ok: true, header_logo: webPath });
  } catch (e) {
    console.error('[site-settings] logo save error:', e);
    res.status(500).json({ error: String(e) });
  }
});

/* ===== Colors (background + text) ===== */
router.post('/site-settings/colors', ensureAuth, mutateLimiter, express.json(), async (req, res) => {
  try {
    const b = req.body || {};

    // backgrounds
    const header = normalizeColor(b.header ?? b.header_top_color ?? b.top ?? '');
    const nav    = normalizeColor(b.nav    ?? b.header_subnav_color ?? b.sub ?? '');

    // fallback text
    const htext  = normalizeColor(b.header_text_color ?? b.header_text ?? b.header_top_text_color ?? b.textTop ?? '');
    const ntext  = normalizeColor(b.nav_text_color    ?? b.nav_text    ?? b.header_subnav_text_color ?? b.textSub ?? '');

    // per-line overrides (optional)
    const hsmall = normalizeColor(b.header_text_small  ?? b.header_text_tiny ?? b.header_top_text_small ?? '');
    const hstrong= normalizeColor(b.header_text_strong ?? b.header_top_text_strong ?? '');

    // apply updates
    await new Promise((resolve) => {
      db.serialize(() => {
        if (hasVal(header)) setSetting('header_color', header, e => e && console.error(e));
        if (hasVal(nav))    setSetting('nav_color',    nav,    e => e && console.error(e));
        if (hasVal(htext))  setSetting('header_text_color', htext, e => e && console.error(e));
        if (hasVal(ntext))  setSetting('nav_text_color',    ntext, e => e && console.error(e));

        // If fallback changed and caller omitted tiny/strong => clear stored overrides
        if (hasVal(htext) && !hasVal(hsmall) && !hasVal(hstrong)) {
          delSetting('header_text_small',  e => e && console.error(e));
          delSetting('header_text_strong', e => e && console.error(e));
        } else {
          if (hasVal(hsmall))  setSetting('header_text_small',  hsmall,  e => e && console.error(e));
          if (hasVal(hstrong)) setSetting('header_text_strong', hstrong, e => e && console.error(e));
        }
        resolve();
      });
    });

    res.json({
      ok: true,
      header_color: header || undefined,
      nav_color: nav || undefined,
      header_text_color: htext || undefined,
      nav_text_color: ntext || undefined,
      header_text_small: hasVal(hsmall) ? hsmall : undefined,
      header_text_strong: hasVal(hstrong) ? hstrong : undefined
    });
  } catch (e) {
    console.error('[site-settings] colors save error:', e);
    res.status(500).json({ error: String(e) });
  }
});

// ===== NEW: PUT /api/site-settings  (merge partials; supports cardGrid) =====
router.put('/site-settings', ensureAuth, mutateLimiter, express.json(), async (req, res) => {
  try {
    const b = req.body || {};

    // Allow simple fields if present
    const simpleKeys = [
      'header_logo',
      'header_color',
      'nav_color',
      'header_text_color',
      'nav_text_color',
      'header_text_small',
      'header_text_strong'
    ];
    await new Promise((resolve) => {
      db.serialize(() => {
        for (const k of simpleKeys) {
          if (Object.prototype.hasOwnProperty.call(b, k)) {
            const v = String(b[k] ?? '');
            setSetting(k, v, e => e && console.error(e));
          }
        }
        resolve();
      });
    });

    // Handle cardGrid if provided
    if (b.cardGrid && typeof b.cardGrid === 'object') {
      const inc = b.cardGrid;
      const currentRaw = await getSetting('cardGrid');
      const cur = parseCardGrid(currentRaw);

      const next = {
        home:     'home'     in inc ? clampInt(inc.home,     1, 8, cur.home)       : cur.home,
        category: 'category' in inc ? clampInt(inc.category, 1, 8, cur.category)   : cur.category,
        search:   'search'   in inc ? clampInt(inc.search,   1, 8, cur.search)     : cur.search,
      };
      await new Promise((resolve, reject) =>
        setSetting('cardGrid', JSON.stringify(next), err => err ? reject(err) : resolve())
      );
    }

    // Return merged view (same as GET)
    getAllSettings((err, obj) => {
      if (err) return res.status(500).json({ error: String(err) });
      const out = {
        header_logo:       obj.header_logo || '',
        header_color:      obj.header_color || '',
        nav_color:         obj.nav_color || '',
        header_text_color: obj.header_text_color || '',
        nav_text_color:    obj.nav_text_color || '',
        cardGrid:          parseCardGrid(obj.cardGrid || null)
      };
      res.json(out);
    });
  } catch (e) {
    console.error('[site-settings] PUT failed:', e);
    res.status(500).json({ error: 'Failed to save site settings' });
  }
});

module.exports = router;
