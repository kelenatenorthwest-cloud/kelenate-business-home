// server/routes/products/export_import.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const XLSX = require('xlsx');

const dbPath = path.join(__dirname, '..', '..', 'app.db');
const db = new sqlite3.Database(dbPath);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// --- helpers ---
function sanitizeRowsForExcel(rows){
  const MAX = 32760; // Excel cell limit ~32767
  return (rows || []).map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
      let val = v;
      if (val == null) { out[k] = val; continue; }
      if (typeof val === 'object') {
        try { val = JSON.stringify(val); } catch {}
      }
      if (typeof val === 'string' && val.length > MAX) {
        val = val.slice(0, MAX) + '…';
      }
      out[k] = val;
    }
    return out;
  });
}

// Parse incoming "images" / "imageUrls" cell into JSON string or null (to skip update)
// Accepts:
//  - JSON array string: ["http://...","http://..."]
//  - newline or comma separated list
//  - If exactly "[]", will CLEAR images (returns "[]")
function toImagesJSON(value){
  if (value == null) return null;

  // If array provided by XLSX parser
  if (Array.isArray(value)) {
    const urls = value
      .map(s => String(s || '').trim())
      .map(s => s.replace(/^["'\[\]]+|["'\[\]]+$/g, '')) // strip stray quotes/brackets
      .filter(s => /^https?:\/\//i.test(s));
    return urls.length ? JSON.stringify(dedupe(urls)) : '[]'; // empty array clears if user gave an empty array
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (s === '[]') return '[]'; // explicit clear

    // Try JSON first
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) {
        const urls = arr
          .map(t => String(t || '').trim())
          .map(t => t.replace(/^["'\[\]]+|["'\[\]]+$/g, ''))
          .filter(t => /^https?:\/\//i.test(t));
        return urls.length ? JSON.stringify(dedupe(urls)) : '[]';
      }
    } catch {}

    // Fallback: split by newline or comma; strip junk; keep valid URLs only
    const parts = s
      .split(/\r?\n|,/)
      .map(t => t.trim().replace(/^["'\[\]]+|["'\[\]]+$/g, ''))
      .filter(t => /^https?:\/\//i.test(t));

    return parts.length ? JSON.stringify(dedupe(parts)) : null; // null => don't touch images
  }

  // other types ignored
  return null;
}

function dedupe(arr){
  const seen = new Set();
  const out = [];
  for (const v of arr) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

// ----- GET /products/export?format=xlsx|csv&all=1 -----
router.get('/products/export', (req, res) => {
  const isAll = String(req.query.all || '') === '1';
  const format = (req.query.format || 'xlsx').toLowerCase();
  const sql = `SELECT * FROM products ${isAll ? '' : 'WHERE IFNULL(is_deleted,0)=0'} ORDER BY rowid`;

  db.all(sql, [], (err, rows=[]) => {
    if (err) return res.status(500).json({ error: String(err) });

    const dateTag = new Date().toISOString().slice(0,10);

    if (format === 'csv') {
      const ws = XLSX.utils.json_to_sheet(rows);
      const csv = XLSX.utils.sheet_to_csv(ws);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="products_export_${dateTag}.csv"`);
      return res.send(csv);
    }

    const safeRows = sanitizeRowsForExcel(rows);
    try {
      const ws = XLSX.utils.json_to_sheet(safeRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Products');
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="products_export_${dateTag}.xlsx"`);
      return res.send(buf);
    } catch (e) {
      return res.status(500).json({ error: 'Excel write failed', detail: String(e) });
    }
  });
});

// ----- POST /products/import  (multipart/form-data: file) -----
// Bulk UPDATE by SKU (update-only)
router.post('/products/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Upload a .xlsx or .csv file as "file"' });

  let rows = [];
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  } catch (e) {
    return res.status(400).json({ error: 'Unable to parse Excel/CSV', detail: String(e) });
  }

  const allowed = new Set([
    'title','description','category','price','mrp','moq','status',
    'bullet1','bullet2','bullet3','bullet4','bullet5','bullet6','bullet7',
    'imageUrls','images'
  ]);

  db.serialize(() => {
    db.run('BEGIN');
    let total=0, updated=0, created=0, skipped=0, errors=0;
    const seenSkus = new Set();

    const getBySku = db.prepare('SELECT rowid FROM products WHERE sku=?');

    for (const r of rows) {
      total++;
      const sku = (r.sku ?? r.SKU ?? '').toString().trim();
      if (!sku || seenSkus.has(sku)) { skipped++; continue; }
      seenSkus.add(sku);

      const sets = [];
      const vals = [];

      for (const key of Object.keys(r)) {
        const k = key.toString().trim();
        if (!allowed.has(k)) continue;

        let v = r[key];

        if (k === 'images' || k === 'imageUrls') {
          const json = toImagesJSON(v);
          // only update if caller explicitly clears [] or there are valid URLs
          if (json === '[]' || (typeof json === 'string' && json.length > 2)) {
            sets.push('images=?'); vals.push(json);
          }
          continue;
        }

        if (v === null || v === undefined || (typeof v === 'string' && v.trim()==='')) continue;
        sets.push(`${k}=?`);
        vals.push(v);
      }

      try {
        const hit = getBySku.get(sku);
        if (hit) {
          if (sets.length === 0) { skipped++; continue; }
          const sql = `UPDATE products SET ${sets.join(', ')} WHERE sku=?`;
          db.prepare(sql).run(...vals, sku);
          updated++;
        } else {
          skipped++; // update-only
        }
      } catch (e) {
        errors++;
      }
    }

    db.run('COMMIT');
    return res.json({ ok:true, total, updated, created, skipped, errors });
  });
});

module.exports = router;
