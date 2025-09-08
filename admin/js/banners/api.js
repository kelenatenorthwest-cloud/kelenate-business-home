// admin/js/banners/api.js
(function () {
  const B = (window.Banners = window.Banners || {});

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  // util: read image dimensions from a File object
  function getImageDims(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const out = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to read image')); };
      img.src = url;
    });
  }

  const api = {
    fetchBanners: () => fetchJSON('/api/banners'),
    createBanner: (formData) => fetchJSON('/api/banners', { method: 'POST', body: formData }),
    deleteBanner: (id) => fetchJSON(`/api/banners/${id}`, { method: 'DELETE' }),

    fetchBannerSettings: () => fetchJSON('/api/banner-settings'),
    updateBannerSettings: (payload) => fetchJSON('/api/banner-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),

    fetchCrops: (id) => fetchJSON(`/api/banners/${id}/crops`),
    putCrop:   (id, payload) => fetchJSON(`/api/banners/${id}/crop`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }),

    getImageDims,
  };

  B.api = api;
})();
