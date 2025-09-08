// admin/js/admin-add.js
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  let EDIT_ID = null; // set by inventory via window._editProductId

  async function fetchJSON(url, opts){ const r=await fetch(url, opts); if(!r.ok) throw new Error(await r.text()); return r.json(); }

  async function loadCategories(){
    try{
      const r = await fetch('/api/categories?type=main&_=' + Date.now());
      if(r.ok){
        const data = await r.json();
        const labels = Array.from(new Set(
          (Array.isArray(data)?data:[]).map(x=>{
            if(typeof x==='string') return x.trim();
            if(x && typeof x==='object'){
              return (x.name||x.label||x.title||x.category||x.value||x.mainCategory||x.MainCategory||'').toString().trim();
            }
            return '';
          }).filter(Boolean)
        )).sort((a,b)=>a.localeCompare(b));
        return labels;
      }
    }catch{}
    try{
      const list = await fetchJSON('/api/products?_=' + Date.now());
      const set = new Set();
      (Array.isArray(list)?list:[]).forEach(p=>{
        const v = (p.category || p.mainCategory || '').toString().trim();
        if(v) set.add(v);
      });
      return Array.from(set).sort((a,b)=>a.localeCompare(b));
    }catch{ return []; }
  }

  function fillCategorySelect(sel, cats){
    sel.innerHTML = '<option value="">-- Select a category --</option>';
    cats.forEach(c=>{
      const opt=document.createElement('option');
      opt.value=c; opt.textContent=c;
      sel.appendChild(opt);
    });
  }

  function collectBullets(){
    const ids = ['ap-b1','ap-b2','ap-b3','ap-b4','ap-b5','ap-b6','ap-b7'];
    return ids.map(id => ($( '#' + id )?.value || '').trim()).filter(Boolean).slice(0,7);
  }

  function setBullets(arr){
    const ids = ['ap-b1','ap-b2','ap-b3','ap-b4','ap-b5','ap-b6','ap-b7'];
    ids.forEach((id,i)=>{ const el=$('#'+id); if(el) el.value = (arr && arr[i]) ? arr[i] : ''; });
  }

  async function loadForEdit(id){
    try{
      const p = await fetchJSON('/api/products/' + encodeURIComponent(id) + '?_=' + Date.now());
      $('#ap-title').value = p.title || '';
      $('#ap-mrp').value   = p.mrp ?? '';
      $('#ap-price').value = p.price ?? '';
      $('#ap-sku').value   = p.sku || '';
      $('#ap-moq').value   = p.moq || 1;
      $('#ap-desc').value  = (p.description || '').toString();
      $('#ap-status').value = p.status === 'inactive' ? 'inactive' : 'active';

      // category select
      const sel = $('#ap-category');
      const opt = Array.from(sel.options).find(o => o.value.toLowerCase() === String(p.category||'').toLowerCase());
      sel.value = opt ? opt.value : '';

      setBullets(Array.isArray(p.bullets) ? p.bullets : []);

      // show existing image URLs for convenience
      const urlsText = Array.isArray(p.images) ? p.images.join('\n') : (p.image || '');
      $('#ap-imageUrls').value = urlsText;

      // UI cosmetics
      const titleH = document.querySelector('#page-title');
      if (titleH) titleH.textContent = 'Edit Product';
      const btn = document.querySelector('#addp-form .btn.primary');
      if (btn) btn.textContent = 'Update product';
    }catch(e){
      console.error('Edit load failed', e);
    }
  }

  async function onSubmit(e){
    e.preventDefault();
    const statusEl = $('#ap-statusMsg');
    statusEl.textContent = EDIT_ID ? 'Updating…' : 'Saving…';

    const sku = $('#ap-sku').value.trim();
    const category = $('#ap-category').value.trim();
    if(!sku) { statusEl.textContent='SKU is mandatory'; return; }
    if(!category) { statusEl.textContent='Category is mandatory'; return; }

    const fd = new FormData();
    fd.append('title',       $('#ap-title').value.trim());
    fd.append('mrp',         $('#ap-mrp').value);
    fd.append('price',       $('#ap-price').value);
    fd.append('sku',         sku);
    fd.append('category',    category);
    fd.append('moq',         $('#ap-moq').value || '1');
    fd.append('description', $('#ap-desc').value);
    fd.append('status',      $('#ap-status').value);

    const bullets = collectBullets();
    bullets.forEach((b,i)=> fd.append('bullet' + (i+1), b));

    // URL list (leave empty if you want to keep existing on edit)
    fd.append('imageUrls', $('#ap-imageUrls').value || '');

    // files (leave empty to keep existing on edit)
    const imgs = $('#ap-images').files;
    for (let i=0; i<imgs.length; i++) fd.append('images', imgs[i]);
    const vids = $('#ap-videos').files;
    for (let i=0; i<vids.length; i++) fd.append('videos', vids[i]);

    try{
      const url = EDIT_ID ? ('/api/products/' + encodeURIComponent(EDIT_ID)) : '/api/products';
      const method = EDIT_ID ? 'PUT' : 'POST';
      const res = await fetch(url, { method, body: fd });
      if(!res.ok){
        const text = await res.text();
        throw new Error(text || 'Failed');
      }
      await res.json();
      statusEl.textContent = EDIT_ID ? 'Updated ✔' : 'Created ✔';

      if (!EDIT_ID) {
        // create flow: soft reset (keep selected category)
        const keepCat = $('#ap-category').value;
        $('#addp-form').reset();
        $('#ap-category').value = keepCat;
      }
      setTimeout(()=> statusEl.textContent='', 1500);
      // clear edit flag after a successful update
      if (EDIT_ID) { window._editProductId = null; EDIT_ID = null; }
    }catch(err){
      statusEl.textContent = 'Error: ' + (err.message || err);
    }
  }

  function onReset(){
    $('#addp-form').reset();
    $('#ap-moq').value = '1';
    $('#ap-statusMsg').textContent = '';
    if (EDIT_ID) { window._editProductId = null; EDIT_ID = null; }
  }

  window.initAddProduct = async function(){
    const cats = await loadCategories();
    fillCategorySelect($('#ap-category'), cats);

    $('#addp-form')?.addEventListener('submit', onSubmit);
    $('#ap-reset')?.addEventListener('click', onReset);

    EDIT_ID = window._editProductId || null;
    if (EDIT_ID) await loadForEdit(EDIT_ID);
  };
})();
