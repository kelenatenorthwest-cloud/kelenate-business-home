// buyers-page/js/main.js
// Entry for the BUYER HOMEPAGE only (rows + hero banners)

import { getMainCategories } from './api.js';
import { $ } from './utils.js';
import { initDropdown, fillMenuWithCategories } from './dropdowns.js';
import { renderHeroBanners } from './banners.js';
import { renderHomeRows } from './rows.js';

// Fill header menus safely (works whether header is already present or arrives via include)
async function wireHeaderMenus() {
  try {
    const categories = await getMainCategories().catch(() => []);
    const allMenuList  = $('#allMenu ul');
    const megaMenuList = $('#megaMenu ul');
    if (allMenuList)  fillMenuWithCategories(allMenuList,  categories);
    if (megaMenuList) fillMenuWithCategories(megaMenuList, categories);
  } catch {}
}

/* ---------- NEW: mobile scroll untrap (defensive fallback to CSS) ---------- */
function applyMobileScrollUntrap() {
  const isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
  if (!isMobile) return;

  // Prefer vertical page scroll everywhere
  const set = (el, prop, val) => { if (el && el.style[prop] !== val) el.style[prop] = val; };

  set(document.documentElement, 'overscrollBehaviorY', 'auto');
  set(document.body,           'overscrollBehaviorY', 'auto');
  set(document.documentElement, 'webkitOverflowScrolling', 'touch');
  set(document.body,            'webkitOverflowScrolling', 'touch');
  set(document.documentElement, 'touchAction', 'pan-y');
  set(document.body,            'touchAction', 'pan-y');

  // Key sections should not trap vertical scroll
  const hero  = document.querySelector('.hero');
  const slides= document.querySelector('.hero__slides');
  const rows  = document.querySelector('main.rows');
  const content = document.querySelector('.content');

  [hero, slides, rows, content].forEach(el => {
    if (!el) return;
    set(el, 'touchAction', 'pan-y');
    set(el, 'overscrollBehaviorY', 'auto');
  });

  // Relax horizontal home carousels so diagonal swipes don't fight vertical scroll
  document.querySelectorAll('.row.amazon-row .products.home-products.home-scroller').forEach(scroller => {
    set(scroller, 'touchAction', 'pan-x pan-y');
    // allow native fling while still snapping when close
    if (scroller.style.scrollSnapType !== 'x proximity') {
      scroller.style.scrollSnapType = 'x proximity';
    }
    set(scroller, 'overscrollBehaviorY', 'auto');
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  // Wire dropdowns wherever present
  initDropdown({ button: '#btnAll',    menu: '#allMenu'  });
  initDropdown({ button: '#hamburger', menu: '#megaMenu' });

  // Try to fill menus now…
  await wireHeaderMenus();
  // …and again after the header include finishes (boot.js dispatches this)
  document.addEventListener('includes:ready', () => {
    wireHeaderMenus();
    applyMobileScrollUntrap(); // ensure vertical scroll stays smooth after header injects
  }, { once: true });

  // Scope: run HERO + ROWS ONLY on homepage (has both .hero and main.rows)
  const isHomePage =
    document.querySelector('.hero') !== null &&
    document.querySelector('main.rows') !== null;

  if (!isHomePage) {
    // Not the homepage (e.g., category.html, product.html): do not render rows/banners.
    return;
  }

  // Homepage: hero + rows
  const heroEl = document.querySelector('.hero');
  const isSmallScreen = (window.matchMedia && window.matchMedia('(max-width: 520px)').matches);
  const heroHidden = heroEl ? (getComputedStyle(heroEl).display === 'none') : true;
  const shouldRenderHero = heroEl && !isSmallScreen && !heroHidden;

  if (shouldRenderHero) {
    await renderHeroBanners().catch(e => console.warn('banners failed', e));
  }

  await renderHomeRows().catch(console.warn);

  // Apply after dynamic content is in place
  applyMobileScrollUntrap();

  // Re-apply on viewport class changes (rotate / resize to/from mobile)
  const mm = window.matchMedia('(max-width: 900px)');
  if (mm.addEventListener) {
    mm.addEventListener('change', applyMobileScrollUntrap);
  } else if (mm.addListener) {
    mm.addListener(applyMobileScrollUntrap); // older iOS Safari
  }
});
