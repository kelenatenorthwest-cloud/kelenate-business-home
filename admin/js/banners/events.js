// admin/js/banners/events.js
(function () {
  const B = (window.Banners = window.Banners || {});
  const S = B.state;
  const D = B.dom;
  const A = B.api;

  const E = {
    async loadBanners() {
      const root = D.$('#banners-list');
      root.innerHTML = '<p class="muted">Loading…</p>';
      try {
        const list = await A.fetchBanners();
        S.bannersCache = Array.isArray(list) ? list : [];
        if (S.bannersCache.length === 0) {
          root.innerHTML = '<p class="muted">No banners yet. Upload one above.</p>';
          S.activeBannerId = null;
          D.renderPreviewPlaceholder();
          D.updateSaveButtonsDisabled(true);
          return;
        }

        const wrap = document.createElement('div');
        wrap.className = 'grid-3';

        S.bannersCache.forEach(b => {
          const card = document.createElement('div');
          card.className = 'card';
          card.dataset.id = b.id;

          const media = D.makeThumbForBanner(b);

          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.alignItems = 'center';
          row.style.marginTop = '8px';

          const left = document.createElement('div');
          left.style.display = 'grid';
          left.style.gap = '2px';

          const small = document.createElement('div');
          small.className = 'muted';
          const typeLabel = (b.type === 'video' || (b.mime||'').startsWith('video/')) ? 'video' : 'image';
          small.textContent = `#${b.id} • ${b.file} • ${typeLabel}`;

          if (media.tagName === 'IMG') {
            media.addEventListener('load', () => {
              const w = media.naturalWidth || media.width;
              const h = media.naturalHeight || media.height;
              if (w && h) {
                const ratio = (w / h).toFixed(2);
                small.textContent = `#${b.id} • ${b.file} • image • ${w}×${h} • ${ratio}:1`;
              }
            });
          } else if (media.tagName === 'VIDEO') {
            media.addEventListener('loadedmetadata', () => {
              const w = media.videoWidth || 0;
              const h = media.videoHeight || 0;
              if (w && h) {
                const ratio = (w / h).toFixed(2);
                small.textContent = `#${b.id} • ${b.file} • video • ${w}×${h} • ${ratio}:1`;
              }
            });
          }

          const selectBtn = document.createElement('button');
          selectBtn.className = 'btn';
          selectBtn.textContent = (typeLabel === 'video') ? 'Select' : 'Edit / Crop';
          selectBtn.addEventListener('click', () => E.setActiveBanner(b, card));

          const delBtn = document.createElement('button');
          delBtn.className = 'btn danger';
          delBtn.textContent = 'Delete';
          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm('Delete this banner?')) return;
            try {
              await A.deleteBanner(b.id);
              if (S.activeBannerId === b.id) {
                S.activeBannerId = null;
                D.renderPreviewPlaceholder();
              }
              await E.loadBanners();
            } catch (err) {
              alert('Failed to delete: ' + err.message);
            }
          });

          left.appendChild(small);
          row.appendChild(left);

          const actions = document.createElement('div');
          actions.style.display = 'flex';
          actions.style.gap = '8px';
          actions.appendChild(selectBtn);
          actions.appendChild(delBtn);
          row.appendChild(actions);

          card.appendChild(media);
          card.appendChild(row);
          wrap.appendChild(card);

          // Card click == select
          card.addEventListener('click', () => E.setActiveBanner(b, card));
        });

        root.innerHTML = '';
        root.appendChild(wrap);

        if (!S.activeBannerId && S.bannersCache[0]) {
          const firstCard = root.querySelector('.card');
          E.setActiveBanner(S.bannersCache[0], firstCard);
        }
      } catch (e) {
        root.innerHTML = `<p class="muted">Error: ${e.message}</p>`;
      }
    },

    async handleUpload(e) {
      e.preventDefault();
      const input = document.getElementById('banner-file');
      const file = input?.files?.[0];
      if (!file) return alert('Choose a media file first.');

      const isImage = S.ALLOWED_IMAGE_MIME.has(file.type);
      const isVideo = S.ALLOWED_VIDEO_MIME.has(file.type);
      if (!isImage && !isVideo) {
        return alert('Only images (JPEG/PNG/WebP/GIF/AVIF) or videos (MP4/WebM/OGG) are allowed.');
      }
      if (file.size > S.MAX_SIZE) {
        return alert('File is too large. Please keep it under 64 MB.');
      }

      if (isImage) {
        try {
          const { width, height } = await A.getImageDims(file);
          if (width && height) {
            const ratio = width / height;
            const low = S.TARGET_RATIO * (1 - S.RATIO_TOL);
            const high = S.TARGET_RATIO * (1 + S.RATIO_TOL);
            if (ratio < low || ratio > high) {
              const ok = confirm(
                `Heads up: This image is ${width}×${height} (~${ratio.toFixed(2)}:1).\n` +
                `The homepage banner prefers a wide image (~${S.TARGET_RATIO}:1).\n` +
                `It will be cropped to fit. Continue?`
              );
              if (!ok) return;
            }
          }
        } catch { /* non-blocking */ }
      }

      const fd = new FormData();
      fd.append('image', file); // keep field name 'image' for back-compat
      try {
        const created = await A.createBanner(fd);
        input.value = '';
        await E.loadBanners();
        const card = document.querySelector(`[data-id="${created.id}"]`);
        E.setActiveBanner(created, card || null);
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    },

    async loadSettings() {
      const s = await A.fetchBannerSettings();
      D.$('#bs-autoRotate').value   = s.autoRotate ? '1' : '0';
      D.$('#bs-intervalMs').value   = s.intervalMs ?? 5000;
      D.$('#bs-transition').value   = s.transition || 'fade';
      D.$('#bs-transitionMs').value = s.transitionMs ?? 400;
      D.$('#bs-showArrows').value   = s.showArrows ? '1' : '0';
      D.$('#bs-loop').value         = s.loop ? '1' : '0';
    },

    async saveSettings(e) {
      e.preventDefault();
      const payload = {
        autoRotate:   D.$('#bs-autoRotate').value === '1',
        intervalMs:   parseInt(D.$('#bs-intervalMs').value, 10),
        transition:   D.$('#bs-transition').value,
        transitionMs: parseInt(D.$('#bs-transitionMs').value, 10),
        showArrows:   D.$('#bs-showArrows').value === '1',
        loop:         D.$('#bs-loop').value === '1'
      };
      const status = D.$('#bs-status');
      status.textContent = 'Saving…';
      try {
        await A.updateBannerSettings(payload);
        status.textContent = 'Saved ✔';
        setTimeout(()=>{ status.textContent = ''; }, 1500);
      } catch (err) {
        status.textContent = 'Failed: ' + err.message;
      }
    },

    async setActiveBanner(b, cardToHighlight) {
      if (!b) return;
      S.activeBannerId = b.id;
      D.highlightCard(cardToHighlight || document.querySelector(`[data-id="${b.id}"]`));

      const isVideo = (b.type === 'video') || (b.mime && String(b.mime).toLowerCase().startsWith('video/'));
      D.clearVideoPreview();

      if (isVideo) {
        D.updateSaveButtonsDisabled(true);
        D.renderPreviewPlaceholder();

        const container = D.ensureSavedVariantsContainer();
        container.innerHTML = '';
        const head = document.createElement('div');
        head.style.fontWeight = '700';
        head.style.marginBottom = '6px';
        head.textContent = 'Selected media';
        const note = document.createElement('div');
        note.className = 'muted tiny';
        note.textContent = 'This banner is a video. Cropping is not supported.';
        const vid = document.createElement('video');
        vid.id = 'bp-video-preview';
        vid.src = b.url;
        vid.controls = true;
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.style.width = '100%';
        vid.style.maxWidth = '720px';
        vid.style.borderRadius = '8px';
        vid.style.marginTop = '8px';

        container.appendChild(head);
        container.appendChild(note);
        container.appendChild(vid);
        return;
      }

      // IMAGE
      D.updateSaveButtonsDisabled(false);
      S.imgEl.onload = () => {
        S.naturalW = S.imgEl.naturalWidth || 0;
        S.naturalH = S.imgEl.naturalHeight || 0;
        D.updateStageSize();
        D.ensureCropOverlay();
        D.initBoxToImage();
      };
      S.imgEl.src = b.url;

      await E.loadCrops(S.activeBannerId).catch(()=>{});
    },

    async loadCrops(id) {
      try {
        const { crops } = await A.fetchCrops(id);
        const container = D.ensureSavedVariantsContainer();
        container.innerHTML = '';
        D.addSavedHeader(container);

        if (!Array.isArray(crops) || crops.length === 0) {
          const none = document.createElement('div');
          none.className = 'muted tiny';
          none.textContent = 'No saved crops yet.';
          container.appendChild(none);
          return;
        }

        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(220px,1fr))';
        grid.style.gap = '10px';

        crops.forEach(c => {
          const card = document.createElement('div');
          card.className = 'card';
          const title = document.createElement('div');
          title.style.fontWeight = '600';
          title.style.marginBottom = '6px';
          title.textContent = `${c.preset} — ${c.width}×${c.height}`;
          const img = document.createElement('img');
          img.src = c.url;
          img.alt = c.preset;
          img.style.width = '100%';
          img.style.height = '90px';
          img.style.objectFit = 'cover';
          img.style.borderRadius = '6px';
          const link = document.createElement('a');
          link.href = c.url;
          link.textContent = 'Open image';
          link.target = '_blank';
          link.style.display = 'inline-block';
          link.style.marginTop = '6px';
          link.style.fontSize = '12px';
          card.appendChild(title);
          card.appendChild(img);
          card.appendChild(link);
          grid.appendChild(card);
        });

        container.appendChild(grid);
      } catch (e) {
        const container = D.ensureSavedVariantsContainer();
        container.innerHTML = '';
        D.addSavedHeader(container);
        const msg = document.createElement('div');
        msg.className = 'muted tiny';
        msg.textContent = `Failed to load saved crops: ${e.message}`;
        container.appendChild(msg);
      }
    },

    async saveCrop(presetKey) {
      if (!S.activeBannerId) return alert('Select a banner (click “Edit / Crop” on an existing banner).');
      const preset = S.PRESETS[presetKey];
      if (!preset) return;

      try {
        const boxPx = D.stageBoxToOriginalBox();
        const statusBtn = document.getElementById(`bp-save-${presetKey}`);
        if (statusBtn) { statusBtn.disabled = true; statusBtn.textContent = `Saving ${preset.label}…`; }

        const payload = { preset: presetKey, width: preset.width, box: boxPx };
        const r = await A.putCrop(S.activeBannerId, payload);

        await E.loadCrops(S.activeBannerId);
        if (statusBtn) { statusBtn.disabled = false; statusBtn.textContent = `Save ${preset.label}`; }

        try {
          const saved = D.$('#bp-saved');
          if (saved) {
            const ok = document.createElement('div');
            ok.className = 'muted tiny';
            ok.textContent = `Saved ${preset.label} (${r.width}×${r.height})`;
            ok.style.marginTop = '6px';
            saved.appendChild(ok);
            setTimeout(() => ok.remove(), 1800);
          }
        } catch {}
      } catch (err) {
        alert('Save failed: ' + err.message);
        const statusBtn = document.getElementById(`bp-save-${presetKey}`);
        if (statusBtn) { statusBtn.disabled = false; statusBtn.textContent = `Save ${S.PRESETS[presetKey].label}`; }
      }
    },

    wirePresetButtons() {
      const BTN = {
        desktop: D.$('#bp-desktop'),
        laptop:  D.$('#bp-laptop'),
        tablet:  D.$('#bp-tablet'),
        wide:    D.$('#bp-wide'),
        reset:   D.$('#bp-reset'),
      };
      BTN.desktop?.addEventListener('click', ()=>{ S.activePresetKey='desktop1440'; D.updatePresetLabels(); D.initBoxToImage(); });
      BTN.laptop ?.addEventListener('click', ()=>{ S.activePresetKey='laptop1200';  D.updatePresetLabels(); D.initBoxToImage(); });
      BTN.tablet ?.addEventListener('click', ()=>{ S.activePresetKey='tablet1024';  D.updatePresetLabels(); D.initBoxToImage(); });
      BTN.wide   ?.addEventListener('click', ()=>{ S.activePresetKey='wide1920';    D.updatePresetLabels(); D.initBoxToImage(); });
      BTN.reset  ?.addEventListener('click', ()=>{ D.initBoxToImage(); });

      document.getElementById('bp-save-desktop1440')?.addEventListener('click', ()=> E.saveCrop('desktop1440'));
      document.getElementById('bp-save-laptop1200') ?.addEventListener('click', ()=> E.saveCrop('laptop1200'));
      document.getElementById('bp-save-tablet1024') ?.addEventListener('click', ()=> E.saveCrop('tablet1024'));
      document.getElementById('bp-save-wide1920')   ?.addEventListener('click', ()=> E.saveCrop('wide1920'));
    },

    injectSaveButtons() {
      const bar = (D.$('#bp-desktop') || D.$('#bp-laptop'))?.parentElement;
      if (!bar || D.$('#bp-save-desktop1440')) return;

      const savesBar = document.createElement('div');
      savesBar.style.display = 'flex';
      savesBar.style.gap = '6px';
      savesBar.style.flexWrap = 'wrap';
      savesBar.style.marginTop = '6px';

      Object.entries(S.PRESETS).forEach(([key, cfg]) => {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.id = `bp-save-${key}`;
        btn.textContent = `Save ${cfg.label}`;
        btn.addEventListener('click', () => E.saveCrop(key));
        savesBar.appendChild(btn);
      });

      bar.parentElement.insertBefore(savesBar, bar.nextSibling);
      D.updateSaveButtonsDisabled(!S.activeBannerId);
    },

    initPreview() {
      S.frameEl  = D.$('#bp-frame');
      S.imgEl    = D.$('#bp-img');
      S.fileInput= D.$('#banner-file');
      S.wlabel   = D.$('#bp-wlabel');
      S.rlabel   = D.$('#bp-ratiolabel');

      if (!S.frameEl || !S.imgEl) return;

      S.frameEl.style.width  = S.STAGE.width + 'px';
      S.frameEl.style.height = S.STAGE.height + 'px';
      S.imgEl.style.objectFit = 'contain';
      S.imgEl.style.objectPosition = '50% 50%';

      S.fileInput?.addEventListener('change', ()=>{
        const f = S.fileInput.files?.[0];
        if (!f) return;

        D.clearVideoPreview();

        const isImage = S.ALLOWED_IMAGE_MIME.has(f.type);
        const isVideo = S.ALLOWED_VIDEO_MIME.has(f.type);

        if (isVideo) {
          D.renderPreviewPlaceholder();
          D.updateSaveButtonsDisabled(true);

          const container = D.ensureSavedVariantsContainer();
          container.innerHTML = '';
          const head = document.createElement('div');
          head.style.fontWeight = '700';
          head.style.marginBottom = '6px';
          head.textContent = 'Selected media';
          const note = document.createElement('div');
          note.className = 'muted tiny';
          note.textContent = 'This banner is a video. Cropping is not supported.';
          const vid = document.createElement('video');
          vid.id = 'bp-video-preview';
          vid.src = URL.createObjectURL(f);
          vid.controls = true;
          vid.muted = true;
          vid.loop = true;
          vid.playsInline = true;
          vid.style.width = '100%';
          vid.style.maxWidth = '720px';
          vid.style.borderRadius = '8px';
          vid.style.marginTop = '8px';

          container.appendChild(head);
          container.appendChild(note);
          container.appendChild(vid);
          return;
        }

        const url = URL.createObjectURL(f);
        S.imgEl.onload = () => {
          S.naturalW = S.imgEl.naturalWidth || 0;
          S.naturalH = S.imgEl.naturalHeight || 0;
          D.updateStageSize();
          D.ensureCropOverlay();
          D.initBoxToImage();
        };
        S.imgEl.src = url;
        S.activeBannerId = null;
        D.updateSaveButtonsDisabled(true);
      });

      E.wirePresetButtons();
      E.injectSaveButtons();
      D.renderPreviewPlaceholder();
      D.updatePresetLabels();
    },
  };

  B.events = E;
})();
