// admin/js/admin-theme.js
(function () {
  const $ = (s, r = document) => r.querySelector(s);

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  const DEF_TOP = '#131921';
  const DEF_SUB = '#232f3e';

  function isHex(v) {
    return /^#?[0-9a-f]{6}$/i.test(String(v || '').trim());
  }
  function norm(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (isHex(s)) return s.startsWith('#') ? s : ('#' + s);
    return s; // allow CSS named colors if you like
  }

  function syncPair(colorInput, textInput, value) {
    const v = norm(value);
    if (!v) return;
    colorInput.value = isHex(v) ? (v.startsWith('#') ? v : ('#' + v)) : colorInput.value;
    textInput.value  = v;
  }

  function updatePreview() {
    $('#previewTop').style.background = $('#hdrColorText').value.trim() || DEF_TOP;
    $('#previewSub').style.background = $('#navColorText').value.trim() || DEF_SUB;
  }

  async function loadCurrent() {
    try {
      const s = await fetchJSON('/api/site-settings?_=' + Date.now());
      const top = s.header_color || DEF_TOP;
      const sub = s.nav_color    || DEF_SUB;
      syncPair($('#hdrColor'), $('#hdrColorText'), top);
      syncPair($('#navColor'), $('#navColorText'), sub);
      updatePreview();
    } catch (e) {
      // Fallback to defaults
      syncPair($('#hdrColor'), $('#hdrColorText'), DEF_TOP);
      syncPair($('#navColor'), $('#navColorText'), DEF_SUB);
      updatePreview();
    }
  }

  async function saveColors() {
    const header = norm($('#hdrColorText').value || $('#hdrColor').value || DEF_TOP);
    const nav    = norm($('#navColorText').value || $('#navColor').value || DEF_SUB);

    const body = JSON.stringify({ header, nav });
    const r = await fetchJSON('/api/site-settings/colors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    // Soft apply to current admin page too (for immediate feedback if admin shares CSS vars)
    document.documentElement.style.setProperty('--header', r.header_color || DEF_TOP);
    document.documentElement.style.setProperty('--nav',    r.nav_color    || DEF_SUB);

    alert('Saved header colors.');
  }

  function wireInputs() {
    // keep color and text inputs in sync
    $('#hdrColor').addEventListener('input', () => {
      $('#hdrColorText').value = $('#hdrColor').value;
      updatePreview();
    });
    $('#navColor').addEventListener('input', () => {
      $('#navColorText').value = $('#navColor').value;
      updatePreview();
    });
    $('#hdrColorText').addEventListener('input', updatePreview);
    $('#navColorText').addEventListener('input', updatePreview);

    $('#btnSaveColors').addEventListener('click', () => {
      saveColors().catch(e => alert(e));
    });
    $('#btnResetColors').addEventListener('click', () => {
      syncPair($('#hdrColor'), $('#hdrColorText'), DEF_TOP);
      syncPair($('#navColor'), $('#navColorText'), DEF_SUB);
      updatePreview();
    });
  }

  window.initHeaderColors = function () {
    wireInputs();
    loadCurrent();
  };
})();
