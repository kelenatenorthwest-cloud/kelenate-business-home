// File: /admin/js/admin-filters.js
// Initializes the Filters admin screen that is injected by admin-shell
// Mirrors the logic that was previously inline in sections/filters.html

(function () {
  function $(sel, root = document) { return root.querySelector(sel); }
  function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function rupee(n) { return new Intl.NumberFormat('en-IN').format(n); }

  function promptColor(item = { name: '', dot: '' }) {
    const name = prompt('Colour name:', item.name ?? '');
    if (name === null) return null;
    const dot = prompt('Dot color (CSS color or hex, leave blank for none):', item.dot ?? '');
    return { name: String(name).trim(), ...(dot ? { dot: String(dot).trim() } : {}) };
  }

  function promptBand(item = { label: '', min: '', max: '' }) {
    const label = prompt('Label (e.g., "Under ₹500"):', item.label ?? '');
    if (label === null) return null;
    let min = prompt('Min price (number, blank for 0):', item.min ?? '');
    if (min === null) return null;
    let max = prompt('Max price (number, blank for no max):', item.max ?? '');
    if (max === null) return null;
    min = String(min).trim(); max = String(max).trim();
    const mm = { label: String(label).trim(), min: min === '' ? 0 : Number(min), max: max === '' ? null : Number(max) };
    if (!Number.isFinite(mm.min) || (mm.max !== null && !Number.isFinite(mm.max))) {
      alert('Please enter valid numbers'); return null;
    }
    return mm;
  }

  function promptDiscount(item = { label: '', min: '' }) {
    const min = prompt('Minimum % off (number):', item.min ?? '');
    if (min === null) return null;
    const m = Number(String(min).trim());
    if (!Number.isFinite(m) || m < 0) { alert('Enter a valid percent'); return null; }
    const label = prompt('Label:', item.label ?? `${m}% Off or more`);
    if (label === null) return null;
    return { label: String(label).trim(), min: m };
  }

  async function fetchConfig() {
    const r = await fetch('/api/admin/filters-config', { cache: 'no-store' });
    return await r.json();
  }

  async function saveConfig(cfg) {
    const r = await fetch('/api/admin/filters-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).error || msg; } catch {}
      throw new Error(msg);
    }
  }

  // Expose single entry the shell will call after it injects the HTML
  window.initAdminFilters = async function initAdminFilters() {
    const root = document.getElementById('page-root');
    if (!root) return;

    // Guard: ensure we’re on the Filters section markup
    const modeSel = $('#mode', root);
    if (!modeSel) return; // Not our screen (or not mounted yet)

    // Tabs
    $$('.tab', root).forEach(t => {
      t.addEventListener('click', () => {
        $$('.tab', root).forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const id = t.dataset.tab;
        $$('section[data-panel]', root).forEach(p => p.hidden = (p.dataset.panel !== id));
      });
    });

    // Local state
    let cfg = { unavailable_mode: 'lock', colors: [], price_bands: [], discounts: [] };

    // === helpers for display sorting (case-insensitive) ===
    const coll = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
    const bandLabel = (b) => b.label || (
      b.max == null ? `Over ₹${rupee(b.min || 0)}` :
      (b.min === 0 ? `Under ₹${rupee(b.max || 0)}` : `₹${rupee(b.min || 0)} – ₹${rupee(b.max || 0)}`)
    );
    const discLabel = (d) => d.label || `${d.min}% Off or more`;
    // =======================================================================

    // Renderers
    function renderColors() {
      const tbody = $('#colorsTable tbody', root);
      const tpl = $('#rowColor', root);
      if (!tbody || !tpl) return;
      tbody.innerHTML = '';

      // Display alphabetically by name; keep underlying cfg order intact
      const rows = (cfg.colors || []).map((c, i) => ({ c, i }))
        .sort((a, b) => coll.compare(a.c.name || '', b.c.name || ''));

      rows.forEach(({ c, i }) => {
        const tr = tpl.content.firstElementChild.cloneNode(true);
        const dot = $('.dot', tr);
        if (dot) dot.style.background = c.dot || 'transparent';
        const nameEl = $('.name', tr);
        if (nameEl) nameEl.textContent = c.name || '';
        const edit = $('.edit', tr);
        const del = $('.del', tr);
        edit?.addEventListener('click', () => {
          const upd = promptColor(c);
          if (!upd) return;
          cfg.colors[i] = upd; // update original index
          renderColors();
        });
        del?.addEventListener('click', () => {
          if (confirm(`Delete colour "${c.name}"?`)) {
            cfg.colors.splice(i, 1);
            renderColors();
          }
        });
        tbody.appendChild(tr);
      });
    }

    function renderBands() {
      const tbody = $('#bandsTable tbody', root);
      const tpl = $('#rowBand', root);
      if (!tbody || !tpl) return;
      tbody.innerHTML = '';

      // === UPDATED: sort by numeric range (min asc, then max asc; open-ended last) ===
      const rows = (cfg.price_bands || []).map((b, i) => ({ b, i, lbl: bandLabel(b) }))
        .sort((a, b) => {
          const amin = Number.isFinite(a.b.min) ? a.b.min : 0;
          const bmin = Number.isFinite(b.b.min) ? b.b.min : 0;
          if (amin !== bmin) return amin - bmin;
          const amax = a.b.max == null ? Number.POSITIVE_INFINITY : a.b.max;
          const bmax = b.b.max == null ? Number.POSITIVE_INFINITY : b.b.max;
          return amax - bmax;
        });

      rows.forEach(({ b, i, lbl }) => {
        const tr = tpl.content.firstElementChild.cloneNode(true);
        $('.label', tr).textContent = lbl;
        $('.min', tr).textContent = (b.min ?? 0);
        $('.max', tr).textContent = (b.max ?? '—');
        $('.edit', tr)?.addEventListener('click', () => {
          const upd = promptBand(b); if (!upd) return;
          cfg.price_bands[i] = { ...cfg.price_bands[i], ...upd }; // update original index
          renderBands();
        });
        $('.del', tr)?.addEventListener('click', () => {
          if (confirm(`Delete price band "${lbl}"?`)) {
            cfg.price_bands.splice(i, 1); renderBands();
          }
        });
        tbody.appendChild(tr);
      });
    }

    function renderDiscounts() {
      const tbody = $('#discountsTable tbody', root);
      const tpl = $('#rowDiscount', root);
      if (!tbody || !tpl) return;
      tbody.innerHTML = '';

      // Display alphabetically by label; keep cfg order intact
      const rows = (cfg.discounts || []).map((d, i) => ({ d, i, lbl: discLabel(d) }))
        .sort((a, b) => coll.compare(a.lbl, b.lbl));

      rows.forEach(({ d, i, lbl }) => {
        const tr = tpl.content.firstElementChild.cloneNode(true);
        $('.label', tr).textContent = lbl;
        $('.min', tr).textContent = d.min ?? 0;
        $('.edit', tr)?.addEventListener('click', () => {
          const upd = promptDiscount(d); if (!upd) return;
          cfg.discounts[i] = { ...cfg.discounts[i], ...upd }; // update original index
          renderDiscounts();
        });
        $('.del', tr)?.addEventListener('click', () => {
          if (confirm(`Delete discount "${lbl}"?`)) {
            cfg.discounts.splice(i, 1); renderDiscounts();
          }
        });
        tbody.appendChild(tr);
      });
    }

    // Wire add buttons & Save
    $('#addColor', root)?.addEventListener('click', () => {
      const item = promptColor(); if (!item) return;
      (cfg.colors ||= []).push(item); renderColors();
    });
    $('#addBand', root)?.addEventListener('click', () => {
      const item = promptBand(); if (!item) return;
      (cfg.price_bands ||= []).push(item); renderBands();
    });
    $('#addDiscount', root)?.addEventListener('click', () => {
      const item = promptDiscount(); if (!item) return;
      (cfg.discounts ||= []).push(item); renderDiscounts();
    });
    $('#save', root)?.addEventListener('click', async () => {
      const errEl = $('#saveError', root);
      if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
      cfg.unavailable_mode = $('#mode', root)?.value || 'lock';
      try {
        await saveConfig(cfg);
        alert('Saved.');
      } catch (e) {
        console.error(e);
        if (errEl) {
          errEl.textContent = 'Save failed: ' + e.message;
          errEl.style.display = 'inline-block';
        }
      }
    });

    // Initial load & paint
    try {
      cfg = await fetchConfig();
    } catch (e) {
      console.error(e);
      cfg = { unavailable_mode: 'lock', colors: [], price_bands: [], discounts: [] };
    }
    const mode = $('#mode', root);
    if (mode) mode.value = cfg.unavailable_mode || 'lock';
    renderColors(); renderBands(); renderDiscounts();
  };
})();
