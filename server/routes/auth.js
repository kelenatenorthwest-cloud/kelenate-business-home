// server/routes/auth.js
const express = require('express');
const router = express.Router();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const dbPath = path.join(__dirname, '..', 'app.db');
const db = new sqlite3.Database(dbPath);

// ==== Secrets & TTLs (env-configurable) ====
const JWT_SECRET          = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET || (JWT_SECRET + '_refresh');
const JWT_ACCESS_TTL      = process.env.JWT_ACCESS_TTL || '15m'; // short-lived access
const JWT_REFRESH_TTL     = process.env.JWT_REFRESH_TTL || '7d'; // longer-lived refresh
const COOKIE_SECURE_ENV   = process.env.COOKIE_SECURE; // '1' to force on, '0' to force off
// NEW: make SameSite adjustable; default to 'lax' for dev-friendliness across ports/hosts
const COOKIE_SAMESITE     = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

// Users table (phone supported; stateCode kept for backward compatibility)
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT,
      email TEXT,               -- may be null if phone-only
      passwordHash TEXT NOT NULL,
      stateCode TEXT,           -- deprecated (ignored on new registrations)
      phone TEXT,               -- required on new registrations
      createdAt INTEGER
    )
  `);

  // Best-effort add of new column if table already existed (ignore error if it exists)
  db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, () => {});

  // Token revocation list for refresh tokens (by JTI)
  db.run(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      exp INTEGER
    )
  `);
});

// ==== small helpers ====
function isEmail(v = '') { return /@/.test(String(v)); }

// Normalize phone to digits-only (removes spaces, dashes, +, parentheses, etc.)
function normalizePhone(v = '') {
  return String(v).replace(/[^\d]/g, '');
}

function ttlMs(ttlStr) {
  if (typeof ttlStr === 'number') return ttlStr;
  const m = String(ttlStr).trim().match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 0;
  const n = Number(m[1]);
  const u = (m[2] || 's').toLowerCase();
  const mult = u === 'm' ? 60e3 : u === 'h' ? 3600e3 : u === 'd' ? 86400e3 : 1e3;
  return n * mult;
}

function secureCookieFlag(req) {
  if (COOKIE_SECURE_ENV === '1') return true;
  if (COOKIE_SECURE_ENV === '0') return false;
  return !!(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

function sameSiteForReq() {
  // allow only valid values
  if (['strict', 'lax', 'none'].includes(COOKIE_SAMESITE)) return COOKIE_SAMESITE;
  return 'lax';
}

function cookieOpts(req, maxAgeMs) {
  const sameSite = sameSiteForReq();
  // If SameSite=None, browsers require Secure=true
  const secure = sameSite === 'none' ? true : secureCookieFlag(req);
  return {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: maxAgeMs,
    path: '/'
  };
}

function nowSec() { return Math.floor(Date.now() / 1000); }

function revokeRefreshJti(jti, expSec) {
  if (!jti) return;
  db.run(`INSERT OR REPLACE INTO revoked_tokens (jti, exp) VALUES (?, ?)`, [jti, expSec || 0], () => {});
}

function isRevokedJti(jti) {
  return new Promise((resolve) => {
    db.get(`SELECT jti FROM revoked_tokens WHERE jti=?`, [jti], (err, row) => {
      if (err) return resolve(true); // fail closed
      resolve(!!row);
    });
  });
}

function signAccess(uid) {
  return jwt.sign({ uid, typ: 'access' }, JWT_SECRET, { expiresIn: JWT_ACCESS_TTL });
}

function signRefresh(uid, jti) {
  const id = jti || (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  return {
    token: jwt.sign({ uid, jti: id, typ: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_TTL }),
    jti: id
  };
}

// Issue cookies (access + refresh). If oldRefreshJti provided, revoke it after rotation.
function issueCookie(req, res, userId, oldRefreshJti) {
  const access = signAccess(userId);
  const { token: refresh, jti } = signRefresh(userId);

  res.cookie('auth', access, cookieOpts(req, ttlMs(JWT_ACCESS_TTL)));
  res.cookie('auth_refresh', refresh, cookieOpts(req, ttlMs(JWT_REFRESH_TTL)));

  if (oldRefreshJti) revokeRefreshJti(oldRefreshJti);
}

// 🔐 Attach logged-in user (if any) to every request via cookie
async function attachUser(req, res, next) {
  const access = req.cookies?.auth;
  if (access) {
    try {
      const { uid } = jwt.verify(access, JWT_SECRET);
      req.user = req.user || {};
      req.user.id = uid;
      req._uid = uid;
      res.locals.user = req.user;
      return next();
    } catch (_) {
      // fall through to refresh
    }
  }

  const refresh = req.cookies?.auth_refresh;
  if (!refresh) return next();

  try {
    const payload = jwt.verify(refresh, JWT_REFRESH_SECRET);
    // Check revocation
    if (await isRevokedJti(payload.jti)) {
      return next(); // treat as unauthenticated
    }
    // Mint new access + rotate refresh (revoke old jti)
    req.user = req.user || {};
    req.user.id = payload.uid;
    req._uid = payload.uid;
    res.locals.user = req.user;

    issueCookie(req, res, payload.uid, payload.jti);
  } catch (_) {
    // invalid/expired refresh → ignore
  }
  next();
}

function readUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName || '',
    email: row.email || '',
    phone: row.phone || '',
    stateCode: row.stateCode || '',
    createdAt: Number(row.createdAt || 0)
  };
}

// Common SQL snippets to normalize values on the DB side (SQLite)
const EMAIL_SQL_NORM = 'LOWER(email)';
const PHONE_SQL_NORM = "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone,''),' ',''),'-',''),'+',''),'(',''),')','')";

// POST /auth/exists  { identifier }
router.post('/auth/exists', (req, res) => {
  const rawIdentifier = String(req.body?.identifier || '').trim();
  if (!rawIdentifier) return res.json({ exists: false });

  if (isEmail(rawIdentifier)) {
    const identifier = rawIdentifier.toLowerCase();
    const sql = `SELECT id, firstName, lastName, email, stateCode, phone, createdAt FROM users WHERE ${EMAIL_SQL_NORM}=?`;
    db.get(sql, [identifier], (err, row) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.json({ exists: !!row, via: 'email', user: row ? readUser(row) : null });
    });
  } else {
    const phoneNorm = normalizePhone(rawIdentifier);
    const sql = `SELECT id, firstName, lastName, email, stateCode, phone, createdAt FROM users WHERE ${PHONE_SQL_NORM}=?`;
    db.get(sql, [phoneNorm], (err, row) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.json({ exists: !!row, via: 'phone', user: row ? readUser(row) : null });
    });
  }
});

// POST /auth/register
// Changes retained:
//  - phone is REQUIRED
//  - stateCode is IGNORED (inserted as NULL)
//  - email remains optional (accepted if provided)
//  - NEW: phone is stored normalized (digits-only); email matched case-insensitively
router.post('/auth/register', (req, res) => {
  const {
    firstName = '',
    lastName = '',
    email = '',
    password = '',
    // stateCode ignored
    phone = ''
  } = req.body || {};

  if (!firstName.trim()) return res.status(400).json({ error: 'firstName is required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!phone.trim()) return res.status(400).json({ error: 'Mobile (phone) is required' }); // <-- mandatory

  const createdAt = Date.now();
  const hash = bcrypt.hashSync(password, 12);
  const emailNorm = (email || '').trim().toLowerCase() || null;
  const phoneNorm = normalizePhone(phone || ''); // normalized digits-only

  // Uniqueness checks (both email and phone if provided), case-insensitive email + normalized phone
  const checkSql = `
    SELECT id FROM users
    WHERE (? IS NOT NULL AND ${EMAIL_SQL_NORM}=?)
       OR (? != '' AND ${PHONE_SQL_NORM}=?)
    LIMIT 1
  `;
  db.get(checkSql, [emailNorm, emailNorm, phoneNorm, phoneNorm], (cerr, found) => {
    if (cerr) return res.status(500).json({ error: String(cerr) });
    if (found) return res.status(409).json({ error: 'Email or phone already registered' });

    const ins = `
      INSERT INTO users (firstName, lastName, email, passwordHash, stateCode, phone, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      firstName.trim(),
      (lastName || '').trim(),
      emailNorm,
      hash,
      null,             // stateCode: ignored/deprecated
      phoneNorm,        // store normalized digits-only
      createdAt
    ];
    db.run(ins, params, function (ierr) {
      if (ierr) return res.status(500).json({ error: String(ierr) });
      db.get('SELECT * FROM users WHERE id=?', [this.lastID], (gerr, row) => {
        if (gerr) return res.status(500).json({ error: String(gerr) });
        issueCookie(req, res, row.id);
        res.status(201).json({ user: readUser(row) });
      });
    });
  });
});

// POST /auth/login   { identifier|email, password }
// NEW: case-insensitive email match, normalized phone match
router.post('/auth/login', (req, res) => {
  const rawIdentifier = String(req.body?.identifier || req.body?.email || '').trim();
  const password = String(req.body?.password || '');
  if (!rawIdentifier || !password) return res.status(400).json({ error: 'identifier/email and password are required' });

  const onUser = (row) => {
    if (!row) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(password, row.passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    issueCookie(req, res, row.id);
    res.json({ user: readUser(row) });
  };

  if (isEmail(rawIdentifier)) {
    const identifier = rawIdentifier.toLowerCase();
    const sql = `SELECT * FROM users WHERE ${EMAIL_SQL_NORM}=?`;
    db.get(sql, [identifier], (err, row) => {
      if (err) return res.status(500).json({ error: String(err) });
      onUser(row);
    });
  } else {
    const phoneNorm = normalizePhone(rawIdentifier);
    const sql = `SELECT * FROM users WHERE ${PHONE_SQL_NORM}=?`;
    db.get(sql, [phoneNorm], (err, row) => {
      if (err) return res.status(500).json({ error: String(err) });
      onUser(row);
    });
  }
});

// GET /auth/me
// NEW: leverage refresh rotation like attachUser so expired access can still succeed if refresh is valid
router.get('/auth/me', attachUser, (req, res) => {
  const uid = req?._uid;
  if (!uid) return res.status(401).json({ error: 'Not logged in' });

  db.get('SELECT id, firstName, lastName, email, stateCode, phone, createdAt FROM users WHERE id=?', [uid], (err, row) => {
    if (err) return res.status(500).json({ error: String(err) });
    if (!row) return res.status(401).json({ error: 'Invalid session' });
    res.json({ user: readUser(row) });
  });
});

// POST /auth/logout
router.post('/auth/logout', (req, res) => {
  // Revoke current refresh token if present & valid
  const r = req.cookies?.auth_refresh;
  if (r) {
    try {
      const payload = jwt.verify(r, JWT_REFRESH_SECRET);
      revokeRefreshJti(payload.jti, payload.exp);
    } catch (_) {
      /* ignore */
    }
  }
  // Clear both cookies with strict/secure parity (sameSite/secure must mirror setter logic)
  const clearOpts = {
    httpOnly: true,
    sameSite: sameSiteForReq(),
    secure: sameSiteForReq() === 'none' ? true : secureCookieFlag(req),
    path: '/'
  };
  res.clearCookie('auth', clearOpts);
  res.clearCookie('auth_refresh', clearOpts);
  res.json({ ok: true });
});

module.exports = router;
// Export the middleware so the server can mount it globally
module.exports.attachUser = attachUser;
