// admin/js/inventory/controls.js
// NOTE: Networking/auth hardening is handled in helpers/api/renderers. This file just wires UI state.

import { $, fmt } from './helpers.js';
import { API } from './api.js';
import { state } from './state.js';
import { renderList, renderDeleted, onListClick, onDeletedClick } from './renderers.js';

// --- Persistence helpers (no-op if localStorage is unavailable) ---
const LS_KEY_VIEW   = 'inv:view';
const LS_KEY_LIST   = 'inv:list';
const LS_KEY_DELETED= 'inv:deleted';

function readJSON(k, fallback){
  try {
    const s = localStorage.getItem(k);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
}
function writeJSON(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

export async function loadCategories(){
  try{
    // Restore saved categories into state before wiring the selects
    const savedList    = readJSON(LS_KEY_LIST, {});
    const savedDeleted = readJSON(LS_KEY_DELETED, {});
    if (savedList && typeof savedList.category === 'string')  state.list.category    = savedList.category;
    if (savedDeleted && typeof savedDeleted.category === 'string') state.deleted.category = savedDeleted.category;

    const cats = await API.categories();
    const names = (cats || []).map(x => x?.name || x?.title || String(x));
    const s1 = $('#inv-maincat'), s2 = $('#del-maincat');
    const opts = names.map(n => `<option>${fmt.esc(n)}</option>`).join('');

    if (s1) {
      const sel = state.list.category || '';
      s1.innerHTML = '<option value="">All main categories</option>' + opts;
      s1.value = sel;
    }
    if (s2) {
      const sel2 = state.deleted.category || '';
      s2.innerHTML = '<option value="">All main categories</option>' + opts;
      s2.value = sel2;
    }
  }catch{/* ignore */}
}

export function wireListControls(){
  const st = state.list;

  // Restore saved list query/limit/offset
  const saved = readJSON(LS_KEY_LIST, {});
  if (typeof saved.q === 'string')       st.q = saved.q;
  if (typeof saved.limit === 'number')   st.limit = saved.limit;
  if (typeof saved.offset === 'number')  st.offset = saved.offset;

  // Reflect into inputs (if present)
  if ($('#inv-search')) $('#inv-search').value = st.q || '';
  if ($('#inv-limit'))  $('#inv-limit').value  = String(st.limit || 20);

  const persist = () => writeJSON(LS_KEY_LIST, st);

  $('#btn-add')?.addEventListener('click', ()=>{
    if (window.nav) window.nav('add'); else location.href='/admin#index=add';
  });

  $('#inv-search')?.addEventListener('input', ()=>{
    st.q = $('#inv-search').value.trim();
    st.offset = 0;
    persist();
    renderList();
  });

  $('#inv-maincat')?.addEventListener('change', ()=>{
    st.category = $('#inv-maincat').value;
    st.offset = 0;
    persist();
    renderList();
  });

  $('#inv-limit')?.addEventListener('change', ()=>{
    st.limit = Number($('#inv-limit').value) || 20;
    st.offset = 0;
    persist();
    renderList();
  });

  $('#inv-refresh')?.addEventListener('click', ()=>{
    // keep place, but most users expect refresh to show from start of results
    // If you prefer exact current page, comment next line:
    // st.offset = 0;
    persist();
    renderList();
  });

  $('#inv-prev')?.addEventListener('click', ()=>{
    st.offset = Math.max(0, st.offset - st.limit);
    persist();
    renderList();
  });

  $('#inv-next')?.addEventListener('click', ()=>{
    st.offset += st.limit;
    persist();
    renderList();
  });

  $('#inv-tbody')?.addEventListener('click', onListClick);
}

export function wireDeletedControls(){
  const st = state.deleted;

  // Restore
  const saved = readJSON(LS_KEY_DELETED, {});
  if (typeof saved.q === 'string')       st.q = saved.q;
  if (typeof saved.limit === 'number')   st.limit = saved.limit;
  if (typeof saved.offset === 'number')  st.offset = saved.offset;

  // Reflect
  if ($('#del-search')) $('#del-search').value = st.q || '';
  if ($('#del-limit'))  $('#del-limit').value  = String(st.limit || 20);

  const persist = () => writeJSON(LS_KEY_DELETED, st);

  $('#del-search')?.addEventListener('input', ()=>{
    st.q = $('#del-search').value.trim();
    st.offset = 0;
    persist();
    renderDeleted();
  });

  $('#del-maincat')?.addEventListener('change', ()=>{
    st.category = $('#del-maincat').value;
    st.offset = 0;
    persist();
    renderDeleted();
  });

  $('#del-limit')?.addEventListener('change', ()=>{
    st.limit = Number($('#del-limit').value) || 20;
    st.offset = 0;
    persist();
    renderDeleted();
  });

  $('#del-refresh')?.addEventListener('click', ()=>{
    // keep current page (or set to 0 if you prefer)
    // st.offset = 0;
    persist();
    renderDeleted();
  });

  $('#del-prev')?.addEventListener('click', ()=>{
    st.offset = Math.max(0, st.offset - st.limit);
    persist();
    renderDeleted();
  });

  $('#del-next')?.addEventListener('click', ()=>{
    st.offset += st.limit;
    persist();
    renderDeleted();
  });

  $('#del-tbody')?.addEventListener('click', onDeletedClick);
}

export function wireTabs(){
  const listPane = $('#listPane');
  const deletedPane = $('#deletedPane');

  const tabs = {
    all: $('#tabAll'),
    active: $('#tabActive'),
    inactive: $('#tabInactive'),
    stranded: $('#tabStranded'),
    deleted: $('#tabDeleted'),
  };

  function updateAria(view){
    for (const k in tabs){
      const btn = tabs[k];
      if (!btn) continue;
      btn.classList.toggle('active', k===view);
      btn.setAttribute('aria-selected', String(k===view));
    }
  }

  async function activate(view){
    state.view = view;
    // persist chosen tab
    try { localStorage.setItem(LS_KEY_VIEW, view); } catch {}
    updateAria(view);

    if (view === 'deleted') {
      if (listPane) listPane.style.display = 'none';
      if (deletedPane) deletedPane.style.display = 'block';
      await renderDeleted();
    } else {
      if (deletedPane) deletedPane.style.display = 'none';
      if (listPane) listPane.style.display = 'block';
      await renderList();
    }
  }

  tabs.all?.addEventListener('click', ()=>activate('all'));
  tabs.active?.addEventListener('click', ()=>activate('active'));
  tabs.inactive?.addEventListener('click', ()=>activate('inactive'));
  tabs.stranded?.addEventListener('click', ()=>activate('stranded'));
  tabs.deleted?.addEventListener('click', ()=>activate('deleted'));

  // Restore last chosen tab (default 'all')
  const savedView = (typeof localStorage !== 'undefined' && localStorage.getItem(LS_KEY_VIEW)) || state.view || 'all';
  activate(savedView);
}
