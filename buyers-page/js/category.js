// Path: E:\amazon-business-home\buyers-page\js\category.js
// category.js — renders a category listing and links each product to the PDP
import { $, el } from './utils.js';
import { API_BASE, getProducts, getMainCategories, getSiteSettings } from './api.js';
import { initDropdown, fillMenuWithCategories } from './dropdowns.js';
import { productCard } from './components/product-card.js'; // <-- use shared card

function params() {
  const u = new URL(location.href);
  return {
    type: (u.searchParams.get('type') || 'main').toLowerCase(),
    value: (u.searchParams.get('value') || '').trim(),
  };
}

function rupee(n){ return (n==null || isNaN(Number(n))) ? '₹—' : `₹${Number(n).toLocaleString('en-IN')}`; }

/* ====== helpers (aligned with buyers-page/js/rows.js) ====== */
function h(tag, attrs = {}, ...kids){
  const el = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k === 'class') el.className = v;
    else if(k === 'style') el.setAttribute('style', v);
    else if(k.startsWith('on') && typeof v === 'function') {
      // FIX: normalize event name so onClick → "click"
      el.addEventListener(k.slice(2).toLowerCase(), v);
    }
    else if(v != null) el.setAttribute(k, v);
  }
  for(const kid of kids.flat()){
    if(kid == null) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function imgSrc(p){
  let src = (Array.isArray(p.images) && p.images[0]) || p.image || p.img || '/img/placeholder.png';
  if (src && !/^https?:\/\//i.test(src)) {
    // prefix absolute host for server-served paths
    src = `${API_BASE}${src}`;
  }
  return src;
}
function pdpHref(p){
  const skuOrId = p?.sku ?? p?.id;
  return skuOrId ? `/product.html?id=${encodeURIComponent(String(skuOrId))}` : '#';
}
function formatINRParts(val){
  const num = Number(val ?? 0);
  const whole = Math.floor(num);
  const fraction = Math.round((num - whole) * 100);
  return { whole: whole.toLocaleString('en-IN'), fraction: String(fraction).padStart(2, '0') };
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
  return h('div', {class:'a-mrp'}, '₹', whole, '.', fraction);
}

/* ====== minimal helpers for Add to Cart (mirrors PDP) ====== */
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

/* ====== color normalization for left-rail filters ====== */
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

/* ====== helpers to expose numeric price/MRP to the filter script ====== */
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

/* Keep category matching/sorting logic unchanged */
function matchesCategory(p, cat){
  if(!cat) return false;
  const C = String(cat).toLowerCase();
  const fields = [p.mainCategory, p.category, p.Category, p.MainCategory].filter(Boolean).map(String);
  if (fields.some(x => x.toLowerCase()===C)) return true;
  if (Array.isArray(p.categories) && p.categories.map(String).some(x => x.toLowerCase()===C)) return true;
  if (Array.isArray(p.tags) && p.tags.map(String).some(x => x.toLowerCase()===C)) return true;
  return false;
}

function sortProducts(list, how){
  const L = [...list];
  if (how==='price_asc')  return L.sort((a,b)=>(+a.price||9e15)-(+b.price||9e15));
  if (how==='price_desc') return L.sort((a,b)=>(+b.price||-1)-(+a.price||-1));
  if (how==='title_asc')  return L.sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
  // relevance = no-op (keep current order)
  return L;
}

async function loadCategoryProducts(cat) {
  const c = String(cat || '').trim();
  // Try server-side, but still apply a client filter to be safe
  try {
    const res = await getProducts({ category: c, limit: 1000, _: Date.now() });
    const filtered = (res || []).filter(p => matchesCategory(p, c));
    if (filtered.length) return filtered;
  } catch {}

  // Fallback: fetch all then filter client-side
  try {
    const all = await getProducts({ limit: 1000, _: Date.now() });
    return (all || []).filter(p => matchesCategory(p, c));
  } catch {
    return [];
  }
}

/* ====== render as multi-row grid with SAME markup, using shared card ====== */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n)||0));

function makeCard(p){
  const a = productCard(p); // <a class="pcard product"...> (make sure)
  // Ensure the filters can find/select this card:
  if (!a.classList.contains('product')) a.classList.add('product');

  // dataset for filters:
  const colors = normalizeColorsFromMeta(p);
  if (colors) a.dataset.colors = colors;

  // Expose numeric price/MRP for price/discount filters
  const priceNum = firstNumber(p, PRICE_KEYS);
  const mrpNum   = firstNumber(p, MRP_KEYS);
  if (priceNum != null) a.dataset.price = String(priceNum);
  if (mrpNum   != null) a.dataset.mrp   = String(mrpNum);

  // alias class so filters can find text:
  const titleEl = a.querySelector('.pcard-title');
  if (titleEl && !titleEl.classList.contains('title')) titleEl.classList.add('title');

  return a;
}

/* NEW: guard to prevent PDP navigation when clicking Add to Cart inside <a> */
function wireNoNavOnCartButtons(root){
  if (!root) return;
  // Capture phase cancels the anchor's default before it fires (robust on mobile)
  const block = (ev) => {
    const t = ev.target;
    if (!t) return;
    const isCartBtn = t.closest && t.closest('.btn');
    const inCard    = t.closest && t.closest('a.pcard');
    if (isCartBtn && inCard){
      ev.preventDefault();
      ev.stopPropagation();
    }
  };
  root.addEventListener('click', block, true);
  root.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.closest?.('.btn')){
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);
}

function renderGrid(list, cols){
  const grid = $('#grid');
  grid.innerHTML = '';

  // Match homepage structure but use a grid wrapper with N columns
  grid.className = 'row amazon-row';
  const productsWrap = h(
    'div',
    {
      class: 'products category-products',
      // bulletproof regardless of CSS load order
      style: `--cols:${cols};grid-auto-flow:row;grid-template-columns:repeat(${cols},1fr);grid-auto-columns:initial;overflow-x:visible;scroll-snap-type:none;`
    },
    list.map(makeCard)
  );
  grid.appendChild(productsWrap);

  // Prevent anchor navigation when Add to Cart is pressed
  wireNoNavOnCartButtons(productsWrap);

  $('#catCount').textContent = `${list.length} result${list.length!==1?'s':''}`;
}

document.addEventListener('DOMContentLoaded', async () => {
  // init menus like home
  initDropdown({ button: '#btnAll',    menu: '#allMenu'  });
  initDropdown({ button: '#hamburger', menu: '#megaMenu' });
  try {
    const cats = await getMainCategories();
    fillMenuWithCategories($('#allMenu ul'), cats);
    fillMenuWithCategories($('#megaMenu ul'), cats);
  } catch {}

  const { type, value } = params();
  const cat = value;
  document.title = `${cat || 'Category'} • Amazon Business Clone`;
  $('#catTitle').textContent = cat || 'Category';

  // Read Admin → Card Grid → Category (grid)
  let cols = 5;
  try {
    const s = await getSiteSettings();
    cols = clamp(s?.cardGrid?.category ?? 5, 1, 8);
  } catch {}

  let products = await loadCategoryProducts(cat);
  renderGrid(products, cols);

  // Filters
  $('#sort').addEventListener('change', (e) => {
    renderGrid(sortProducts(products, e.target.value), cols);
  });
  $('#q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const filtered = !q ? products : products.filter(p =>
      String(p.title||'').toLowerCase().includes(q) ||
      String(p.sku||'').toLowerCase().includes(q)
    );
    renderGrid(sortProducts(filtered, $('#sort').value), cols);
  });
});
