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

const loadedScripts = new Set();
function ensureScript(src){
  return new Promise((res,rej)=>{
    if(loadedScripts.has(src)) return res();
    const s=document.createElement('script');
    s.src=src; s.onload=()=>{loadedScripts.add(src);res();};
    s.onerror=rej; document.body.appendChild(s);
  });
}

async function ensureModule(src){
  try { await import(src); }
  catch (e) { console.error('Module load failed:', src, e); throw e; }
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
  const res = await fetch(`/admin/sections/${name}.html`, { cache:'no-store' });
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
