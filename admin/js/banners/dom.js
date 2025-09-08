// admin/js/banners/dom.js
(function () {
  const B = (window.Banners = window.Banners || {});
  const S = B.state;

  const D = {
    $: (sel, root = document) => root.querySelector(sel),

    makeThumbForBanner(b) {
      const isVideo = (b.type === 'video') || (b.mime && String(b.mime).toLowerCase().startsWith('video/'));
      if (!isVideo) {
        const img = document.createElement('img');
        img.src = b.url;
        img.alt = 'banner';
        img.className = 'thumb';
        img.style.width = '100%';
        img.style.height = '120px';
        img.style.objectFit = 'cover';
        img.style.borderRadius = '8px';
        return img;
      }
      const vid = document.createElement('video');
      vid.src = b.url;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.autoplay = true;
      vid.style.width = '100%';
      vid.style.height = '120px';
      vid.style.objectFit = 'cover';
      vid.style.borderRadius = '8px';
      vid.setAttribute('aria-label', 'banner video');
      return vid;
    },

    highlightCard(card) {
      if (S.lastSelectedCard) S.lastSelectedCard.style.outline = '';
      if (card) {
        card.style.outline = '2px solid #ffbf47';
        S.lastSelectedCard = card;
      }
    },

    updateSaveButtonsDisabled(disabled) {
      ['bp-save-desktop1440','bp-save-laptop1200','bp-save-tablet1024','bp-save-wide1920'].forEach(id=>{
        const el = document.getElementById(id);
        if (el) el.disabled = !!disabled;
      });
    },

    renderPreviewPlaceholder() {
      if (!S.imgEl) return;
      S.imgEl.removeAttribute('src');
      S.naturalW = 0; S.naturalH = 0;
      D.updateSaveButtonsDisabled(true);
      const saved = D.$('#bp-saved');
      if (saved) {
        saved.innerHTML = '';
        const h = document.createElement('div');
        h.style.fontWeight = '700';
        h.style.marginBottom = '6px';
        h.textContent = 'Saved variants';
        const p = document.createElement('div');
        p.className = 'muted tiny';
        p.textContent = 'No saved crops yet.';
        saved.appendChild(h);
        saved.appendChild(p);
      }
    },

    clearVideoPreview() {
      const vp = document.getElementById('bp-video-preview');
      if (vp) vp.remove();
    },

    ensureSavedVariantsContainer() {
      let c = D.$('#bp-saved');
      if (c) return c;
      const previewCard = S.frameEl?.closest('.card') || document;
      c = document.createElement('div');
      c.id = 'bp-saved';
      c.style.marginTop = '12px';
      const note = previewCard.querySelector('p.muted.tiny:last-of-type');
      if (note && note.parentElement) {
        note.parentElement.appendChild(c);
      } else if (S.frameEl && S.frameEl.parentElement) {
        S.frameEl.parentElement.appendChild(c);
      } else {
        document.body.appendChild(c);
      }
      return c;
    },

    addSavedHeader(container){
      const h = document.createElement('div');
      h.style.fontWeight = '700';
      h.style.marginBottom = '6px';
      h.textContent = 'Saved variants';
      container.appendChild(h);
    },

    updatePresetLabels() {
      const p = S.PRESETS[S.activePresetKey];
      if (S.wlabel) S.wlabel.textContent = `${p.width}px`;
      if (S.rlabel) {
        const rr = (S.box.width && S.box.height) ? (S.box.width / S.box.height).toFixed(2) : 'freeform';
        S.rlabel.textContent = rr;
      }
    },

    getImageDrawRect() {
      const stageW = S.frameEl?.clientWidth || 0;
      const stageH = S.frameEl?.clientHeight || 0;
      if (!S.naturalW || !S.naturalH || !stageW || !stageH) return { left:0, top:0, drawW:0, drawH:0, scale:1 };
      const scale = Math.min(stageW / S.naturalW, stageH / S.naturalH);
      const drawW = S.naturalW * scale;
      const drawH = S.naturalH * scale;
      const left = (stageW - drawW) / 2;
      const top  = (stageH - drawH) / 2;
      return { left, top, drawW, drawH, scale };
    },

    updateStageSize() {
      if (!S.frameEl) return;
      S.frameEl.style.width  = Math.min(S.STAGE.width, S.frameEl.parentElement?.clientWidth || S.STAGE.width) + 'px';
      S.frameEl.style.height = S.STAGE.height + 'px';
      D.updatePresetLabels();
    },

    applyBox() {
      const cb = D.$('#cb-box', S.frameEl || document);
      if (!cb) return;
      cb.style.left   = S.box.left + 'px';
      cb.style.top    = S.box.top  + 'px';
      cb.style.width  = S.box.width  + 'px';
      cb.style.height = S.box.height + 'px';
      D.updatePresetLabels();
    },

    ensureCropOverlay() {
      if (!S.frameEl) return null;
      let overlay = D.$('#cb-overlay', S.frameEl);
      if (overlay) return overlay;

      overlay = document.createElement('div');
      overlay.id = 'cb-overlay';
      Object.assign(overlay.style, {
        position: 'absolute',
        inset: '0',
        pointerEvents: 'none',
      });
      S.frameEl.appendChild(overlay);

      const cb = document.createElement('div');
      cb.id = 'cb-box';
      Object.assign(cb.style, {
        position: 'absolute',
        border: '2px solid #3b82f6',
        borderRadius: '8px',
        boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
        background: 'transparent',
        cursor: 'move',
        pointerEvents: 'auto',
      });
      overlay.appendChild(cb);

      // handles
      const mkHandle = (cls, cursor, anchor) => {
        const h = document.createElement('div');
        h.className = `cb-h ${cls}`;
        Object.assign(h.style, {
          position: 'absolute',
          width: '12px', height: '12px',
          background: '#fff',
          border: '2px solid #3b82f6',
          borderRadius: '50%',
          boxShadow: '0 1px 3px rgba(0,0,0,.15)',
          cursor,
          zIndex: '3',
        });
        if (anchor.includes('n')) h.style.top = '-6px';
        if (anchor.includes('s')) h.style.bottom = '-6px';
        if (anchor.includes('w')) h.style.left = '-6px';
        if (anchor.includes('e')) h.style.right = '-6px';
        cb.appendChild(h);
        return h;
      };
      const hNW = mkHandle('cb-h-nw', 'nwse-resize', 'nw');
      const hNE = mkHandle('cb-h-ne', 'nesw-resize', 'ne');
      const hSW = mkHandle('cb-h-sw', 'nesw-resize', 'sw');
      const hSE = mkHandle('cb-h-se', 'nwse-resize', 'se');

      // drag-to-move
      let dragging = false, startX = 0, startY = 0, startBox = null;
      cb.addEventListener('mousedown', (e) => {
        if (e.target && (e.target.classList.contains('cb-h'))) return;
        dragging = true; startX = e.clientX; startY = e.clientY; startBox = { ...S.box };
        e.preventDefault();
      });
      window.addEventListener('mouseup', ()=> dragging = false);
      window.addEventListener('mousemove', (e)=>{
        if (!dragging) return;
        const { left:imgL, top:imgT, drawW, drawH } = D.getImageDrawRect();
        if (!drawW || !drawH) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let nx = startBox.left + dx;
        let ny = startBox.top  + dy;

        nx = S.clamp(nx, imgL, imgL + drawW - S.box.width);
        ny = S.clamp(ny, imgT, imgT + drawH - S.box.height);

        S.box.left = nx; S.box.top = ny;
        D.applyBox();
      });

      // corner resize — FREEFORM
      const startResize = (corner) => (e) => {
        e.stopPropagation(); e.preventDefault();
        const { left:imgL, top:imgT, drawW, drawH } = D.getImageDrawRect();
        if (!drawW || !drawH) return;

        const start = { x: e.clientX, y: e.clientY, box: { ...S.box }, imgL, imgT, drawW, drawH };
        const minW = 40, minH = 40;

        const onMove = (ev) => {
          const dx = ev.clientX - start.x;
          const dy = ev.clientY - start.y;

          let b = { ...start.box };
          let newLeft = b.left, newTop = b.top, newW = b.width, newH = b.height;

          if (corner.includes('e')) newW = Math.max(minW, start.box.width + dx);
          if (corner.includes('s')) newH = Math.max(minH, start.box.height + dy);
          if (corner.includes('w')) { newW = Math.max(minW, start.box.width - dx); newLeft = start.box.left + (start.box.width - newW); }
          if (corner.includes('n')) { newH = Math.max(minH, start.box.height - dy); newTop  = start.box.top  + (start.box.height - newH); }

          // clamp fully inside the drawn image rect
          if (newLeft < start.imgL) newLeft = start.imgL;
          if (newTop  < start.imgT) newTop  = start.imgT;
          if (newLeft + newW > start.imgL + start.drawW) newW = (start.imgL + start.drawW) - newLeft;
          if (newTop  + newH > start.imgT + start.drawH) newH = (start.imgT + start.drawH) - newTop;

          S.box = { left: newLeft, top: newTop, width: newW, height: newH };
          D.applyBox();
        };

        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      };

      hNW.addEventListener('mousedown', startResize('nw'));
      hNE.addEventListener('mousedown', startResize('ne'));
      hSW.addEventListener('mousedown', startResize('sw'));
      hSE.addEventListener('mousedown', startResize('se'));

      return overlay;
    },

    initBoxToImage() {
      const { left, top, drawW, drawH } = D.getImageDrawRect();
      if (!drawW || !drawH) return;
      const w = drawW * 0.9;
      const h = Math.max(60, Math.min(drawH * 0.5, w));
      const x = left + (drawW - w)/2;
      const y = top  + (drawH - h)/2;
      S.box = { left: x, top: y, width: w, height: h };
      D.applyBox();
    },

    stageBoxToOriginalBox() {
      const { left:imgL, top:imgT, scale } = D.getImageDrawRect();
      if (!S.naturalW || !S.naturalH || !scale) throw new Error('image not ready');

      let x = (S.box.left - imgL) / scale;
      let y = (S.box.top  - imgT)  / scale;
      let w = S.box.width  / scale;
      let h = S.box.height / scale;

      x = S.clamp(Math.round(x), 0, Math.max(0, S.naturalW - 1));
      y = S.clamp(Math.round(y), 0, Math.max(0, S.naturalH - 1));
      w = Math.max(1, Math.min(Math.round(w), S.naturalW - x));
      h = Math.max(1, Math.min(Math.round(h), S.naturalH - y));

      return { left: x, top: y, width: w, height: h };
    },
  };

  B.dom = D;
})();
