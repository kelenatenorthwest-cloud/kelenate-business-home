// scan-dbs.js — project-wide SQLite scanner (schemas + full-text search)
const fs = require('fs');
const path = require('path');
const DB = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..', '..'); // project root
const exts = new Set(['.db', '.sqlite', '.sqlite3']);

const argv = process.argv.slice(2);
const wantSchema = argv.includes('--schema');
const wantFind = argv.includes('--find');
const sampleIdx = argv.indexOf('--sample');
const sampleN = sampleIdx >= 0 ? Math.max(1, parseInt(argv[sampleIdx + 1] || '3', 10)) : 0;
const needle = wantFind ? argv[argv.indexOf('--find') + 1] : null;

if (wantFind && !needle) {
  console.error('Usage: node scan-dbs.js --find <VALUE> [--sample N]');
  process.exit(2);
}

function listDbFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules for speed
      if (entry.name === 'node_modules') continue;
      out.push(...listDbFiles(p));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.has(ext)) out.push(p);
    }
  }
  return out;
}

function Q(s) {
  return '"' + String(s).replace(/"/g, '""') + '"';
}

function dumpOne(dbPath) {
  console.log('==== ' + dbPath + ' ====');
  if (!fs.existsSync(dbPath)) { console.log('  (missing)'); return; }
  try {
    const db = new DB(dbPath, { readonly: true });
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map(r => r.name);

    if (wantSchema) {
      console.log('  tables:', tables.length ? tables.join(', ') : '<none>');
      for (const t of tables) {
        const cols = db.prepare('PRAGMA table_info(' + Q(t) + ')').all();
        console.log('  -', t, '=>', cols.map(c => `${c.name}:${c.type || 'TEXT'}`).join(', '));
      }
    }

    if (wantFind) {
      const hits = [];
      for (const t of tables) {
        const cols = db.prepare('PRAGMA table_info(' + Q(t) + ')').all().map(c => c.name);
        for (const col of cols) {
          try {
            const cnt = db.prepare('SELECT COUNT(*) c FROM ' + Q(t) + ' WHERE CAST(' + Q(col) + ' AS TEXT) LIKE ?').get('%' + needle + '%').c;
            if (cnt > 0) {
              hits.push({ table: t, col, cnt });
              console.log(`  HIT: ${t}.${col} = ${cnt}`);
              if (sampleN > 0) {
                // sample a few rows with the value visible
                const ors = cols.map(c => 'CAST(' + Q(c) + ' AS TEXT) LIKE ?').join(' OR ');
                const params = cols.map(() => '%' + needle + '%');
                const rows = db.prepare('SELECT * FROM ' + Q(t) + ' WHERE ' + ors + ' LIMIT ' + sampleN).all(...params);
                for (const r of rows) {
                  console.log('    sample:', r);
                }
              }
            }
          } catch (_) { /* ignore non-textable columns */ }
        }
      }
      if (!hits.length) console.log('  no matches');
    }
  } catch (e) {
    console.log('  error:', e.message);
  }
}

const files = listDbFiles(ROOT);
if (!files.length) {
  console.log('No .db/.sqlite/.sqlite3 files found under', ROOT);
  process.exit(0);
}
files.forEach(dumpOne);
