// buyers-page/js/address-book.js

// ---------- tiny helpers ----------
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Canonical address-book path (where we return after add/edit)
const BOOK_PATH = '/address-book.html';

// Link for the “Add address” tile/button
const addHref = `/add-address.html?return=${encodeURIComponent(BOOK_PATH)}`;

// ---------- fetch util ----------
async function fetchJSON(url, opt) {
  const res = await fetch(url, { credentials: 'include', ...(opt || {}) });
  const t = await res.text();
  let d;
  try { d = t ? JSON.parse(t) : {}; }
  catch { d = { raw: t }; }
  if (!res.ok) throw new Error(d?.error || res.statusText);
  return d;
}

// (kept in case you use it elsewhere)
function shortify(a) {
  const city = [a.city, a.state].filter(Boolean).join(', ');
  return {
    title: a.full_name || '—',
    lines: [
      a.line1, a.line2,
      city ? city : null,
      a.pincode ? String(a.pincode) : null
    ].filter(Boolean)
  };
}

// ---------- UI builders ----------
function card(a) {
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="pad">
      <div class="hd">
        <strong>${a.full_name || '—'}</strong>
        ${a.last_used ? '<span class="tiny muted">Default</span>' : ''}
      </div>
      <div class="muted tiny" style="line-height:1.4;">
        ${[a.line1, a.line2].filter(Boolean).join('<br>')}
        <br>${[a.city, a.state].filter(Boolean).join(', ')} ${a.pincode || ''}
        ${a.phone ? `<br>Phone: ${a.phone}` : ''}
      </div>
    </div>
    <div class="actions">
      <a class="link act-edit" data-id="${a.id}">Edit</a>
      <a class="link act-remove" data-id="${a.id}">Remove</a>
      ${a.last_used ? '' : `<a class="link act-default" data-id="${a.id}">Set as Default</a>`}
    </div>
  `;

  // Edit -> new edit page
  div.querySelector('.act-edit').addEventListener('click', (e) => {
    e.preventDefault();
    location.href =
      `/edit-address.html?id=${encodeURIComponent(a.id)}&return=${encodeURIComponent(BOOK_PATH)}`;
  });

  // Remove
  div.querySelector('.act-remove').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Delete this address?')) return;
    try {
      await fetchJSON(`/api/addresses/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (e2) {
      alert('Could not delete: ' + e2.message);
    }
  });

  // Set default
  const def = div.querySelector('.act-default');
  if (def) def.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await fetchJSON(`/api/addresses/${a.id}/use`, { method: 'POST' });
      await load();
    } catch (e2) {
      alert('Could not set default: ' + e2.message);
    }
  });

  return div;
}

function addTile() {
  const div = document.createElement('div');
  div.className = 'card add-tile';
  div.innerHTML = `
    <div class="pad" style="width:100%;">
      <div style="font-size:42px;line-height:1;">+</div>
      <div style="margin-top:6px;font-weight:600;">Add address</div>
      <div class="tiny muted" style="margin-top:2px;">Create a new delivery address</div>
      <div style="margin-top:10px;">
        <a class="btn" href="${addHref}">Add address</a>
      </div>
    </div>
  `;
  return div;
}

// ---------- load/render ----------
async function load() {
  const grid = $('#addrGrid');
  grid.innerHTML = '';
  try {
    const { items } = await fetchJSON('/api/addresses');
    grid.appendChild(addTile());
    items.forEach((a) => grid.appendChild(card(a)));
  } catch (e) {
    grid.innerHTML = `<div class="muted">Could not load addresses: ${e.message}</div>`;
  }
}

load();
