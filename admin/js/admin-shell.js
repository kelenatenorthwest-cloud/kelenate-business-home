// Path: E:\amazon-business-home\admin\js\admin-shell.js
/* Admin SPA shell: navigation + dynamic loaders (CSP-safe external script) */

const meta = {
  dashboard: "Overview and shortcuts",
  inventory: "Search, filter, edit & delete products",
  add: "Create a new product",
  "amz-upload": "Paste an Amazon URL to prefill and save products",
  "amz-bulk": "Bulk import by ASIN",                           // NEW
  categories: "Manage main & home categories",
  banners: "Homepage banners",
  "home-sections": "Pick categories for homepage rows",
  coupons: "Coupons & rules",
  orders: "Order list",
  customers: "Customer directory",
  analytics: "Charts & KPIs",
  settings: "Store settings",
  help: "Help & docs",
  branding: "Logo & branding",
  "header-colors": "Header & subnav colors",
  "card-grid": "Cards per row for Home/Category/Search",       // NEW
  filters: "Manage left-rail filters (Colours, Price Bands, Discounts)", // NEW
};

// NEW: per-session cache-busting token (prevents stale admin JS/HTML after deploy)
const BUST = (() => {
  try {
    let v = sessionStorage.getItem('admin:bust');
    if (!v) { v = Date.now().toString(36); sessionStorage.setItem('admin:bust', v); }
    return v;
  } catch { return Date.now().toString(36); }
})();
function withBust(url) {
  return url + (url.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(BUST);
}

const loadedScripts = new Set();
function ensureScript(src){
  return new Promise((res,rej)=>{
    // NEW: append version so browsers don’t serve stale files after deployment
    const verSrc = withBust(src);
    if(loadedScripts.has(verSrc)) return res();
    const s=document.createElement('script');
    s.src=verSrc;
    s.onload=()=>{loadedScripts.add(verSrc);res();};
    s.onerror=(e)=>{ console.error('Script load failed:', verSrc, e); rej(e); };
    document.body.appendChild(s);
  });
}

async function ensureModule(src){
  try {
    // NEW: import with version query for freshness across deploys
    await import(withBust(src));
  } catch (e) {
    console.error('Module load failed:', src, e);
    throw e;
  }
}

// --- Remember/restore last screen via hash + localStorage ---
const LAST_KEY = 'admin:lastScreen';
function getHashIndex(){
  const h = (location.hash || '').replace(/^#/, '');
  const m = h.match(/(?:^|&)index=([^&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}
function setHashIndex(name){
  try {
    const newHash = 'index=' + encodeURIComponent(name);
    if (getHashIndex() !== name) location.hash = newHash;
  } catch {}
}
function getInitialScreen(){
  const fromHash = getHashIndex();
  if (fromHash) return fromHash;
  try {
    const saved = localStorage.getItem(LAST_KEY);
    if (saved) return saved;
  } catch {}
  return 'dashboard';
}

let navToken = 0;
let currentScreen = null;

async function nav(name){
  const myToken = ++navToken;

  try { localStorage.setItem(LAST_KEY, name); } catch {}
  setHashIndex(name);

  document.querySelectorAll('.menu button')
    .forEach(b => b.classList.toggle('active', b.dataset.screen===name));

  document.getElementById('page-title').textContent =
    name.charAt(0).toUpperCase()+name.slice(1);

  document.getElementById('page-sub').textContent = meta[name] || '';

  const root=document.getElementById('page-root');
  root.innerHTML='<div class="card"><p class="muted">Loading…</p></div>';

  // fetch section HTML (template literal is required!)
  // NEW: include cache bust + credentials; show helpful UI on 401
  const url = withBust(`/admin/sections/${name}.html`);
  const res = await fetch(url, { cache:'no-store', credentials:'same-origin' });
  if (res.status === 401 || res.status === 403) {
    root.innerHTML =
      '<div class="card"><p class="muted">Session expired or unauthorized.</p>' +
      '<p><button class="btn" onclick="location.reload()">Re-authenticate</button></p></div>';
    return;
  }
  if (!res.ok) {
    root.innerHTML =
      `<div class="card"><p class="muted">Failed to load section: ${name}</p></div>`;
    return;
  }
  let html = await res.text();

  // Inline <script> inserted via innerHTML won't execute — strip and load JS externally.
  if (name === 'inventory' || name === 'amz-bulk' || name === 'filters') {
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  }

  if (myToken !== navToken) return;
  root.innerHTML = html;

  try{
    if (name === 'inventory') {
      await ensureModule('/admin/js/inventory/index.js');
      window.inventoryInit && window.inventoryInit();
      // NEW: add Excel export/import controls to Inventory
      await ensureScript('/admin/js/admin-inventory-excel.js');
      window.injectInventoryExcel && window.injectInventoryExcel();
    }
    else if (name === 'categories') {
      await ensureScript('/admin/js/admin-categories.js');
      window.initCategories && window.initCategories();
    }
    else if (name === 'banners') {
      // split banners module: state → api → dom → events → main
      await ensureScript('/admin/js/banners/state.js');
      await ensureScript('/admin/js/banners/api.js');
      await ensureScript('/admin/js/banners/dom.js');
      await ensureScript('/admin/js/banners/events.js');
      await ensureScript('/admin/js/banners/main.js');
      window.initBanners && window.initBanners();
    }
    else if (name === 'home-sections') {
      await ensureScript('/admin/js/admin-home-sections.js');
      window.initHomeSections && window.initHomeSections();
    }
    else if (name === 'add') {
      await ensureScript('/admin/js/admin-add.js');
      window.initAddProduct && window.initAddProduct();
    }
    else if (name === 'amz-upload') {
      await ensureScript('/admin/js/admin-amz.js');
      window.initAmzUpload && window.initAmzUpload();
    }
    else if (name === 'amz-bulk') {
      await ensureScript('/admin/js/admin-amz-bulk.js');
      window.initAmzBulk && window.initAmzBulk();
    }
    else if (name === 'branding') {
      await ensureScript('/admin/js/admin-branding.js');
      window.initBranding && window.initBranding();
    }
    else if (name === 'customers') {
      await ensureScript('/admin/js/admin-customers.js');
      window.initCustomers && window.initCustomers();
    }
    else if (name === 'header-colors') {
      await ensureScript('/admin/js/admin-header-colors.js');
      window.initHeaderColors && window.initHeaderColors();
    }
    else if (name === 'card-grid') { // NEW
      await ensureScript('/admin/js/admin-card-grid.js');
      window.initCardGrid && window.initCardGrid();
    }
    else if (name === 'filters') { // NEW
      await ensureScript('/admin/js/admin-filters.js');
      window.initAdminFilters && window.initAdminFilters();
    }
  } catch(e) {
    console.error(e);
  } finally {
    currentScreen = name;
  }
}

window.nav = nav;

// Wire menu + hash router no matter when this script loads
(function initShell() {
  const wire = () => {
    document.querySelectorAll('.menu button')
      .forEach(btn => btn.addEventListener('click', () => nav(btn.dataset.screen)));

    window.addEventListener('hashchange', () => {
      const target = getHashIndex() || 'dashboard';
      if (target !== currentScreen) nav(target);
    });

    nav(getInitialScreen());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire, { once: true });
  } else {
    wire();
  }
})();
