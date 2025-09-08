// admin-categories.js — Full UI for listing, adding, renaming, deleting categories
// Works with endpoints provided by the categories service (or monolith):
//   GET  /api/categories?type=main|home
//   GET  /api/categories/all   => { main:[], home:[] }
//   POST /api/categories       => { type, value }
//   PUT  /api/categories/rename => { type, oldName, newName }
//   DELETE /api/categories/:type/:name

const API_CAT = '/api/categories';

// Safe HTML
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Mount function (exposed for index.html safety net)
window.__mountCategories = async function __mountCategories() {
  const root = document.getElementById('section-root');
  root.innerHTML = `
    <div class="card">
      <h2>Categories</h2>
      <p class="muted">Manage both <b>Main</b> and <b>Home</b> categories. Click Edit to rename, Delete to remove.</p>

      <div class="row" style="margin-top:12px;">
        <div class="col-6">
          <h3>Main categories</h3>
          <div id="mainCats"></div>
        </div>
        <div class="col-6">
          <h3>Home categories</h3>
          <div id="homeCats"></div>
        </div>
        <div class="col-12" style="margin-top:16px;">
          <h3>Add category</h3>
          <div class="toolbar">
            <label>Type:
              <select id="catType">
                <option value="main">main</option>
                <option value="home">home</option>
              </select>
            </label>
            <input id="catValue" type="text" placeholder="Category name" />
            <button class="btn" id="addCatBtn">Add</button>
          </div>
          <p class="muted">Tip: Deleting removes the name from the service. Renaming changes the name in-place.</p>
        </div>
      </div>
    </div>
  `;

  // Wire "Add"
  document.getElementById('addCatBtn').addEventListener('click', async () => {
    const type = document.getElementById('catType').value;
    const value = document.getElementById('catValue').value.trim();
    if (!value) return alert('Enter category name');
    const resp = await fetch(API_CAT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, value })
    });
    if (!resp.ok) {
      const t = await resp.text();
      return alert('Create failed: ' + t);
    }
    document.getElementById('catValue').value = '';
    await loadAndRenderCategories();
  });

  await loadAndRenderCategories();
};

// Fetch all and render both lists
async function loadAndRenderCategories() {
  const res = await fetch(`${API_CAT}/all`);
  if (!res.ok) {
    document.getElementById('mainCats').innerText = 'Failed to load categories';
    document.getElementById('homeCats').innerText = 'Failed to load categories';
    return;
  }
  const data = await res.json(); // { main, home }
  renderCategoryList('main', data.main || []);
  renderCategoryList('home', data.home || []);
}

function renderCategoryList(type, names) {
  const wrap = document.getElementById(type === 'main' ? 'mainCats' : 'homeCats');
  wrap.innerHTML = '';

  if (!names.length) {
    wrap.innerHTML = `<p class="muted">No ${type} categories.</p>`;
    return;
  }

  names.forEach((name) => {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <button class="btn secondary edit">Edit</button>
      <button class="btn delete">Delete</button>
      <span class="edit-ui" style="display:none;">
        <input class="new-name" type="text" value="${escapeHtml(name)}" />
        <button class="btn save">Save</button>
        <button class="btn secondary cancel">Cancel</button>
      </span>
    `;

    // Delete
    row.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${name}" from ${type}?`)) return;
      const url = `${API_CAT}/${type}/${encodeURIComponent(name)}`;
      const resp = await fetch(url, { method: 'DELETE' });
      if (!resp.ok) {
        const t = await resp.text();
        alert('Delete failed: ' + t);
        return;
      }
      await loadAndRenderCategories();
    });

    // Show edit UI
    row.querySelector('.edit').addEventListener('click', () => {
      row.querySelector('.edit-ui').style.display = 'inline-flex';
      row.querySelector('.edit').style.display = 'none';
      row.querySelector('.delete').style.display = 'none';
    });

    // Cancel edit
    row.querySelector('.cancel').addEventListener('click', () => {
      row.querySelector('.edit-ui').style.display = 'none';
      row.querySelector('.edit').style.display = '';
      row.querySelector('.delete').style.display = '';
    });

    // Save rename
    row.querySelector('.save').addEventListener('click', async () => {
      const newName = row.querySelector('.new-name').value.trim();
      if (!newName) return alert('New name required');
      const resp = await fetch(`${API_CAT}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, oldName: name, newName })
      });
      if (!resp.ok) {
        const t = await resp.text();
        alert('Rename failed: ' + t);
        return;
      }
      await loadAndRenderCategories();
    });

    wrap.appendChild(row);
  });
}

// Auto-mount if the current active button is "Categories"
document.addEventListener('DOMContentLoaded', () => {
  const active = document.querySelector('.menu button.active')?.dataset.section;
  if (active === 'categories') {
    if (window.__mountCategories) window.__mountCategories();
  }
});
