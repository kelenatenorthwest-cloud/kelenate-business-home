// Path: E:\amazon-business-home\buyers-page\js\components\product-card.js
// Shared Amazon-like product card used by home rows, category page, and search results.

import { API_BASE } from '../api.js';

/* tiny DOM helper (matches your existing h() behavior incl. onClick normalization) */
function h(tag, attrs = {}, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'style') el.setAttribute('style', v);
    else if (k.startsWith('on') && typeof v === 'function') {
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

function abs(u){ return !u ? '' : (/^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`); }

function imgSrc(p){
  const raw =
    (Array.isArray(p.images) && p.images[0]) ||
    p.image || p.img || '/img/placeholder.png';
  return abs(raw);
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
  return h('div', {class:'a-mrp'}, '₹', whole, '.', fraction);
}

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

/**
 * productCard(p, opts?) -> HTMLElement <a class="pcard product">
 *  opts:
 *    - showAddToCart (default true)
 */
export function productCard(p, opts = {}){
  const { showAddToCart = true } = opts;

  const href = pdpHref(p);
  const title = p?.title || p?.name || p?.Title || 'Product';
  const price = (p?.price ?? p?.Price ?? p?.salePrice ?? p?.sale_price ?? null);
  const mrp   = (p?.mrp   ?? p?.MRP   ?? p?.listPrice ?? p?.list_price ?? null);

  // STRICT: show OOS only when status is exactly "inactive" (case-insensitive)
  const status = String(p?.status ?? '').trim().toLowerCase();
  const isInactive = status === 'inactive';

  const media = h('div', {class:'pcard-media'},
    h('img', {src: imgSrc(p), alt: String(title)})
  );

  const priceBlock = h('div', {class:'a-price-block'},
    price != null ? priceView(price) : '',
    isInactive ? h('span', {
      class:'stock-badge is-oos',
      style:'color:#B12704;margin-left:8px;font-weight:600'
    }, 'Out of Stock') : '',
    (mrp != null && Number(mrp) > Number(price ?? -1)) ? mrpView(mrp) : ''
  );

  const onAddClick = async (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const btn = ev.currentTarget;
    btn.disabled = true;
    try {
      const pidMaybe = p.id ?? p.product_id ?? p.sku;
      const pid = (pidMaybe != null && pidMaybe !== '' && !Number.isNaN(Number(pidMaybe))) ? Number(pidMaybe) : null;
      const image = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.image || '');

      // Payload matches home/category implementation
      const payload = {
        product_id: pid,
        title: String(title),
        image: abs(image) || '',
        price_cents: toPaise(price),
        qty: 1,
        in_stock: isInactive ? 0 : 1
      };
      await postJSON(`${API_BASE}/api/cart/items`, payload);
      window.dispatchEvent(new Event('cart:updated'));
      btn.classList.add('ok'); setTimeout(()=>btn.classList.remove('ok'), 600);
    } catch (e) {
      if (e.message !== 'Auth required') alert('Could not add to cart: ' + e.message);
    } finally {
      if (!isInactive) btn.disabled = false;
    }
  };

  const addBtn = showAddToCart
    ? h('button', { class:'btn', type:'button', onClick:onAddClick }, 'Add to Cart')
    : null;
  if (addBtn && isInactive) {
    addBtn.disabled = true;
    addBtn.setAttribute('aria-disabled','true');
    addBtn.title = 'Out of stock';
  }

  // Order: price block → title → button (matches home/category)
  const body = h('div', {class:'pcard-body'},
    priceBlock,
    h('div', {class:'pcard-title title'}, title), // add .title for filter hooks
    showAddToCart ? addBtn : ''
  );

  const box = h('div', {class:'pcard-box'}, media, body);

  // data-* hooks for filters (price/mrp/colors)
  const attrs = {
    class:'pcard product',
    href,
    'aria-label': String(title)
  };
  if (Number.isFinite(Number(price))) attrs['data-price'] = String(Number(price));
  if (Number.isFinite(Number(mrp)))   attrs['data-mrp']   = String(Number(mrp));

  // Normalize colors from meta (space-separated, lowercased, deduped)
  const colors = [];
  ['color','colour','Color','Colour','colors','colours'].forEach(k => {
    const v = p?.[k];
    if (!v) return;
    if (Array.isArray(v)) colors.push(...v);
    else if (typeof v === 'string') colors.push(v);
  });
  const normalized = Array.from(new Set(
    colors
      .filter(Boolean)
      .map(s => String(s).toLowerCase().trim())
      .map(c => c === 'golden' ? 'gold' : (c === 'gray' ? 'grey' : c))
  ));
  if (normalized.length) attrs['data-colors'] = normalized.join(' ');

  return h('a', attrs, box);
}
