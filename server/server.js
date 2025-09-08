// File: /server/server.js

// ===== .env loader (safe if dotenv is not installed)
try { require('dotenv').config(); } catch (_) { /* optional */ }

// ===== Core requires
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

// 🔐 Security & hardening (added)
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

// ===== Create app BEFORE using `app.use(...)`
const app = express();

// --- Security: trust proxy for correct secure cookie / IP handling
// If you're behind nginx/Cloudflare/etc, set TRUST_PROXY=1 (or leave as default here).
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 1);

// --- Security: remove X-Powered-By
app.disable('x-powered-by');

// --- Security: Helmet (HTTP headers + CSP)
// Note: CSP here mirrors the one we used in the HTML; set once on server.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      // ✅ allow Razorpay checkout script + inline modules (for login.html)
      "script-src": ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      // ✅ allow XHR/WebSocket to Razorpay (and same-origin)
      "connect-src": ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      // ✅ allow Razorpay’s iframe/modal
      "frame-src": ["https://checkout.razorpay.com", "https://api.razorpay.com"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"]
    }
  },
  // Avoid breaking cross-origin asset loads for images/fonts in some setups
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));

// --- Security: HTTP Parameter Pollution protection
app.use(hpp());

// --- Optional: CORS allowlist (no effect unless CORS_ORIGINS is set)
const ALLOW_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// NOTE: previously CORS applied only to '/api'. For login cookies from another origin,
// we must also enable CORS on '/auth' and handle OPTIONS preflight on those paths.
if (ALLOW_ORIGINS.length) {
  const corsOptionsDelegate = (req, cb) => {
    const origin = req.header('Origin');
    const isAllowed = ALLOW_ORIGINS.includes(origin);
    cb(null, { origin: isAllowed, credentials: true, optionsSuccessStatus: 204 });
  };
  // existing behavior (keep):
  app.use('/api', cors(corsOptionsDelegate));
  // NEW: enable CORS on auth routes mounted without '/api'
  app.use(['/auth', '/api/auth'], cors(corsOptionsDelegate));
  // NEW: explicit preflight for auth endpoints
  app.options(['/auth/*', '/api/auth/*'], cors(corsOptionsDelegate));
}

// --- Rate limits (gentle API-wide + stricter on auth)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: Number(process.env.API_RATE_MAX || 1200), // generous default
  standardHeaders: true,
  legacyHeaders: false
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_MAX || 50),  // stricter for login/register
  standardHeaders: true,
  legacyHeaders: false
});

// Apply auth limiter to typical auth endpoints BEFORE routers
app.use(['/api/auth', '/auth'], authLimiter);

// ===== Common middleware
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true })); // <— handy for form posts without files
app.use(cookieParser());

// 🔐 Attach logged-in user from JWT cookie to req.user (so /api/cart sees it)
const authModule = require('./routes/auth');     // exports router + attachUser
const attachUser = authModule.attachUser;
app.use(attachUser);

// ===== Paths for new structure
const ROOT_DIR   = path.resolve(__dirname, '..');
const BUYER_DIR  = path.join(ROOT_DIR, 'buyers-page'); // buyer website
const ADMIN_DIR  = path.join(ROOT_DIR, 'admin');       // admin UI (folder is 'admin')
const UPLOAD_DIR = path.join(__dirname, 'uploads');    // server/uploads
const PUBLIC_DIR = path.join(__dirname, 'public');     // server/public (for /img, etc)

// ===== API routers
const productsRouter           = require('./routes/products');
const categoriesRouter         = require('./routes/categories');
const bannersRouter            = require('./routes/banners');
const homeSectionsRouter       = require('./routes/home_sections');
const amazonImportRouter       = require('./routes/amazon_import');
const siteSettingsRouter       = require('./routes/site_settings'); // branding/logo
const authRouter               = authModule;                        // use same module as router
const usersRouter              = require('./routes/users');         // customers list in admin
const cartRouter               = require('./routes/cart');          // user cart
const addressesRouter          = require('./routes/addresses');     // addresses API
const paymentsRouter           = require('./routes/payments');      // Razorpay order creation
// NEW: prune-missing-images endpoint + real-time cascade watcher
const pruneMissingImagesRouter = require('./routes/products/prune_missing_images');
require('./routes/products/uploads_cascade').startUploadsCascade();

// === NEW: Admin Filters Config API (adds GET/PUT /api/admin/filters-config)
const adminFiltersConfigRouter = require('./routes/adminConfig');

/* =================================================================== */
/* Address page redirects (MUST be BEFORE static + routers)             */
/* =================================================================== */
function keepQuery(originalUrl) {
  const i = originalUrl.indexOf('?');
  return i >= 0 ? originalUrl.slice(i) : '';
}

app.get(['/addresses.html', '/addresses'], (req, res) => {
  const qs = keepQuery(req.originalUrl);
  if (req.query && req.query.id) {
    return res.redirect(302, '/edit-address.html' + qs);
  }
  return res.redirect(302, '/address-book.html' + qs);
});

app.get(['/address.html', '/address'], (req, res) => {
  const qs = keepQuery(req.originalUrl);
  if (req.query && req.query.id) {
    return res.redirect(302, '/edit-address.html' + qs);
  }
  return res.redirect(302, '/add-address.html' + qs);
});

app.get('/address-book', (req, res) => {
  const qs = keepQuery(req.originalUrl);
  return res.redirect(302, '/address-book.html' + qs);
});

/* =================================================================== */

// ===== Static mounts (order matters)
// Put /admin BEFORE / to avoid any accidental buyer fallback for admin assets.
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/admin',   express.static(ADMIN_DIR,  { extensions: ['html'] }));
app.use('/img',     express.static(path.join(PUBLIC_DIR, 'img'))); // for /img/placeholder.png

// >>> Serve buyers-page also at /buyers-page so URLs like /buyers-page/side-categories.html work
// Disable caching for html/js/css so updated files take effect immediately.
app.use(
  '/buyers-page',
  express.static(BUYER_DIR, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (/\.(?:html?|css|js|mjs|map)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      }
    }
  })
);

// Existing root mount for buyer site (kept as-is)
app.use(
  '/',
  express.static(BUYER_DIR, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (/\.(?:html?|css|js|mjs|map)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
      }
    }
  })
);

// ===== Handy aliases (fix product page path differences)
const PROD_HTML = path.join(BUYER_DIR, 'product.html');
const P_HTML    = path.join(BUYER_DIR, 'p.html');
app.get(['/product.html', '/product'], (_req, res) => {
  const file = fs.existsSync(PROD_HTML)
    ? PROD_HTML
    : (fs.existsSync(P_HTML) ? P_HTML : null);
  if (!file) return res.status(404).send('Product page missing');
  res.sendFile(file);
});

// ===== Category page alias (so /category.html works with the root file)
const CATEGORY_HTML_BUYER = path.join(BUYER_DIR,  'category.html');
const CATEGORY_HTML_ROOT  = path.join(ROOT_DIR,   'category.html');
app.get(['/category.html', '/category'], (_req, res) => {
  const file = fs.existsSync(CATEGORY_HTML_BUYER)
    ? CATEGORY_HTML_BUYER
    : (fs.existsSync(CATEGORY_HTML_ROOT) ? CATEGORY_HTML_ROOT : null);
  if (!file) return res.status(404).send('Category page missing');
  res.sendFile(file);
});

// >>> Side Categories page alias (both /side-categories and /side-categories.html)
const SIDECAT_HTML = path.join(BUYER_DIR, 'side-categories.html');
app.get(['/side-categories.html', '/side-categories'], (_req, res) => {
  if (!fs.existsSync(SIDECAT_HTML)) return res.status(404).send('Side categories page missing');
  res.sendFile(SIDECAT_HTML);
});

// ===== Checkout page alias (so /checkout works with buyers-page/checkout.html)
const CHECKOUT_HTML = path.join(BUYER_DIR, 'checkout.html');
app.get(['/checkout.html', '/checkout'], (_req, res) => {
  if (!fs.existsSync(CHECKOUT_HTML)) return res.status(404).send('Checkout page missing');
  res.sendFile(CHECKOUT_HTML);
});

// ===== Simple health checks
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/health',     (_req, res) => res.json({ ok: true }));

// Apply API limiter AFTER the health checks so they remain lightweight
app.use('/api', apiLimiter);

// ===== API routers
// (Most APIs available under both /api and /; addresses ONLY under /api to avoid clashes.)
app.use('/api/admin/filters-config', adminFiltersConfigRouter); // <<< NEW
app.use(['/api', '/'], productsRouter);
app.use(['/api', '/'], categoriesRouter);
app.use(['/api', '/'], bannersRouter);
app.use(['/api', '/'], homeSectionsRouter);
app.use(['/api', '/'], amazonImportRouter);
app.use(['/api', '/'], siteSettingsRouter);
app.use(['/api', '/'], authRouter);
app.use(['/api', '/'], usersRouter);
app.use(['/api', '/'], cartRouter);
app.use('/api',        addressesRouter); // <-- no bare "/" mount here
app.use('/api',        paymentsRouter);  // Razorpay order creation
// NEW: expose POST /api/products/prune-missing-images
app.use(['/api', '/'], pruneMissingImagesRouter);

// ===== (Optional) Generic error handler with safe messages
// Keeps stack traces out of responses in production.
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  const msg = (process.env.NODE_ENV === 'development') ? String(err) : 'Internal Server Error';
  res.status(status).json({ error: msg });
});

// ===== Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Monolith running at http://localhost:${PORT}`);
});
