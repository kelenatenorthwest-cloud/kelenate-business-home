// File: E:\amazon-business-home\buyers-page\js\api.js
import { _catLabel } from './utils.js';

// ---- API base resolver ----
// - By default, use relative URLs so we hit the same origin that served the page.
// - If you need to call a different origin (e.g., dev server on :4000),
//   set window.__API_BASE__ = "http://localhost:4000" in your HTML before loading this file.
function resolveApiBase() {
  const override = (globalThis.__API_BASE__ || '').trim();
  if (override) return override.replace(/\/+$/, '');
  return ''; // same-origin via relative paths
}
export const API_BASE = resolveApiBase();

export async function getJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}) }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* Normalize products payload into an array:
   - []                       -> []
   - { rows: [...] }          -> rows
   - { products: [...] }      -> products
*/
export async function getProducts(params = {}) {
  const qs = new URLSearchParams(params);
  const data = await getJSON(`${API_BASE}/api/products${qs.toString() ? `?${qs}` : ""}`);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.products)) return data.products;
  return [];
}

/* More tolerant main categories:
   Accepts:
   - [ "Cat", ... ]
   - [ { name:"Cat" }, ... ]
   - { main:[...strings/objs...] }
   - { rows:[...strings/objs...] }
   - { data:[...strings/objs...] }
   Falls back to products if API comes back empty.
*/
export async function getMainCategories() {
  try {
    const raw = await getJSON(`${API_BASE}/api/categories?type=main&_=${Date.now()}`);

    // unwrap possible container objects
    let arr = raw;
    if (!Array.isArray(arr) && raw && typeof raw === 'object') {
      if (Array.isArray(raw.main)) arr = raw.main;
      else if (Array.isArray(raw.rows)) arr = raw.rows;
      else if (Array.isArray(raw.data)) arr = raw.data;
      else arr = Object.values(raw); // last resort
    }

    if (Array.isArray(arr) && arr.length) {
      const set = new Set();
      for (const item of arr) {
        const label =
          _catLabel(item) ||
          String(item?.name || item?.Category || item?.MainCategory || item || '').trim();
        if (label) set.add(label);
      }
      const list = Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b));
      if (list.length) return list;
    }
  } catch {}

  // Fallback via products (collect from multiple likely fields)
  const all = await getProducts({ _: Date.now() });
  const set = new Set();
  for (const p of all) {
    const push = (v) => {
      const s = _catLabel(v) || (v != null ? String(v) : '');
      if (s && s.trim()) set.add(s.trim());
    };

    push(p.mainCategory);
    push(p.MainCategory);
    push(p.main);
    push(p.department);
    push(p.categoryMain);

    // as a last resort, also allow single-level category to appear as a root
    push(p.category);
    push(p.Category);

    // arrays
    if (Array.isArray(p.categories)) p.categories.forEach(push);
    if (Array.isArray(p.tags))       p.tags.forEach(push);
  }
  return Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b));
}

// Read the three homepage row categories (keep/pick/freq)
export async function getHomeSections() {
  try {
    const r = await getJSON(`${API_BASE}/api/home-sections?_=${Date.now()}`);
    const norm = (v) => {
      if (!v) return "";
      if (typeof v === "string") return v;
      // handle objects like { category, title, name, ... }
      return _catLabel(v) || String(v?.category || v?.title || v?.name || "");
    };
    return {
      keep: norm(r.keep),
      pick: norm(r.pick),
      freq: norm(r.freq),
    };
  } catch {
    return { keep: "", pick: "", freq: "" };
  }
}

export async function getHomeSectionsOrder() {
  try {
    const r = await getJSON(`${API_BASE}/api/home-sections-order?_=${Date.now()}`);
    return Array.isArray(r.order) ? r.order : [];
  } catch { return []; }
}

export async function getBanners() {
  try { return await getJSON(`${API_BASE}/api/banners?_=${Date.now()}`); }
  catch { return []; }
}

export async function getBannerSettings() {
  try { return await getJSON(`${API_BASE}/api/banner-settings?_=${Date.now()}`); }
  catch {
    return { autoRotate:true, intervalMs:5000, transition:'fade', transitionMs:400, showArrows:true, loop:true };
  }
}

// Site-wide settings (logo etc.)
export async function getSiteSettings() {
  try { return await getJSON(`${API_BASE}/api/site-settings?_=${Date.now()}`); }
  catch { return {}; }
}

/* ========= AUTH HELPERS =========
   These hit /auth/* (also available at /api/auth/*).
   We include credentials so the auth cookie is set/sent. */
export async function authRegister(payload) {
  return getJSON(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

export async function authLogin(payload) {
  // legacy: expects { email, password }
  return getJSON(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

// NEW: check if an identifier (email or phone) already exists
export async function authExists(identifier) {
  return getJSON(`${API_BASE}/auth/exists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier }),
  });
}

// NEW: login using email OR phone via { identifier, password }
export async function authLoginById(payload) {
  return getJSON(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
}

export async function authMe() {
  return getJSON(`${API_BASE}/auth/me`, {
    credentials: 'include',
  });
}

export async function authLogout() {
  return getJSON(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
}

/* ========= CATEGORY TREE (NEW) =========
   Sidebar expects a nested tree: [{ id, name, children: [...] }, ...]
   Strategy:
   1) Try API endpoints likely to exist.
   2) If none, BUILD a tree from products (mainCategory → category → subCategory).
*/

function _slugify(s){
  return String(s || '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}
function _toNode(name){
  const clean = String(name || '').trim();
  return { id: _slugify(clean) || Math.random().toString(36).slice(2), name: clean, children: [] };
}
function _ensureNode(array, name){
  const label = String(name || '').trim();
  if (!label) return null;
  const id = _slugify(label);
  let n = array.find(x => (x.id === id) || (x.name?.toLowerCase() === label.toLowerCase()));
  if (!n){ n = _toNode(label); array.push(n); }
  return n;
}
function _normalizeIncomingTree(raw){
  // Accept:
  // - already nested nodes with { name, children }
  // - arrays of strings
  // - arrays of objects with { title } or { label }
  if (!Array.isArray(raw)) return [];
  if (raw.some(n => Array.isArray(n?.children))) {
    // ensure each node has id/name/children
    const walk = (nodes) => nodes.map(n => {
      const name = _catLabel(n) || n.name || n.title || n.label || n.slug || '';
      const node = { id: _slugify(name) || String(n.id || n.category_id || Math.random().toString(36).slice(2)), name, children: [] };
      if (Array.isArray(n.children) && n.children.length) node.children = walk(n.children);
      return node;
    });
    return walk(raw);
  }
  // strings or flat objects
  return raw
    .map(x => typeof x === 'string'
      ? _toNode(x)
      : _toNode(_catLabel(x) || x.name || x.title || x.label || x.slug || ''))
    .filter(n => n.name);
}

async function _fetchPossibleTrees(){
  const endpoints = [
    `${API_BASE}/api/categories?type=tree&_=${Date.now()}`,
    `${API_BASE}/api/categories/tree?_=${Date.now()}`,
    `${API_BASE}/api/categories?type=all&_=${Date.now()}`
  ];
  for (const url of endpoints){
    try {
      const data = await getJSON(url);
      const tree = _normalizeIncomingTree(data);
      if (tree.length) return tree;
    } catch {}
  }
  return null;
}

export async function getCategoryTree(){
  // 1) Try server-provided tree
  const fromApi = await _fetchPossibleTrees();
  if (fromApi && fromApi.length) return fromApi;

  // 2) Build from products (mainCategory, category, subCategory)
  const products = await getProducts({ _: Date.now() });
  const roots = [];

  for (const p of products){
    const main = _catLabel(p.mainCategory || p.main || p.department || p.categoryMain || '');
    const cat  = _catLabel(p.category || p.cat || '');
    const sub  = _catLabel(p.subCategory || p.subcategory || p.subCat || p.subcat || '');

    // Ensure root (main)
    const mainNode = _ensureNode(roots, main);
    if (!mainNode) continue;

    // If no deeper info, continue
    if (!cat && !sub) continue;

    // Ensure 2nd level (category)
    const catNode = _ensureNode(mainNode.children, cat || sub);
    if (!catNode) continue;

    // Ensure 3rd level (subcategory) when both present
    if (cat && sub && sub.toLowerCase() !== cat.toLowerCase()){
      _ensureNode(catNode.children, sub);
    }
  }

  // Sort nodes alphabetically for a stable UI
  const sortTree = (nodes)=>{
    nodes.sort((a,b)=>a.name.localeCompare(b.name));
    nodes.forEach(n => n.children && n.children.length && sortTree(n.children));
  };
  sortTree(roots);

  // If we somehow didn’t get anything, degrade gracefully to main categories as roots
  if (!roots.length){
    const mains = await getMainCategories();
    return mains.map(n => _toNode(n));
  }

  return roots;
}
