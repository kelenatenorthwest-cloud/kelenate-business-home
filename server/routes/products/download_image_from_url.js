// server/routes/products/download_image_from_url.js
// Downloads image URLs into the uploads folder and returns their web paths.
// Usage in create.js (example):
//   const { downloadImagesFromUrls } = require('./download_image_from_url');
//   const picked = await downloadImagesFromUrls(bodyImageUrls, uploadDir, { webBase: '/uploads' });
//   const downloadedWebPaths = picked.map(x => x.webPath); // use these in `images` field.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { pipeline } = require('stream');
const { promisify } = require('util');

const streamPipeline = promisify(pipeline);

const DEFAULT_OPTS = {
  webBase: '/uploads',           // public URL base for uploaded assets
  maxBytes: 15 * 1024 * 1024,    // 15 MB guard
  gapMs: 250,                    // small pause between downloads
  maxRedirects: 5,
  timeoutMs: 20000,
  headers: {
    // Realistic headers help with Amazon/CDNs
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/119.0 Safari/537.36',
    'accept': 'image/avif,image/webp,image/*,*/*;q=0.8',
    'accept-language': 'en-IN,en;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
  },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeExtFromContentType(ct) {
  if (!ct) return '.jpg';
  ct = String(ct).toLowerCase();
  if (ct.includes('jpeg')) return '.jpg';
  if (ct.includes('jpg'))  return '.jpg';
  if (ct.includes('png'))  return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif'))  return '.gif';
  if (ct.includes('bmp'))  return '.bmp';
  if (ct.includes('svg'))  return '.svg';
  return '.jpg';
}

function extFromUrl(u) {
  try {
    const url = new URL(u);
    const p = url.pathname.toLowerCase();
    const m = p.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:$|\.)/i);
    if (m) {
      const e = m[1].toLowerCase();
      return e === 'jpeg' ? '.jpg' : `.${e}`;
    }
  } catch {}
  return null;
}

function pickExt(u, contentType) {
  return extFromUrl(u) || safeExtFromContentType(contentType);
}

function sha1Hex(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function isLikelyImageUrl(u) {
  return /\.(jpg|jpeg|png|webp|gif|bmp|svg)(?:$|\.)/i.test(String(u));
}

function httpGet(url, headers, opts){
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers, timeout: opts.timeoutMs }, (res) => resolve(res));
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

async function getWithRedirects(url, headers, opts, redirectsLeft){
  const res = await httpGet(url, headers, opts);
  const code = res.statusCode || 0;

  // Follow redirects
  if ([301,302,303,307,308].includes(code)) {
    res.resume(); // discard body
    if (redirectsLeft <= 0) throw new Error('Too many redirects');
    const loc = res.headers.location;
    if (!loc) throw new Error('Redirect with no Location');
    const next = new URL(loc, url).toString();
    return getWithRedirects(next, headers, opts, redirectsLeft - 1);
  }

  return { url, res };
}

async function downloadOne(url, uploadDir, opts) {
  const out = { url, ok: false, filePath: null, webPath: null, reason: '' };
  try {
    const { url: finalUrl, res } = await getWithRedirects(url, opts.headers, opts, opts.maxRedirects);

    // Status must be 2xx
    const sc = res.statusCode || 0;
    if (sc < 200 || sc >= 300) {
      out.reason = `HTTP ${sc}`;
      res.resume();
      return out;
    }

    // Content-type / size guards
    const ct = res.headers['content-type'] || '';
    const len = Number(res.headers['content-length'] || '') || 0;

    // Accept if Content-Type starts with image/* OR URL clearly looks like an image
    const ctOk = /^image\//i.test(ct) || isLikelyImageUrl(finalUrl);
    if (!ctOk) {
      res.resume();
      out.reason = `Not an image content-type: ${ct || 'unknown'}`;
      return out;
    }

    // NEW: hard-block GIFs (by final URL or by content-type)
    if (/\.gif(?:$|\?)/i.test(finalUrl) || /image\/gif/i.test(ct)) {
      res.resume();
      out.reason = 'GIF blocked';
      return out;
    }

    if (opts.maxBytes && len && len > opts.maxBytes) {
      res.resume();
      out.reason = `Too large: ${len} bytes`;
      return out;
    }

    ensureDir(uploadDir);

    // Deterministic filename from URL hash (prevents re-downloads)
    const id = sha1Hex(finalUrl).slice(0, 16);
    const ext = pickExt(finalUrl, ct);
    const filename = `${id}${ext}`;
    const finalPath = path.join(uploadDir, filename);

    // If file already exists, reuse it
    if (fs.existsSync(finalPath)) {
      out.ok = true;
      out.filePath = finalPath;
      out.webPath = path.posix.join(opts.webBase || DEFAULT_OPTS.webBase, filename);
      res.resume();
      return out;
    }

    // Stream to disk via .part, then atomic rename
    const tmpPath = finalPath + '.part';
    try {
      await streamPipeline(res, fs.createWriteStream(tmpPath));
    } catch (e) {
      try { fs.unlinkSync(tmpPath); } catch {}
      out.reason = `Stream error: ${String(e)}`;
      return out;
    }

    // Size check after download if no content-length provided
    if (opts.maxBytes && !len) {
      const st = fs.statSync(tmpPath);
      if (st.size > opts.maxBytes) {
        try { fs.unlinkSync(tmpPath); } catch {}
        out.reason = `Too large after download: ${st.size} bytes`;
        return out;
      }
    }

    fs.renameSync(tmpPath, finalPath);

    out.ok = true;
    out.filePath = finalPath;
    out.webPath = path.posix.join(opts.webBase || DEFAULT_OPTS.webBase, filename);
    return out;
  } catch (e) {
    out.reason = String(e?.message || e);
    return out;
  }
}

/**
 * Download many image URLs sequentially with a small gap to be gentle.
 * @param {string[]} urls
 * @param {string} uploadDir absolute path to uploads directory
 * @param {object} options   { webBase, maxBytes, gapMs, headers, maxRedirects, timeoutMs }
 * @returns {Promise<Array<{url, ok, filePath, webPath, reason}>>}
 */
async function downloadImagesFromUrls(urls, uploadDir, options={}) {
  const opts = Object.assign({}, DEFAULT_OPTS, options || {});
  const results = [];
  for (const u of Array.isArray(urls) ? urls : []) {
    const url = String(u || '').trim();
    if (!url) continue;
    const r = await downloadOne(url, uploadDir, opts);
    results.push(r);
    if (opts.gapMs) await sleep(opts.gapMs);
  }
  return results;
}

module.exports = {
  downloadImagesFromUrls,
};
