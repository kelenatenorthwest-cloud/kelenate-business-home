// Path: /admin/js/admin-card-grid.js
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    const txt = await res.text();
    let data; try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
    if (!res.ok) throw new Error(data?.error || res.statusText);
    return data;
  }
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));

  async function load() {
    try {
      const s = await fetchJSON('/api/site-settings');
      const g = s.cardGrid || {};
      $('#cg-home').value     = g.home     ?? 6;
      $('#cg-category').value = g.category ?? 5;
      $('#cg-search').value   = g.search   ?? 4;
    } catch (e) {
      $('#cg-status').textContent = 'Failed to load: ' + e.message;
    }
  }

  async function save(e) {
    e?.preventDefault?.();
    const home     = clamp($('#cg-home').value, 1, 8);
    const category = clamp($('#cg-category').value, 1, 8);
    const search   = clamp($('#cg-search').value, 1, 8);

    const btn = $('#cg-save');
    const status = $('#cg-status');
    btn.disabled = true; status.textContent = 'Saving…';
    try {
      const current = await fetchJSON('/api/site-settings');
      const next = { ...current, cardGrid: { ...(current.cardGrid || {}), home, category, search } };
      await fetchJSON('/api/site-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next)
      });
      status.textContent = 'Saved ✔';
      setTimeout(() => status.textContent = '', 1500);
    } catch (e2) {
      status.textContent = 'Failed: ' + e2.message;
    } finally {
      btn.disabled = false;
    }
  }

  window.initCardGrid = function () {
    $('#card-grid-form')?.addEventListener('submit', save);
    $('#cg-save')?.addEventListener('click', save);
    load();
  };
})();
