// buyers-page/js/searchbar.js
// Header search box: suggestions + routing to the search results page

import { getProducts } from './api.js';

function $(sel, root = document) { return root.querySelector(sel); }
function debounce(fn, ms = 150) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); }; }

// Always use the buyers-page search
const SEARCH_URL = '/buyers-page/search.html';

function attachSearch() {
  const form   = $('.search');
  const input  = $('.search__input');
  const btnAll = $('#btnAll');
  const btnGo  = $('#btnSearch');

  if (!form || !input) return;

  // Make native submit go to the correct page too
  form.setAttribute('action', SEARCH_URL);
  form.setAttribute('method', 'GET');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) location.href = `${SEARCH_URL}?q=${encodeURIComponent(q)}`;
  });

  // Build a suggestions panel (reusing .menu-panel styles)
  let panel = $('#searchSuggest');
  if (!panel) {
    panel = document.createElement('nav');
    panel.id = 'searchSuggest';
    panel.className = 'dropdown menu-panel';
    panel.setAttribute('aria-label', 'Search Suggestions');
    panel.innerHTML = '<ul></ul>';
    form.appendChild(panel);
  }
  const list = panel.querySelector('ul');

  function positionPanel() {
    const left = (btnAll?.offsetWidth || 0);
    const width = input.offsetWidth || 280;
    const top = (form.offsetHeight || 44); // align to the bottom of the search form
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.minWidth = width + 'px';
    panel.style.zIndex = 2200;
  }
  positionPanel();
  const onResize = () => { positionPanel(); if (!list.children.length) closePanel(); };
  window.addEventListener('resize', onResize);

  let cursor = -1;
  const openPanel  = () => panel.classList.add('is-open');
  const closePanel = () => { panel.classList.remove('is-open'); cursor = -1; };
  const isOpen     = () => panel.classList.contains('is-open');

  function renderSuggestions(items) {
    list.innerHTML = '';
    if (!items || !items.length) { closePanel(); return; }

    items.forEach((p) => {
      const idOrSku =
        (p?.sku && String(p.sku).trim()) ||
        (p?.id != null ? String(p.id) : '');

      if (!idOrSku) return; // skip items without identifier

      const imgSrc = (Array.isArray(p.images) && p.images[0]) || p.image || '';
      const li = document.createElement('li');
      li.innerHTML = `
        <a href="/buyers-page/product.html?id=${encodeURIComponent(idOrSku)}" data-id="${idOrSku}" style="display:flex;gap:8px;align-items:center;">
          <img src="${imgSrc}" alt="" style="width:32px;height:32px;border-radius:6px;border:1px solid #eee;object-fit:contain;background:#fafafa"/>
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.title || ''}</span>
        </a>
      `;
      // keep input focus when clicking
      li.addEventListener('mousedown', (e) => e.preventDefault());

      // ✅ CSP-safe error handler (no inline onerror)
      const img = li.querySelector('img');
      if (img) img.addEventListener('error', () => { img.style.display = 'none'; });

      list.appendChild(li);
    });

    cursor = -1;
    if (list.children.length) openPanel(); else closePanel();
    positionPanel(); // ensure correct size after content changes
  }

  const doSuggest = debounce(async (q) => {
    if (!q || q.length < 2) { closePanel(); return; }
    try {
      const items = await getProducts({ q, limit: 8, _: Date.now() });
      renderSuggestions(items);
    } catch {
      closePanel();
    }
  }, 180);

  input.addEventListener('input', () => doSuggest(input.value.trim()));

  input.addEventListener('keydown', (e) => {
    const items = Array.from(list.querySelectorAll('li a'));
    if (!items.length) {
      if (e.key === 'Enter') {
        const q = input.value.trim();
        if (q) location.href = `${SEARCH_URL}?q=${encodeURIComponent(q)}`;
        closePanel();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = Math.min(items.length - 1, cursor + 1);
      items.forEach(a => a.classList.remove('is-active'));
      items[cursor].classList.add('is-active');
      items[cursor].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = Math.max(0, cursor - 1);
      items.forEach(a => a.classList.remove('is-active'));
      items[cursor].classList.add('is-active');
      items[cursor].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (cursor >= 0 && items[cursor]) {
        location.href = items[cursor].getAttribute('href');
      } else {
        const q = input.value.trim();
        if (q) location.href = `${SEARCH_URL}?q=${encodeURIComponent(q)}`;
      }
      closePanel();
    } else if (e.key === 'Escape') {
      closePanel();
    }
  });

  input.addEventListener('focus', () => {
    if (list.children.length) openPanel();
  });
  input.addEventListener('blur', () => setTimeout(closePanel, 120));

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    const t = e.target;
    if (!panel.contains(t) && !form.contains(t)) closePanel();
  });

  // Close on scroll (prevents floating panel while sticky header moves)
  window.addEventListener('scroll', () => { if (isOpen()) closePanel(); }, { passive: true });

  btnGo?.addEventListener('click', () => {
    const q = input.value.trim();
    if (q) location.href = `${SEARCH_URL}?q=${encodeURIComponent(q)}`;
  });
}

function runWhenReady() {
  if (window.__includesReady) attachSearch();
  else document.addEventListener('includes:ready', attachSearch, { once: true });
}

runWhenReady();
