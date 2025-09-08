// admin/js/inventory/index.js
import { loadCategories, wireListControls, wireDeletedControls, wireTabs } from './controls.js';
import { renderList } from './renderers.js';
import { state } from './state.js';

/**
 * Wire the UI, and re-wire when the Inventory DOM has been re-injected
 * (e.g., after navigating away & back). We mark the current DOM with
 * data-wired="1" so a fresh section (without the flag) triggers wiring again.
 */
async function init() {
  try {
    const listPane = document.getElementById('listPane'); // exists only when inventory.html is injected
    const needsDOM = !!listPane;

    if (state._wired) {
      // Already wired at least once in this page lifecycle.
      // If the DOM was replaced by the admin shell (new Inventory HTML),
      // the marker won't be present—so wire again.
      if (needsDOM && listPane.dataset.wired !== '1') {
        await loadCategories();     // fill category dropdowns (fresh DOM)
        wireListControls();         // search, filters, paging, actions
        wireDeletedControls();      // deleted tab controls
        wireTabs();                 // tab switching
        listPane.dataset.wired = '1';
      }
      // Always refresh data for current view
      await renderList();
      return;
    }

    // First-time setup in this page lifecycle
    state._wired = true;

    if (needsDOM) {
      await loadCategories();
      wireListControls();
      wireDeletedControls();
      wireTabs();
      listPane.dataset.wired = '1';
    }

    // Initial render
    await renderList();
  } catch (err) {
    console.error('Inventory init failed:', err);
    alert(err?.message || 'Failed to initialize inventory UI');
  }
}

/**
 * Lightweight refresh used for bfcache restore, etc.
 */
async function refresh() {
  try {
    await renderList();
  } catch (e) {
    console.error('Inventory refresh failed:', e);
  }
}

// If loaded directly via <script type="module" src="..."> in inventory.html
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init().catch(console.error); }, { once: true });
} else {
  init().catch(console.error);
}

// Handle Chrome back/forward cache: refresh data without rewiring
window.addEventListener('pageshow', (e) => {
  if (e.persisted) refresh();
});

// Hook for the admin shell. Safe to call repeatedly; it will re-wire if DOM is fresh.
window.inventoryInit = () => { init(); };

export { init, refresh };
