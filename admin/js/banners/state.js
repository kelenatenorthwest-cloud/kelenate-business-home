// admin/js/banners/state.js
(function () {
  const B = (window.Banners = window.Banners || {});

  const state = {
    // ---- constants (match your original) ----
    ALLOWED_IMAGE_MIME: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
    ALLOWED_VIDEO_MIME: new Set(['video/mp4', 'video/webm', 'video/ogg']),
    MAX_SIZE: 64 * 1024 * 1024, // 64MB
    TARGET_RATIO: 2.5,
    RATIO_TOL: 0.15,
    PRESETS: {
      wide1920:    { width: 1920, label: 'Wide 1920'    },
      desktop1440: { width: 1440, label: 'Desktop 1440' },
      laptop1200:  { width: 1200, label: 'Laptop 1200'  },
      tablet1024:  { width: 1024, label: 'Tablet 1024'  },
    },
    STAGE: { width: 720, height: 280 },

    // ---- mutable UI state ----
    bannersCache: [],
    activeBannerId: null,
    lastSelectedCard: null,

    frameEl: null,
    imgEl: null,
    fileInput: null,
    wlabel: null,
    rlabel: null,

    naturalW: 0,
    naturalH: 0,
    activePresetKey: 'desktop1440',

    // Crop box (in stage pixels)
    box: { left: 0, top: 0, width: 0, height: 0 },

    // utils
    clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); },
  };

  B.state = state;
})();
