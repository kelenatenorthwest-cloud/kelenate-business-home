// buyers-page/js/banners.js
import { API_BASE, getBanners, getBannerSettings } from './api.js';

export async function renderHeroBanners() {
  const wrap = document.querySelector('.hero__slides');
  if (!wrap) return;

  // Skip on small devices (CSS already hides .hero at <=520px)
  if (window.matchMedia && window.matchMedia('(max-width: 520px)').matches) return;

  const hero = wrap.closest('.hero');
  if (hero) {
    const display = getComputedStyle(hero).display;
    if (display === 'none') return;
  }

  /* ---------------- helpers ---------------- */
  const absUrl = (u) => (u?.startsWith('http') ? u : `${API_BASE}${u || ''}`);

  const isVideo = (b) => {
    const m = String(b?.mime || '').toLowerCase();
    const f = String(b?.file || b?.url || '').toLowerCase();
    return b?.kind === 'video'
      || m.startsWith('video/')
      || /\.(mp4|webm|ogg)$/i.test(f);
  };

  // Set CSS aspect based on a loaded media element (img or video)
  function syncHeroAspect(media) {
    if (!media || !hero) return;
    let w = 0, h = 0;
    if (media.tagName === 'IMG') {
      w = media.naturalWidth || 0;
      h = media.naturalHeight || 0;
    } else if (media.tagName === 'VIDEO') {
      w = media.videoWidth || 0;
      h = media.videoHeight || 0;
    }
    if (w > 0 && h > 0) hero.style.setProperty('--hero-ar', `${w}/${h}`);
  }

  const [banners, settings] = await Promise.all([getBanners(), getBannerSettings()]);
  if (!Array.isArray(banners) || banners.length === 0) return;

  /* ---- crops only for images ---- */
  const cropsMap = new Map(); // id -> [{preset,width,height,url}]
  async function fetchCropsFor(b) {
    if (isVideo(b)) return; // no crops for videos
    try {
      const res = await fetch(`${API_BASE}/api/banners/${b.id}/crops?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      if (json && Array.isArray(json.crops)) cropsMap.set(b.id, json.crops);
    } catch {}
  }
  await Promise.all(banners.map(fetchCropsFor).slice(0, 12));

  // Best source for images; videos always use original file URL
  function bestSrcFor(banner, targetW) {
    if (isVideo(banner)) return absUrl(banner.url);
    const crops = cropsMap.get(banner.id);
    if (!crops || !crops.length) return absUrl(banner.url);

    // pick the smallest crop whose width >= targetW, else the largest
    let candidate = null;
    for (const c of crops) {
      if (c.width >= targetW && (!candidate || c.width < candidate.width)) candidate = c;
    }
    const chosen = candidate || crops.reduce((a, c) => (c.width > a.width ? c : a), crops[0]);
    return absUrl(chosen.url);
  }

  function currentHeroWidth() {
    try {
      const r = hero?.getBoundingClientRect();
      return Math.max(700, Math.round((r?.width || window.innerWidth || 1200)));
    } catch { return 1200; }
  }

  /* ---- setup wrapper for chosen transition ---- */
  wrap.innerHTML = '';
  const mode = (settings.transition === 'slide') ? 'slide' : 'fade';
  const tMs  = Number(settings.transitionMs) || 400;

  if (mode === 'fade') {
    wrap.style.position = 'relative';
    wrap.style.overflow = 'hidden';
    wrap.style.whiteSpace = '';
    wrap.style.transform = '';
    wrap.style.transition = '';
  } else {
    // slide mode: inline slides in a horizontal ribbon
    wrap.style.position = 'relative';
    wrap.style.overflow  = 'hidden';
    wrap.style.whiteSpace = 'nowrap';
    wrap.style.transform = 'translateX(0)';
    wrap.style.transition = `transform ${tMs}ms ease`;
  }

  const heroW = currentHeroWidth();

  /* ---- build slides (img or video) ---- */
  const slides = banners.map((b, i) => {
    const slide = document.createElement('div');
    slide.className = 'hero__slide';

    if (mode === 'slide') {
      Object.assign(slide.style, {
        position: 'relative',
        display: 'inline-block',
        width: '100%',
        height: '100%',
        verticalAlign: 'top',
        left: 'auto',
        right: 'auto',
        top: 'auto',
        bottom: 'auto',
      });
    }

    let media;
    if (isVideo(b)) {
      const v = document.createElement('video');
      v.src = absUrl(b.url);
      v.muted = true;
      v.autoplay = true;          // most browsers require muted+playsinline to auto-play
      v.loop = true;
      v.playsInline = true;       // iOS in-page playback
      v.setAttribute('playsinline', ''); // extra safety for iOS
      v.preload = 'metadata';
      v.style.width = '100%';
      v.style.height = '100%';
      v.style.objectFit = 'cover';
      v.style.display = 'block';
      v.style.borderRadius = '8px';

      v.addEventListener('loadedmetadata', () => syncHeroAspect(v));
      media = v;
    } else {
      const img = document.createElement('img');
      img.src = bestSrcFor(b, heroW);
      img.alt = 'Banner';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      img.style.borderRadius = '8px';
      img.loading = i === 0 ? 'eager' : 'lazy';

      img.addEventListener('load', () => syncHeroAspect(img));
      media = img;
    }

    slide.appendChild(media);

    if (mode === 'fade') {
      Object.assign(slide.style, {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        opacity: 0,
        transition: `opacity ${tMs}ms ease`
      });
    }

    wrap.appendChild(slide);
    return { slide, media, banner: b, isVideo: isVideo(b) };
  });

  let idx = 0;
  const N = slides.length;

  const showFade  = n =>
    slides.forEach((s, i) => {
      s.slide.style.opacity = (i === n ? '1' : '0');
      s.slide.style.zIndex  = (i === n ? 2 : 1);
    });

  const showSlide = n => {
    wrap.style.transition = `transform ${tMs}ms ease`;
    wrap.style.transform  = `translateX(-${n * 100}%)`;
  };

  // Pause all non-active videos; play the active one
  function updateVideoPlayback(activeIdx) {
    slides.forEach((s, i) => {
      if (!s.isVideo) return;
      try {
        if (i === activeIdx) {
          // ensure current one plays
          if (s.media.paused) s.media.play().catch(()=>{});
        } else {
          if (!s.media.paused) s.media.pause();
        }
      } catch {}
    });
  }

  if (mode === 'fade') showFade(0); else showSlide(0);
  syncHeroAspect(slides[0]?.media);
  updateVideoPlayback(0);

  /* ---- arrows ---- */
  const prevBtn = document.getElementById('heroPrev');
  const nextBtn = document.getElementById('heroNext');
  const hasMultiple = N > 1;
  const showArrows = !!settings.showArrows && hasMultiple;

  if (prevBtn) prevBtn.style.display = showArrows ? '' : 'none';
  if (nextBtn) nextBtn.style.display = showArrows ? '' : 'none';

  function go(delta) {
    if (!hasMultiple) return;
    const loop = !!settings.loop;
    let n = idx + delta;
    if (loop) n = (n + N) % N; else n = Math.max(0, Math.min(N - 1, n));
    idx = n;
    if (mode === 'fade') showFade(idx); else showSlide(idx);
    syncHeroAspect(slides[idx]?.media);
    updateVideoPlayback(idx);
  }

  prevBtn && prevBtn.addEventListener('click', () => go(-1));
  nextBtn && nextBtn.addEventListener('click', () => go(+1));

  /* ---- autorotate ---- */
  if (settings.autoRotate && hasMultiple) {
    const interval = Math.max(1000, Number(settings.intervalMs) || 5000);
    let timer = setInterval(() => go(+1), interval);
    wrap.addEventListener('mouseenter', () => { clearInterval(timer); timer = null; });
    wrap.addEventListener('mouseleave', () => { if (!timer) timer = setInterval(() => go(+1), interval); });
  }

  /* ---- swap image crops on resize (videos unaffected) ---- */
  let lastAppliedW = heroW;
  function maybeSwapSources() {
    const w = currentHeroWidth();
    if (Math.abs(w - lastAppliedW) / lastAppliedW < 0.1) return;
    lastAppliedW = w;

    slides.forEach(({ media, banner, isVideo }) => {
      if (isVideo) return; // nothing to swap
      const nextSrc = bestSrcFor(banner, w);
      if (nextSrc && nextSrc !== media.src) media.src = nextSrc;
    });
    syncHeroAspect(slides[idx]?.media);
  }
  window.addEventListener('resize', () => { requestAnimationFrame(maybeSwapSources); });
}
