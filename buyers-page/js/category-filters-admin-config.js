// buyers-page/js/category-filters-admin-config.js
(function () {
  const CONFIG_TRY = ["/api/admin/filters-config", "/buyers-page/config/filters-config.json"];

  function onlyOnCategoryOrSearch() {
    const p = location.pathname.toLowerCase();
    return p.endsWith("/category.html") || p.endsWith("/search.html");
  }
  function whenReady(){return new Promise(r=>document.readyState!=="loading"?r():document.addEventListener("DOMContentLoaded",r,{once:true}))}
  async function loadConfig(){
    for (const url of CONFIG_TRY){ try{ const res=await fetch(url,{cache:"no-store"}); if(res.ok) return await res.json(); }catch{} }
    return { unavailable_mode:"lock", colors:[], price_bands:[], discounts:[] };
  }
  function rupee(n){ try{ return new Intl.NumberFormat("en-IN").format(n);}catch{return String(n)} }

  // === KEEP: requested group order → Colour → Price → Discount ===
  function reorderFilterGroupsAlphabetically() {
    const firstGroup = document.querySelector('#filters section[data-group]');
    if (!firstGroup) return;
    const parent = firstGroup.parentElement;
    if (!parent) return;

    const sections = Array.from(parent.querySelectorAll(':scope > section[data-group]'));
    if (sections.length < 2) return;

    const ORDER = ["color","price","discount"]; // fixed order
    sections.sort((a, b) => {
      const ai = ORDER.indexOf(a.dataset.group);
      const bi = ORDER.indexOf(b.dataset.group);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    sections.forEach(sec => parent.appendChild(sec));
  }
  // === END KEEP ===

  function render(cfg){
    const filters = document.getElementById("filters");
    if (!filters) return;

    // lock vs hide
    filters.setAttribute("data-unavailable-mode", cfg.unavailable_mode || "lock");
    if (!document.getElementById("cfgHideStyle")) {
      const st = document.createElement("style");
      st.id = "cfgHideStyle";
      st.textContent = '.filters[data-unavailable-mode="hide"] .is-locked{display:none!important;}';
      document.head.appendChild(st);
    }

    // === NEW: remove bullets/markers for colour checklist; keep checkbox + swatch ===
    if (!document.getElementById("cfgChecklistStyle")) {
      const st2 = document.createElement("style");
      st2.id = "cfgChecklistStyle";
      st2.textContent = `
        #filters .checklist{ list-style:none; margin:0; padding-left:0; }
        #filters .checklist li{ list-style:none; }
        #filters .checklist li::marker{ content:''; }
      `;
      document.head.appendChild(st2);
    }
    // === END NEW ===

    // ---------- SORTED VIEWS (display-only; does NOT mutate cfg) ----------
    const colorsSorted = (cfg.colors||[]).slice().sort((a,b)=>{
      const an = (a && a.name!=null ? a.name : String(a||""));
      const bn = (b && b.name!=null ? b.name : String(b||""));
      return an.localeCompare(bn, undefined, { sensitivity:"base", numeric:true });
    });

    // numeric sort: min asc, then max asc; open-ended (max=null) goes last
    const bandsSorted = (cfg.price_bands||[]).slice().sort((a,b)=>{
      const amin = Number.isFinite(+a.min) ? +a.min : 0;
      const bmin = Number.isFinite(+b.min) ? +b.min : 0;
      if (amin !== bmin) return amin - bmin;
      const amax = a.max == null ? Number.POSITIVE_INFINITY : +a.max;
      const bmax = b.max == null ? Number.POSITIVE_INFINITY : +b.max;
      return amax - bmax;
    });

    // % ascending
    const discountsSorted = (cfg.discounts||[]).slice().sort((a,b)=>(a.min??0)-(b.min??0));
    // ----------------------------------------------------------------------

    // Colour
    const colorList = document.querySelector('section[data-group="color"] .checklist');
    if (colorList) {
      colorList.innerHTML = "";
      for (const c of colorsSorted) {
        const name = c.name || String(c);
        const li = document.createElement("li");
        const label = document.createElement("label");
        const input = Object.assign(document.createElement("input"), { type:"checkbox", value:name });
        input.setAttribute("data-filter","color");
        label.appendChild(input);
        if (c.dot) {
          const dot = document.createElement("span");
          dot.className = "color-dot";
          dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:999px;margin:0 6px;background:${c.dot}`;
          label.appendChild(dot);
        } else {
          label.appendChild(document.createTextNode(" "));
        }
        label.appendChild(document.createTextNode(name));
        li.appendChild(label);
        colorList.appendChild(li);
      }
    }

    // Price (now sorted numerically: e.g., 0–199 first, then 0–500, …, Over 3000 last)
    const priceList = document.querySelector('section[data-group="price"] .links');
    if (priceList) {
      priceList.innerHTML = "";
      for (const band of bandsSorted) {
        const li = document.createElement("li");
        const btn = Object.assign(document.createElement("button"), { type:"button", className:"filter-link" });
        btn.setAttribute("data-filter","price");
        if (band.min!=null) btn.dataset.min = String(band.min);
        if (band.max!=null) btn.dataset.max = String(band.max);
        btn.textContent = band.label || (
          band.max==null
            ? `Over ₹${rupee(band.min)}`
            : (band.min===0
                ? `Under ₹${rupee(band.max)}`
                : `₹${rupee(band.min)} – ₹${rupee(band.max)}`
              )
        );
        li.appendChild(btn);
        priceList.appendChild(li);
      }
    }

    // Discount (ascending %)
    const discList = document.querySelector('section[data-group="discount"] .links');
    if (discList) {
      discList.innerHTML = "";
      for (const d of discountsSorted) {
        const li = document.createElement("li");
        const btn = Object.assign(document.createElement("button"), { type:"button", className:"filter-link" });
        btn.setAttribute("data-filter","discount");
        if (d.min!=null) btn.dataset.min = String(d.min);
        btn.textContent = d.label || `${d.min}% Off or more`;
        li.appendChild(btn);
        discList.appendChild(li);
      }
    }

    // Ensure group order
    reorderFilterGroupsAlphabetically();
  }

  (async function boot(){
    if (!onlyOnCategoryOrSearch()) return; // Home page: no filters
    await whenReady();
    const cfg = await loadConfig();
    render(cfg);
  })();
})();
