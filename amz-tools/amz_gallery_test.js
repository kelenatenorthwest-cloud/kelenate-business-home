// amz_gallery_test.js
// CLI tester to fetch ONLY the GALLERY images from an Amazon product page
// Usage: node amz_gallery_test.js "https://www.amazon.in/dp/<ASIN>"
// Requires: Node 18+ and `npm i cheerio`

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const INPUT_URL = (process.argv[2] || '').trim();
if (!/^https?:\/\/(www\.)?amazon\./i.test(INPUT_URL)) {
  console.error('ERROR: Provide a valid Amazon product URL.\nExample:\n  node amz_gallery_test.js "https://www.amazon.in/dp/B0..."');
  process.exit(1);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-IN,en;q=0.9',
      'cache-control': 'no-cache',
      'pragma': 'no-cache',
      'upgrade-insecure-requests': '1',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return await res.text();
}

function absolutize(productUrl, u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  try {
    const base = new URL(productUrl);
    if (u.startsWith('//')) return `${base.protocol}${u}`;
    if (u.startsWith('/')) return `${base.origin}${u}`;
    return `${base.origin}/${u}`;
  } catch {
    return u;
  }
}
function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x || '').trim();
    if (!k) continue;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

// Pull hiRes/large/mainUrl from script blobs referencing gallery objects
function collectFromScriptBlobs(html, baseUrl) {
  const out = [];
  const candidates = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  const MARKERS = ['colorImages', 'imageGalleryData', 'ImageBlockATF', 'imageBlockData', 'ImageGallery'];
  const urlRe = /(?:hiRes|large|mainUrl)\s*:\s*(["'])(https?:\/\/[^"']+?)\1/g;

  for (const tag of candidates) {
    const lower = tag.toLowerCase();
    if (!MARKERS.some((m) => lower.includes(m.toLowerCase()))) continue;
    let m;
    while ((m = urlRe.exec(tag)) !== null) {
      out.push(m[2]);
    }
  }
  return out.map((u) => absolutize(baseUrl, u));
}

// Collect from thumbnail strip (data-a-dynamic-image prefers biggest)
function collectFromThumbDynamic($, baseUrl) {
  const out = [];
  const thumbSelectors = ['#altImages img', '#imageBlockThumbs img', '.imageThumb img', '#ivThumbs img'];

  for (const sel of thumbSelectors) {
    $(sel).each((_, el) => {
      const $img = $(el);
      const dyn = $img.attr('data-a-dynamic-image') || $img.attr('data-old-hires') || '';
      const src = $img.attr('src') || '';
      if (dyn) {
        try {
          const fixed = dyn.replace(/&quot;/g, '"').replace(/'/g, '"'); // normalize single→double quotes
          const map = JSON.parse(fixed); // {"url":[w,h], ...}
          let best = null;
          for (const [u, size] of Object.entries(map)) {
            const [w, h] = Array.isArray(size) ? size : [0, 0];
            const score = (+w || 0) * (+h || 0);
            if (!best || score > best.score) best = { url: u, score };
          }
          if (best && best.url) out.push(best.url);
        } catch {}
      } else if (src) {
        out.push(src);
      }
    });
  }
  return out.map((u) => absolutize(baseUrl, u));
}

// Single-hero fallback (only if gallery empty)
function collectHeroFallback($, baseUrl) {
  const out = [];
  const hero = $('#landingImage');
  if (hero.length) {
    const hires = hero.attr('data-old-hires') || '';
    const dyn = hero.attr('data-a-dynamic-image') || '';
    const src = hero.attr('src') || '';
    if (hires) out.push(hires);
    else if (dyn) {
      try {
        const fixed = dyn.replace(/&quot;/g, '"').replace(/'/g, '"');
        const map = JSON.parse(fixed);
        let best = null;
        for (const [u, size] of Object.entries(map)) {
          const [w, h] = Array.isArray(size) ? size : [0, 0];
          const score = (+w || 0) * (+h || 0);
          if (!best || score > best.score) best = { url: u, score };
        }
        if (best && best.url) out.push(best.url);
      } catch {}
    } else if (src) out.push(src);
  }
  return out.map((u) => absolutize(baseUrl, u));
}

// Keep only Amazon image CDNs & try upgrading tiny size tokens
function postFilterAndUpgrade(urls) {
  const onlyAmazonCdn = urls.filter(
    (u) =>
      /amazon\.(?:com|in|co\.uk|de|fr|co\.jp|ca|com\.au|com\.mx|ae|sa|it|es|nl|se|pl|eg|sg)/i.test(u) ||
      /images-(?:na|eu|jc)\.ssl-images-amazon\.com/i.test(u),
  );

  const upgraded = onlyAmazonCdn.map((u) =>
    u
      .replace(/\._SX\d+_\.jpg/gi, '._SL1500_.jpg')
      .replace(/\._SY\d+_\.jpg/gi, '._SL1500_.jpg')
      .replace(/\._SS\d+_\.jpg/gi, '._SL1500_.jpg')
      .replace(/\._UX\d+_\.jpg/gi, '._SL1500_.jpg')
      .replace(/\._UY\d+_\.jpg/gi, '._SL1500_.jpg')
      .replace(/\._CR\,[^_]+_/gi, '._SL1500_'),
  );

  return uniq(upgraded);
}

async function main() {
  console.log('Fetching:', INPUT_URL);
  const html = await fetchHtml(INPUT_URL);
  const $ = cheerio.load(html);

  let gallery = collectFromScriptBlobs(html, INPUT_URL);
  const fromThumbs = collectFromThumbDynamic($, INPUT_URL);
  if (fromThumbs.length) gallery = gallery.concat(fromThumbs);

  if (gallery.length === 0) gallery = gallery.concat(collectHeroFallback($, INPUT_URL));

  const finalUrls = postFilterAndUpgrade(gallery);

  if (finalUrls.length === 0) console.error('No gallery images found (page blocked or structure changed).');
  else console.log(`Found ${finalUrls.length} gallery image(s).`);

  const urlsPath = path.resolve(process.cwd(), 'amz_gallery_urls.txt');
  fs.writeFileSync(urlsPath, finalUrls.join('\n'), 'utf8');
  console.log('Saved:', urlsPath);

  const htmlPath = path.resolve(process.cwd(), 'amz_gallery_preview.html');
  const grid = finalUrls
    .map(
      (u) => `
    <figure class="card">
      <img src="${u}" loading="lazy" alt="gallery">
      <figcaption>${u}</figcaption>
    </figure>`,
    )
    .join('\n');

  const page = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazon Gallery Preview</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:16px}
h1{margin:0 0 12px;font-size:20px}
.meta{color:#555;margin-bottom:16px;word-break:break-all}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card{border:1px solid #ddd;border-radius:12px;padding:10px;background:#fff}
.card img{width:100%;height:260px;object-fit:contain;background:#fafafa;border-radius:8px}
.card figcaption{margin-top:8px;font-size:12px;color:#333}
.empty{padding:20px;border:1px dashed #bbb;border-radius:8px}
</style></head>
<body>
  <h1>Amazon Gallery Preview</h1>
  <div class="meta">Source: <a href="${INPUT_URL}" target="_blank" rel="noreferrer">${INPUT_URL}</a><br>Images found: ${finalUrls.length}</div>
  ${finalUrls.length ? `<div class="grid">${grid}</div>` : `<div class="empty">No images found.</div>`}
</body></html>`;

  fs.writeFileSync(htmlPath, page, 'utf8');
  console.log('Saved:', htmlPath);

  if (process.platform === 'win32') {
    const { exec } = require('child_process');
    exec(`start "" "${htmlPath.replace(/\//g, '\\\\')}"`);
  }
}

main().catch((err) => {
  console.error('ERROR:', err?.message || err);
  process.exit(1);
});
