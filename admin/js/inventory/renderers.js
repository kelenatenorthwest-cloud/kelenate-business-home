// admin/js/inventory/renderers.js
import { $, fmt, resolveThumb } from './helpers.js';
import { API } from './api.js';
import { state } from './state.js';

// NEW: tiny helpers for clearer auth failures
function isUnauthorized(err) {
  return !!(err && (err.status === 401 || err.status === 403 || /unauthor/i.test(String(err.message))));
}
const UNAUTH_TEXT = 'Session expired or unauthorized. Please reload to re-authenticate.';

function statusText(p, mode) {
  return mode === 'deleted' ? 'deleted'
       : (String(p.status || 'active')).toLowerCase();
}

function statusBadge(p, mode) {
  const s = statusText(p, mode);
  // dot colors (inline so we don't depend on extra CSS)
  const color =
    s === 'active'   ? '#16a34a' :   // green
    s === 'inactive' ? '#6b7280' :   // gray
    s === 'stranded' ? '#f59e0b' :   // orange
    s === 'deleted'  ? '#dc2626' :   // red
                       '#6b7280';    // default gray

  return `
    <span class="badge">
      <span style="
        display:inline-block;width:8px;height:8px;border-radius:50%;
        background:${color};margin-right:6px;flex:0 0 8px"
        aria-hidden="true"></span>
      ${fmt.esc(s.charAt(0).toUpperCase() + s.slice(1))}
    </span>
  `;
}

function rowHTML(p, mode){
  const mrp = p.mrp
    ? `<span class="muted" style="text-decoration:line-through;margin-left:6px">₹ ${Number(p.mrp).toLocaleString('en-IN')}</span>`
    : '';
  const img = fmt.esc(resolveThumb(p));
  const dateCol = mode==='deleted'
    ? (p.deleted_at || p.updated_at || p.updatedAt || '')
    : (p.created_at || p.createdAt || '');
  const actId = fmt.esc(p.id ?? p.sku);
  const actions = mode==='deleted'
    ? `<button class="btn primary" data-act="restore" data-id="${actId}">Restore</button>`
    : `<button class="btn" data-act="edit" data-id="${actId}">Edit</button>
       <button class="btn danger" data-act="delete" data-id="${actId}" style="margin-left:8px">Delete</button>`;

  return `
    <tr>
      <td><img class="thumb" src="${img}" alt=""></td>
      <td>${fmt.esc(p.title || '(no title)')}</td>
      <td>${fmt.esc(p.sku || String(p.id || ''))}</td>
      <td class="nowrap">${fmt.rupee(p.price)}${mrp}</td>
      <td>${fmt.esc(p.mainCategory || p.category || '')}</td>
      <td>${statusBadge(p, mode)}</td>
      <td>${fmt.esc(fmt.date(dateCol))}</td>
      <td class="nowrap" style="min-width:${mode==='deleted'?'120px':'170px'}">${actions}</td>
    </tr>
  `;
}

/* -------- public: renderers -------- */
export async function renderList(){
  const tbody = $('#inv-tbody'); if (!tbody) return;
  const badge = $('#listBadge');
  const st = state.list;

  const labels = { all:'All', active:'Active', inactive:'Inactive', stranded:'Stranded' };
  if (badge) badge.textContent = `(${labels[state.view] || 'All'})`;

  const statusEl = $('#inv-status'); if (statusEl) statusEl.textContent = 'Loading…';
  try{
    const data = await API.list({
      status: state.view, limit: st.limit, offset: st.offset,
      q: st.q, mainCategory: st.category
    });

    if (!Array.isArray(data)) throw new Error('Unexpected response');

    tbody.innerHTML =
      data.map(p => rowHTML(p, 'list')).join('') ||
      `<tr><td colspan="8" class="muted">No products.</td></tr>`;

    if (statusEl) statusEl.textContent = `Showing ${data.length} (offset ${st.offset})`;
    const btnPrev = $('#inv-prev'), btnNext = $('#inv-next');
    if (btnPrev) btnPrev.disabled = st.offset === 0;
    if (btnNext) btnNext.disabled = data.length < st.limit;
  }catch(e){
    // NEW: clearer unauthorized UX
    if (isUnauthorized(e)) {
      if (statusEl) statusEl.textContent = UNAUTH_TEXT;
      alert(UNAUTH_TEXT);
      return;
    }
    if (statusEl) statusEl.textContent = `Error: ${e.message || 'Failed to load'}`;
    alert(e.message || 'Failed to load');
  }
}

export async function renderDeleted(){
  const tbody = $('#del-tbody'); if (!tbody) return;
  const st = state.deleted;

  const statusEl = $('#del-status'); if (statusEl) statusEl.textContent = 'Loading…';
  try{
    const data = await API.list({
      status: 'deleted', limit: st.limit, offset: st.offset,
      q: st.q, mainCategory: st.category
    });

    if (!Array.isArray(data)) throw new Error('Unexpected response');

    tbody.innerHTML =
      data.map(p => rowHTML(p, 'deleted')).join('') ||
      `<tr><td colspan="8" class="muted">No deleted products.</td></tr>`;

    if (statusEl) statusEl.textContent = `Showing ${data.length} (offset ${st.offset})`;
    const btnPrev = $('#del-prev'), btnNext = $('#del-next');
    if (btnPrev) btnPrev.disabled = st.offset === 0;
    if (btnNext) btnNext.disabled = data.length < st.limit;
  }catch(e){
    // NEW: clearer unauthorized UX
    if (isUnauthorized(e)) {
      if (statusEl) statusEl.textContent = UNAUTH_TEXT;
      alert(UNAUTH_TEXT);
      return;
    }
    if (statusEl) statusEl.textContent = `Error: ${e.message || 'Failed to load deleted products'}`;
    alert(e.message || 'Failed to load deleted products');
  }
}

/* -------- actions (exported so controls can wire) -------- */
export function openEditor(p){
  // Use existing Add Product page in edit mode
  window._editProductId = p.id || p.sku;   // add page will fetch /api/products/:id
  if (window.nav) window.nav('add'); else location.href = '/admin#index=add';
}

export async function onListClick(e){
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.act === 'edit') {
    return openEditor({ id, sku: id });
  }
  if (btn.dataset.act === 'delete') {
    if (!confirm('Move this product to Deleted?')) return;
    try{
      await API.remove(id);
      // adjust paging if page emptied
      const rows = $('#inv-tbody')?.rows?.length || 0;
      if (rows <= 1 && state.list.offset > 0)
        state.list.offset = Math.max(0, state.list.offset - state.list.limit);
      await renderList();
      if ($('#del-tbody')) await renderDeleted();
    }catch(err){
      // NEW: clearer unauthorized UX
      if (isUnauthorized(err)) {
        alert(UNAUTH_TEXT);
        return;
      }
      alert(err.message || 'Delete failed');
    }
  }
}

export async function onDeletedClick(e){
  const btn = e.target.closest('button[data-act="restore"]'); if (!btn) return;
  try{
    await API.restore(btn.dataset.id);
    await renderDeleted();
    if ($('#inv-tbody')) await renderList();
  }catch(err){
    // NEW: clearer unauthorized UX
    if (isUnauthorized(err)) {
      alert(UNAUTH_TEXT);
      return;
    }
    alert(err.message || 'Restore failed');
  }
}
