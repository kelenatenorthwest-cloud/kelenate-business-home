// admin/js/admin-home-sections.js
(function(){
  const $  = (sel, root=document) => root.querySelector(sel);

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    if(!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // ---- Load categories (Main + Home) ----
  async function loadAvailableCategories(){
    const main = await (async ()=>{
      try{
        const r = await fetch('/api/categories?type=main&_=' + Date.now());
        if(!r.ok) return [];
        const data = await r.json();
        return (Array.isArray(data)?data:[]).map(x => {
          if (typeof x === 'string') return x.trim();
          if (x && typeof x === 'object') {
            return (x.name || x.label || x.title || x.category || x.value || x.MainCategory || x.mainCategory || '').toString().trim();
          }
          return '';
        }).filter(Boolean);
      }catch{ return []; }
    })();

    // Try endpoint for home categories; if not available, derive from products
    const home = await (async ()=>{
      try {
        const r = await fetch('/api/categories?type=home&_=' + Date.now());
        if (r.ok) {
          const data = await r.json();
          return (Array.isArray(data)?data:[]).map(x => (typeof x==='string'?x: (x?.name||x?.label||'') )).filter(Boolean).map(s=>s.trim());
        }
      } catch {}
      // Fallback: scan products.homeCategories
      try{
        const products = await fetchJSON('/api/products?_=' + Date.now());
        const set = new Set();
        (Array.isArray(products)?products:[]).forEach(p=>{
          if(Array.isArray(p.homeCategories)) p.homeCategories.forEach(h=>h && set.add(String(h).trim()));
        });
        return Array.from(set);
      }catch{ return []; }
    })();

    // De-dupe & sort
    const all = Array.from(new Set([...main, ...home].map(s => s.trim()).filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b));

    return all;
  }

  function fillSelect(select, items){
    select.innerHTML = '';
    items.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v; opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function getSelectValues(select){
    return Array.from(select.selectedOptions).map(o=>o.value);
  }

  function ensureUnique(list){
    const seen = new Set(); const out=[];
    list.forEach(v => { const k=v.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(v); } });
    return out;
  }

  // ---- State ----
  let available = [];
  let selected  = [];

  async function loadState(){
    available = await loadAvailableCategories();

    // Load existing order if any
    let order = [];
    try {
      const r = await fetchJSON('/api/home-sections-order?_=' + Date.now());
      if (Array.isArray(r.order)) order = r.order.filter(Boolean);
    } catch {}

    // Fallback to legacy keep/pick/freq if order is empty
    if (!order.length) {
      try {
        const conf = await fetchJSON('/api/home-sections?_=' + Date.now());
        order = [conf.keep?.category, conf.pick?.category, conf.freq?.category].filter(Boolean);
      } catch {}
    }

    // Ensure uniqueness, and lose any unknowns
    selected = ensureUnique(order).filter(c => available.some(a => a.toLowerCase() === c.toLowerCase()));
    fillSelect($('#hpsec-available'), available.filter(a => !selected.some(s => s.toLowerCase() === a.toLowerCase())));
    fillSelect($('#hpsec-selected'), selected);
  }

  // ---- Transfer & reorder ----
  function addSelected(){
    const left  = $('#hpsec-available');
    const vals  = getSelectValues(left);
    const rest  = available.filter(a => !vals.includes(a));
    selected = ensureUnique([...selected, ...vals]);
    fillSelect(left, rest.filter(a => !selected.some(s => s.toLowerCase()===a.toLowerCase())));
    fillSelect($('#hpsec-selected'), selected);
  }

  function removeSelected(){
    const right = $('#hpsec-selected');
    const vals  = getSelectValues(right).map(v=>v.toLowerCase());
    selected = selected.filter(s => !vals.includes(s.toLowerCase()));
    fillSelect($('#hpsec-selected'), selected);
    // refresh left with anything not in selected
    fillSelect($('#hpsec-available'), available.filter(a => !selected.some(s => s.toLowerCase()===a.toLowerCase())));
  }

  function move(delta){
    const right = $('#hpsec-selected');
    const idxs = Array.from(right.selectedOptions).map(o => Array.from(right.options).indexOf(o)).sort((a,b)=>a-b);
    if(!idxs.length) return;

    // Move contiguous block
    let first = idxs[0], last = idxs[idxs.length-1];
    if (delta < 0 && first === 0) return;
    if (delta > 0 && last === selected.length-1) return;

    const block = selected.splice(first, idxs.length);
    selected.splice(first + delta, 0, ...block);
    fillSelect(right, selected);

    // Restore selection
    const opts = Array.from(right.options);
    for(let i=0;i<idxs.length;i++){
      const targetIndex = idxs[i] + delta;
      if (opts[targetIndex]) opts[targetIndex].selected = true;
    }
  }

  async function save(e){
    e.preventDefault();
    const status = $('#hpsec-status');
    status.textContent = 'Saving…';
    try{
      await fetchJSON('/api/home-sections-order', {
        method: 'PUT',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ order: selected })
      });
      status.textContent = 'Saved ✔';
      setTimeout(()=>status.textContent='', 1500);
    }catch(err){
      status.textContent = 'Failed: ' + err.message;
    }
  }

  function resetAll(){
    loadState();
    $('#hpsec-status').textContent = '';
  }

  // ---- init ----
  window.initHomeSections = function(){
    $('#btn-add')?.addEventListener('click', addSelected);
    $('#btn-remove')?.addEventListener('click', removeSelected);
    $('#btn-up')?.addEventListener('click', ()=>move(-1));
    $('#btn-down')?.addEventListener('click', ()=>move(+1));
    $('#hpsec-form')?.addEventListener('submit', save);
    $('#btn-reset')?.addEventListener('click', resetAll);
    loadState();
  };
})();
