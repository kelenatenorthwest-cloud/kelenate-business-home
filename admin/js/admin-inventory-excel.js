// admin/js/admin-inventory-excel.js
(function(){
  const $ = (s, r=document)=>r.querySelector(s);

  function ui(){
    const wrap = document.createElement('div');
    wrap.className = 'inv-excel-bar';
    wrap.style.cssText = 'display:flex;gap:12px;align-items:center;margin:8px 0;';
    wrap.innerHTML = `
      <button id="inv-excel-export" class="btn">Export (Excel)</button>
      <button id="inv-csv-export"  class="btn">Export (CSV)</button>
      <label class="btn">
        Import (Excel/CSV)
        <input id="inv-excel-file" type="file" accept=".xlsx,.csv" style="display:none">
      </label>
      <span id="inv-excel-status" class="muted"></span>
    `;
    return wrap;
  }

  async function download(url){
    const a = document.createElement('a');
    a.href = url;
    a.click();
  }

  async function importFile(file){
    const st = $('#inv-excel-status');
    const fd = new FormData();
    fd.append('file', file);
    st.textContent = 'Uploading…';

    const res = await fetch('/api/products/import?mode=update', { method:'POST', body: fd });
    const json = await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(json?.error || 'Import failed');

    st.textContent = `Done. Updated: ${json.updated}  Created: ${json.created}  Skipped: ${json.skipped}  Errors: ${json.errors}`;
    // optionally: trigger a refresh of your inventory list if you have a function for it
    // window.reloadInventory?.();
  }

  window.injectInventoryExcel = function(container){
    const host = container || $('#inventory') || $('#products') || document.querySelector('main') || document.body;
    const bar = ui();
    host.prepend(bar);

    $('#inv-excel-export', bar).addEventListener('click', ()=> download('/api/products/export?format=xlsx'));
    $('#inv-csv-export',  bar).addEventListener('click', ()=> download('/api/products/export?format=csv'));

    $('#inv-excel-file', bar).addEventListener('change', async (e)=>{
      const f = e.target.files?.[0];
      if(!f) return;
      try { await importFile(f); }
      catch(err){ $('#inv-excel-status').textContent = String(err.message||err); }
      e.target.value = '';
    });
  };
})();
