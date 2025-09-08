// boot.js — include any [data-include] fragments, then signal ready (buyers only)
async function includeFragments() {
  const incs = Array.from(document.querySelectorAll('[data-include]'));

  await Promise.all(
    incs.map(async (el) => {
      const url = el.getAttribute('data-include');
      if (!url) return;

      const res = await fetch(url + '?v=' + Date.now()); // cache-bust
      const html = await res.text();

      // Parse into real nodes and dissolve the wrapper element:
      const tpl = document.createElement('template');
      tpl.innerHTML = html.trim();

      // Re-execute any inline <script> tags so included scripts still run
      // (safe no-op if the partial has none)
      tpl.content.querySelectorAll('script').forEach((old) => {
        const s = document.createElement('script');
        // copy attributes (type, src, etc.)
        for (const { name, value } of Array.from(old.attributes)) {
          s.setAttribute(name, value);
        }
        s.textContent = old.textContent || '';
        old.replaceWith(s);
      });

      // Replace the placeholder node entirely (do NOT nest inside it)
      el.replaceWith(tpl.content);
    })
  );
}

(async () => {
  await includeFragments();
  // flag + event for other modules that need injected DOM
  window.__includesReady = true;
  document.dispatchEvent(new Event('includes:ready'));
})();
