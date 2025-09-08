import { showRow } from './dom.js';
import { normalizeColorName } from './colors.js';

function setInputAvailability(input, enabled, isSelected, mode){
  const finalEnabled = isSelected ? true : enabled;

  if (mode === 'hide') {
    showRow(input, finalEnabled || isSelected);
    input.disabled = !finalEnabled && !isSelected;
    input.setAttribute('aria-disabled', String(!finalEnabled && !isSelected));
    input.classList.toggle('is-locked', !finalEnabled && !isSelected);
    return;
  }
  input.disabled = !finalEnabled;
  input.setAttribute('aria-disabled', String(!finalEnabled));
  input.classList.toggle('is-locked', !finalEnabled);
  if (!finalEnabled) input.title = 'Not available in current results'; else input.removeAttribute('title');
  showRow(input, true);
}

function setButtonAvailability(btn, enabled, isSelected, mode){
  const finalEnabled = isSelected ? true : enabled;

  if (mode === 'hide') {
    showRow(btn, finalEnabled || isSelected);
    btn.disabled = !finalEnabled && !isSelected;
    btn.setAttribute('aria-disabled', String(!finalEnabled && !isSelected));
    btn.classList.toggle('is-locked', !finalEnabled && !isSelected);
    return;
  }
  btn.disabled = !finalEnabled;
  btn.setAttribute('aria-disabled', String(!finalEnabled));
  btn.classList.toggle('is-locked', !finalEnabled);
  if (!finalEnabled) btn.title = 'Not available in current results'; else btn.removeAttribute('title');
  showRow(btn, true);
}

export function scanAvailabilityAndLock({grid, priceLinks, discountLinks, colorChecks, state, parser, mode}){
  const cards = Array.from(grid.querySelectorAll('.product'));
  if (cards.length === 0) return;

  const availableColors = new Set();
  let allowMulti = false;

  const priceCounts = new Map();     priceLinks.forEach(b => priceCounts.set(b, 0));
  const discountCounts = new Map();  discountLinks.forEach(b => discountCounts.set(b, 0));

  for (const card of cards) {
    if (card.style && card.style.display === 'none') continue;

    const info = parser.productInfo(card);
    const hits = info._colorHits || new Set();

    if (hits.size === 0 || hits.size >= 2) allowMulti = true;
    hits.forEach(c => availableColors.add(normalizeColorName(c)));

    for (const btn of priceLinks) {
      const min = parseFloat(btn.dataset.min);
      const max = parseFloat(btn.dataset.max);
      const p = info.price;
      if (Number.isFinite(p)
          && (isNaN(min) || p >= min)
          && (isNaN(max) || p <= max)) {
        priceCounts.set(btn, (priceCounts.get(btn) || 0) + 1);
      }
    }

    const pct = parser.discountPercent(info.mrp, info.price);
    for (const btn of discountLinks) {
      const min = parseFloat(btn.dataset.min);
      if (isNaN(min) || pct >= min) {
        discountCounts.set(btn, (discountCounts.get(btn) || 0) + 1);
      }
    }
  }

  const selectedColorSet = new Set((state.colors || []).map(v => String(v)));

  for (const cb of colorChecks) {
    const val = normalizeColorName(cb.value);
    const enabled = (val === 'multi') ? allowMulti : availableColors.has(val);
    const isSelected = selectedColorSet.has(cb.value);
    setInputAvailability(cb, enabled, isSelected, mode);
  }

  for (const btn of priceLinks) {
    const enabled = (priceCounts.get(btn) || 0) > 0;
    const isSelected = btn.classList.contains('is-active');
    setButtonAvailability(btn, enabled, isSelected, mode);
  }

  for (const btn of discountLinks) {
    const enabled = (discountCounts.get(btn) || 0) > 0;
    const isSelected = btn.classList.contains('is-active');
    setButtonAvailability(btn, enabled, isSelected, mode);
  }
}
