// /admin/js/filters-screen.js
(function () {
  function qs(sel, r = document) { return r.querySelector(sel); }

  const btn = qs('.menu [data-screen="filters"]');
  const root = qs('#page-root');
  const title = qs('#page-title');
  const sub = qs('#page-sub');

  function setActive() {
    document.querySelectorAll('.menu button').forEach(b => b.classList.remove('active'));
    if (btn) { btn.classList.add('active'); }
  }

  function renderFiltersScreen() {
    if (!root) return;
    setActive();
    if (title) title.textContent = 'Filters';
    if (sub) sub.textContent = 'Manage left-rail filters (Colours, Price Bands, Discounts)';

    // Build an iframe that hosts /admin/filters.html inside the shell
    root.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.src = '/admin/filters.html';
    frame.style.width = '100%';
    frame.style.border = '0';
    frame.style.background = 'transparent';
    frame.id = 'filtersFrame';
    root.appendChild(frame);

    // Auto-size the iframe to fill the visible area
    function resize() {
      const rect = root.getBoundingClientRect();
      const padding = 20; // bottom breathing room
      frame.style.height = (window.innerHeight - rect.top - padding) + 'px';
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
  }

  function currentIndexFromHash() {
    const m = location.hash.match(/index=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function maybeRenderFromHash() {
    if (currentIndexFromHash() === 'filters') {
      renderFiltersScreen();
      return true;
    }
    return false;
  }

  // Sidebar button: navigate to our screen
  if (btn) {
    btn.addEventListener('click', () => { location.hash = '#index=filters'; });
  }

  // React to hash changes and on first load
  window.addEventListener('hashchange', maybeRenderFromHash);
  document.addEventListener('DOMContentLoaded', maybeRenderFromHash);
})();
