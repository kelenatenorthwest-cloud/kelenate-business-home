// Admin/js/admin-categories.js
(function () {
  async function apiFetch(path, opts) {
    const tries = [`/api${path}`, path];
    let lastErr;
    for (const url of tries) {
      try {
        const r = await fetch(url, opts);
        if (r.ok) return r;
        lastErr = new Error(`${r.status} ${r.statusText}`);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Request failed');
  }

  window.initCategories = function () {
    const $ = (s)=>document.querySelector(s);

    const api = {
      async list(type){ const r=await apiFetch(`/categories?type=${encodeURIComponent(type)}`); return r.json(); },
      async create(type,value){ const r=await apiFetch(`/categories`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,value})}); return r.json(); },
      async rename(type,oldName,newName){ const r=await apiFetch(`/categories/rename`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,oldName,newName})}); return r.json(); },
      async remove(type,name){ const r=await apiFetch(`/categories/${encodeURIComponent(type)}/${encodeURIComponent(name)}`,{method:'DELETE'}); return r.json(); }
    };

    const mainTbody=$('#main-tbody'); if(!mainTbody) return;
    const homeTbody=$('#home-tbody');
    const mainCount=$('#main-count'); const homeCount=$('#home-count');
    const mainFilter=$('#main-filter'); const homeFilter=$('#home-filter');

    let data={main:[],home:[]}; let filters={main:'',home:''};

    async function refresh(){
      const [m,h]=await Promise.all([api.list('main'),api.list('home')]);
      data.main=(m||[]).map(r=>r.name||r.value||r);
      data.home=(h||[]).map(r=>r.name||r.value||r);
      render();
    }

    function renderTable(tbody,items,type){
      tbody.innerHTML='';
      const f=(filters[type]||'').toLowerCase();
      const rows=items.filter(n=>!f||String(n).toLowerCase().includes(f)).sort((a,b)=>String(a).localeCompare(String(b)));
      for(const name of rows){
        const tr=document.createElement('tr');
        const tdName=document.createElement('td'); tdName.textContent=name;

        const tdAct=document.createElement('td');
        const ren=document.createElement('button'); ren.className='btn'; ren.textContent='Rename'; ren.style.marginRight='8px';
        ren.onclick=async()=>{const nn=prompt(`Rename "${name}" to:`,name); if(!nn||nn.trim()===name)return; await api.rename(type,name,nn.trim()); await refresh();};
        const del=document.createElement('button'); del.className='btn danger'; del.textContent='Delete';
        del.onclick=async()=>{if(!confirm(`Delete ${type} category "${name}"?`))return; await api.remove(type,name); await refresh();};

        tdAct.append(ren,del);
        tr.append(tdName,tdAct);
        tbody.appendChild(tr);
      }
    }

    function render(){
      renderTable(mainTbody,data.main,'main');
      renderTable(homeTbody,data.home,'home');
      if(mainCount) mainCount.textContent=`${data.main.length} total`;
      if(homeCount) homeCount.textContent=`${data.home.length} total`;
    }

    document.getElementById('btn-cat-create')?.addEventListener('click', async ()=>{
      const type=document.getElementById('cat-create-type')?.value||'main';
      const name=(document.getElementById('cat-create-name')?.value||'').trim();
      if(!name){alert('Enter a category name');return;}
      await api.create(type,name);
      document.getElementById('cat-create-name').value='';
      await refresh();
    });

    document.getElementById('btn-cat-rename')?.addEventListener('click', async ()=>{
      const type=document.getElementById('cat-rename-type')?.value||'main';
      const oldName=(document.getElementById('cat-rename-old')?.value||'').trim();
      const newName=(document.getElementById('cat-rename-new')?.value||'').trim();
      if(!oldName||!newName){alert('Fill both Old and New');return;}
      await api.rename(type,oldName,newName);
      document.getElementById('cat-rename-old').value='';
      document.getElementById('cat-rename-new').value='';
      await refresh();
    });

    mainFilter?.addEventListener('input', ()=>{ filters.main=mainFilter.value; render(); });
    homeFilter?.addEventListener('input', ()=>{ filters.home=homeFilter.value; render(); });

    refresh().catch(()=>alert('Failed to load categories.'));
  };
})();
