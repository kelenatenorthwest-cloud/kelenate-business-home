// admin/js/inventory/helpers.js

// Try /api first, then no prefix; surface server response body on errors
export async function apiFetch(path, opts) {
  const tries = [`/api${path}`, path];
  let lastErr, lastRes = null;
  for (const url of tries) {
    try {
      const r = await fetch(url, opts);
      lastRes = r;
      if (r.ok) return r;
      lastErr = new Error(`${r.status} ${r.statusText}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastRes) {
    let body = '';
    try { body = await lastRes.text(); } catch {}
    throw new Error(body || (lastErr?.message || 'Request failed'));
  }
  throw lastErr || new Error('Request failed');
}

export const $ = (s, r = document) => r.querySelector(s);

// lightweight formatters & escaping
export const fmt = {
  rupee(n){
    const v = Number(n || 0);
    return isNaN(v) ? '-' : `₹ ${v.toLocaleString('en-IN',{ maximumFractionDigits: 2 })}`;
  },
  date(v){
    if (!v) return '-';
    const num = Number(v);
    if (Number.isFinite(num)) return new Date(num).toLocaleString();
    const ms = Date.parse(String(v).replace(' ', 'T'));
    return Number.isFinite(ms) ? new Date(ms).toLocaleString() : String(v);
  },
  esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
  }
};

export function resolveThumb(p){
  return (Array.isArray(p.images) && p.images[0]) || p.image || '/img/placeholder.png';
}

// optional helpers we’ll use in the split modules
export function qs(obj = {}) {
  const sp = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function debounce(fn, delay = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
