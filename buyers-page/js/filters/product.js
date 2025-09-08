import { colorsInTitle, normalizeColorName } from './colors.js';

function parseRupees(text){
  const out = [];
  const re = /₹\s*([0-9][0-9,]*)(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export class ProductInfoCache {
  constructor(){ this.map = new WeakMap(); }

  productInfo(card){
    let info = this.map.get(card);
    if (info) return info;

    const title =
      card.querySelector('.title')?.textContent?.trim() ||
      card.getAttribute('aria-label')?.trim() ||
      card.textContent.trim();

    let price = null, mrp = null;

    if (card.dataset.price) {
      const p = parseFloat(card.dataset.price);
      if (Number.isFinite(p)) price = p;
    }
    if (card.dataset.mrp) {
      const m = parseFloat(card.dataset.mrp);
      if (Number.isFinite(m)) mrp = m;
    }

    if (price == null || (mrp == null && !card.dataset.mrp)) {
      const nums = parseRupees(card.textContent);
      if (nums.length === 1) {
        price = price ?? nums[0];
      } else if (nums.length > 1) {
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        price = price ?? min;
        mrp   = mrp ?? (max > min ? max : null);
      }
    }

    const dataColors = String(card.dataset.colors || '')
      .split(/\s+/).filter(Boolean)
      .map(s => normalizeColorName(s));

    const hitSet = colorsInTitle(title || '');
    if (dataColors.length) dataColors.forEach(c => hitSet.add(c));

    info = { title, price, mrp, _colorHits: hitSet };
    this.map.set(card, info);
    return info;
  }

  reset(){ this.map = new WeakMap(); }

  discountPercent(mrp, price){
    if (!Number.isFinite(mrp) || !Number.isFinite(price) || mrp <= 0 || price >= mrp) return 0;
    return ((mrp - price) / mrp) * 100;
  }
}
