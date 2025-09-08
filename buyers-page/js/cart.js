// buyers-page/js/cart.js
// Cart page: fetch, render, qty updates, delete.
// Trimmed: removed "Share cart items" & "Save for later" & "EMI" wiring.

const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];

const fmt = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2
});

async function fetchJSON(url, opts){
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

async function getCart(){
  return fetchJSON('/api/cart', { credentials: 'include' });
}

async function patchQty(id, qty){
  return fetchJSON(`/api/cart/items/${id}`, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ qty })
  });
}

async function removeItem(id){
  return fetchJSON(`/api/cart/items/${id}`, {
    method:'DELETE',
    credentials:'include'
  });
}

function itemRow(item){
  const el = document.createElement('div');
  el.className = 'row ai-start';
  el.style.padding = '12px 0';

  el.innerHTML = `
    <div class="img"><img alt=""></div>
    <div style="flex:1;">
      <div class="row jc-between ai-start">
        <div style="max-width:720px;">
          <a class="link item-title" href="/product.html?id=${encodeURIComponent(item.productId || item.id)}">${item.title}</a>
          <div class="tiny muted" style="margin-top:6px;">
            ${item.inStock ? '<span class="pill">In stock</span>' : '<span class="pill" style="background:#fef2f2;color:#991b1b;border-color:#fecaca;">Out of stock</span>'}
          </div>
          <div class="tiny muted" style="margin-top:6px;">
            ${item.color ? `Colour: <b>${item.color}</b>&nbsp;&nbsp;` : ''}
            ${item.pattern ? `Pattern Name: <b>${item.pattern}</b>` : ''}
          </div>
        </div>
        <div class="price item-price">${fmt.format(item.price_cents / 100)}</div>
      </div>

      <div class="row ai-center" style="gap:10px; margin-top:10px;">
        <label class="tiny muted">Qty:</label>
        <select class="qty" data-id="${item.id}">
          ${Array.from({length: 10}, (_,i)=> i+1).map(n => `<option value="${n}" ${n===item.qty?'selected':''}>${n}</option>`).join('')}
        </select>
        <a class="link tiny action-delete" data-id="${item.id}">Delete</a>
      </div>
    </div>
  `;

  const img = el.querySelector('img');
  img.src = item.image || '/img/placeholder.png';
  img.alt = item.title || 'Item';

  // handlers
  el.querySelector('.qty').addEventListener('change', async (e) => {
    const id = Number(e.target.dataset.id);
    const qty = Number(e.target.value);
    e.target.disabled = true;
    try {
      await patchQty(id, qty);
      await loadAndRender();
    } catch (err) {
      alert('Failed to update quantity: ' + err.message);
      e.target.disabled = false;
    }
  });

  el.querySelector('.action-delete').addEventListener('click', async (e) => {
    e.preventDefault();
    const id = Number(e.target.dataset.id);
    if (!confirm('Remove this item from cart?')) return;
    try {
      await removeItem(id);
      await loadAndRender();
    } catch (err) {
      alert('Failed to remove item: ' + err.message);
    }
  });

  return el;
}

function render(cart){
  const list = $('#cartList');
  list.innerHTML = '';

  if (!cart.items?.length){
    $('#emptyCart').style.display = 'block';
  } else {
    $('#emptyCart').style.display = 'none';
    cart.items.forEach(it => list.appendChild(itemRow(it)));
    list.appendChild(Object.assign(document.createElement('div'), { className:'hr' }));
  }

  // RIGHT summary
  $('#count').textContent = String(cart.count || 0);
  $('#subtotal').textContent = cart.subtotal_cents != null
    ? fmt.format(cart.subtotal_cents / 100)
    : '—';

  // LEFT subtotal line (with small divider) — shown only when there are items
  const leftWrap = $('#leftSubWrap');
  if (leftWrap){
    if (cart.items?.length){
      leftWrap.style.display = 'block';
      $('#countLeft').textContent = String(cart.count || 0);
      $('#subtotalLeft').textContent = cart.subtotal_cents != null
        ? fmt.format(cart.subtotal_cents / 100)
        : '—';
    } else {
      leftWrap.style.display = 'none';
    }
  }
}

async function loadAndRender(){
  try {
    const cart = await getCart();
    render(cart);
    // keep header badge in sync
    window.dispatchEvent(new Event('cart:updated'));
  } catch (err) {
    console.warn('[cart] load failed', err);
    $('#cartList').innerHTML = '<div class="muted">Could not load your cart. Try reloading.</div>';
  }
}

function run(){
  loadAndRender();

  // Proceed to buy -> go to checkout (placeholder)
  $('#proceed')?.addEventListener('click', () => {
    location.href = '/checkout.html';
  });
}

run();
