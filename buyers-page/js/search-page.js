// Path: E:\amazon-business-home\buyers-page\js\search-page.js
import { getProducts, API_BASE, getSiteSettings } from './api.js';
import { productCard } from './components/product-card.js'; // shared product card

const $ = (s, r = document) => r.querySelector(s);

// Keys used by the shared filters script
const FILTER_STATE_KEY = 'kelenate.category.filters.v1';
const LAST_Q_KEY       = 'kelenate.last.search.q';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)||0));

function fmtPrice(p){
  if (p == null) return '';
  const n = Number(p) || 0;
  return '₹' + n.toLocaleString('en-IN');
}
function abs(u){ return !u ? '' : (/^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`); }

function getQ(){
  const q = new URLSearchParams(location.search).get('q') || '';
  return q.trim();
}

/* ---------- filter state guards (so search isn't "empty") ---------- */
function clearFiltersOncePerPageLoad(){
  try { sessionStorage.removeItem(FILTER_STATE_KEY); } catch {}
}
function resetFiltersIfNewQuery(q){
  try{
    const last = sessionStorage.getItem(LAST_Q_KEY) || '';
    if (q && q !== last) {
      sessionStorage.removeItem(FILTER_STATE_KEY);
      sessionStorage.setItem(LAST_Q_KEY, q);
    }
  }catch{}
}

/* ---------- color normalization for filter module ---------- */
function normalizeColorsFromMeta(p){
  const colors = [];
  ['color','colour','Color','Colour','colors','colours'].forEach(k => {
    const v = p?.[k];
    if (!v) return;
    if (Array.isArray(v)) colors.push(...v);
    else if (typeof v === 'string') colors.push(v);
  });
  const norm = Array.from(new Set(
    colors
      .filter(Boolean)
      .map(s => String(s).toLowerCase().trim())
      .map(c => c === 'golden' ? 'gold' : (c === 'gray' ? 'grey' : c))
  ));
  return norm.join(' ');
}

/* ---------- price/MRP helpers so filters can read numeric values ---------- */
function firstNumber(obj, keys){
  for (const k of keys){
    const v = obj?.[k];
    if (v == null) continue;
    const n = (typeof v === 'number') ? v : Number(String(v).replace(/[^\d.]/g,''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}
const PRICE_KEYS = [
  'price','Price','salePrice','sale_price','sellingPrice','selling_price',
  'discountedPrice','discounted_price','ourPrice','our_price','offerPrice','offer_price'
];
const MRP_KEYS = [
  'mrp','MRP','listPrice','list_price','strikePrice','strike_price',
  'originalPrice','original_price','maxRetailPrice','max_retail_price'
];

/* ---------- render cards into #grid (use shared product-card) ---------- */
function render(products, cols){
  const grid = $('#grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!Array.isArray(products) || products.length === 0) {
    grid.innerHTML = '<div class="muted">No results found.</div>';
    const c = $('#srchCount');
    if (c) c.textContent = '0 items';
    return;
  }

  // ✅ Do not clobber existing classes; just ensure these are present
  grid.classList.add('row', 'amazon-row');

  const wrap = document.createElement('div');
  wrap.className = 'products search-products';

  // ✅ Force a proper grid here so Admin columns apply reliably on Search
  wrap.setAttribute(
    'style',
    `display:grid;--cols:${cols};grid-auto-flow:row;grid-template-columns:repeat(${cols},1fr);grid-auto-columns:initial;overflow-x:visible;scroll-snap-type:none;min-width:0;`
  );

  products.forEach(p => {
    const card = productCard(p); // should be <a class="pcard …">

    // Ensure filters can target/read data from each card:

    // 1) Make sure the card has the `.product` class (selector used by filters)
    if (!card.classList.contains('product')) card.classList.add('product');

    // 2) Title hook for text matching
    const titleNode = card.querySelector('.pcard-title');
    if (titleNode && !titleNode.classList.contains('title')) titleNode.classList.add('title');

    // 3) Colors hook (only if component didn't set it)
    if (!card.getAttribute('data-colors')) {
      const colors = normalizeColorsFromMeta(p);
      if (colors) card.setAttribute('data-colors', colors);
    }

    // 4) Numeric price/MRP for price & discount filters
    const priceNum = firstNumber(p, PRICE_KEYS);
    const mrpNum   = firstNumber(p, MRP_KEYS);
    if (priceNum != null) card.dataset.price = String(priceNum);
    if (mrpNum   != null) card.dataset.mrp   = String(mrpNum);

    wrap.appendChild(card);
  });

  grid.appendChild(wrap);

  const count = products.length;
  const c = $('#srchCount');
  if (c) c.textContent = `${count} item${count === 1 ? '' : 's'}`;
}

/* ---------- sorting ---------- */
function applySort(items, sort){
  const arr = items.slice();
  if (sort === 'price_asc')      arr.sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  else if (sort === 'price_desc')arr.sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  else if (sort === 'title_asc') arr.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  return arr; // 'relevance' keeps API order
}

/* ---------- search flow ---------- */
async function fetchResults(q){
  // Backend query attempt
  let raw = [];
  try {
    raw = await getProducts({ q, limit: 200, _: Date.now() }) || [];
  } catch {}

  // Fallback: title-filter client-side (if backend ignores q or returns nothing)
  if (!raw.length) {
    try {
      const bulk = await getProducts({ limit: 1000, _: Date.now() }) || [];
      const qq = q.toLowerCase();
      raw = bulk.filter(p => String(p.title || '').toLowerCase().includes(qq));
    } catch {}
  }
  return raw;
}

async function runSearch(){
  const q = getQ();
  const t = $('#srchTitle');
  if (t) t.textContent = q ? `Results for “${q}”` : 'Results';

  const grid = $('#grid');
  if (!q) {
    const c = $('#srchCount');
    if (c) c.textContent = '0 items';
    if (grid) grid.innerHTML = '<div class="muted">Type in the search box above to find products.</div>';
    return;
  }

  // Make sure stale filters don't hide fresh results
  resetFiltersIfNewQuery(q);

  // ✅ Read Admin → Card Grid with robust fallbacks
  let cols = 4;
  try {
    const s = await getSiteSettings();
    const cg = s?.cardGrid || {};
    cols = clamp(cg.search ?? cg.default ?? cg.home ?? cg.category ?? 4, 1, 8);
  } catch {}

  const raw = await fetchResults(q);

  const sortSel = $('#sort');
  const rerender = () => {
    const sorted = sortSel ? applySort(raw, sortSel.value) : raw;
    render(sorted, cols);
    // category-filters.js observes #grid mutations and will auto-lock/update.
  };
  if (sortSel) sortSel.onchange = rerender;

  rerender();
}

/* ---------- init ---------- */
async function init(){
  // First page load: ensure no stale filter chips kill the initial render
  clearFiltersOncePerPageLoad();

  try {
    await runSearch();
  } catch {
    const grid = $('#grid');
    if (grid) grid.innerHTML = '<div class="muted">No results found.</div>';
    const c = $('#srchCount');
    if (c) c.textContent = '0 items';
  }
}

// Handle back/forward when query changes
window.addEventListener('popstate', init);

init();
