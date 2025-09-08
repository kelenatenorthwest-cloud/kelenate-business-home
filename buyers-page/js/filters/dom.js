export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function whenReady(){
  return new Promise(res => {
    if (document.readyState !== 'loading') res();
    else document.addEventListener('DOMContentLoaded', res, { once: true });
  });
}

export function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,a),ms); }; }

export function rowOf(el){
  return el.closest('li, .filter-item, .checklist-item, label') || el.parentElement;
}

export function showRow(el, show){
  const n = rowOf(el);
  if (!n) return;
  n.hidden = !show;
  n.style.display = show ? '' : 'none';
  n.setAttribute('aria-hidden', String(!show));
}

export function escapeRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function num(v){ const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
export function eq(a,b){ return (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && a === b); }
