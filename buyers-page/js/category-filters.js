// Filters entrypoint (split modules). Keeps behavior & updates 1–10 intact.
import { $, $$, whenReady, debounce, num, eq } from './filters/dom.js';
import { normalizeColorName, colorsInTitle } from './filters/colors.js';
import { loadAdminUnavailableMode } from './filters/admin-mode.js';
import { ProductInfoCache } from './filters/product.js';
import { scanAvailabilityAndLock } from './filters/availability.js';
import { renderChips } from './filters/chips.js';
import { wireControls } from './filters/wiring.js';

(function(){
  const grid           = $('#grid');
  const chipsContainer = $('#activeFilters');

  // live collections (we refresh in wireControls)
  const priceLinks    = Array.from($$('.filter-link[data-filter="price"]'));
  const discountLinks = Array.from($$('.filter-link[data-filter="discount"]'));
  const colorChecks   = Array.from($$('.checklist [data-filter="color"]'));

  if (!grid) return;

  const STORAGE_KEY = 'kelenate.category.filters.v1';
  const state = loadState() || { colors: [], price: {min:null,max:null}, discount: {min:null} };

  function saveState(){ sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function loadState(){
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || ''); } catch { return null; }
  }

  let ADMIN_UNAVAILABLE_MODE = 'lock';
  const parser = new ProductInfoCache();

  function hydrateUIFromState(){
    // case-insensitive checkbox syncing so labels/case changes don’t break checks
    const colorSetLC = new Set((state.colors || []).map(s => String(s).toLowerCase()));
    colorChecks.forEach(cb => { cb.checked = colorSetLC.has(String(cb.value).toLowerCase()); });

    priceLinks.forEach(btn => {
      const min = num(btn.dataset.min);
      const max = num(btn.dataset.max);
      btn.classList.toggle('is-active', eq(min, state.price.min) && eq(max, state.price.max));
    });

    discountLinks.forEach(btn => {
      const min = num(btn.dataset.min);
      btn.classList.toggle('is-active', eq(min, state.discount.min));
    });

    // === UPDATED: make chip “X” actually clear state, robustly ===
    renderChips({
      state,
      chipsContainer,
      onRemoveColor: (color) => {
        // case-insensitive remove to match UI labels/admin values
        const target = String(color).toLowerCase();
        state.colors = (state.colors || []).filter(c => String(c).toLowerCase() !== target);
        saveState(); hydrateUIFromState(); applyFilters();
      },
      onClearPrice: () => {
        // mutate in place so any handlers that captured state.price keep working
        state.price.min = null;
        state.price.max = null;
        saveState(); hydrateUIFromState(); applyFilters();
      },
      onClearDiscount: () => {
        state.discount.min = null;
        saveState(); hydrateUIFromState(); applyFilters();
      }
    });
    // === END UPDATED ===
  }

  function applyFilters(){
    const selectedLC = state.colors.map(s => String(s).toLowerCase());
    const hasAnyColor = selectedLC.length > 0;

    const hasMulti = selectedLC.includes('multi');
    const singleSelected = selectedLC.filter(c => c !== 'multi');

    const priceMin = state.price.min;
    const priceMax = state.price.max;
    const discMin  = state.discount.min;

    let visible = 0;

    $$('.product', grid).forEach(card => {
      const info = parser.productInfo(card);

      if (!info._colorHits) {
        const base = colorsInTitle(info.title || '');
        const dataColors = String(card.dataset.colors || '')
          .split(/\s+/).filter(Boolean)
          .map(s => normalizeColorName(s));
        if (dataColors.length) dataColors.forEach(c => base.add(c));
        info._colorHits = base;
      }
      const hitSet = info._colorHits;
      const hitCount = hitSet.size;

      let okColor = true;
      if (hasAnyColor) {
        const singleMatch = singleSelected.some(sel => hitSet.has(normalizeColorName(sel)));
        const multiMatch = hasMulti && (hitCount === 0 || hitCount >= 2);
        okColor = singleMatch || multiMatch;
      }

      let okPrice = true;
      if (priceMin != null || priceMax != null) {
        const p = info.price;
        okPrice = Number.isFinite(p)
          && (priceMin == null || p >= priceMin)
          && (priceMax == null || p <= priceMax);
      }

      let okDisc = true;
      if (discMin != null) {
        const pct = parser.discountPercent(info.mrp, info.price);
        okDisc = pct >= discMin;
      }

      const show = okColor && okPrice && okDisc;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    const countEl = $('#catCount') || $('#srchCount');
    if (countEl) countEl.textContent = `${visible} result${visible === 1 ? '' : 's'}`;

    scanAvailabilityAndLock({
      grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE
    });
  }

  const debouncedApply = debounce(() => {
    parser.reset();
    scanAvailabilityAndLock({ grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE });
    hydrateUIFromState();
    applyFilters();
  }, 80);

  const mo = new MutationObserver(debouncedApply);
  mo.observe(grid, { childList:true, subtree:true });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      scanAvailabilityAndLock({ grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE });
      hydrateUIFromState();
      applyFilters();
    }
  });

  whenReady().then(async () => {
    ADMIN_UNAVAILABLE_MODE = await loadAdminUnavailableMode();

    wireControls({
      priceLinks, discountLinks, colorChecks,
      state, saveState, hydrateUIFromState, applyFilters
    });

    if ($$('.product', grid).length > 0) {
      scanAvailabilityAndLock({ grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE });
      hydrateUIFromState();
      applyFilters();
    } else {
      const start = Date.now(); const timeout=8000; const interval=60;
      const tick = setInterval(()=> {
        if ($$('.product', grid).length > 0 || Date.now()-start > timeout) {
          clearInterval(tick);
          scanAvailabilityAndLock({ grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE });
          hydrateUIFromState();
          applyFilters();
        }
      }, interval);
    }
  });

  // Rewire when admin updates the left rail
  const __filtersEl = $('#filters');
  if (__filtersEl) {
    const __moFilters = new MutationObserver(debounce(() => {
      wireControls({ priceLinks, discountLinks, colorChecks, state, saveState, hydrateUIFromState, applyFilters });
      hydrateUIFromState();
      scanAvailabilityAndLock({ grid, priceLinks, discountLinks, colorChecks, state, parser, mode: ADMIN_UNAVAILABLE_MODE });
    }, 80));
    __moFilters.observe(__filtersEl, { childList: true, subtree: true });
  }
})();
