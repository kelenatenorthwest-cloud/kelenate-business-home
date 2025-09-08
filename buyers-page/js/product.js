// buyers-page/js/product.js
// Fills PDP slots (gallery/body/buybox) + robust Add to Cart / Buy Now.
// Handles Back/Forward cache: re-enables CTAs when you return to the page.

import { $, el } from './utils.js';
import { API_BASE, getJSON } from './api.js';

const qs  = (s, r=document) => r.querySelector(s);
const rupee = n => (n==null || isNaN(+n)) ? '₹—' : `₹${Number(n).toLocaleString('en-IN')}`;
const abs   = u => !u ? null : (/^https?:\/\//i.test(u) ? u : `${API_BASE}${u}`);

/* ---------------- helpers ---------------- */
function parseArrayish(v){
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  const s = String(v).trim();
  try { const j = JSON.parse(s); return Array.isArray(j) ? j : []; } catch {}
  return s.split(/\r?\n|•|;|\u2022/g).map(x => x.trim()).filter(Boolean);
}
function getParam(name){
  return new URLSearchParams(location.search).get(name);
}
function toPaise(val){
  // accept number or "₹12,345.50"
  if (val == null) return 0;
  const n = typeof val === 'number' ? val
          : Number(String(val).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/* ---------------- data load + render ---------------- */
async function loadProduct(){
  const sp = new URLSearchParams(location.search);
  const id = sp.get('id') || sp.get('sku');
  if (!id) { const t=qs('[data-slot="title"]'); if (t) t.textContent='Product not specified.'; return null; }
  try { return await getJSON(`${API_BASE}/api/products/${encodeURIComponent(id)}`); }
  catch { const t=qs('[data-slot="title"]'); if (t) t.textContent='Product not found.'; return null; }
}

/* NEW: compute and apply the mobile frame variable from an image */
function setMobileFrameVar(wrap, img){
  if (!wrap || !img || !img.naturalWidth || !img.naturalHeight) return;
  const w = wrap.clientWidth || img.clientWidth || Math.max(document.documentElement.clientWidth, window.innerWidth || 0) || 0;
  if (!w) return;
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w)); // h/w * width
  // Tie CSS height to this variable (CSS reads var(--pdp-frame-h))
  wrap.style.setProperty('--pdp-frame-h', `${h}px`);
}

function renderGallery(images, videos){
  const thumbs = qs('[data-slot="thumbs"]') || qs('#pdpThumbs');
  const imgEl  = qs('[data-slot="main-image"]') || qs('#pdpMainImg');
  const vidEl  = qs('[data-slot="main-video"]') || qs('#pdpMainVideo');
  const wrap   = qs('#pdpMainWrap') || qs('[data-slot="main"]') || imgEl?.parentElement;
  if (!imgEl || !vidEl) return;

  const isMobile = matchMedia('(max-width: 768px)').matches;

  // Build items list (videos first to preserve original intent)
  const items = []
    .concat((videos||[]).map(src => ({ type:'video', src: abs(src) })))
    .concat((images||[]).map(src => ({ type:'image', src: abs(src) })));

  // Expose first video for mobile script (video-first tile)
  if (wrap) {
    const firstVideo = (videos && videos.length) ? abs(videos[0]) : null;
    if (firstVideo) {
      wrap.dataset.firstVideo = firstVideo;   // <div id="pdpMainWrap" data-first-video="...">
      wrap.dataset.hasVideo   = '1';
    } else {
      delete wrap.dataset.firstVideo;
      delete wrap.dataset.hasVideo;
    }
  }

  // Fallback if no media
  if (!items.length) {
    if (thumbs) thumbs.innerHTML = '';
    if (vidEl) { vidEl.pause?.(); vidEl.style.display='none'; }
    imgEl.src = 'https://via.placeholder.com/900x620?text=No+Media';
    imgEl.style.display = '';
    // Ensure mobile scroll box still works when placeholder is tall
    if (isMobile && wrap) {
      wrap.style.display = 'block';
      wrap.style.overflowY = 'auto';
      wrap.style.overflowX = 'hidden';
      wrap.style.webkitOverflowScrolling = 'touch';
      wrap.style.touchAction = 'pan-y';
      // leave height to CSS var/clamp; only fallback if truly unset:
      if (!parseFloat(getComputedStyle(wrap).height)) wrap.style.height = '420px';

      imgEl.style.width = '100%';
      imgEl.style.maxWidth = '100%';
      // do NOT force height here; mobile enhancer/var will size for overflow
      imgEl.style.maxHeight = 'none';
      imgEl.style.objectFit = 'contain';

      // set frame var once image loads
      const ensureVar = () => setMobileFrameVar(wrap, imgEl);
      if (!imgEl.complete || !imgEl.naturalWidth) imgEl.addEventListener('load', ensureVar, { once:true });
      else ensureVar();
    }
    return;
  }

  // Reset initial state
  if (thumbs) thumbs.innerHTML = '';
  imgEl.style.display = 'none';
  vidEl.style.display = 'none'; vidEl.pause?.();

  // Helper: on mobile, keep --pdp-frame-h in sync with the current image & viewport
  const wireMobileFrameSync = () => {
    if (!isMobile || !wrap || !imgEl) return;

    // set once (after load)
    const updateVar = () => setMobileFrameVar(wrap, imgEl);
    if (!imgEl.complete || !imgEl.naturalWidth) {
      imgEl.addEventListener('load', updateVar, { once:true });
    } else {
      updateVar();
    }

    // on resize/orientation change
    if (!wrap.__frameResizeBound) {
      const onR = () => setMobileFrameVar(wrap, imgEl);
      window.addEventListener('resize', onR);
      wrap.__frameResizeBound = onR;
    }

    // if the desktop code swaps #pdpMainImg.src, recompute var
    if (!wrap.__frameImgObs) {
      const obs = new MutationObserver(() => {
        const once = () => setMobileFrameVar(wrap, imgEl);
        if (!imgEl.complete || !imgEl.naturalWidth) imgEl.addEventListener('load', once, { once:true });
        else once();
      });
      obs.observe(imgEl, { attributes:true, attributeFilter:['src'] });
      wrap.__frameImgObs = obs;
    }
  };

  // Helper: show a given index
  const show = i => {
    const it = items[i];
    if (!it) return;

    if (isMobile) {
      // MOBILE: prefer first image for scroll experience; video handled by mobile enhancer
      let target = it;
      if (it.type === 'video') {
        const firstImg = items.find(x => x.type === 'image');
        if (firstImg) target = firstImg;
      }

      // Make wrap the vertical scroll box (inline, so CSS can still win with !important)
      if (wrap) {
        wrap.style.display = 'block';
        wrap.style.overflowY = 'auto';
        wrap.style.overflowX = 'hidden';
        wrap.style.webkitOverflowScrolling = 'touch';
        wrap.style.touchAction = 'pan-y';
        if (!parseFloat(getComputedStyle(wrap).height)) wrap.style.height = '420px';
      }

      if (target.type === 'image') {
        imgEl.src = target.src || '';
        imgEl.style.display = '';
        vidEl.style.display = 'none'; vidEl.pause?.();

        imgEl.style.width = '100%';
        imgEl.style.maxWidth = '100%';
        imgEl.style.maxHeight = 'none';
        imgEl.style.objectFit = 'contain';

        wireMobileFrameSync();
      } else {
        vidEl.src = target.src || '';
        vidEl.style.display=''; imgEl.style.display='none';
        vidEl.muted = true; vidEl.playsInline = true; vidEl.controls = true;
      }

      return;
    }

    // DESKTOP (unchanged): show exactly what was requested
    if (it.type === 'video') {
      vidEl.src = it.src; vidEl.style.display=''; imgEl.style.display='none';
      vidEl.muted = true; vidEl.playsInline = true; vidEl.controls = true;
      vidEl.play().catch(()=>{});
    } else {
      imgEl.src = it.src; imgEl.style.display=''; vidEl.style.display='none'; vidEl.pause?.();
    }
  };

  // Build thumbs (desktop), keep for consistency even if hidden on mobile
  items.forEach((it, i) => {
    if (!thumbs) return;
    const t = el('div', { class:'thumb' + (it.type==='video'?' is-video':'') });
    if (it.type === 'image') t.style.backgroundImage = `url(${it.src})`;
    t.addEventListener('click', ()=>show(i));
    thumbs.appendChild(t);
  });

  // Hide thumbs on mobile so body flows naturally
  if (isMobile && thumbs) thumbs.style.display = 'none';

  // Show first relevant item
  if (isMobile) {
    const firstImgIdx = items.findIndex(x => x.type === 'image');
    show(firstImgIdx >= 0 ? firstImgIdx : 0);
  } else {
    show(0);
  }
}

function renderPricing(p){
  const price = Number(p.price ?? NaN);
  const mrp   = Number(p.mrp   ?? NaN);
  const set = (sel, text) => { const n = qs(sel); if (n) n.textContent = text; };

  // center block
  set('#priceLine', isFinite(price) ? rupee(price) : '₹—');
  set('#mrpLine',   isFinite(mrp)   ? rupee(mrp)   : '₹—');

  const saveEl = qs('#saveLine'); if (saveEl) saveEl.textContent='';
  if (isFinite(mrp) && isFinite(price) && mrp > price && saveEl){
    const save = mrp - price, pct = Math.round((save/mrp)*100);
    saveEl.textContent = `Save ${rupee(save)} (${pct}% off)`;
  }

  // buybox duplicate
  set('#bbPrice', isFinite(price) ? rupee(price) : '₹—');
  set('#bbMrp',   isFinite(mrp)   ? rupee(mrp)   : '');
}

function renderMeta(p){
  document.title = `${p.title || 'Product'} • Kelenate Business`;
  const set = (sel, text) => { const n=qs(sel); if (n) n.textContent=text; };
  set('[data-slot="title"]', p.title || 'Untitled');
  const cat = p.mainCategory || p.category || '';
  set('#crumbs', cat ? `Category › ${cat}` : '');

  const moq = Number(p.moq || 1);
  const qty = qs('#qty'); if (qty) { qty.min = moq>0?moq:1; qty.value = moq>0?moq:1; }
  const moqEl = qs('#bbMoq'); if (moqEl) moqEl.textContent = moq>1 ? `(MOQ: ${moq})` : '';

  const inStock = (p.status || 'active') === 'active';
  const stock = qs('#bbStock'); if (stock) stock.textContent = inStock ? 'In stock' : 'Out of stock';

  // Disable CTAs if out of stock
  const addBtn = qs('#btnAddCart');
  const buyBtn = qs('#btnBuyNow');
  [addBtn, buyBtn].forEach(b => {
    if (!b) return;
    // Keep a flag so we can restore correctly on bfcache back/forward
    b.dataset.oos = inStock ? '0' : '1';
    b.disabled = !inStock;
  });
}

function renderBullets(bullets){
  const ul = qs('[data-slot="bullets"]') || qs('#pdpBullets');
  if (!ul) return;
  ul.innerHTML = '';
  bullets.slice(0,8).forEach(b => ul.appendChild(el('li', {}, b)));
}

/* -------------------- Add to Cart / Buy Now -------------------- */
async function postJSON(url, body){
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    credentials: 'include',           // send cookies/session
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw:text }; }
  if (!res.ok) {
    if (res.status === 401) {
      // ✅ preserve return location so login brings user back to this PDP
      const ret = encodeURIComponent(location.pathname + location.search);
      location.href = `/login.html?return=${ret}`;
      throw new Error('Auth required');
    }
    throw new Error(data?.error || res.statusText);
  }
  return data;
}

function currentQty(){
  const q = Number(qs('#qty')?.value || 1);
  const min = Number(qs('#qty')?.min || 1);
  if (!isFinite(q) || q < (min||1)) return (min||1);
  return Math.round(q);
}

async function addToCart(p, { redirect=false } = {}){
  const addBtn = qs('#btnAddCart');
  const buyBtn = qs('#btnBuyNow');
  [addBtn, buyBtn].forEach(b => { if (b) b.disabled = true; });

  try {
    // Prefer product.id; fallback to URL param
    const pidMaybe = p.id ?? p.product_id ?? p.sku ?? getParam('id');
    const pid = (pidMaybe != null && pidMaybe !== '' && !Number.isNaN(Number(pidMaybe))) ? Number(pidMaybe) : null;

    const image = (Array.isArray(p.images) && p.images[0]) ? p.images[0] : (p.image || '');
    const price_cents = toPaise(p.price);

    const payload = {
      product_id: pid,                         // numeric when possible
      title: p.title || 'Item',
      image: abs(image) || '',
      price_cents,
      qty: currentQty(),
      in_stock: (p.status || 'active') === 'active' ? 1 : 0
    };

    await postJSON('/api/cart/items', payload);

    // notify header badge
    window.dispatchEvent(new Event('cart:updated'));

    if (redirect) {
      location.href = '/cart';
    } else {
      if (addBtn) { addBtn.classList.add('ok'); setTimeout(()=>addBtn.classList.remove('ok'), 600); }
      [addBtn, buyBtn].forEach(b => { if (b && b.dataset.oos !== '1') b.disabled = false; });
    }
  } catch (e) {
    [addBtn, buyBtn].forEach(b => { if (b && b.dataset.oos !== '1') b.disabled = false; });
    if (e.message !== 'Auth required') alert('Could not add to cart: ' + e.message);
  }
}

function wireCTAs(p){
  const buy = qs('#btnBuyNow');
  const add = qs('#btnAddCart');
  buy?.addEventListener('click', () => addToCart(p, { redirect:true }));
  add?.addEventListener('click', () => addToCart(p, { redirect:false }));
}

/* ---- Handle bfcache/back-forward: restore CTA enabled state if in stock ---- */
function restoreCTAState(){
  const addBtn = qs('#btnAddCart');
  const buyBtn = qs('#btnBuyNow');
  [addBtn, buyBtn].forEach(b => {
    if (!b) return;
    const isOOS = b.dataset.oos === '1';
    b.disabled = isOOS ? true : false;
  });
}
window.addEventListener('pageshow', () => { // fires on BFCache restore, Safari/Firefox/Chrome
  restoreCTAState();
});
document.addEventListener('visibilitychange', () => { // just in case
  if (document.visibilityState === 'visible') restoreCTAState();
});

/* -------------------- init -------------------- */
async function init(){
  const p = await loadProduct(); if (!p) return;
  renderPricing(p);
  renderMeta(p);
  renderBullets(parseArrayish(p.bullets));

  const images = parseArrayish(p.images);
  const videos = parseArrayish(p.videos);
  if (!images.length && p.image) images.push(p.image);
  renderGallery(images, videos);

  wireCTAs(p);
}

document.addEventListener('DOMContentLoaded', ()=>whenSlots(init));

/* wait until required slots exist (works with partial-injection or static DOM) */
function whenSlots(cb){
  const need = ['[data-slot="gallery"]','[data-slot="body"]','[data-slot="buybox"]'];
  const ok = () => need.every(s => qs(s));
  if (ok()) return cb();
  const mo = new MutationObserver(()=>{ if (ok()) { mo.disconnect(); cb(); } });
  mo.observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(()=>{ try{mo.disconnect();}catch{} if(ok()) cb(); }, 8000);
}
