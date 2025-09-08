// server/routes/payments.js
// Uses the official Razorpay SDK but lazy-initializes it so the server
// doesn't crash at startup if keys are missing.

const express  = require('express');
const router   = express.Router();
const Razorpay = require('razorpay');
const rateLimit = require('express-rate-limit');        // added: per-route limiter
const path = require('path');
const sqlite3 = require('sqlite3').verbose();           // added: idempotency store

// ---- Auth helpers (match style used in other routes) ----
function getDeep(o, k){ try { return k.split('.').reduce((a,c)=>a?.[c], o); } catch { return undefined; } }
function getUserId(req){
  // Prefer pre-set _uid if your attachUser already did it
  if (req && req._uid) return req._uid;
  const c = [
    getDeep(req,'user.id'), getDeep(req,'user.user.id'),
    getDeep(req,'auth.id'), getDeep(req,'auth.user.id'),
    getDeep(req,'session.user.id'), getDeep(req,'session.user.user.id'),
    getDeep(req,'res.locals.user.id'), getDeep(req,'res.locals.user.user.id')
  ].find(v => v != null);
  const n = Number(c);
  return Number.isFinite(n) ? n : (c ?? null);
}
function ensureAuth(req, res, next) {
  const uid = getUserId(req);
  if (!uid) return res.status(401).json({ error: 'Sign in required.' });
  req._uid = uid; // normalize for downstream usage
  next();
}

// ---- Lazy Razorpay client (avoid crashing at module load) ----
function getRazorpayClient() {
  const key_id     = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  return { client: new Razorpay({ key_id, key_secret }), key_id };
}

// ---- Env knobs (validation & idempotency) ----
const MAX_PAISE = Number(process.env.PAYMENTS_MAX_PAISE || 5_000_000); // ₹50,000 default
const CURRENCY_ALLOW = (process.env.PAYMENTS_CURRENCY_ALLOW || 'INR')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const IDEMP_RETENTION_MS = Number(process.env.PAYMENTS_IDEMP_TTL_MS || 24 * 60 * 60 * 1000); // 24h

// ---- SQLite store for idempotency ----
const db = new sqlite3.Database(path.join(__dirname, '..', 'app.db'));
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      order_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
});
function idemGet(key) {
  return new Promise((resolve) => {
    db.get(`SELECT key, uid, order_id, amount, currency, created_at FROM idempotency_keys WHERE key=?`, [key],
      (err, row) => resolve(err ? null : row));
  });
}
function idemPut(key, uid, orderId, amount, currency) {
  return new Promise((resolve) => {
    db.run(
      `INSERT OR IGNORE INTO idempotency_keys (key, uid, order_id, amount, currency, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [key, String(uid), orderId, amount, currency, Date.now()],
      () => resolve()
    );
  });
}

// ---- Per-route limiter (in addition to global API limiter) ----
const payLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PAYMENTS_ORDER_RATE_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false
});

// ---- helpers ----
function sanitizeNotes(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  const keys = Object.keys(obj).slice(0, 15);
  for (const k of keys) {
    if (typeof k !== 'string' || k.length > 32) continue;
    const v = obj[k];
    const t = typeof v;
    if (t === 'string')      out[k] = v.slice(0, 256);
    else if (t === 'number') out[k] = Number.isFinite(v) ? v : undefined;
    else if (t === 'boolean')out[k] = v ? 1 : 0;
    // ignore objects/arrays/functions
  }
  return out;
}
function isThreeLetterCurrency(s) { return /^[A-Z]{3}$/.test(s || ''); }

// POST /api/payments/razorpay/order
// body: { amount (paise), currency?, notes? }
// Security upgrades: rate-limit, validation, idempotency.
router.post('/payments/razorpay/order', ensureAuth, payLimiter, async (req, res) => {
  try {
    let { amount, currency = 'INR', notes = {} } = req.body || {};

    // --- validate amount (integer paise, bounds)
    amount = Math.floor(Number(amount || 0));
    if (!Number.isFinite(amount) || amount < 1) {
      return res.status(400).json({ error: 'amount (in paise) required' });
    }
    if (MAX_PAISE && amount > MAX_PAISE) {
      return res.status(400).json({ error: `amount exceeds max ${MAX_PAISE} paise` });
    }

    // --- validate currency
    currency = String(currency || 'INR').toUpperCase();
    if (!isThreeLetterCurrency(currency)) return res.status(400).json({ error: 'invalid currency code' });
    if (CURRENCY_ALLOW.length && !CURRENCY_ALLOW.includes(currency)) {
      return res.status(400).json({ error: `currency not allowed` });
    }

    // --- sanitize notes
    notes = sanitizeNotes(notes);

    // --- idempotency key: header or notes.idempotency_key
    const headerKey = String(req.get('Idempotency-Key') || '').trim();
    const bodyKey = String(notes.idempotency_key || '').trim();
    const idemKey = (headerKey || bodyKey || '');
    if (idemKey) {
      const existing = await idemGet(idemKey);
      // purge old keys
      if (existing && (Date.now() - existing.created_at) <= IDEMP_RETENTION_MS) {
        if (String(existing.uid) !== String(req._uid)) {
          return res.status(409).json({ error: 'idempotency key belongs to a different user' });
        }
        if (existing.amount !== amount || String(existing.currency) !== currency) {
          return res.status(409).json({ error: 'idempotency key conflicts with different parameters' });
        }
        // Return the earlier order deterministically
        return res.json({
          id: existing.order_id,
          amount: existing.amount,
          currency: existing.currency,
          key_id: process.env.RAZORPAY_KEY_ID
        });
      }
    }

    const r = getRazorpayClient();
    if (!r) {
      return res.status(500).json({
        error: 'Razorpay keys missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before calling this endpoint.'
      });
    }

    const order = await r.client.orders.create({
      amount,
      currency,
      notes,
      receipt: `ord_${Date.now()}_${req._uid}`
    });

    // Record idempotency AFTER successful create
    if (idemKey) {
      await idemPut(idemKey, req._uid, order.id, amount, currency);
    }

    // Frontend needs key_id to open the checkout
    return res.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: r.key_id || process.env.RAZORPAY_KEY_ID
    });
  } catch (e) {
    const msg = e?.response?.data ? JSON.stringify(e.response.data) : String(e?.message || e);
    return res.status(500).json({ error: msg });
  }
});

module.exports = router;
