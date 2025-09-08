// admin/js/admin-amz-bulk.js
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);

  // pacing / retry options (tuned for Amazon IN)
  let AMZ_OPTS = {
    baseDelayMs: 2500,   // initial backoff per retry
    maxDelayMs:  20000,  // cap backoff
    jitterMs:    1500,   // random jitter
    userDelayMs: 1200    // extra pause per retry attempt
  };

  let ABORTED = false;

  async function fetchJSON(url, opts){
    const res = await fetch(url, opts);
    if (!res.ok) {
      // propagate readable error
      const msg = await res.text().catch(()=>String(res.status));
      throw new Error(msg || `HTTP ${res.status}`);
    }
    // guard empty bodies (e.g., 204)
    const t = await res.text();
    return t ? JSON.parse(t) : {};
  }

  function text(s){ return (s||'').toString(); }
  const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  async function loadCategories(){
    try{
      const r = await fetch('/api/categories?type=main&_=' + Date.now());
      if(!r.ok) return [];
      const data = await r.json();
      // support {name} or {title}
      return Array.from(new Set((data||[]).map(x => x?.name || x?.title || String(x)).filter(Boolean)));
    }catch{ return []; }
  }

  function fillCategorySelect(sel, cats){
    if (!sel) return;
    const opts = cats.map(n => `<option>${esc(n)}</option>`).join('');
    sel.innerHTML = `<option value="">Select a category</option>${opts}`;
  }

  function esc(s){ return text(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function parseAsins(input){
    const lines = text(input).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const out = [];
    const seen = new Set();
    const reUrl = /(?:dp|gp\/product)\/([A-Z0-9]{8,14})/i;
    const rePure = /^[A-Z0-9]{8,14}$/i;

    for (const line of lines){
      let asin = null;
      if (/^https?:\/\//i.test(line)) {
        const m = line.match(reUrl);
        if (m) asin = m[1].toUpperCase();
      } else if (rePure.test(line)) {
        asin = line.toUpperCase();
      }
      if (asin && !seen.has(asin)) { seen.add(asin); out.push(asin); }
    }
    return out;
  }

  // NEW: build row with a "Fields" cell (Title/MRP/Price/Images pills)
  function rowEl(asin){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="nowrap mono">${esc(asin)}</td>
      <td class="nowrap amzb-status">Pending</td>
      <td class="amzb-fields">
        <div class="cell-stats">
          <span class="pill wait" data-key="title"  title="Waiting"><span class="dot"></span>Title</span>
          <span class="pill wait" data-key="mrp"    title="Waiting"><span class="dot"></span>MRP</span>
          <span class="pill wait" data-key="price"  title="Waiting"><span class="dot"></span>Price</span>
          <span class="pill wait" data-key="images" title="Waiting"><span class="dot"></span>Images</span>
        </div>
      </td>
      <td class="amzb-msg muted"></td>
    `;
    return tr;
  }

  function setRow(tr, status, msg){
    tr.querySelector('.amzb-status').textContent = status;
    tr.querySelector('.amzb-msg').textContent = msg || '';
  }

  // pill helpers
  function setField(tr, key, state, tip){
    const el = tr.querySelector(`.amzb-fields .pill[data-key="${key}"]`);
    if (!el) return;
    el.classList.remove('ok','warn','err','wait','info');
    el.classList.add(state || 'wait');
    if (tip) el.title = tip;
  }

  function setAllFields(tr, state, tip){
    ['title','mrp','price','images'].forEach(k => setField(tr, k, state, tip));
  }

  // sanity gate – require at least a title or an image
  function sane(d){
    const titleOk = (d && typeof d.title === 'string' && d.title.trim().length >= 2);
    const imgsOk  = Array.isArray(d?.images) && d.images.length > 0;
    return titleOk || imgsOk;
  }

  // --- strict required fields (Title, MRP, Price, Images (non-gif)) ---
  function requiredFieldsStatus(d){
    const missing = [];

    const titleOk = (d && typeof d.title === 'string' && d.title.trim().length >= 2);
    if (!titleOk) missing.push('Title');

    const mrpNum   = toNum(d?.mrp);
    const mrpOk    = mrpNum != null && mrpNum > 0;
    if (!mrpOk) missing.push('MRP');

    const priceNum = toNum(d?.price);
    const priceOk  = priceNum != null && priceNum > 0;
    if (!priceOk) missing.push('Price');

    const origImgs = Array.isArray(d?.images) ? d.images : [];
    const imgs = origImgs.filter(u => u && !/\.gif(?:$|\?)/i.test(String(u)));
    const imgsOk = imgs.length > 0;
    if (!imgsOk) missing.push('Images');

    const imagesFiltered = imgs;
    const hadGif = origImgs.length > imgs.length;

    return {
      ok: missing.length === 0,
      missing,
      filteredImages: imagesFiltered,
      hadGif,
      mrpNum,
      priceNum
    };
  }

  // --- check if a SKU already exists on the server (tries several API shapes) ---
  async function skuExists(sku){
    const key = String(sku || '').trim().toUpperCase();
    if (!key) return false;

    // 1) dedicated exists endpoint (if available)
    try{
      const r = await fetch(`/api/products/exists?sku=${encodeURIComponent(key)}&_=${Date.now()}`);
      if (r.ok) {
        const d = await r.json().catch(()=>null);
        if (d && typeof d.exists === 'boolean') return !!d.exists;
        if (Array.isArray(d)) return d.some(p => String(p?.sku||'').toUpperCase() === key);
      }
    }catch{}

    // 2) filtered by sku
    try{
      const r = await fetch(`/api/products?sku=${encodeURIComponent(key)}&_=${Date.now()}`);
      if (r.ok) {
        const d = await r.json().catch(()=>null);
        if (Array.isArray(d)) return d.some(p => String(p?.sku||'').toUpperCase() === key);
        if (d && Array.isArray(d.items)) return d.items.some(p => String(p?.sku||'').toUpperCase() === key);
      }
    }catch{}

    // 3) search param
    try{
      const r = await fetch(`/api/products?search=${encodeURIComponent(key)}&_=${Date.now()}`);
      if (r.ok) {
        const d = await r.json().catch(()=>null);
        if (Array.isArray(d)) return d.some(p => String(p?.sku||'').toUpperCase() === key);
        if (d && Array.isArray(d.items)) return d.items.some(p => String(p?.sku||'').toUpperCase() === key);
      }
    }catch{}

    // 4) fallback: fetch all (worst-case)
    try{
      const r = await fetch(`/api/products?_=${Date.now()}`);
      if (r.ok) {
        const d = await r.json().catch(()=>null);
        if (Array.isArray(d)) return d.some(p => String(p?.sku||'').toUpperCase() === key);
        if (d && Array.isArray(d.items)) return d.items.some(p => String(p?.sku||'').toUpperCase() === key);
      }
    }catch{}

    return false;
  }

  // Retry-until-data (sequential pacing); returns parsed object with at least a title or images
  async function importOne(marketBase, asin){
    let attempt = 0;
    let delay = Math.max(1500, AMZ_OPTS.baseDelayMs|0);
    const maxDelay = Math.max(delay, AMZ_OPTS.maxDelayMs|0);
    const jitter = Math.max(0, AMZ_OPTS.jitterMs|0);
    const userGap = Math.max(0, AMZ_OPTS.userDelayMs|0);

    const url = `${String(marketBase||'').replace(/\/$/,'')}/dp/${asin}`;

    // eslint-disable-next-line no-constant-condition
    while (true){
      if (ABORTED) throw new Error('aborted');
      attempt++;
      try{
        const data = await fetchJSON('/api/amazon/import', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ url })
        });

        if (sane(data)) {
          // Trim extremely long description to keep payloads sane (optional)
          if (typeof data.description === 'string' && data.description.length > 100000) {
            data.description = data.description.slice(0, 100000) + '…';
          }
          return data;
        }
        // fallthrough to retry
      }catch(e){
        // If Amazon bot wall hinted, increase backoff more aggressively
        if (/\b(429|captcha|robot|automated access)\b/i.test(String(e.message||''))) {
          delay = Math.min(maxDelay, Math.floor(delay * 1.6));
        }
      }
      const wait = delay + Math.floor(Math.random() * jitter) + userGap;
      await new Promise(r => setTimeout(r, wait));
      delay = Math.min(maxDelay, Math.floor(delay * 1.3));
    }
  }

  async function createOne(category, data){
    const fd = new FormData();
    // ensure minimums
    const ttl = text(data.title).trim();
    const sku = text(data.sku || data.asin || '').trim();

    fd.append('title',       ttl || (sku || ''));
    if (data.mrp   != null) fd.append('mrp',   String(data.mrp));
    if (data.price != null) fd.append('price', String(data.price));
    fd.append('sku',         sku);
    fd.append('category',    text(category));
    fd.append('moq',         '1');
    fd.append('description', text(data.description || ''));
    fd.append('status',      'active');

    // bullets (max 7)
    const bullets = Array.isArray(data.bullets) ? data.bullets : [];
    bullets.slice(0,7).forEach((b,i)=> fd.append('bullet' + (i+1), text(b)));

    // image URLs — server filters .gif on import; we also filtered client-side via requiredFieldsStatus
    const images = Array.isArray(data.images) ? data.images : [];
    if (images.length) fd.append('imageUrls', images.join('\n'));

    // trigger server-side auto-download into /uploads
    fd.append('autoDownload', '1');

    const res = await fetch('/products', { method:'POST', body: fd });
    if (!res.ok) throw new Error((await res.text()).slice(0,500));
    return res.json();
  }

  // NEW: overall progress bar updater
  function setProgress(done, total){
    const bar = $('#amzb-progress-bar');
    if (!bar || !total) return;
    const pct = Math.max(0, Math.min(100, Math.round((done/total)*100)));
    bar.style.width = pct + '%';
  }

  window.initAmzBulk = async function(){
    const selCategory = $('#amzb-category');
    const selMarket   = $('#amzb-market');
    const txtInput    = $('#amzb-input');
    const btnStart    = $('#amzb-start');
    const btnStop     = $('#amzb-stop');
    const btnReset    = $('#amzb-reset');

    const tbody       = $('#amzb-tbody');
    const status      = $('#amzb-status');
    const elTotal     = $('#amzb-total');
    const elCount     = $('#amzb-count');
    const elOK        = $('#amzb-ok');
    const elSkip      = $('#amzb-skip');
    const elErr       = $('#amzb-err');

    // load categories
    const cats = await loadCategories();
    fillCategorySelect(selCategory, cats);

    ABORTED = false;

    btnReset?.addEventListener('click', ()=>{
      txtInput.value = '';
      tbody.innerHTML = '';
      status.textContent = 'Idle';
      elTotal.textContent = '0';
      elCount.textContent = '0';
      elOK.textContent = '0';
      elSkip.textContent = '0';
      elErr.textContent = '0';
      setProgress(0, 1);
      ABORTED = false;
    });

    btnStop?.addEventListener('click', ()=>{ ABORTED = true; status.textContent = 'Stopping…'; });

    btnStart?.addEventListener('click', async ()=>{
      const category = text(selCategory?.value).trim();
      if (!category) { alert('Please select a Category'); return; }

      const asins = parseAsins(txtInput?.value || '');
      if (!asins.length) { alert('Please enter at least one ASIN or Amazon URL'); return; }

      // build rows
      tbody.innerHTML = '';
      const rows = new Map();
      asins.forEach(a => rows.set(a, tbody.appendChild(rowEl(a))));

      elTotal.textContent = String(asins.length);
      elCount.textContent = '0';
      elOK.textContent = '0';
      elSkip.textContent = '0';
      elErr.textContent = '0';
      setProgress(0, asins.length);
      status.textContent = 'Running…';
      ABORTED = false;

      const marketBase = text(selMarket?.value || 'https://www.amazon.in');

      // run strictly sequential to stay under the radar
      let done = 0, ok = 0, err = 0, skip = 0;
      for (const asin of asins){
        if (ABORTED) break;
        const tr = rows.get(asin);

        let skipped = false;
        try{
          // Reset pills to waiting
          setAllFields(tr, 'wait', 'Waiting');

          // --- pre-check SKU (ASIN) existence ---
          setRow(tr, 'Checking…', '');
          const exists = await skuExists(asin);
          if (exists) {
            skipped = true;
            skip++;
            setRow(tr, 'Skipped', 'SKU exists');
            setAllFields(tr, 'info', 'Skipped: already exists');
          } else {
            setRow(tr, 'Importing…', '');
            const data = await importOne(marketBase, asin); // retries until sane or stopped

            // evaluate fields (coerce numbers)
            const ttlOk = (data && typeof data.title === 'string' && data.title.trim().length >= 2);
            setField(tr, 'title', ttlOk ? 'ok' : 'err', ttlOk ? 'Title fetched' : 'Missing Title');

            const mrpNum   = toNum(data?.mrp);
            const mrpOk    = mrpNum != null && mrpNum > 0;
            setField(tr, 'mrp', mrpOk ? 'ok' : 'err', mrpOk ? `MRP: ${mrpNum}` : 'Missing/Invalid MRP');

            const priceNum = toNum(data?.price);
            const priceOk  = priceNum != null && priceNum > 0;
            setField(tr, 'price', priceOk ? 'ok' : 'err', priceOk ? `Price: ${priceNum}` : 'Missing/Invalid Price');

            const { ok: okReq, missing, filteredImages, hadGif } = requiredFieldsStatus(data);
            if (filteredImages) {
              const imgState = filteredImages.length > 0 ? (hadGif ? 'warn' : 'ok') : 'err';
              const tip = filteredImages.length > 0
                ? (hadGif ? `Images: ${filteredImages.length} (GIFs removed)` : `Images: ${filteredImages.length}`)
                : 'No valid images';
              setField(tr, 'images', imgState, tip);
            } else {
              setField(tr, 'images', 'err', 'No images');
            }

            if (!okReq) {
              skipped = true;
              skip++;
              setRow(tr, 'Skipped', 'Missing: ' + missing.join(', '));
            } else {
              if (!data.sku) data.sku = asin;
              data.images = filteredImages;
              data.mrp   = mrpNum;
              data.price = priceNum;

              setRow(tr, 'Creating…', '');
              await createOne(category, data);
              ok++; setRow(tr, 'OK', '');
            }
          }
        }catch(e){
          if (String(e.message||e).toLowerCase().includes('aborted')) {
            setRow(tr, 'Stopped', '');
          } else {
            err++; setRow(tr, 'Error', String(e.message||e).replace(/<[^>]+>/g,'').slice(0,500));
            setAllFields(tr, 'err', 'Fetch/Create error');
          }
        }finally{
          done++;
          elCount.textContent = String(done);
          elOK.textContent    = String(ok);
          elErr.textContent   = String(err);
          elSkip.textContent  = String(skip);
          setProgress(done, asins.length);
          const gap = skipped ? 200 : (800 + Math.floor(Math.random()*700));
          if (!ABORTED) await new Promise(r => setTimeout(r, gap));
        }
      }

      status.textContent = ABORTED ? 'Stopped' : 'Finished';
    });
  };
})();
