// admin/js/admin-customers.js
(function(){
  const $ = s => document.querySelector(s);
  async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error(await r.text()); return r.json(); }
  function fmtDate(ms){ const d=new Date(Number(ms||0)); return isNaN(d) ? '' : d.toLocaleDateString(); }

  async function load(){
    const q = ($('#custQ')?.value || '').trim();
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    const users = await fetchJSON(`/api/users${qs}`);
    const tbody = $('#custBody'); tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="nowrap">${u.id}</td>
        <td>${u.firstName || ''}</td>
        <td>${u.lastName || ''}</td>
        <td>${u.email || ''}</td>
        <td>${u.stateCode || ''}</td>
        <td>${fmtDate(u.createdAt)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.initCustomers = function(){
    $('#custRefresh')?.addEventListener('click', load);
    $('#custQ')?.addEventListener('input', () => { clearTimeout(window.__custT); window.__custT=setTimeout(load, 300); });
    load();
  };
})();
