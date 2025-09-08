export async function loadAdminUnavailableMode(){
  let mode = 'lock';
  try{
    const r = await fetch('/api/admin/filters-config', { cache: 'no-store' });
    if (r.ok){
      const j = await r.json();
      const m = (j && j.unavailable_mode) ? String(j.unavailable_mode).toLowerCase() : 'lock';
      mode = (m === 'hide') ? 'hide' : 'lock';
    }
  }catch{}
  return mode;
}
