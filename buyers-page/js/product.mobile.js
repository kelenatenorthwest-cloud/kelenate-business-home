// buyers-page/js/product.mobile.js
// Mobile-only enhancer for PDP:
// - Do NOT rebuild the gallery (preserve vertical scroll behavior).
// - Hide thumbs on mobile.
// - Make #pdpMainWrap a proper vertical scroller and capture gestures so
//   the scroll happens INSIDE the image box, not the page.
// - Force wrapping on title/bullets (defensive).
// - NEW: Stacked scroller — fix viewport from first image aspect ratio, then
//        render all images at the same height (object-fit: contain, centered).
// - NEW: If a product video exists (exposed by product.js on #pdpMainWrap[data-first-video]),
//        render it as the FIRST frame on mobile with the same fixed height.

const qs  = (s, r=document)=> r.querySelector(s);
const qsa = (s, r=document)=> Array.from(r.querySelectorAll(s));

function when(condition, cb, timeout=8000) {
  if (condition()) return void cb();
  const mo = new MutationObserver(() => { if (condition()) { mo.disconnect(); cb(); } });
  mo.observe(document.documentElement, { childList:true, subtree:true });
  setTimeout(() => { try { mo.disconnect(); } catch {} if (condition()) cb(); }, timeout);
}

function getBgURL(el) {
  const style = el.getAttribute('style') || '';
  let m = style.match(/background-image:\s*url\((['"]?)(.*?)\1\)/i);
  if (m && m[2]) return m[2];
  const bg = getComputedStyle(el).backgroundImage;
  m = bg && bg.match(/url\((['"]?)(.*?)\1\)/i);
  return m ? m[2] : null;
}

function clampMainHeight() {
  // legacy fallback: clamp(320px, 62vw, 460px)
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const h = Math.min(460, Math.max(320, 0.62 * vw));
  return Math.round(h);
}

function enableInnerScroll(scroller) {
  if (!scroller) return;

  // --- Keep native scrolling; allow page to take over at edges ---
  scroller.style.webkitOverflowScrolling = 'touch';
  scroller.style.touchAction = 'pan-y';
  // IMPORTANT: allow scroll chaining to the page when at edges
  scroller.style.overscrollBehavior = 'auto';
  scroller.style.overscrollBehaviorY = 'auto';

  // Remove any previous handlers if re-wired
  if (scroller.__wheelHandler) {
    scroller.removeEventListener('wheel', scroller.__wheelHandler, { passive: false });
  }
  if (scroller.__touchStartHandler) {
    scroller.removeEventListener('touchstart', scroller.__touchStartHandler, { passive: true });
  }
  if (scroller.__touchMoveHandler) {
    scroller.removeEventListener('touchmove', scroller.__touchMoveHandler, { passive: false });
  }

  // Only intercept when we actually consume scroll *inside* the scroller.
  const onWheel = (e) => {
    if (e.ctrlKey) return; // pinch-zoom etc.
    const canScroll = scroller.scrollHeight > scroller.clientHeight;
    if (!canScroll) return; // let page handle it
    const prev = scroller.scrollTop;
    scroller.scrollTop += e.deltaY;
    const consumed = scroller.scrollTop !== prev;
    // prevent only if we truly scrolled this element; otherwise allow page to scroll
    if (consumed) e.preventDefault();
  };

  let lastY = 0;
  const onTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    lastY = e.touches[0].clientY;
  };
  const onTouchMove = (e) => {
    if (e.touches.length !== 1) return;
    const y = e.touches[0].clientY;
    // Delta positive when finger moves UP (mirror wheel deltaY)
    const deltaY = lastY - y;
    lastY = y;

    const canScroll = scroller.scrollHeight > scroller.clientHeight;
    if (!canScroll) return; // allow page to handle it

    const prev = scroller.scrollTop;
    scroller.scrollTop += deltaY;

    const consumed = scroller.scrollTop !== prev;
    // Only block the event if we actually moved the inner scroller.
    // If we're at the top/bottom and cannot move, let the page scroll naturally.
    if (consumed) e.preventDefault();
  };

  // Attach updated, edge-friendly listeners
  scroller.addEventListener('wheel', onWheel, { passive: false });
  scroller.addEventListener('touchstart', onTouchStart, { passive: true });
  scroller.addEventListener('touchmove', onTouchMove, { passive: false });

  // keep refs to cleanup on re-wire
  scroller.__wheelHandler = onWheel;
  scroller.__touchStartHandler = onTouchStart;
  scroller.__touchMoveHandler = onTouchMove;

  scroller.dataset.scrollWired = '1';
}

/* ------- legacy: aspect-ratio aware sizing for a single image (kept for compatibility) ------- */
function layoutImageToOverflow(wrap, img) {
  if (!wrap || !img) return;
  const w = wrap.clientWidth || img.clientWidth || 0;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!w || !nw || !nh) return;
  const scaledH = Math.round((nh / nw) * w);
  img.style.width = '100%';
  img.style.maxWidth = '100%';
  img.style.height = scaledH + 'px';
  img.style.maxHeight = 'none';
  img.style.objectFit = 'contain';
  img.style.display = 'block';
  img.style.pointerEvents = 'auto';
  img.style.userSelect = 'none';
  img.style.webkitUserDrag = 'none';
  img.style.touchAction = 'pan-y';
  img.style.transform = 'translateZ(0)';
}

/* ------- helper: normalize image URL for stronger de-dup (avoid double main image) ------- */
function normalizeKey(u){
  if (!u) return '';
  try {
    const url = new URL(u, location.origin);
    const file = url.pathname.split('/').pop() || url.pathname; // filename or last segment
    return file.toLowerCase(); // ignore querystring & host differences
  } catch {
    const noQ = String(u).split('?')[0];
    return noQ.split('/').pop().toLowerCase();
  }
}

/* ------- NEW: collect all image URLs and build a stacked scroller ------- */
function collectImageURLs(thumbs, mainImg) {
  const candidates = [];

  // 1) current main image first (if set)
  if (mainImg && mainImg.src) candidates.push(mainImg.src);

  // 2) thumbs (only those with background-image and NOT videos)
  if (thumbs) {
    qsa('.thumb', thumbs).forEach(t => {
      if (t.classList.contains('is-video')) return;
      const u = getBgURL(t);
      if (u) candidates.push(u);
    });
  }

  // de-dup while preserving order (by normalized filename)
  const seen = new Set();
  const urls = [];
  for (const u of candidates) {
    const key = normalizeKey(u);
    if (key && !seen.has(key)) {
      seen.add(key);
      urls.push(u);
    }
  }
  return urls;
}

function preloadImage(url) {
  return new Promise(resolve => {
    const im = new Image();
    im.onload = () => resolve({ width: im.naturalWidth || 1, height: im.naturalHeight || 1 });
    im.onerror = () => resolve({ width: 1, height: 1 });
    im.decoding = 'async';
    im.src = url;
  });
}

function buildStack(wrap, frameH, urls, videoSrc) {
  if (!wrap) return;

  // keep original nodes but hide them
  const img = qs('#pdpMainImg', wrap);
  const vid = qs('#pdpMainVideo', wrap);
  if (vid) { try { vid.pause(); } catch {} vid.style.display = 'none'; }
  if (img) img.style.display = 'none';

  let stack = qs('#pdpStack', wrap);
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'pdpStack';
    wrap.appendChild(stack);
  }

  // basic container styling
  stack.style.margin = '0';
  stack.style.padding = '0';
  stack.style.display = 'block';

  // rebuild items
  stack.innerHTML = '';

  // (A) Optional video-first frame
  if (videoSrc) {
    const vs = document.createElement('video');
    vs.src = videoSrc;

    // Mobile autoplay requirements
    vs.muted = true;
    vs.autoplay = true;
    vs.playsInline = true; // programmatic
    vs.setAttribute('playsinline', ''); // iOS Safari
    vs.setAttribute('muted', '');       // iOS Safari
    vs.setAttribute('autoplay', '');    // iOS Safari hint

    vs.loop = false;        // we'll handle loop count manually
    vs.controls = true;     // keep controls visible
    vs.preload = 'metadata';

    // fixed viewport height; contain and center (match image frames)
    vs.style.display = 'block';
    vs.style.width = '100%';
    vs.style.height = frameH + 'px';
    vs.style.maxWidth = '100%';
    vs.style.maxHeight = 'none';
    vs.style.objectFit = 'contain';
    vs.style.objectPosition = 'center center';
    vs.style.margin = '0 auto';
    vs.style.userSelect = 'none';
    vs.style.webkitUserDrag = 'none';
    vs.style.pointerEvents = 'auto';
    vs.style.touchAction = 'pan-y';

    // Autoplay + loop exactly twice, then stop on first frame
    let completes = 0;
    const tryPlay = () => { vs.play().catch(()=>{}); };

    // kick off when ready (some engines fire one or the other)
    vs.addEventListener('loadedmetadata', tryPlay, { once: true });
    vs.addEventListener('canplay', tryPlay, { once: true });

    vs.addEventListener('ended', () => {
      completes += 1; // finished one play
      if (completes < 2) {
        // replay from start for the second pass
        try {
          vs.currentTime = 0;
        } catch {}
        tryPlay();
      } else {
        // stop and reset to first frame
        try { vs.pause(); } catch {}
        try { vs.currentTime = 0; } catch {}
      }
    });

    stack.appendChild(vs);
  }

  // (B) Image frames
  urls.forEach((src, idx) => {
    const it = document.createElement('img');
    it.src = src;
    it.alt = `Product image ${idx + 1}`;
    it.loading = idx || videoSrc ? 'lazy' : 'eager';
    it.decoding = 'async';

    // fixed viewport height; contain and center
    it.style.display = 'block';
    it.style.width = '100%';
    it.style.height = frameH + 'px';
    it.style.maxWidth = '100%';
    it.style.maxHeight = 'none';
    it.style.objectFit = 'contain';
    it.style.objectPosition = 'center center';
    it.style.margin = '0 auto';
    it.style.userSelect = 'none';
    it.style.webkitUserDrag = 'none';
    it.style.pointerEvents = 'auto';
    it.style.touchAction = 'pan-y';

    stack.appendChild(it);
  });

  // make the wrapper the scroll container
  wrap.style.display = 'block';
  wrap.style.overflowY = 'auto';
  wrap.style.overflowX = 'hidden';
  wrap.style.webkitOverflowScrolling = 'touch';
  wrap.style.touchAction = 'pan-y';
  // IMPORTANT: allow page scroll chaining when at edges to avoid "stuck" feel
  wrap.style.overscrollBehavior = 'auto';
  wrap.style.overscrollBehaviorY = 'auto';
  wrap.style.height = frameH + 'px';                      // viewport height == first image frame
  wrap.style.setProperty('--pdp-frame-h', frameH + 'px'); // drive CSS var for consistency
  enableInnerScroll(wrap);
}

function applyMobileMediaBehavior(){
  if (!matchMedia('(max-width: 768px)').matches) return;

  const wrap    = qs('#pdpMainWrap') || qs('[data-slot="main"]');
  const thumbs  = qs('#pdpThumbs')   || qs('[data-slot="thumbs"]');
  const mainImg = qs('#pdpMainImg')  || qs('[data-slot="main-image"]');
  const mainVid = qs('#pdpMainVideo')|| qs('[data-slot="main-video"]');
  if (!wrap) return;

  // Hide thumbs on phones (we’ll stack media instead)
  if (thumbs) thumbs.style.display = 'none';
  if (mainVid) { try { mainVid.pause(); } catch {} mainVid.style.display = 'none'; }

  // Read optional video-first URL (set by product.js)
  const videoFirst = wrap.dataset.firstVideo || '';

  // If we've already built a stack, keep heights in sync AND
  // (FIX) detect newly-available images (e.g., we started video-only) and rebuild.
  if (wrap.dataset.stackApplied === '1') {
    const ratio = Number(wrap.dataset.firstRatio || '0') || 0;
    const w = wrap.clientWidth || Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const frameH = ratio > 0 ? Math.round(ratio * w) : clampMainHeight();

    // If images have appeared since the first build (e.g., video-only → images later), rebuild now.
    const existingImgs = qsa('#pdpStack img', wrap).length;
    const urlsNow = collectImageURLs(thumbs, mainImg);
    if (urlsNow.length && urlsNow.length !== existingImgs) {
      preloadImage(urlsNow[0]).then(({ width, height }) => {
        const r2 = (width > 0) ? (height / width) : 0;
        const fh = r2 > 0 ? Math.round(r2 * (wrap.clientWidth || w)) : frameH;
        wrap.dataset.firstSrc = urlsNow[0];
        wrap.dataset.firstRatio = String(r2);
        buildStack(wrap, fh, urlsNow, videoFirst || null);
      });
      return;
    }

    wrap.style.height = frameH + 'px';
    wrap.style.setProperty('--pdp-frame-h', frameH + 'px');
    qsa('#pdpStack img, #pdpStack video', wrap).forEach(n => n.style.height = frameH + 'px');
    return;
  }

  const urls = collectImageURLs(thumbs, mainImg);
  if (!urls.length && mainImg && mainImg.src) urls.push(mainImg.src);

  // If absolutely nothing yet, but we DO have a first video, build video-only stack immediately.
  if (!urls.length && videoFirst) {
    const h = clampMainHeight();
    wrap.dataset.firstSrc = '';         // no image yet
    wrap.dataset.firstRatio = '0';
    wrap.dataset.stackApplied = '1';
    buildStack(wrap, h, [], videoFirst);
    // also listen for an image arriving later to recompute a nicer frame
    if (mainImg && !wrap.__stackAwaitSrcObs) {
      const obsVidOnly = new MutationObserver(() => {
        const src = mainImg.getAttribute('src') || '';
        if (src) {
          try { obsVidOnly.disconnect(); } catch {}
          wrap.__stackAwaitSrcObs = null;
          applyMobileMediaBehavior(); // rebuild with image-derived frame
        }
      });
      obsVidOnly.observe(mainImg, { attributes:true, attributeFilter:['src'] });
      wrap.__stackAwaitSrcObs = obsVidOnly;
    }
    return;
  }

  // If still no media at all, fallback and wait for first img src to appear
  if (!urls.length) {
    const h = clampMainHeight();
    wrap.style.display = 'block';
    wrap.style.overflowY = 'auto';
    wrap.style.overflowX = 'hidden';
    wrap.style.height = h + 'px';
    wrap.style.setProperty('--pdp-frame-h', h + 'px');
    // Allow chaining in fallback too
    wrap.style.overscrollBehavior = 'auto';
    wrap.style.overscrollBehaviorY = 'auto';
    enableInnerScroll(wrap);

    if (mainImg && !wrap.__stackAwaitSrcObs) {
      const obs2 = new MutationObserver(() => {
        const src = mainImg.getAttribute('src') || '';
        if (src) {
          try { obs2.disconnect(); } catch {}
          wrap.__stackAwaitSrcObs = null;
          applyMobileMediaBehavior();
        }
      });
      obs2.observe(mainImg, { attributes:true, attributeFilter:['src'] });
      wrap.__stackAwaitSrcObs = obs2;
    }
    return;
  }

  // Preload FIRST IMAGE to get its aspect ratio -> frame height at 100% width
  const firstSrc = urls[0];
  const wNow = wrap.clientWidth || Math.max(document.documentElement.clientWidth, window.innerWidth || 0);

  preloadImage(firstSrc).then(({ width, height }) => {
    const ratio = (width > 0) ? (height / width) : 0; // h/w
    const frameH = ratio > 0 ? Math.round(ratio * wNow) : clampMainHeight();

    // Persist so resizes/mutations can reuse
    wrap.dataset.firstSrc = firstSrc;
    wrap.dataset.firstRatio = String(ratio);
    wrap.dataset.stackApplied = '1';

    buildStack(wrap, frameH, urls, videoFirst || null); // sets --pdp-frame-h, video first if any

    // Keep responsive
    const onResize = () => {
      const w = wrap.clientWidth || Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const r = Number(wrap.dataset.firstRatio || '0') || 0;
      const h = r > 0 ? Math.round(r * w) : clampMainHeight();
      wrap.style.height = h + 'px';
      wrap.style.setProperty('--pdp-frame-h', h + 'px');
      qsa('#pdpStack img, #pdpStack video', wrap).forEach(n => n.style.height = h + 'px');
    };

    // avoid duplicate listeners
    if (wrap.__onResizeStack) window.removeEventListener('resize', wrap.__onResizeStack);
    wrap.__onResizeStack = onResize;
    window.addEventListener('resize', onResize);

    // If desktop code changes #pdpMainImg.src (even while thumbs hidden), rebuild stack
    const img = qs('#pdpMainImg');
    if (img && !wrap.__imgObs) {
      const obs = new MutationObserver(() => {
        const src = img.getAttribute('src') || '';
        if (src && src !== wrap.dataset.firstSrc) {
          // Insert new first image and rebuild list (keep de-dup order)
          const revised = [src, ...urls.filter(u => normalizeKey(u) !== normalizeKey(src))];
          const w2 = wrap.clientWidth || Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
          preloadImage(src).then(({ width: wN, height: hN }) => {
            const r2 = (wN > 0) ? (hN / wN) : 0;
            const newH = r2 > 0 ? Math.round(r2 * w2) : clampMainHeight();
            wrap.dataset.firstSrc = src;
            wrap.dataset.firstRatio = String(r2);
            buildStack(wrap, newH, revised, wrap.dataset.firstVideo || null); // keep video-first
          });
        }
      });
      obs.observe(img, { attributes: true, attributeFilter: ['src'] });
      wrap.__imgObs = obs;
    }
  });

  // Defensive text wrapping (unchanged)
  const title = qs('#pdpTitle');
  if (title) {
    title.style.whiteSpace = 'normal';
    title.style.overflowWrap = 'anywhere';
    title.style.wordBreak = 'break-word';
  }
  qsa('.bullets, .bullets li, .pdp-desc').forEach(el => {
    el.style.whiteSpace = 'normal';
    el.style.overflowWrap = 'anywhere';
    el.style.wordBreak = 'break-word';
  });
}

(function initMobilePDP(){
  if (!matchMedia('(max-width: 768px)').matches) return;

  when(
    () => document.querySelector('#pdpMainWrap') ||
          document.querySelector('#pdpMainImg')  ||
          document.querySelector('#pdpMainVideo'),
    applyMobileMediaBehavior
  );

  // Re-apply if user shrinks viewport back to mobile later
  const mm = matchMedia('(max-width: 768px)');
  if (mm.addEventListener) {
    mm.addEventListener('change', (e) => { if (e.matches) applyMobileMediaBehavior(); });
  } else if (mm.addListener) { // older iOS Safari
    mm.addListener((e) => { if (e.matches) applyMobileMediaBehavior(); });
  }
})();
