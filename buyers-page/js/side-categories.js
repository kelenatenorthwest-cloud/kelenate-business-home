// File: E:\amazon-business-home\buyers-page\js\side-categories.js

// Sidebar (left rail) that:
// - Always lists ALL root categories
// - Click -> /category.html?type=main&value=<Category>
// - Highlights current category via aria-current="page"
// - Loads from /api/categories?type=main first, then helpers, then optional tree, then demo

// ---- Demo data fallback (used only if APIs return nothing)
const DEMO_TREE = [
  { id:'buylogy-brand',           name:'Buylogy Brand' },
  { id:'car-door-shock-absorber', name:'Car Door Shock Absorber' },
  { id:'dot-stickers',            name:'Dot Stickers' },
  { id:'habit-tracker',           name:'Habit Tracker' },
  { id:'note-pad',                name:'Note Pad' },
  { id:'stickers',                name:'Stickers' },
];

// -------- utilities
const $ = sel => document.querySelector(sel);
const qp = new URLSearchParams(location.search);
const VALUE = (qp.get('value') || '').trim();
const IDVAL = (qp.get('id') || '').trim();

function slugify(s){
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

// pick displayable name from an object in many possible shapes
function pickName(x){
  return (
    x?.name ??            // canonical
    x?.Category ??        // uppercase
    x?.MainCategory ??    // camel case
    x?.title ??
    x?.label ??
    x?.slug ??
    x?.category ??        // lowercase field
    ''
  );
}

// Normalize any item (string/object) into a node {id,name}
function toNode(x){
  if (!x) return null;
  if (typeof x === 'string') return { id: slugify(x) || x, name: x };
  const name = pickName(x);
  if (!name) return null;
  const idCandidate = (x.id ?? x.category_id ?? x.slug ?? slugify(name));
  const id = String(idCandidate || name);
  return { id, name: String(name) };
}

function uniqByName(list){
  const seen = new Set();
  const out = [];
  for (const n of list){
    const k = slugify(n?.name || '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

// Convert raw input (array of strings/objects or nested tree) to flat ROOT list [{id,name}]
function normalizeRoots(data){
  if (!data) return [];
  // Accept { main:[...]} or { rows:[...] } server shapes too
  if (!Array.isArray(data) && typeof data === 'object'){
    if (Array.isArray(data.main))       data = data.main;
    else if (Array.isArray(data.rows))  data = data.rows;
    else if (Array.isArray(data.data))  data = data.data;
    else                                data = Object.values(data);
  }
  if (!Array.isArray(data)) return [];

  // If it's a nested tree, use top-level nodes as roots.
  if (data.some(d => d && typeof d === 'object' && Array.isArray(d.children))) {
    return uniqByName(data.map(toNode).filter(Boolean)).sort((a,b)=>a.name.localeCompare(b.name));
  }
  // Otherwise map items directly.
  return uniqByName(data.map(toNode).filter(Boolean)).sort((a,b)=>a.name.localeCompare(b.name));
}

// Build link that always goes to the category page
function linkForRoot(node){
  const q = new URLSearchParams({ type: 'main', value: node?.name || '' });
  return `/category.html?${q.toString()}`;
}

// Current selection from URL (?value or ?id)
function currentRootFromUrl(roots){
  const qpNow  = new URLSearchParams(location.search);
  const value  = (qpNow.get('value') || '').trim();
  const idval  = (qpNow.get('id') || '').trim();

  if (!value && !idval) return null;
  const byId   = idval.toLowerCase();
  const byName = value.toLowerCase();
  const bySlug = slugify(value);

  for (const r of roots){
    const id = String(r.id || '').toLowerCase();
    const nm = String(r.name || '').toLowerCase();
    const sl = slugify(r.name);
    if ((byId && id === byId) || (byName && nm === byName) || (bySlug && sl === bySlug)) return r;
  }
  return null;
}

function sameRoot(a, b){
  if (!a || !b) return false;
  const idA = String(a.id || '').toLowerCase();
  const idB = String(b.id || '').toLowerCase();
  if (idA && idB && idA === idB) return true;
  return slugify(a.name) === slugify(b.name);
}

// -------- rendering (flat list; breadcrumb left empty)
function el(tag, cls, text){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderSidebar(roots, currentRoot){
  const pathUl = $('#catPath');     // keep empty in flat mode
  const list   = $('#catChildren'); // render all roots here
  if (!list) return;
  if (pathUl) pathUl.innerHTML = '';
  list.innerHTML = '';

  for (const r of roots){
    const name = (r?.name || '').trim();
    if (!name) continue; // skip empty names defensively
    const li = el('li');
    const a  = el('a', '', name);
    a.href = linkForRoot(r);
    if (currentRoot && sameRoot(r, currentRoot)) {
      a.setAttribute('aria-current', 'page'); // bold/highlight via CSS
    }
    li.appendChild(a);
    list.appendChild(li);
  }
}

// -------- data loading (prefer /api/categories?type=main)
async function fetchCategoriesAt(url){
  const r = await fetch(url, { credentials:'same-origin' });
  if (!r.ok) return null;
  const data = await r.json();
  const canon = normalizeRoots(data);
  return canon.length ? canon : null;
}

async function loadRootsDirect(){
  try{
    // Try /api mount first
    let roots = await fetchCategoriesAt('/api/categories?type=main&_=' + Date.now());
    if (roots && roots.length) return roots;

    // Fallback: in case router is mounted at root
    roots = await fetchCategoriesAt('/categories?type=main&_=' + Date.now());
    if (roots && roots.length) return roots;

    // Extra tolerance: if server mistakenly returns {main:[...]} at ?type=both
    roots = await fetchCategoriesAt('/api/categories?type=both&_=' + Date.now());
    if (roots && roots.length) return roots;

    return null;
  }catch{
    return null;
  }
}

// Helper module (if available)
async function loadViaHelper(){
  try {
    const api = await import('/buyers-page/js/api.js');
    if (typeof api.getMainCategories === 'function') {
      const mains = await api.getMainCategories(); // ["Name", ...]
      if (Array.isArray(mains) && mains.length) {
        return normalizeRoots(mains.map(n => ({ name:n })));
      }
    }
    if (typeof api.getCategoryTree === 'function') {
      const tree = await api.getCategoryTree();
      const roots = normalizeRoots(tree);
      if (roots.length) return roots;
    }
  } catch {}
  return null;
}

// Optional tree endpoint (if you later add it)
async function loadViaHttpTree(){
  try {
    const r = await fetch('/api/categories/tree?_=' + Date.now(), { credentials:'same-origin' });
    if (!r.ok) return null;
    const data = await r.json();
    const roots = normalizeRoots(data);
    return roots.length ? roots : null;
  } catch { return null; }
}

async function loadRoots(){
  return (
    await loadRootsDirect()   ||
    await loadViaHelper()     ||
    await loadViaHttpTree()   ||
    normalizeRoots(DEMO_TREE)
  );
}

// DOM ready
function ready(){
  return new Promise(res => {
    if (document.readyState !== 'loading') res();
    else document.addEventListener('DOMContentLoaded', res, { once:true });
  });
}

// -------- init
(async function bootstrap(){
  await ready();

  if (!document.getElementById('sideCategories')) return;

  const roots   = await loadRoots();
  const current = currentRootFromUrl(roots);

  renderSidebar(roots, current);

  // Announce readiness so other modules can react if needed (non-breaking)
  window.dispatchEvent(new Event('sidecat:ready'));

  // Re-highlight after header include finishes (sticky vars etc.)
  window.addEventListener('includes:ready', () => {
    renderSidebar(roots, currentRootFromUrl(roots));
  }, { once:true });

  // Re-highlight on URL changes (Back/Forward, client-side nav)
  window.addEventListener('popstate', () => {
    renderSidebar(roots, currentRootFromUrl(roots));
  });
})().catch(console.error);
