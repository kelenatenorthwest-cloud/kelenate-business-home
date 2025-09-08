// admin/js/admin-inventory.js
(function () {
  /* ===================== helpers ===================== */

  async function apiFetch(path, opts) {
    const tries = [`/api${path}`, path];
    let lastErr, lastRes = null;
    for (const url of tries) {
      try {
        const r = await fetch(url, opts);
        lastRes = r;
        if (r.ok) return r;
        lastErr = new Error(`${r.status} ${r.statusText}`);
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastRes) {
      let body = '';
      try { body = await lastRes.text(); } catch {}
      throw new Error(body || (lastErr?.message || 'Request failed'));
    }
    throw lastErr || new Error('Request failed');
  }

  const $ = (s, r = document) => r.querySelector(s);

  const fmt = {
    rupee(n){ const v = Number(n || 0); return isNaN(v) ? '-' : `₹ ${v.toLocaleString('en-IN',{maximumFractionDigits:2})}`; },
    date(v){
      if (!v) return '-';
      const num = Number(v);
      if (Number.isFinite(num)) return new Date(num).toLocaleString();
      const ms = Date.parse(String(v).replace(' ', 'T'));
      return Number.isFinite(ms) ? new Date(ms).toLocaleString() : String(v);
    },
    esc(s){ return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  };

  /* ===================== API ===================== */
  const API = {
    list: async (q) => {
      const qs = new URLSearchParams(q);
      const r = await apiFetch(`/products?${qs.toString()}`);
      return r.json();
    },
    remove: async (idOrSku) => {
      try {
        const r = await apiFetch(`/products/${encodeURIComponent(idOrSku)}`, { method:'DELETE' });
        return r.json();
      } catch {
        const r2 = await apiFetch(`/products/${encodeURIComponent(idOrSku)}/delete`, { method:'POST' });
        return r2.json();
      }
    },
    restore: async (idOrSku) => {
      const r = await apiFetch(`/products/${encodeURIComponent(idOrSku)}/restore`, { method:'POST' });
      return r.json();
    },
    categories: async () => {
      try {
        const r = await apiFetch(`/categories?type=main`);
        return r.json();
      } catch { return []; }
    }
  };

  /* ===================== state ===================== */
  const state = {
    view: 'all',
    list:   { limit: 20, offset: 0, q: '', category: '' },
    deleted:{ limit: 20, offset: 0, q: '', category: '' },
  };

  /* ===================== renderers ===================== */
  function resolveThumb(p){
    return (Array.isArray(p.images) && p.images[0]) || p.image || '/img/placeholder.png';
  }

  function getStatus(p, mode){
    if (mode === 'deleted' || p.is_deleted) return 'Deleted';
    const s = String(p.status || 'active').toLowerCase();
    return s === 'inactive' ? 'Inactive' : 'Active';
  }

  function rowHTML(p, mode){
    const mrp = p.mrp ? `<span class="muted" style="text-decoration:line-through;margin-left:6px">₹ ${Number(p.mrp).toLocaleString('en-IN')}</span>` : '';
    const img = fmt.esc(resolveThumb(p));
    const dateCol = mode==='deleted'
      ? (p.deleted_at || p.updated_at || p.updatedAt || '')
      : (p.created_at || p.createdAt || '');
    const actions = mode==='deleted'
      ? `<button class="btn primary" data-act="restore" data-id="${fmt.esc(p.id ?? p.sku)}">Restore</button>`
      : `<button class="btn" data-act="edit" data-id="${fmt.esc(p.id ?? p.sku)}">Edit</button>
         <button class="btn danger" data-act="delete" data-id="${fmt.esc(p.id ?? p.sku)}" style="margin-left:8px">Delete</button>`;
    return `
      <tr>
        <td><img class="thumb" src="${img}" alt=""></td>
        <td>${fmt.esc(p.title || '(no title)')}</td>
        <td>${fmt.esc(p.sku || String(p.id || ''))}</td>
        <td class="nowrap">${fmt.rupee(p.price)}${mrp}</td>
        <td>${fmt.esc(p.mainCategory || p.category || '')}</td>
        <td>${fmt.esc(getStatus(p, mode))}</td>
        <td>${fmt.esc(fmt.date(dateCol))}</td>
        <td class="nowrap" style="min-width:${mode==='deleted'?'120px':'170px'}">${actions}</td>
      </tr>
    `;
  }

  async function renderList(){
    const tbody = $('#inv-tbody'); if (!tbody) return;
    const badge = $('#listBadge');
    const st = state.list;

    const labels = { all:'All', active:'Active', inactive:'Inactive', stranded:'Stranded' };
    if (badge) badge.textContent = `(${labels[state.view] || 'All'})`;

    const status = $('#inv-status'); if (status) status.textContent = 'Loading…';
    try{
      const data = await API.list({
        status: state.view, limit: st.limit, offset: st.offset,
        q: st.q, mainCategory: st.category
      });
      tbody.innerHTML = data.map(p => rowHTML(p, 'list')).join('') || `<tr><td colspan="8" class="muted">No products.</td></tr>`;
      if (status) status.textContent = `Showing ${data.length} (offset ${st.offset})`;
      const btnPrev = $('#inv-prev'), btnNext = $('#inv-next');
      if (btnPrev) btnPrev.disabled = st.offset === 0;
      if (btnNext) btnNext.disabled = data.length < st.limit;
    }catch(e){
      if (status) status.textContent = `Error: ${e.message || 'Failed to load'}`;
      alert(e.message || 'Failed to load');
    }
  }

  async function renderDeleted(){
    const tbody = $('#del-tbody'); if (!tbody) return;
    const st = state.deleted;

    const status = $('#del-status'); if (status) status.textContent = 'Loading…';
    try{
      const data = await API.list({
        status: 'deleted', limit: st.limit, offset: st.offset,
        q: st.q, mainCategory: st.category
      });
      tbody.innerHTML = data.map(p => rowHTML(p, 'deleted')).join('') || `<tr><td colspan="8" class="muted">No deleted products.</td></tr>`;
      if (status) status.textContent = `Showing ${data.length} (offset ${st.offset})`;
      const btnPrev = $('#del-prev'), btnNext = $('#del-next');
      if (btnPrev) btnPrev.disabled = st.offset === 0;
      if (btnNext) btnNext.disabled = data.length < st.limit;
    }catch(e){
      if (status) status.textContent = `Error: ${e.message || 'Failed to load deleted products'}`;
      alert(e.message || 'Failed to load deleted products');
    }
  }

  /* ===================== actions ===================== */
  function openEditor(p){
    window._editProductId = p.id || p.sku;
    if (window.nav) window.nav('add'); else location.href = '/admin#index=add';
  }

  async function onListClick(e){
    const btn = e.target.closest('button[data-act]'); if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.act === 'edit') {
      return openEditor({ id, sku: id });
    }
    if (btn.dataset.act === 'delete') {
      if (!confirm('Move this product to Deleted?')) return;
      try{
        await API.remove(id);
        const rows = $('#inv-tbody')?.rows?.length || 0;
        if (rows <= 1 && state.list.offset > 0)
          state.list.offset = Math.max(0, state.list.offset - state.list.limit);
        await renderList();
        if ($('#del-tbody')) await renderDeleted();
      }catch(err){
        alert(err.message || 'Delete failed');
      }
    }
  }

  async function onDeletedClick(e){
    const btn = e.target.closest('button[data-act="restore"]'); if (!btn) return;
    try{
      await API.restore(btn.dataset.id);
      await renderDeleted();
      if ($('#inv-tbody')) await renderList();
    }catch(err){
      alert(err.message || 'Restore failed');
    }
  }

  /* ===================== controls & tabs ===================== */
  async function loadCategories(){
    try{
      const cats = await API.categories();
      const names = (cats || []).map(x => x?.name || x?.title || String(x));
      const s1 = $('#inv-maincat'), s2 = $('#del-maincat');
      const opts = names.map(n => `<option>${fmt.esc(n)}</option>`).join('');
      if (s1) s1.innerHTML = '<option value="">All main categories</option>' + opts;
      if (s2) s2.innerHTML = '<option value="">All main categories</option>' + opts;
    }catch{}
  }

  function wireListControls(){
    const st = state.list;
    $('#btn-add')?.addEventListener('click', ()=> { if (window.nav) window.nav('add'); else location.href='/admin#index=add'; });
    $('#inv-search')?.addEventListener('input', ()=>{ st.q = $('#inv-search').value.trim(); st.offset=0; renderList(); });
    $('#inv-maincat')?.addEventListener('change', ()=>{ st.category = $('#inv-maincat').value; st.offset=0; renderList(); });
    $('#inv-limit')?.addEventListener('change', ()=>{ st.limit = Number($('#inv-limit').value)||20; st.offset=0; renderList(); });
    $('#inv-refresh')?.addEventListener('click', ()=>{ st.offset=0; renderList(); });
    $('#inv-prev')?.addEventListener('click', ()=>{ st.offset = Math.max(0, st.offset - st.limit); renderList(); });
    $('#inv-next')?.addEventListener('click', ()=>{ st.offset += st.limit; renderList(); });
    $('#inv-tbody')?.addEventListener('click', onListClick);
  }

  function wireDeletedControls(){
    const st = state.deleted;
    $('#del-search')?.addEventListener('input', ()=>{ st.q = $('#del-search').value.trim(); st.offset=0; renderDeleted(); });
    $('#del-maincat')?.addEventListener('change', ()=>{ st.category = $('#del-maincat').value; st.offset=0; renderDeleted(); });
    $('#del-limit')?.addEventListener('change', ()=>{ st.limit = Number($('#del-limit').value)||20; st.offset=0; renderDeleted(); });
    $('#del-refresh')?.addEventListener('click', ()=>{ st.offset=0; renderDeleted(); });
    $('#del-prev')?.addEventListener('click', ()=>{ st.offset = Math.max(0, st.offset - st.limit); renderDeleted(); });
    $('#del-next')?.addEventListener('click', ()=>{ st.offset += st.limit; renderDeleted(); });
    $('#del-tbody')?.addEventListener('click', onDeletedClick);
  }

  function wireTabs(){
    const listPane = $('#listPane');
    const deletedPane = $('#deletedPane');

    const tabs = {
      all: $('#tabAll'),
      active: $('#tabActive'),
      inactive: $('#tabInactive'),
      stranded: $('#tabStranded'),
      deleted: $('#tabDeleted'),
    };

    function activate(view){
      state.view = view;
      for (const k in tabs) tabs[k]?.classList.toggle('active', k===view);
      if (view === 'deleted') {
        if (listPane) listPane.style.display = 'none';
        if (deletedPane) deletedPane.style.display = 'block';
        renderDeleted();
      } else {
        if (deletedPane) deletedPane.style.display = 'none';
        if (listPane) listPane.style.display = 'block';
        renderList();
      }
    }

    tabs.all?.addEventListener('click', ()=>activate('all'));
    tabs.active?.addEventListener('click', ()=>activate('active'));
    tabs.inactive?.addEventListener('click', ()=>activate('inactive'));
    tabs.stranded?.addEventListener('click', ()=>activate('stranded'));
    tabs.deleted?.addEventListener('click', ()=>activate('deleted'));

    activate('all');
  }

  /* ===================== boot (SPA-safe) ===================== */
  async function boot(){
    await loadCategories();
    wireListControls();
    wireDeletedControls();
    wireTabs();
  }

  function mountIfPresent() {
    const hook = document.getElementById('inv-tbody');
    if (!hook) return;
    if (hook.dataset.invWired === '1') return;
    hook.dataset.invWired = '1';
    boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountIfPresent);
  } else {
    mountIfPresent();
  }

  window.addEventListener('hashchange', () => setTimeout(mountIfPresent, 0));
  window.addEventListener('popstate',   () => setTimeout(mountIfPresent, 0));
  document.addEventListener('click',    () => setTimeout(mountIfPresent, 0));

  const __invObserver = new MutationObserver(() => mountIfPresent());
  __invObserver.observe(document.body, { childList: true, subtree: true });
})();
