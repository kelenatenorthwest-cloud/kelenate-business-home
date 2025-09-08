// admin/js/admin-amz.js
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }

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
    // Fallback: scan products
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

  function setBullets(arr){
    const ids = ['amz-b1','amz-b2','amz-b3','amz-b4','amz-b5','amz-b6','amz-b7'];
    ids.forEach((id,i)=>{ const el = $('#'+id); if(el) el.value = arr[i] || ''; });
  }

  function collectBullets(){
    const ids = ['amz-b1','amz-b2','amz-b3','amz-b4','amz-b5','amz-b6','amz-b7'];
    return ids.map(id => ($('#'+id)?.value || '').trim()).filter(Boolean).slice(0,7);
  }

  async function onFetch(){
    const url = $('#amz-url').value.trim();
    const status = $('#amz-fetch-status');
    status.textContent = 'Fetching…';
    try{
      const data = await fetchJSON('/api/amazon/import', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ url })
      });

      $('#amz-title').value = data.title || '';
      $('#amz-mrp').value   = data.mrp ?? '';
      $('#amz-price').value = data.price ?? '';
      $('#amz-sku').value   = data.sku || '';
      $('#amz-moq').value   = data.moq || 1;
      $('#amz-desc').value  = (data.description || '').toString();

      // category: try to preselect if exact match exists
      const sel = $('#amz-category');
      const opt = Array.from(sel.options).find(o => o.value.toLowerCase() === String(data.category||'').toLowerCase());
      sel.value = opt ? opt.value : '';

      // images -> URL textarea
      const urlsText = Array.isArray(data.images) ? data.images.join('\n') : '';
      $('#amz-imageUrls').value = urlsText;

      setBullets(Array.isArray(data.bullets) ? data.bullets : []);

      $('#amz-status').value = data.status === 'inactive' ? 'inactive' : 'active';

      status.textContent = 'Fetched ✔ (review and Save)';
    }catch(e){
      status.textContent = 'Failed: ' + (e.message || e);
    }
  }

  async function onSave(e){
    e.preventDefault();
    const status = $('#amz-statusMsg');
    status.textContent = 'Saving…';

    const sku = $('#amz-sku').value.trim();
    const category = $('#amz-category').value.trim();
    if(!sku){ status.textContent='SKU is mandatory'; return; }
    if(!category){ status.textContent='Category is mandatory'; return; }

    const fd = new FormData();
    fd.append('title',       $('#amz-title').value.trim());
    fd.append('mrp',         $('#amz-mrp').value);
    fd.append('price',       $('#amz-price').value);
    fd.append('sku',         sku);
    fd.append('category',    category);
    fd.append('moq',         $('#amz-moq').value || '1');
    fd.append('description', $('#amz-desc').value);
    fd.append('status',      $('#amz-status').value);

    const bullets = collectBullets();
    bullets.forEach((b,i)=> fd.append('bullet' + (i+1), b));

    // URLs
    fd.append('imageUrls', $('#amz-imageUrls').value || '');
    // trigger server-side auto-download into /uploads
    fd.append('autoDownload', '1');

    // optional file uploads
    const imgs = $('#amz-images').files;
    for (let i=0;i<imgs.length;i++) fd.append('images', imgs[i]);
    const vids = $('#amz-videos').files;
    for (let i=0;i<vids.length;i++) fd.append('videos', vids[i]);

    try{
      const res = await fetch('/api/products', { method:'POST', body: fd });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || 'Failed to create product');
      }
      await res.json();
      status.textContent = 'Saved ✔';
      setTimeout(()=> status.textContent='', 1500);
    }catch(e){
      status.textContent = 'Error: ' + (e.message || e);
    }
  }

  function onReset(){
    $('#amz-form').reset();
    $('#amz-moq').value = '1';
    $('#amz-statusMsg').textContent = '';
  }

  window.initAmzUpload = async function(){
    const cats = await loadCategories();
    fillCategorySelect($('#amz-category'), cats);

    $('#amz-fetch')?.addEventListener('click', onFetch);
    $('#amz-form')?.addEventListener('submit', onSave);
    $('#amz-reset')?.addEventListener('click', onReset);
  };
})();
