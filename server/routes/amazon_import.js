// server/routes/amazon_import.js
const express = require('express');
const router = express.Router();
const cheerio = require('cheerio');

/**
 * POST /amazon/import { url }
 * Returns a normalized product object:
 * { title, mrp, price, sku, category, moq, bullets[], description, images[], videos[], status }
 */
router.post('/amazon/import', express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const url = String(req.body?.url || '').trim();
    if (!url || !/^https?:\/\/(www\.)?amazon\./i.test(url)) {
      return res.status(400).json({ error: 'Provide a valid Amazon product URL' });
    }

    // Fetch Amazon HTML
    const html = await fetchHtml(url);
    if (!html) return res.status(502).json({ error: 'Failed to fetch the URL' });

    // Detect bot walls / captchas – signal client to retry with backoff
    if (/captcha|not a robot|robot check|automated access|enter the characters/i.test(html)) {
      return res.status(429).json({ error: 'Blocked by Amazon (captcha/bot wall)' });
    }

    const $ = cheerio.load(html);

    // -------- Title (robust fallbacks) --------
    const title =
      textTrim($('#productTitle').first().text()) ||
      textTrim($('#title').first().text()) ||
      textTrim($('meta[property="og:title"]').attr('content')) ||
      textTrim($('meta[name="title"]').attr('content')) ||
      textTrim($('h1').first().text()) ||
      '';

    // -------- Price / MRP candidates (common variants) --------
    // Visible price (deal/our price/offscreen)
    const priceStr =
      textTrim($('.a-price .a-offscreen').first().text()) ||
      textTrim($('#corePriceDisplay_desktop_feature_div .a-offscreen').first().text()) ||
      textTrim($('#priceblock_ourprice').text()) ||
      textTrim($('#priceblock_dealprice').text()) ||
      textTrim($('#tp_price_block_total_price_ww .a-offscreen').first().text()) ||
      '';

    // Struck list price / MRP (strikethrough)
    const mrpStr =
      textTrim($('#price .a-text-price .a-offscreen').first().text()) ||
      textTrim($('.a-text-price .a-offscreen').first().text()) ||
      textTrim($('.priceBlockStrikePriceString').first().text()) ||
      textTrim($('#listPrice').text()) ||
      textTrim($('#corePriceDisplay_desktop_feature_div .a-price.a-text-price .a-offscreen').first().text()) ||
      '';

    const price = parseMoney(priceStr);
    const mrp   = parseMoney(mrpStr);

    // -------- ASIN / SKU --------
    let sku =
      $('#ASIN').attr('value') ||
      $('input[name="ASIN"]').attr('value') ||
      '';

    // Try detail bullets (new layout)
    if (!sku) {
      $('#detailBullets_feature_div li').each((_, li) => {
        const t = textTrim($(li).text());
        const m = t.match(/ASIN\s*:\s*([A-Z0-9]{8,14})/i);
        if (m) sku = m[1].toUpperCase();
      });
    }
    // Try legacy product details table
    if (!sku) {
      $('#productDetails_detailBullets_sections1 tr').each((_, tr) => {
        const th = textTrim($(tr).find('th').text());
        const td = textTrim($(tr).find('td').text());
        if (/ASIN/i.test(th)) {
          const m = td.match(/([A-Z0-9]{8,14})/i);
          if (m) sku = m[1].toUpperCase();
        }
      });
    }
    // Fallback: canonical link or URL path (/dp/<ASIN>, /gp/product/<ASIN>)
    if (!sku) {
      const canon = $('link[rel="canonical"]').attr('href') || url;
      const m = canon.match(/(?:dp|gp\/product)\/([A-Z0-9]{8,14})/i);
      if (m) sku = m[1].toUpperCase();
    }

    // -------- Category (breadcrumb last non-empty) --------
    let category = '';
    $('#wayfinding-breadcrumbs_container a').each((_, a) => {
      const t = textTrim($(a).text());
      if (t) category = t;
    });

    // -------- Bullets (up to 7) --------
    const bullets = [];
    // Primary bullets list
    $('#feature-bullets ul li').each((_, li) => {
      const t = textTrim($(li).text());
      if (t) bullets.push(t);
    });
    // Alt bullet list variant (some layouts)
    if (bullets.length === 0) {
      $('ul.a-unordered-list.a-vertical.a-spacing-mini li').each((_, li) => {
        const t = textTrim($(li).text());
        if (t) bullets.push(t);
      });
    }
    while (bullets.length > 7) bullets.pop();

    // -------- Description: prefer A+ content, fallback to productDescription/meta --------
    let descriptionHtml =
      $('#aplus_feature_div').html() ||
      $('#productDescription').html() ||
      '';
    if (!descriptionHtml) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) descriptionHtml = metaDesc;
    }
    const description = (descriptionHtml || '').toString().trim();

    // =====================================================================
    //            GALLERY-ONLY IMAGE EXTRACTION (no A+ content)
    // =====================================================================

    // 1) From known script blobs: colorImages / imageGalleryData / ImageBlockATF
    function collectFromScriptBlobs(rawHtml, baseUrl){
      const out = [];
      const tags = rawHtml.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
      const MARKERS = ['colorImages','imageGalleryData','ImageBlockATF','imageBlockData','ImageGallery'];
      const urlRe = /(?:hiRes|large|mainUrl)\s*:\s*(["'])(https?:\/\/[^"']+?)\1/g;

      for (const tag of tags) {
        const lower = tag.toLowerCase();
        if (!MARKERS.some(m => lower.includes(m.toLowerCase()))) continue;
        let m;
        while ((m = urlRe.exec(tag)) !== null) {
          out.push(m[2]);
        }
      }
      return out.map(u => absolutizeImage(baseUrl, u));
    }

    // 2) From thumbnail strip: data-a-dynamic-image (pick largest)
    function collectFromThumbDynamic($$, baseUrl){
      const out = [];
      const sels = ['#altImages img', '#imageBlockThumbs img', '.imageThumb img', '#ivThumbs img'];
      for (const sel of sels) {
        $$(sel).each((_, el) => {
          const $img = $$(el);
          const dyn = $img.attr('data-a-dynamic-image') || $img.attr('data-old-hires') || '';
          const src = $img.attr('src') || '';
          if (dyn) {
            try {
              const fixed = dyn.replace(/&quot;/g,'"').replace(/'/g,'"');
              const map = JSON.parse(fixed); // {"url":[w,h], ...}
              let best = null;
              for (const [u, size] of Object.entries(map)) {
                const [w,h] = Array.isArray(size) ? size : [0,0];
                const score = (+w||0)*(+h||0);
                if (!best || score > best.score) best = { url:u, score };
              }
              if (best && best.url) out.push(best.url);
            } catch {}
          } else if (src) {
            out.push(src);
          }
        });
      }
      return out.map(u => absolutizeImage(baseUrl, u));
    }

    // 3) Hero fallback (single) ONLY if gallery empty
    function collectHeroFallback($$, baseUrl){
      const out = [];
      const hero = $$('#landingImage');
      if (hero.length) {
        const hires = hero.attr('data-old-hires') || '';
        const dyn   = hero.attr('data-a-dynamic-image') || '';
        const src   = hero.attr('src') || '';
        if (hires) out.push(hires);
        else if (dyn) {
          try {
            const fixed = dyn.replace(/&quot;/g,'"').replace(/'/g,'"');
            const map = JSON.parse(fixed);
            let best = null;
            for (const [u, size] of Object.entries(map)) {
              const [w,h] = Array.isArray(size) ? size : [0,0];
              const score = (+w||0)*(+h||0);
              if (!best || score > best.score) best = { url:u, score };
            }
            if (best && best.url) out.push(best.url);
          } catch {}
        } else if (src) out.push(src);
      }
      return out.map(u => absolutizeImage(baseUrl, u));
    }

    // 4) Keep only Amazon image CDNs & upgrade tiny variants
    function postFilterAndUpgrade(urls){
      const onlyAmazonCdn = urls.filter(u =>
        /amazon\.(?:com|in|co\.uk|de|fr|co\.jp|ca|com\.au|com\.mx|ae|sa|it|es|nl|se|pl|eg|sg)/i.test(u) ||
        /images-(?:na|eu|jc)\.ssl-images-amazon\.com/i.test(u)
      );
      const upgraded = onlyAmazonCdn.map(u =>
        u
          .replace(/\._SX\d+_\.jpg/gi, '._SL1500_.jpg')
          .replace(/\._SY\d+_\.jpg/gi, '._SL1500_.jpg')
          .replace(/\._SS\d+_\.jpg/gi, '._SL1500_.jpg')
          .replace(/\._UX\d+_\.jpg/gi, '._SL1500_.jpg')
          .replace(/\._UY\d+_\.jpg/gi, '._SL1500_.jpg')
          .replace(/\._CR\,[^_]+_/gi, '._SL1500_')
      );
      // use existing unique() helper for de-dupe
      return unique(upgraded);
    }

    // Build gallery-only list (no general <img> scan, no A+ scrape)
    let gallery = collectFromScriptBlobs(html, url);
    const thumbs = collectFromThumbDynamic($, url);
    if (thumbs.length) gallery = gallery.concat(thumbs);
    if (gallery.length === 0) {
      // final fallback to a single "hero" if nothing else
      gallery = gallery.concat(collectHeroFallback($, url));
    }
    const images = postFilterAndUpgrade(gallery).slice(0, 20);

    // -------- Videos (optional) --------
    const videos = []; // most ASINs won’t expose direct URLs

    // If nothing useful, let client retry (empty but retryable)
    if (!title && images.length === 0) {
      return res.status(204).end();
    }

    const out = {
      title,
      mrp: (Number.isFinite(price) && Number.isFinite(mrp)) ? Math.max(price, mrp) : (mrp ?? null),
      price: price ?? null,
      sku: sku || '',              // client can override/fill before save
      category: category || '',    // client chooses exact admin category
      moq: 1,
      bullets,
      description,
      images,                      // <-- gallery-only
      videos,
      status: 'active'
    };
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      headers: {
        // Realistic desktop headers help reduce bot walls
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-IN,en;q=0.9',
        'cache-control': 'no-cache',
        'pragma': 'no-cache',
        'upgrade-insecure-requests': '1'
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function textTrim(s){ return (s||'').replace(/\s+/g,' ').trim(); }
function parseMoney(s){
  if(!s) return null;
  const n = s.replace(/[^\d.,]/g,'').replace(/,/g,'');
  const f = parseFloat(n);
  return Number.isFinite(f) ? f : null;
}
function unique(arr){
  const set = new Set();
  const out = [];
  arr.forEach(u => {
    const k = String(u).trim();
    if (k && !set.has(k)) { set.add(k); out.push(k); }
  });
  return out;
}

// Make image URL absolute relative to the product URL origin
function absolutizeImage(productUrl, u){
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  try {
    const base = new URL(productUrl);
    if (u.startsWith('//')) return `${base.protocol}${u}`;
    if (u.startsWith('/'))  return `${base.origin}${u}`;
    return `${base.origin}/${u}`;
  } catch { return u; }
}

module.exports = router;
