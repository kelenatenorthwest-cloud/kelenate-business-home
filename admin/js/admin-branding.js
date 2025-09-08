// admin/js/admin-branding.js
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  async function fetchJSON(url, opts) {
    console.debug('[branding] fetchJSON', url, opts || {});
    const res = await fetch(url, opts);
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    console.debug('[branding] response', res.status, data);
    if (!res.ok) throw new Error(typeof data === 'string' ? data : (data.error || JSON.stringify(data)));
    return data;
  }

  function setPreview(src) {
    const img = $('#brandingPreview');
    const empty = $('#brandingEmpty');
    const urlLabel = $('#brandingUrl');
    if (src) {
      if (img) { img.src = src; img.style.display = 'block'; }
      if (empty) empty.style.display = 'none';
      if (urlLabel) urlLabel.textContent = src;
    } else {
      if (img) { img.removeAttribute('src'); img.style.display = 'none'; }
      if (empty) empty.style.display = 'inline';
      if (urlLabel) urlLabel.textContent = '';
    }
  }

  function hexify(v){ if(!v) return ''; const s=String(v).trim(); return /^#?[0-9a-f]{6}$/i.test(s)?(s.startsWith('#')?s:'#'+s):s; }
  function isHex6(v){ return /^#?[0-9a-f]{6}$/i.test(String(v||'').trim()); }
  const norm = (v)=> (v?hexify(v).toLowerCase():'');
  const eq   = (a,b)=> norm(a)===norm(b);

  function setPair(colorId, textId, value, fallback) {
    const colorEl = $(colorId), textEl = $(textId);
    const v = hexify(value) || fallback;
    if (colorEl) colorEl.value = isHex6(v) ? hexify(v) : hexify(fallback);
    if (textEl)  textEl.value = v || '';
    return v;
  }

  // keep track of initial values to know if user changed only the fallback
  const initial = { headerText:'', tiny:'', strong:'' };

  function applyPreview({ headerBg, headerText, headerTextTiny, headerTextStrong, subnavBg, subnavText }) {
    const ph = $('#previewHeader');
    const ps = $('#previewSubnav');
    if (ph) {
      if (headerBg)   ph.style.background = headerBg;
      if (headerText) ph.style.color = headerText;
      const tinyEl = ph.querySelector('.tiny');
      const strongEl = ph.querySelector('.strong');
      if (tinyEl)   tinyEl.style.color   = headerTextTiny   || headerText;
      if (strongEl) strongEl.style.color = headerTextStrong || headerText;
    }
    if (ps) {
      if (subnavBg)   ps.style.background = subnavBg;
      if (subnavText) ps.style.color      = subnavText;
    }
  }

  async function loadSettings() {
    try {
      const s = await fetchJSON('/api/site-settings?_=' + Date.now());
      setPreview(s.header_logo || '');

      const headerBg = setPair('#colorHeaderBg', '#colorHeaderBgText',
        s.header_color || s.header_top_color || '#131921', '#131921');
      const subnavBg = setPair('#colorSubnavBg', '#colorSubnavBgText',
        s.nav_color || s.header_subnav_color || '#232f3e', '#232f3e');

      const headerText = setPair('#colorHeaderText', '#colorHeaderTextHex',
        s.header_text_color || '#000000', '#000000');
      const subnavText = setPair('#colorSubnavText', '#colorSubnavTextHex',
        s.nav_text_color || '#000000', '#000000');

      const headerTextTiny   = setPair('#colorHeaderTextTiny',   '#colorHeaderTextTinyHex',
        s.header_text_small  || s.header_text_color || headerText, headerText);
      const headerTextStrong = setPair('#colorHeaderTextStrong', '#colorHeaderTextStrongHex',
        s.header_text_strong || s.header_text_color || headerText, headerText);

      // snapshot initial values
      initial.headerText = headerText;
      initial.tiny       = headerTextTiny;
      initial.strong     = headerTextStrong;

      applyPreview({ headerBg, headerText, headerTextTiny, headerTextStrong, subnavBg, subnavText });
    } catch (e) {
      console.warn('[branding] loadSettings failed', e);
      setPreview('');
    }
  }

  async function saveLogo() {
    try {
      const file = $('#brandingFile')?.files?.[0];
      const url  = ($('#brandingLink')?.value || '').trim();
      const fd = new FormData();
      if (file) fd.append('logo', file);
      if (!file && url) fd.append('logoUrl', url);
      if (!file && !url) { alert('Please choose a file or paste a URL.'); return; }
      const result = await fetchJSON('/api/site-settings/logo', { method:'POST', body: fd });
      setPreview(result.header_logo || '');
      if ($('#brandingFile')) $('#brandingFile').value = '';
      if ($('#brandingLink')) $('#brandingLink').value = '';
      alert('Logo saved.');
    } catch (e) {
      alert('Failed to save logo: ' + e.message);
    }
  }

  function readPair(colorId, textId) {
    const hex = $(textId)?.value?.trim();
    if (hex && isHex6(hex)) return hexify(hex);
    const color = $(colorId)?.value?.trim();
    return color ? hexify(color) : '';
  }

  async function saveColors() {
    const statusEl = $('#brandingColorStatus');
    const setStatus = (msg, ok=false) => { if(!statusEl) return; statusEl.textContent = msg; statusEl.style.color = ok?'green':'#6b7280'; };

    const headerBg   = readPair('#colorHeaderBg',   '#colorHeaderBgText');
    const headerText = readPair('#colorHeaderText', '#colorHeaderTextHex');
    const subnavBg   = readPair('#colorSubnavBg',   '#colorSubnavBgText');
    const subnavText = readPair('#colorSubnavText', '#colorSubnavTextHex');

    const tinyRaw   = readPair('#colorHeaderTextTiny',   '#colorHeaderTextTinyHex');
    const strongRaw = readPair('#colorHeaderTextStrong', '#colorHeaderTextStrongHex');

    const fallbackChanged = !eq(headerText, initial.headerText);

    // Only send per-line if user changed them OR if they differ from the fallback
    let headerTextSmall  = null;
    let headerTextStrong = null;

    if (fallbackChanged) {
      // if fallback changed and user didn't touch per-line fields, clear them (omit)
      if (tinyRaw   && !eq(tinyRaw,   initial.tiny))   headerTextSmall  = tinyRaw;
      if (strongRaw && !eq(strongRaw, initial.strong)) headerTextStrong = strongRaw;
    } else {
      if (tinyRaw   && !eq(tinyRaw,   headerText)) headerTextSmall  = tinyRaw;
      if (strongRaw && !eq(strongRaw, headerText)) headerTextStrong = strongRaw;
    }

    // live preview with effective values
    applyPreview({
      headerBg, headerText,
      headerTextTiny:   headerTextSmall  || headerText,
      headerTextStrong: headerTextStrong || headerText,
      subnavBg, subnavText
    });

    try {
      setStatus('Saving…');
      const body = {};
      if (headerBg)   body.header = headerBg;
      if (subnavBg)   body.nav = subnavBg;
      if (headerText) body.header_text_color = headerText;
      if (subnavText) body.nav_text_color = subnavText;
      if (headerTextSmall  != null) body.header_text_small  = headerTextSmall;
      if (headerTextStrong != null) body.header_text_strong = headerTextStrong;

      await fetchJSON('/api/site-settings/colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Update our "initial" snapshot to what we just saved (effective values)
      initial.headerText = headerText;
      initial.tiny       = headerTextSmall  || headerText;
      initial.strong     = headerTextStrong || headerText;

      setStatus('Saved ✓', true);
    } catch (e) {
      setStatus('Save failed: ' + e.message);
      alert('Failed to save colors: ' + e.message);
    }
  }

  function wireColorSync() {
    const pairs = [
      ['#colorHeaderBg',          '#colorHeaderBgText',          'headerBg'],
      ['#colorHeaderText',        '#colorHeaderTextHex',         'headerText'],
      ['#colorHeaderTextTiny',    '#colorHeaderTextTinyHex',     'headerTextTiny'],
      ['#colorHeaderTextStrong',  '#colorHeaderTextStrongHex',   'headerTextStrong'],
      ['#colorSubnavBg',          '#colorSubnavBgText',          'subnavBg'],
      ['#colorSubnavText',        '#colorSubnavTextHex',         'subnavText'],
    ];
    pairs.forEach(([pickerId, textId, key]) => {
      const picker = $(pickerId);
      const text   = $(textId);
      picker?.addEventListener('input', (e) => {
        const v = e.target.value;
        if (text) text.value = v;
        const prev = {}; prev[key] = v; applyPreview(prev);
      });
      text?.addEventListener('input', (e) => {
        const raw = e.target.value.trim();
        const val = isHex6(raw) ? hexify(raw) : raw;
        if (isHex6(raw) && picker) picker.value = val;
        const prev = {}; prev[key] = val; applyPreview(prev);
      });
    });
  }

  window.initBranding = function () {
    $('#brandingSave')?.addEventListener('click', () => saveLogo().catch(console.error));
    $('#brandingClear')?.addEventListener('click', () => {
      if ($('#brandingFile')) $('#brandingFile').value = '';
      if ($('#brandingLink')) $('#brandingLink').value = '';
    });

    wireColorSync();
    $('#brandingSaveColors')?.addEventListener('click', saveColors);

    loadSettings().catch(e => console.error('[branding] init loadSettings error', e));
  };
})();
