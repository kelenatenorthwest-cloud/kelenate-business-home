// buyers-page/js/address-form.js
const $ = (s, r=document) => r.querySelector(s);
const qs = () => new URLSearchParams(location.search);

/* -------------------- routing helpers -------------------- */
function retUrl(){
  const v = qs().get('return');
  // only allow local, non-empty paths
  return v && v.startsWith('/') ? v : '/address-book.html';
}
function getId(){
  const v = qs().get('id');
  return v ? Number(v) : null;
}
function isEditMode(){
  const p = location.pathname.toLowerCase();
  return p.endsWith('/edit-address.html') || !!getId();
}

/* -------------------- fetch helper -------------------- */
async function fetchJSON(url, opt){
  const res = await fetch(url, { credentials:'include', ...(opt||{}) });
  const t = await res.text();
  let data; try { data = t ? JSON.parse(t) : {}; } catch { data = { raw:t }; }
  if (!res.ok) {
    if (res.status === 401) {
      location.href = '/login.html?return=' + encodeURIComponent(location.pathname + location.search);
      throw new Error('Unauthorized');
    }
    throw new Error(data?.error || res.statusText);
  }
  return data;
}

/* -------------------- UI wiring -------------------- */
$('#cancel')?.addEventListener('click', (e)=>{
  e.preventDefault();
  if (history.length > 1) history.back();
  else location.href = retUrl();
});

function updateUI(){
  const title = $('#formTitle');
  const save  = $('#saveBtn');
  if (isEditMode()){
    if (title) title.textContent = 'Edit address';
    if (save)  save.textContent  = 'Save changes';
    document.title = 'Edit Address • Amazon Business Clone';
  } else {
    if (title) title.textContent = 'Add address';
    if (save)  save.textContent  = 'Add address';
    document.title = 'Add Address • Amazon Business Clone';
  }
}

/* -------------------- tolerant form mapping -------------------- */
/** keys the backend expects */
const KEYS = {
  full_name: ['full_name','fullname','full-name','name','recipient','recipient_name'],
  pincode:   ['pincode','pin','pin_code','zipcode','zip','postal','postal_code'],
  city:      ['city','town'],
  state:     ['state','state_code','statecode','region'],
  line1:     ['line1','address1','address_line1','address-line1','address'],
  line2:     ['line2','address2','address_line2','address-line2','street2'],
  phone:     ['phone','mobile','phone_number','tel'],
  landmark:  ['landmark','nearby'],
  is_default:['is_default','default','make_default','set_default']
};

function getFirst(raw, list){
  for (const k of list) {
    if (k in raw) {
      const v = raw[k];
      if (typeof v === 'string') {
        const s = v.trim();
        if (s !== '') return s;
      } else if (v != null) {
        return v;
      }
    }
  }
  return '';
}

/** Read the form with synonym support and normalize types */
function readForm(formEl){
  const fd  = new FormData(formEl);
  const raw = Object.fromEntries(fd.entries());

  const body = {
    full_name: getFirst(raw, KEYS.full_name),
    pincode:   getFirst(raw, KEYS.pincode),
    city:      getFirst(raw, KEYS.city),
    state:     getFirst(raw, KEYS.state),
    line1:     getFirst(raw, KEYS.line1),
    line2:     getFirst(raw, KEYS.line2),
    phone:     getFirst(raw, KEYS.phone),
    landmark:  getFirst(raw, KEYS.landmark),
    is_default: !!(raw[KEYS.is_default[0]] || raw[KEYS.is_default[1]] || raw[KEYS.is_default[2]] || raw[KEYS.is_default[3]])
  };

  // light normalization
  body.pincode = String(body.pincode || '').trim();
  body.phone   = String(body.phone || '').trim();

  return body;
}

/** Fill inputs by preferred name, falling back to synonyms if needed */
function setInputValue(formEl, name, value){
  let input = formEl.querySelector(`[name="${name}"]`);
  if (!input) {
    const alts = (KEYS[name] || []).slice(1); // skip canonical
    for (const k of alts) {
      input = formEl.querySelector(`[name="${k}"]`);
      if (input) break;
    }
  }
  if (!input) return;
  if (input.type === 'checkbox') input.checked = !!value;
  else input.value = value ?? '';
}

/* -------------------- prefill for edit -------------------- */
async function prefillIfEditing(){
  if (!isEditMode()) return;
  const id = getId();
  if (!id) { location.replace(retUrl()); return; }

  try{
    const { address } = await fetchJSON(`/api/addresses/${id}`);
    const f = $('#addrForm');
    if (!f) return;
    setInputValue(f, 'full_name', address?.full_name);
    setInputValue(f, 'pincode',   address?.pincode);
    setInputValue(f, 'city',      address?.city);
    setInputValue(f, 'state',     address?.state);
    setInputValue(f, 'line1',     address?.line1);
    setInputValue(f, 'line2',     address?.line2);
    setInputValue(f, 'phone',     address?.phone);
    setInputValue(f, 'landmark',  address?.landmark);
    setInputValue(f, 'is_default',address?.is_default);
  }catch(e){
    alert('Could not load address: ' + e.message);
    location.href = retUrl();
  }
}

/* -------------------- submit -------------------- */
$('#addrForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id   = getId();

  const body = readForm(form);

  // Required field check (after tolerant mapping)
  if (!body.full_name || !body.pincode || !body.city || !body.state || !body.line1) {
    alert('Please fill all required fields');
    return;
  }

  const btn = $('#saveBtn') || form.querySelector('[type="submit"]');
  if (btn){ btn.disabled = true; btn.dataset.prev = btn.textContent; btn.textContent = isEditMode() ? 'Saving…' : 'Adding…'; }

  try{
    if (isEditMode()) {
      await fetchJSON(`/api/addresses/${id}`, {
        method:'PUT',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      await fetchJSON('/api/addresses', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(body)
      });
    }
    location.href = retUrl();
  }catch(err){
    alert('Could not save address: ' + err.message);
  }finally{
    if (btn){ btn.disabled = false; btn.textContent = btn.dataset.prev || 'Save'; }
  }
});

/* -------------------- kick off -------------------- */
updateUI();
prefillIfEditing();
