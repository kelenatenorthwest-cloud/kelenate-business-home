// buyers-page/js/header-loader.js
(function(){
  const API_BASE = (location.origin && location.origin.startsWith("http")) ? location.origin : "http://localhost:4000";
  const $  = (s, r=document)=>r.querySelector(s);
  const el = (t,a={},c=[])=>{
    const n=document.createElement(t);
    for (const [k,v] of Object.entries(a)){
      k==='class' ? n.className=v
      : k==='html' ? n.innerHTML=v
      : n.setAttribute(k,v);
    }
    (Array.isArray(c)?c:[c]).forEach(x=>n.appendChild(x instanceof Node?x:document.createTextNode(String(x))));
    return n;
  };
  function _catLabel(item){
    if(item==null) return "";
    if(typeof item==="string") return item;
    if(typeof item==="object"){
      const k=["name","label","title","category","value","MainCategory","mainCategory"]
        .find(K=>Object.prototype.hasOwnProperty.call(item,K) && item[K]);
      return k ? String(item[k]) : String(item);
    }
    return String(item);
  }

  async function getJSON(u){
    const r=await fetch(u);
    if(!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async function getMainCategories(){
    try{
      const data = await getJSON(`${API_BASE}/api/categories?type=main&_=${Date.now()}`);
      if(Array.isArray(data) && data.length){
        return Array.from(new Set(data.map(s=>_catLabel(s).trim()).filter(Boolean)))
          .sort((a,b)=>a.localeCompare(b));
      }
    }catch{}
    // fallback via products
    try{
      const all = await getJSON(`${API_BASE}/api/products?_=${Date.now()}`);
      const set=new Set();
      all.forEach(p=>p?.mainCategory && set.add(String(p.mainCategory).trim()));
      return Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    }catch{
      return [];
    }
  }

  function initDropdown({button, menu}) {
    const btn=$(button), panel=$(menu);
    if(!btn || !panel) return;
    let open=false;

    btn.addEventListener('click', e=>{
      e.preventDefault();
      open=!open;
      panel.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });

    // Close when clicking outside both the panel and the button (including icons within the button)
    document.addEventListener('click', e=>{
      if (!panel.contains(e.target) && !btn.contains(e.target)){
        open=false;
        panel.classList.remove('is-open');
        btn.setAttribute('aria-expanded','false');
      }
    });
  }

  function fillMenuWithCategories(ul, categories){
    if(!ul) return;
    const cats = Array.from(new Set((categories||[])
      .map(s=>_catLabel(s).trim())
      .filter(Boolean)))
      .sort((a,b)=>a.localeCompare(b));

    // IMPORTANT: Only replace content if we actually have categories.
    // This preserves the fallback items from fragments/header.html for desktop hover.
    if (cats.length === 0) return;

    ul.innerHTML = "";
    cats.forEach(label=>{
      const li = el("li", {}, el("a", { href: `category.html?type=main&value=${encodeURIComponent(label)}` }, label));
      ul.appendChild(li);
    });
  }

  async function mountHeader(){
    const mount = document.getElementById('site-header');
    if(!mount) return;

    // Load header fragment
    const res = await fetch('/fragments/header.html', { cache: 'no-store' });
    mount.innerHTML = await res.text();

    // Init dropdowns (works for both mobile click and desktop focus/hover CSS)
    initDropdown({ button:'#btnAll',    menu:'#allMenu'  });
    initDropdown({ button:'#hamburger', menu:'#megaMenu' });

    // Try to fetch categories; if none/error, keep the fallback content intact
    try{
      const categories = await getMainCategories();
      fillMenuWithCategories($('#allMenu ul'), categories);
      fillMenuWithCategories($('#megaMenu ul'), categories);
    }catch{
      // silently keep fallback
    }
  }

  document.addEventListener('DOMContentLoaded', mountHeader);
})();
