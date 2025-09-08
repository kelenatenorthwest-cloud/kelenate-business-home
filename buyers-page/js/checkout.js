// buyers-page/js/checkout.js
// Loads default address, shows summary, opens Razorpay on "Proceed to payment".
// Works with your existing address popup if available; otherwise uses a built-in fallback.

const API_BASE = (location.origin && location.origin.startsWith("http"))
  ? location.origin
  : "http://localhost:4000";

const LOGIN_PATH = "/signin.html"; // used on 401 redirects

const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const inr = (n)=> new Intl.NumberFormat("en-IN",{style:"currency", currency:"INR"}).format((n||0)/100);

const els = {
  addrName: $("#addrName"),
  addrBlock: $("#addrBlock"),
  invoiceBlock: $("#invoiceBlock"),
  itemsVal: $("#itemsVal"),
  orderTotal: $("#orderTotal"),
  payBtn: $("#payBtn"),
  changeBtn: $("#changeAddressBtn"),
  overlay: $("#addrOverlay"),
  addrList: $("#addrList"),
  addrUse: $("#addrUse"),
  addrCancel: $("#addrCancel"),
};

let current = {
  cart: { items:[], subtotal_cents:0, count:0 },
  activeAddress: null,
  selectedAddressId: null, // used by fallback modal
};

let paying = false; // prevent double-clicks during Razorpay init

/* ===== Fetch helpers (with timeout + 401 redirect + credentials) ===== */
const FETCH_TIMEOUT_MS = 20000;
function redirectToLogin() {
  const next = encodeURIComponent(location.pathname + location.search);
  // keep hash if present
  location.href = `${LOGIN_PATH}?next=${next}`;
}
async function fetchWithTimeout(url, opts={}) {
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(new Error("Request timed out")), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: controller.signal,
      ...opts
    });
    if (res.status === 401) {
      redirectToLogin();
      throw new Error("Not authenticated");
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}
async function getJSON(u){
  const r = await fetchWithTimeout(u);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function postJSON(u, body, headersExtra){
  const r = await fetchWithTimeout(u, {
    method: "POST",
    headers: { "Content-Type":"application/json", ...(headersExtra||{}) },
    body: JSON.stringify(body||{})
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/* ===== Loaders ===== */
async function loadCart(){
  try {
    const cart = await getJSON(`${API_BASE}/api/cart?_=${Date.now()}`);
    current.cart = cart || { items:[], subtotal_cents:0, count:0 };
  } catch {
    current.cart = { items:[], subtotal_cents:0, count:0 };
  }
  renderSummary();
}

async function loadActiveAddress(){
  try {
    const data = await getJSON(`${API_BASE}/api/addresses/active?_=${Date.now()}`);
    current.activeAddress = data || null;
  } catch {
    current.activeAddress = null;
  }
  renderAddress();
}

/* ===== Renderers ===== */
function renderSummary(){
  const sub = Number(current.cart?.subtotal_cents || 0);
  els.itemsVal.textContent = inr(sub);
  els.orderTotal.textContent = inr(sub);
  els.payBtn.disabled = sub <= 0 || !current.activeAddress;
}

function formatAddress(a){
  if(!a) return "";
  const parts = [
    a.name && `<span class="addr-name">${escapeHtml(a.name)}</span>`,
    [a.line1,a.line2,a.landmark].filter(Boolean).join(", "),
    a.city && a.state && a.pincode ? `${escapeHtml(a.city)}, ${escapeHtml(a.state)} — ${escapeHtml(a.pincode)}` : "",
    a.country || "India"
  ].filter(Boolean);
  return parts.join("<br>");
}
function renderAddress(){
  const a = current.activeAddress;
  els.addrName.textContent = a?.name ? a.name : "—";
  els.addrBlock.innerHTML = a ? formatAddress(a) : `<span class="muted">No default address found. <a href="/add-address.html">Add one</a>.</span>`;
  els.invoiceBlock.innerHTML = a ? (formatAddress(a) + (a.gstin ? `<div class="gst">GSTIN: ${escapeHtml(a.gstin)}</div>` : "")) : "";
  renderSummary();
}

/* ===== Address change: existing popup or fallback modal ===== */
function openExistingAddressPopup(){
  // Try a few likely integration points from your codebase
  if (typeof window.openAddrModal === "function") {
    window.openAddrModal({ onSelect: onPopupAddressSelected });
    return true;
  }
  if (typeof window.addressPopup?.open === "function") {
    window.addressPopup.open({ onSelect: onPopupAddressSelected });
    return true;
  }
  // Broadcast in case your popup listens for a custom event
  const ev = new CustomEvent("address:open", { detail: { onSelect: onPopupAddressSelected } });
  document.dispatchEvent(ev);
  // We can't know if it opened; return false to trigger fallback
  return false;
}
async function onPopupAddressSelected(addr){
  // If your popup hands back the whole address object:
  if (addr?.id) {
    await postJSON(`${API_BASE}/api/addresses/${addr.id}/use`, {});
    await loadActiveAddress();
  } else {
    // Otherwise just re-fetch active
    await loadActiveAddress();
  }
}

/* ===== Fallback modal (simple, self-contained) ===== */
function lockBodyScroll(lock){
  // Mobile nicety: prevent background scroll under the modal
  try { document.documentElement.style.overflow = lock ? "hidden" : ""; } catch {}
  try { document.body.style.overflow = lock ? "hidden" : ""; } catch {}
}
async function fallbackOpenAddressChooser(){
  try {
    const data = await getJSON(`${API_BASE}/api/addresses?_=${Date.now()}`);
    const { list = [], default_id = null } = data || {};
    els.addrList.innerHTML = list.map(a => `
      <label class="addr-row">
        <input type="radio" name="addrPick" value="${a.id}" ${a.id===default_id ? "checked":""} />
        <div>
          <div style="font-weight:700">${escapeHtml(a.name||"")}</div>
          <div class="muted">${escapeHtml([a.line1,a.line2,a.landmark].filter(Boolean).join(", "))}</div>
          <div class="muted">${escapeHtml(a.city||"")}, ${escapeHtml(a.state||"")} — ${escapeHtml(a.pincode||"")}</div>
        </div>
      </label>
    `).join("") || `<div class="muted" style="padding:12px 0">No addresses yet. <a href="/add-address.html">Add one</a>.</div>`;

    els.overlay.classList.add("open");
    lockBodyScroll(true);
    current.selectedAddressId = default_id;

    // Wire radio changes
    $$('input[name="addrPick"]').forEach(r => r.addEventListener("change", () => current.selectedAddressId = Number(r.value)));

    // Mobile-friendly close: clicking outside the modal or pressing Esc
    if (!els.overlay.dataset.wired){
      els.overlay.addEventListener("click", (e) => {
        if (e.target === els.overlay) { // backdrop
          els.overlay.classList.remove("open");
          lockBodyScroll(false);
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && els.overlay.classList.contains("open")) {
          els.overlay.classList.remove("open");
          lockBodyScroll(false);
        }
      });
      els.overlay.dataset.wired = "1";
    }
  } catch (e) {
    alert("Could not load addresses.");
  }
}
async function fallbackUseAddress(){
  if (!current.selectedAddressId) { alert("Select an address"); return; }
  try {
    await postJSON(`${API_BASE}/api/addresses/${current.selectedAddressId}/use`, {});
    els.overlay.classList.remove("open");
    lockBodyScroll(false);
    await loadActiveAddress();
  } catch {
    alert("Failed to set address.");
  }
}

/* ===== Razorpay integration ===== */
function makeIdemKey(){
  // RFC4122-ish v4 (sufficient for idempotency)
  if (crypto && crypto.getRandomValues) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    // hexify
    const h = [...b].map(x=>x.toString(16).padStart(2,'0')).join('');
    return `idem_${h}`;
  }
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
async function ensureRazorpayReady(timeoutMs = 8000){
  const start = Date.now();
  while (!window.Razorpay) {
    await new Promise(r => setTimeout(r, 50));
    if (Date.now() - start > timeoutMs) throw new Error("Razorpay script not loaded");
  }
  return true;
}
async function createRazorpayOrder(amountPaise){
  const idem = makeIdemKey();
  const res = await postJSON(
    `${API_BASE}/api/payments/razorpay/order`,
    {
      amount: amountPaise, // in paise
      currency: "INR",
      notes: { cartCount: current.cart?.count || 0, idempotency_key: idem }
    },
    { "Idempotency-Key": idem }
  );
  // Expecting: { id, amount, currency, key_id }
  return res;
}
function openRazorpay(order){
  if (!window.Razorpay) {
    alert('Razorpay script not loaded. Ensure <script src="https://checkout.razorpay.com/v1/checkout.js"></script> is present.');
    return;
  }
  const a = current.activeAddress || {};
  const options = {
    key: order.key_id,              // from backend
    amount: order.amount,           // paise
    currency: order.currency || "INR",
    name: "Kelenate",
    description: "Order payment",
    order_id: order.id,             // Razorpay order id
    prefill: {
      name: a?.name || "",
      email: a?.email || "",
      contact: a?.phone || ""
    },
    notes: { address_id: a?.id || "" },
    handler: function (resp){
      // You can hit a verify endpoint here (recommended).
      alert("Payment successful! Razorpay Payment ID: " + resp.razorpay_payment_id);
      // TODO: redirect to /thank-you.html
    },
    modal: {
      ondismiss: function(){ /* user closed the modal */ }
    },
    theme: { color: "#ff9900" }
  };
  const rzp = new window.Razorpay(options);
  rzp.open();
}

function escapeHtml(s){ return String(s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }

/* ===== Wire up ===== */
els.changeBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!openExistingAddressPopup()) {
    await fallbackOpenAddressChooser();
  }
});
els.addrCancel.addEventListener("click", ()=>{
  els.overlay.classList.remove("open");
  lockBodyScroll(false);
});
els.addrUse.addEventListener("click", fallbackUseAddress);

els.payBtn.addEventListener("click", async () => {
  try {
    if (paying) return; // debounce
    const amt = Number(current.cart?.subtotal_cents || 0);
    if (!amt) return;
    if (!current.activeAddress) { alert("Please select a delivery address first."); return; }

    paying = true;
    const prevText = els.payBtn.textContent;
    els.payBtn.textContent = "Opening Razorpay…";
    els.payBtn.disabled = true;

    await ensureRazorpayReady();
    const order = await createRazorpayOrder(amt);
    openRazorpay(order);

    // restore button after opening modal
    els.payBtn.textContent = prevText;
    els.payBtn.disabled = false;
    paying = false;
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    alert("Payment init failed.\n" + msg);
    els.payBtn.textContent = "Proceed to payment";
    els.payBtn.disabled = false;
    paying = false;
  }
});

// Initial load (top-level await is fine in module scripts)
await loadActiveAddress();
await loadCart();
