import { num } from './dom.js';

export function refreshControls({priceLinks, discountLinks, colorChecks}){
  priceLinks.length = 0;     priceLinks.push(...document.querySelectorAll('.filter-link[data-filter="price"]'));
  discountLinks.length = 0;  discountLinks.push(...document.querySelectorAll('.filter-link[data-filter="discount"]'));
  colorChecks.length = 0;    colorChecks.push(...document.querySelectorAll('.checklist [data-filter="color"]'));
}

export function wireControls({priceLinks, discountLinks, colorChecks, state, saveState, hydrateUIFromState, applyFilters}){
  refreshControls({priceLinks, discountLinks, colorChecks});

  colorChecks.forEach(cb => {
    if (cb.dataset.wired) return;
    cb.dataset.wired = '1';
    cb.addEventListener('change', () => {
      if (cb.disabled) return;
      const val = cb.value;
      const set = new Set(state.colors);
      if (cb.checked) set.add(val); else set.delete(val);
      state.colors = Array.from(set);
      saveState(); hydrateUIFromState(); applyFilters();
    });
  });

  priceLinks.forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const min = num(btn.dataset.min);
      const max = num(btn.dataset.max);
      const isActive = btn.classList.contains('is-active');
      state.price = isActive ? { min: null, max: null } : { min, max };
      saveState(); hydrateUIFromState(); applyFilters();
    });
  });

  discountLinks.forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const min = num(btn.dataset.min);
      const isActive = btn.classList.contains('is-active');
      state.discount = isActive ? { min: null } : { min };
      saveState(); hydrateUIFromState(); applyFilters();
    });
  });
}
