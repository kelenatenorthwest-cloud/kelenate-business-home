// buyers-page/js/filters/chips.js
function rupeeN(n){
  try { return new Intl.NumberFormat('en-IN').format(n); }
  catch { return String(n); }
}

export function activePriceLabel(state){
  const { min, max } = state.price || {};
  if (min == null && max == null) return null;
  if (min == null && max != null) return `Under ₹${rupeeN(max)}`;
  if (min != null && max == null) return `Over ₹${rupeeN(min)}`;
  return `₹${rupeeN(min)} – ₹${rupeeN(max)}`;
}

export function activeDiscountLabel(state){
  const d = state.discount?.min;
  if (d == null) return null;
  return `${d}% Off or more`;
}

export function chipEl(text, onX, type='', value=''){
  const wrap = document.createElement('span');
  wrap.className = 'chip';
  if (type) wrap.dataset.filter = type;
  // keep 0 / empty string if passed
  if (value !== undefined) wrap.dataset.value = String(value);

  // Make the whole chip removable with a single click
  wrap.setAttribute('data-action', 'remove');
  wrap.setAttribute('role', 'button');
  wrap.tabIndex = 0;
  wrap.setAttribute('aria-label', `Remove ${text}`);

  const lbl = document.createElement('span');
  lbl.textContent = text;

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'x';
  x.setAttribute('data-action', 'remove'); // for delegated handler
  x.setAttribute('aria-label', `Remove ${text}`);
  x.textContent = '×';

  // Direct handler (works even without delegation)
  x.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    onX && onX();
  });

  wrap.append(lbl, x);
  return wrap;
}

export function renderChips({
  state,
  chipsContainer,
  onClearPrice,
  onClearDiscount,
  onRemoveColor,
  onClearAll // optional
}){
  if (!chipsContainer) return;

  // One-time delegated handlers so removal works reliably (single click).
  if (!chipsContainer.__chipsDelegation){
    const invoke = (chip) => {
      if (!chip) return;
      const act = chip.dataset.action;
      if (act === 'clear-all') {
        chipsContainer.__onClearAll && chipsContainer.__onClearAll();
        return;
      }
      const t = chip.dataset.filter;
      const v = chip.dataset.value;
      if (t === 'color'    && chipsContainer.__onRemoveColor)   chipsContainer.__onRemoveColor(v);
      else if (t === 'price'    && chipsContainer.__onClearPrice)    chipsContainer.__onClearPrice();
      else if (t === 'discount' && chipsContainer.__onClearDiscount) chipsContainer.__onClearDiscount();
    };

    // Prevent duplicate firing between pointerup and click
    let lockUntil = 0;
    const guard = (fn) => (e) => {
      const now = Date.now();
      if (now < lockUntil) return;
      lockUntil = now + 150;
      fn(e);
    };

    // Pointer: single-tap anywhere on the chip
    chipsContainer.addEventListener('pointerup', guard((e) => {
      const chip = e.target.closest('.chip,[data-action]');
      if (!chip) return;
      e.preventDefault(); e.stopPropagation();
      invoke(chip.closest('.chip') || chip); // prefer .chip if present
    }));

    // Fallback/capture for explicit clicks on [data-action] elements
    chipsContainer.addEventListener('click', guard((e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      invoke(el.closest('.chip') || el);
    }));

    // Keyboard accessibility
    chipsContainer.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const chip = e.target.closest('.chip,[data-action]');
      if (!chip) return;
      e.preventDefault(); e.stopPropagation();
      invoke(chip.closest('.chip') || chip);
    });

    chipsContainer.__chipsDelegation = true;
  }

  // Stash callbacks so the delegate can reach them
  chipsContainer.__onClearPrice    = onClearPrice;
  chipsContainer.__onClearDiscount = onClearDiscount;
  chipsContainer.__onRemoveColor   = onRemoveColor;
  chipsContainer.__onClearAll      = onClearAll;

  chipsContainer.innerHTML = '';

  let count = 0;

  (state.colors || []).forEach(color => {
    chipsContainer.appendChild(
      chipEl(`Colour: ${color}`, () => onRemoveColor && onRemoveColor(color), 'color', color)
    );
    count++;
  });

  const pLabel = activePriceLabel(state);
  if (pLabel){
    chipsContainer.appendChild(
      chipEl(`Price: ${pLabel}`, () => onClearPrice && onClearPrice(), 'price', pLabel)
    );
    count++;
  }

  const dLabel = activeDiscountLabel(state);
  if (dLabel){
    chipsContainer.appendChild(
      chipEl(`Discount: ${dLabel}`, () => onClearDiscount && onClearDiscount(), 'discount', dLabel)
    );
    count++;
  }

  // Optional: Clear all control if any chip exists and a handler is provided
  if (count > 0 && typeof onClearAll === 'function'){
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'chip chip--action';
    clearBtn.textContent = 'Clear all';
    clearBtn.setAttribute('data-action', 'clear-all');
    chipsContainer.appendChild(clearBtn);
  }
}
