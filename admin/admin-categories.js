// admin-categories.js — Manage categories with full CRUD
const API_CAT = '/api/categories';

async function loadCategoriesUI() {
  const res = await fetch(`${API_CAT}/all`);
  if (!res.ok) {
    document.getElementById('mainCats').innerText = 'Failed to load categories';
    document.getElementById('homeCats').innerText = 'Failed to load categories';
    return;
  }
  const data = await res.json(); // { main: [...], home: [...] }
  renderCategoryList('main', data.main);
  renderCategoryList('home', data.home);
}

function renderCategoryList(type, names) {
  const wrapId = type === 'main' ? 'mainCats' : 'homeCats';
  const wrap = document.getElementById(wrapId);
  wrap.innerHTML = ''; // clear

  names.forEach(name => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="name">${escapeHtml(name)}</span>
      <button class="edit">Edit</button>
      <button class="delete">Delete</button>
      <span class="edit-ui" style="display:none;">
        <input class="new-name" type="text" value="${escapeHtml(name)}" />
        <button class="save">Save</button>
        <button class="cancel">Cancel</button>
      </span>
    `;

    // Delete
    row.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`Delete category "${name}" from ${type}?`)) return;
      const url = `${API_CAT}/${type}/${encodeURIComponent(name)}`;
      const resp = await fetch(url, { method: 'DELETE' });
      if (!resp.ok) {
        alert('Delete failed');
        return;
      }
      await loadCategoriesUI();
    });

    // Edit (show inline UI)
    row.querySelector('.edit').addEventListener('click', () => {
      row.querySelector('.edit-ui').style.display = 'inline-block';
      row.querySelector('.edit').style.display = 'none';
      row.querySelector('.delete').style.display = 'none';
    });

    // Cancel
    row.querySelector('.cancel').addEventListener('click', () => {
      row.querySelector('.edit-ui').style.display = 'none';
      row.querySelector('.edit').style.display = '';
      row.querySelector('.delete').style.display = '';
    });

    // Save (rename)
    row.querySelector('.save').addEventListener('click', async () => {
      const newName = row.querySelector('.new-name').value.trim();
      if (!newName) return alert('New name required');
      const resp = await fetch(`${API_CAT}/rename`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, oldName: name, newName })
      });
      if (!resp.ok) {
        const err = await resp.text();
        alert('Rename failed: ' + err);
        return;
      }
      await loadCategoriesUI();
    });

    wrap.appendChild(row);
  });
}

// Add new category
document.getElementById('addCatBtn').addEventListener('click', async () => {
  const type = document.getElementById('catType').value; // 'main' | 'home'
  const value = document.getElementById('catValue').value.trim();
  if (!value) return alert('Enter category name');
  const resp = await fetch(API_CAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value })
  });
  if (!resp.ok) return alert('Create failed');
  document.getElementById('catValue').value = '';
  await loadCategoriesUI();
});

// helpers
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

// Initial load
loadCategoriesUI();
