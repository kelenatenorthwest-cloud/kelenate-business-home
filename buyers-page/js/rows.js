// Amazon-like rows with two-tone product cards, 2-line title,
// price above MRP (MRP slashed)

import { $, $$ } from './utils.js';
import { getProducts, getHomeSections, getHomeSectionsOrder, API_BASE, getSiteSettings } from './api.js';
import { productCard } from './components/product-card.js'; // <-- shared card

/* ---------- tiny DOM helper ---------- */
function h(tag, attrs = {}, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') {
      // FIX: normalize event name to lowercase so onClick → "click"
      const evt = k.slice(2).toLowerCase();
      el.addEventListener(evt, v);
    } else if (v != null) {
      el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/* ---------- helpers (kept for compatibility) ---------- */
function imgSrc(p){
  return (
    (Array.isArray(p.images) && p.images[0]) ||
    p.image || p.img || '/img/placeholder.png'
  );
}
function abs(u){ return !u ? '' : (/^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`); }
function toPaise(val){
  if (val == null) return 0;
  const n = typeof val === 'number' ? val : Number(String(val).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
async function postJSON(url, body){
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!res.ok) {
    if (res.status === 401) { location.href = '/login.html'; throw new Error('Auth required'); }
    throw new Error(data?.error || res.statusText);
  }
  return data;
}
function pdpHref(p){
  const skuOrId = p?.sku ?? p?.id;
  return skuOrId ? `/product.html?id=${encodeURIComponent(String(skuOrId))}` : '#';
}
function formatINRParts(val){
  const num = Number(val ?? 0);
  const whole = Math.floor(num);
  const fraction = Math.round((num - whole) * 100);
  return {
    whole: whole.toLocaleString('en-IN'),
    fraction: String(fraction).padStart(2, '0')
  };
}
function priceView(price){
  const {whole, fraction} = formatINRParts(price);
  return h('div', {class:'a-price'},
    h('span', {class:'a-price-symbol'}, '₹'),
    h('span', {class:'a-price-whole'},  whole),
    h('span', {class:'a-price-fraction'}, fraction)
  );
}
function mrpView(mrp){
  if(mrp == null) return null;
  const {whole, fraction} = formatINRParts(mrp);
  return h('div', {class:'a-mrp'},
    '₹', whole, '.', fraction
  );
}
function matchesCategory(p, cat){
  if(!cat) return false;
  const C = String(cat).toLowerCase();
  const fields = [p.mainCategory, p.category, p.Category, p.MainCategory]
    .filter(Boolean).map(String);
  if (fields.some(x => x.toLowerCase() === C)) return true;
  if (Array.isArray(p.categories) && p.categories.some(x => String(x).toLowerCase() === C)) return true;
  if (Array.isArray(p.tags) && p.tags.some(x => String(x).toLowerCase() === C)) return true;
  return false;
}

// clamp helper for grid sizes
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

// breakpoint helpers
const isSmall = () => window.matchMedia && window.matchMedia('(max-width: 900px)').matches;

/* ---------- row ---------- */
function renderCategoryRow(title, items, cols, useScroller){
  const section = h('section', {class:'row amazon-row'});

  // Title → category page link
  section.append(
    h('h3', {},
      h('a', {
        href: `category.html?type=main&value=${encodeURIComponent(title)}`,
        class: 'row-title-link',
        style: 'text-decoration:none;color:inherit',
        'aria-label': `Browse ${title}`
      }, title)
    )
  );

  // PRODUCT WRAP
  // NOTE: we DO NOT set --vis inline so CSS media queries can control it.
  const wrap = h(
    'div',
    useScroller
      ? {
          class: 'products home-products home-scroller',
          style: ['display:grid','min-width:0',`--cols:${cols}`].join(';')
        }
      : {
          class: 'products home-products',
          style: [
            'display:grid',
            'min-width:0',
            `--cols:${cols}`,
            'grid-auto-flow:row',
            'grid-template-columns:repeat(var(--cols),1fr)',
            'grid-auto-columns:initial'
          ].join(';')
        },
    items.map(productCard)
  );

  section.append(wrap);
  return section;
}

/* ---------- main: render rows ---------- */
export async function renderHomeRows(){
  const container = document.querySelector('.rows') || document.querySelector('main') || document.body;

  // Read cards-per-row for HOME from site settings (Admin → Card Grid)
  let homeCols = 6;
  try {
    const s = await getSiteSettings();
    const cg = s?.cardGrid || {};
    homeCols = clamp(cg.home ?? cg.default ?? cg.category ?? cg.search ?? 6, 1, 8);
  } catch {}

  // 1) Desired order of categories (admin-configured)
  let order = [];
  try {
    order = await getHomeSectionsOrder();   // array of category names
  } catch {}
  if(!order || !order.length){
    try{
      const hs = await getHomeSections();   // legacy keys
      order = Array.from(new Set([hs?.keep, hs?.pick, hs?.freq].filter(Boolean)));
    }catch{ order = []; }
  }
  if(!order.length){
    container.append(h('div', {class:'muted', style:'padding:12px'},
      'No home categories configured yet. Use Admin → Home Sections.'));
    return;
  }

  // 2) Decide initial layout & how many items to fetch
  const useScrollerInitially = isSmall();
  const fetchN = useScrollerInitially ? Math.max(homeCols * 3, 24) : homeCols;

  // Fetch products PER CATEGORY
  const cache = new Map();
  async function getTopFor(cat, n = fetchN){
    const key = String(cat || '');
    if (!key) return [];
    if (cache.has(key)) return cache.get(key);
    try {
      const rows = await getProducts({ mainCategory: key, limit: n, offset: 0 });
      if (Array.isArray(rows) && rows.length){
        const out = rows.slice(0, n);
        cache.set(key, out);
        return out;
      }
    } catch (e){
      console.warn('Category fetch failed', key, e);
    }
    // Fallback: fetch a larger page and filter client-side for backward compatibility
    try {
      const bulk = await getProducts({ limit: Math.max(200, n), offset: 0 });
      const filtered = (bulk || []).filter(p => matchesCategory(p, key)).slice(0, n);
      cache.set(key, filtered);
      return filtered;
    } catch (e2){
      console.warn('Fallback fetch failed', key, e2);
      cache.set(key, []);
      return [];
    }
  }

  // 3) Build rows
  for (const cat of order){
    const list = await getTopFor(String(cat), fetchN);
    if(!list || !list.length) continue;
    container.append( renderCategoryRow(String(cat), list, homeCols, useScrollerInitially) );
  }

  // 4) Responsive toggle (if viewport changes, switch scroller class)
  function applyResponsiveLayout(){
    const small = isSmall();
    document.querySelectorAll('.row.amazon-row .products.home-products').forEach(wrap => {
      wrap.classList.toggle('home-scroller', small);
      // we deliberately do NOT set --vis here; CSS controls it via media queries
    });
  }
  window.addEventListener('resize', applyResponsiveLayout);
}
