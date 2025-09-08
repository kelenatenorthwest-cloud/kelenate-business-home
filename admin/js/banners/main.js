// admin/js/banners/main.js
(function () {
  const B = (window.Banners = window.Banners || {});
  const E = () => B.events;

  // Expose initializer so admin/index.html can call it
  window.initBanners = function () {
    document.getElementById('banner-upload-form')?.addEventListener('submit', E().handleUpload);
    document.getElementById('refresh-banners')?.addEventListener('click', E().loadBanners);
    document.getElementById('banner-settings-form')?.addEventListener('submit', E().saveSettings);

    E().loadBanners();
    E().loadSettings();
    E().initPreview();
  };
})();
