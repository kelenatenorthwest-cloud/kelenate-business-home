// dropdowns.js
import { el } from './utils.js';

const OPEN_CLASS = 'is-open';

// Helper: ensure an element has an id (used for aria-controls / aria-labelledby)
function ensureId(node, prefix = 'dd') {
  if (!node) return '';
  if (!node.id) node.id = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
  return node.id;
}

export function initDropdown({button, menu}) {
  const btn = document.querySelector(button);
  const panel = document.querySelector(menu);
  if (!btn || !panel) return;

  // Avoid double-initializing the same dropdown
  if (btn.dataset.ddInited === '1') return;
  btn.dataset.ddInited = '1';

  // Basic ARIA wiring (non-destructive; respects existing attrs)
  const panelId = ensureId(panel, 'menu');
  const btnId   = ensureId(btn, 'btn');

  btn.setAttribute('aria-haspopup', btn.getAttribute('aria-haspopup') || 'true');
  btn.setAttribute('aria-expanded', btn.getAttribute('aria-expanded') || 'false');
  btn.setAttribute('aria-controls', btn.getAttribute('aria-controls') || panelId);

  panel.setAttribute('role', panel.getAttribute('role') || 'menu');
  // Associate the panel with its trigger for AT users
  if (!panel.getAttribute('aria-labelledby') && btnId) {
    panel.setAttribute('aria-labelledby', btnId);
  }

  let open = false;

  const closeOthers = () => {
    document.querySelectorAll('.menu-panel.' + OPEN_CLASS).forEach(p => {
      if (p !== panel) {
        p.classList.remove(OPEN_CLASS);
        const ownerBtn = document.querySelector(`[aria-controls="${p.id}"]`);
        if (ownerBtn) ownerBtn.setAttribute('aria-expanded', 'false');
      }
    });
  };

  const openDropdown = () => {
    if (open) return;
    closeOthers();
    open = true;
    panel.classList.add(OPEN_CLASS);
    btn.setAttribute('aria-expanded', 'true');
  };

  const closeDropdown = () => {
    if (!open) return;
    open = false;
    panel.classList.remove(OPEN_CLASS);
    btn.setAttribute('aria-expanded', 'false');
  };

  // Toggle on button click
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    open ? closeDropdown() : openDropdown();
  });

  // Keyboard support: Enter/Space/ArrowDown opens; Escape closes
  btn.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'ArrowDown') {
      e.preventDefault();
      openDropdown();
      // Try focus first link inside panel
      const firstLink = panel.querySelector('a,button,[tabindex]:not([tabindex="-1"])');
      if (firstLink) firstLink.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      closeDropdown();
      btn.focus();
    }
  });

  // Click outside to close (treat clicks within the button—including icons—as inside)
  document.addEventListener('click', (e) => {
    if (!open) return;
    const t = e.target;
    if (!panel.contains(t) && !btn.contains(t)) {
      closeDropdown();
    }
  });

  // Close on window resize or scroll (prevents weird positioning while sticky header moves)
  const closeOnViewportChange = () => { if (open) closeDropdown(); };
  window.addEventListener('resize', closeOnViewportChange, { passive: true });
  window.addEventListener('scroll', closeOnViewportChange, { passive: true });

  // Close when a link in the menu is activated
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a,button');
    if (!a) return;
    // Allow navigation to proceed, but close the panel right away
    closeDropdown();
  });
}

/**
 * Fill a menu with category links.
 * Backward compatible:
 *  - If you pass a <ul>, it will be used directly.
 *  - If you pass the panel (<nav>), we will find or create a <ul> inside it.
 *
 * Update: preserve existing fallback items when categories are empty.
 */
export function fillMenuWithCategories(ulOrPanel, categories) {
  if (!ulOrPanel) return;

  let ul = ulOrPanel;
  // If the caller passed the panel <nav>, find or create a <ul> inside
  if (ul.tagName && ul.tagName.toUpperCase() !== 'UL') {
    ul = ul.querySelector('ul');
    if (!ul) {
      ul = document.createElement('ul');
      ulOrPanel.appendChild(ul);
    }
  }

  // Ensure menu semantics
  ul.setAttribute('role', ul.getAttribute('role') || 'menu');

  // Normalize, dedupe, sort labels
  const labels = Array.from(new Set(
    (categories || [])
      .map(raw => (raw == null ? '' : String(raw)).trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));

  // IMPORTANT: If no categories, keep whatever is already in the HTML (fallback items)
  if (labels.length === 0) return;

  // Replace only when we have something meaningful to show
  ul.innerHTML = "";
  labels.forEach(label => {
    const li = el("li", { role: "none" },
      el("a", {
        href: `category.html?type=main&value=${encodeURIComponent(label)}`,
        role: "menuitem"
      }, label)
    );
    ul.appendChild(li);
  });
}
