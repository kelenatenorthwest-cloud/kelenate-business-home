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

document.addEventListener("DOMContentLoaded", async () => {
  // Wire dropdowns wherever present
  initDropdown({ button: '#btnAll',    menu: '#allMenu'  });
  initDropdown({ button: '#hamburger', menu: '#megaMenu' });

  // Try to fill menus now…
  await wireHeaderMenus();
  // …and again after the header include finishes (boot.js dispatches this)
  document.addEventListener('includes:ready', wireHeaderMenus, { once: true });

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
});
