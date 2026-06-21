/* Leitz Label Studio — offline label designer for the Leitz Icon.
 * Renders labels at the printer's native 300 dpi so output is 1:1.
 * Vendored deps: qrcode-generator (QR), JsBarcode (Code 128). */
(() => {
  'use strict';

  const DPI = 300;
  const PX = DPI / 25.4;                 // pixels per millimetre
  const mm = v => Math.round(v * PX);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const clampLen = v => clamp(v || 10, 8, 2700);
  const STORE_KEY = 'leitzlabels.v2';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const escapeHtml = s => String(s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Continuous cartridge widths (mm). 88 = the 3.5" totes/tools cartridge.
  const WIDTHS = [88, 61, 57, 50, 39, 32, 25, 19, 12];
  // Real Leitz Icon die-cut cartridges: { h: tape width, l: label length }.
  const DIECUTS = [
    { h: 36, l: 88, name: '36 × 88 mm — Large address' },
    { h: 28, l: 88, name: '28 × 88 mm — Small address' },
    { h: 26, l: 88, name: '26 × 88 mm — Multipurpose' },
    { h: 50, l: 88, name: '50 × 88 mm — Small shipping' },
    { h: 59, l: 102, name: '59 × 102 mm — Large shipping' },
  ];

  // Starter templates — applied over the current design as a starting point.
  const TEMPLATES = [
    { id: 'tote', name: '📦 Storage tote', spec: { type: 'continuous', widthMm: 88, orient: 'h', lengthMode: 'auto', line1: 'GARAGE — POWER TOOLS', line2: 'Tote 01', align: 'left', qr: true, qrData: 'TOTE-01', barcode: false } },
    { id: 'tool', name: '🔧 Tool / equipment', spec: { type: 'continuous', widthMm: 39, orient: 'h', lengthMode: 'auto', line1: 'IMPACT DRIVER', line2: '18V · Kit 2', align: 'left', qr: false, barcode: true, bcData: 'TOOL-014' } },
    { id: 'bin', name: '🗄️ Shelf / bin', spec: { type: 'continuous', widthMm: 50, orient: 'h', lengthMode: 'fixed', lengthMm: 70, line1: 'BIN A3', line2: 'Fasteners', align: 'center', qr: false, barcode: false } },
    { id: 'cable', name: '🔌 Cable flag (rotated)', spec: { type: 'continuous', widthMm: 25, orient: 'v', lengthMode: 'auto', line1: 'CAM-1', line2: '', align: 'center', qr: false, barcode: false } },
    { id: 'qrlink', name: '🔗 Scan-to-open (QR link)', spec: { type: 'continuous', widthMm: 50, orient: 'h', lengthMode: 'auto', line1: 'PART 4471', line2: 'Scan for details', align: 'left', qr: true, qrData: 'https://example.com/part/4471', barcode: false } },
    { id: 'address', name: '✉️ Address', spec: { type: 'diecut', dieIdx: 0, orient: 'h', line1: 'John Smith', line2: '12 Oak St · Springfield', align: 'left', qr: false, barcode: false } },
    { id: 'shipping', name: '🚚 Shipping + QR', spec: { type: 'diecut', dieIdx: 4, orient: 'h', line1: 'SHIP TO — Order #1024', line2: 'Springfield, IL', align: 'left', qr: true, qrData: 'https://track.example.com/1024', barcode: false } },
    { id: 'badge', name: '🪪 Name badge', spec: { type: 'continuous', widthMm: 57, orient: 'h', lengthMode: 'fixed', lengthMm: 90, line1: 'ALEX MORGAN', line2: 'Operations', align: 'center', qr: false, barcode: false } },
  ];

  // Font choices (system fonts only — no downloads, works offline).
  const FONTS = {
    system: { name: 'System', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    rounded: { name: 'Rounded', css: '"SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif' },
    condensed: { name: 'Condensed', css: '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", sans-serif' },
    serif: { name: 'Serif', css: 'Georgia, "Times New Roman", "Noto Serif", serif' },
    mono: { name: 'Mono', css: '"SF Mono", Menlo, Consolas, "Roboto Mono", monospace' },
  };

  // Tape colours for the preview only (print is always black on the physical tape).
  const TAPES = [
    { c: '#ffffff', n: 'White' }, { c: '#ffd400', n: 'Yellow' }, { c: '#ff7a1a', n: 'Orange' },
    { c: '#e23b3b', n: 'Red' }, { c: '#33b35a', n: 'Green' }, { c: '#2e7fe0', n: 'Blue' },
    { c: '#c7ccd1', n: 'Silver' },
  ];

  const defaultDesign = () => ({
    type: 'continuous', widthMm: 88, dieIdx: 0, orient: 'h',
    lengthMode: 'auto', lengthMm: 100,
    line1: 'GARAGE — POWER TOOLS', line2: 'Tote 01', line3: '',
    bold: true, align: 'left', font: 'system', symbol: 'none', border: 'none', tape: '#ffffff', invert: false,
    qr: true, qrData: 'TOTE-01', qrType: 'text', qrEcc: 'M', qrScale: 100, qrLogo: false,
    qrPass: '', qrEnc: 'WPA', qrHidden: false, qrSubject: '', qrBody: '', qrMsg: '',
    qrOrg: '', qrPhone: '', qrEmail: '',
    barcode: false, bcData: '',
    logo: false, logoId: null, logoPos: 'left', marginMm: 2,
  });
  const defaultBulk = () => ({
    type: 'continuous', widthMm: 88, dieIdx: 0, orient: 'h',
    lengthMode: 'auto', lengthMm: 100, layout: 'text-qr', font: 'system',
    symbol: 'none', border: 'none', copies: 1, invert: false,
    qrPrefix: '', qrEcc: 'M',
    logo: false, logoId: null, logoPos: 'left', items: '',
  });
  const defaults = () => ({
    design: defaultDesign(), bulk: defaultBulk(),
    settings: { units: 'mm', cal: { dx: 0, dy: 0, scale: 100 } },
    assets: { logos: [] }, saved: [], presets: [], scanLog: [], queue: [],
  });

  // Normalise a parsed blob into a complete state object.
  function normalizeState(p) {
    const d = defaults();
    if (!p || !p.design) return d;
    const s = {
      design: { ...d.design, ...p.design }, bulk: { ...d.bulk, ...p.bulk },
      settings: { ...d.settings, ...p.settings, cal: { ...d.settings.cal, ...(p.settings && p.settings.cal) } },
      assets: { logos: (p.assets && p.assets.logos) || [] },
      saved: p.saved || [], presets: p.presets || [], scanLog: p.scanLog || [], queue: p.queue || [],
    };
    // Migrate the old single-logo asset to the new gallery.
    if (p.assets && p.assets.logo && !s.assets.logos.length) {
      const id = uid();
      s.assets.logos = [{ id, url: p.assets.logo }];
      if (s.design.logo) s.design.logoId = id;
      if (s.bulk.logo) s.bulk.logoId = id;
    }
    return s;
  }

  /* ---------------- IndexedDB persistence ---------------- */
  // Primary store is IndexedDB (large capacity for logos/backups); we migrate
  // any existing localStorage data on first run.
  const IDB_NAME = 'leitzlabels', IDB_STORE = 'kv', IDB_KEY = 'state';
  let idbPromise = null;
  function openIDB() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no idb'));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return idbPromise;
  }
  function idbGet(key) {
    return openIDB().then(db => new Promise((res, rej) => {
      const r = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  }
  function idbSet(key, val) {
    return openIDB().then(db => new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(val, key);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    }));
  }

  let state = defaults();
  async function loadState() {
    try {
      const rec = await idbGet(IDB_KEY);
      if (rec) return normalizeState(rec);
    } catch (e) { /* fall through to localStorage */ }
    // Migrate from the previous localStorage store, if present.
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = normalizeState(JSON.parse(raw));
        idbSet(IDB_KEY, s).then(() => { try { localStorage.removeItem(STORE_KEY); } catch (e) {} }).catch(() => {});
        return s;
      }
    } catch (e) {}
    return defaults();
  }

  let saveTimer = null, quotaWarned = false;
  function persist() {
    idbSet(IDB_KEY, state).then(() => { quotaWarned = false; }).catch(() => {
      // Fall back to localStorage; warn once if even that fails (quota).
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch (e) { if (!quotaWarned) { quotaWarned = true; toast('Storage full — back up & remove a logo'); } }
    });
  }
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 150); };

  /* ---------------- Units (display only; internal is always mm) ---------------- */
  const unit = () => state.settings.units;
  const uToMm = v => unit() === 'in' ? v * 25.4 : v;
  const mmToU = v => unit() === 'in' ? v / 25.4 : v;
  const fmtU = v => unit() === 'in' ? (v / 25.4).toFixed(2) : Math.round(v).toString();

  /* ---------------- Logo gallery ---------------- */
  const logoImgs = {};                 // id -> HTMLImageElement (decoded)
  function cacheLogo(id, url, cb) {
    const img = new Image();
    img.onload = () => { logoImgs[id] = img; if (cb) cb(); };
    img.onerror = () => { if (cb) cb(); };
    img.src = url;
  }
  function loadAllLogos(cb) {
    const list = state.assets.logos;
    if (!list.length) { if (cb) cb(); return; }
    let n = list.length;
    list.forEach(l => cacheLogo(l.id, l.url, () => { if (--n === 0 && cb) cb(); }));
  }
  const getLogoImg = id => logoImgs[id] || null;
  const firstLogoImg = () => (state.assets.logos[0] && getLogoImg(state.assets.logos[0].id)) || null;
  function rerenderActive() {
    if ($('#view-bulk').classList.contains('is-active')) renderBulk();
    else renderDesign();
  }
  // Downscale on import so the stored data URL stays small, then select it.
  function addLogoFromFile(file, st, afterFill) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 800;
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const cw = Math.max(1, Math.round(img.naturalWidth * s));
        const ch = Math.max(1, Math.round(img.naturalHeight * s));
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
        const url = cv.toDataURL('image/png');
        const id = uid();
        state.assets.logos.push({ id, url });
        st.logo = true; st.logoId = id;
        save();
        cacheLogo(id, url, () => { if (afterFill) afterFill(); rerenderActive(); });
        toast('Logo added');
      };
      img.onerror = () => toast('Could not read that image');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function removeLogoAsset(id) {
    state.assets.logos = state.assets.logos.filter(l => l.id !== id);
    delete logoImgs[id];
    [state.design, state.bulk].forEach(st => { if (st.logoId === id) st.logoId = null; });
    state.saved.forEach(s => { if (s.spec && s.spec.logoId === id) s.spec.logoId = null; });
    save();
  }
  // Renders the thumbnail picker + add button for a tab's logo section.
  function renderLogoGallery(prefix, st) {
    const wrap = $(`#${prefix}_logoGallery`);
    if (!wrap) return;
    wrap.innerHTML = state.assets.logos.map(l =>
      `<button type="button" class="logo-thumb ${l.id === st.logoId ? 'is-active' : ''}" data-logo="${l.id}">
         <img src="${l.url}" alt="logo" /><span class="logo-del" data-del="${l.id}">✕</span>
       </button>`).join('') +
      `<button type="button" class="logo-thumb add" data-add="1" aria-label="Add logo">＋</button>`;
    $$(`#${prefix}_logoWrap [data-pos]`).forEach(b =>
      b.classList.toggle('is-active', b.dataset.pos === st.logoPos));
  }

  /* ---------------- Rendering engine ---------------- */
  const scratch = document.createElement('canvas').getContext('2d');
  const fontStr = (px, bold, font) =>
    `${bold ? '700' : '500'} ${px}px ${(FONTS[font] || FONTS.system).css}`;

  // Cap auto text height so one long line doesn't create a metre-long label.
  const MAX_FONT_PX = mm(26);

  function fitFont(lines, boxW, boxH, bold, font) {
    let lo = 6, hi = Math.min(Math.floor(boxH), MAX_FONT_PX), best = lo;
    while (lo <= hi) {
      const f = (lo + hi) >> 1;
      const f2 = Math.round(f * 0.58);
      let widest = 0, totalH = 0;
      lines.forEach((ln, i) => {
        const fs = i === 0 ? f : f2;
        scratch.font = fontStr(fs, bold, font);
        widest = Math.max(widest, scratch.measureText(ln).width);
        totalH += i === 0 ? fs * 1.16 : fs * 1.3;
      });
      if (widest <= boxW && totalH <= boxH) { best = f; lo = f + 1; }
      else hi = f - 1;
    }
    return best;
  }

  // Substitute {date} {time} {n} {n:NN} (NN = zero-pad width) tokens.
  function applyTokens(str, index) {
    if (!str || str.indexOf('{') < 0) return str || '';
    const now = new Date();
    return str
      .replace(/\{date\}/gi, now.toLocaleDateString())
      .replace(/\{time\}/gi, now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
      .replace(/\{n(?::(\d+))?\}/gi, (_, w) => String(index || 1).padStart(w ? +w : 0, '0'));
  }

  // Built-in monochrome symbols, drawn as vector paths in a square box.
  const SYMBOLS = {
    none: { name: 'None' },
    warning: { name: '⚠ Warning' }, fragile: { name: '🍷 Fragile' },
    up: { name: '↑↑ This way up' }, dry: { name: '☂ Keep dry' },
    flammable: { name: '🔥 Flammable' }, bolt: { name: '⚡ Electrical' },
    arrow: { name: '→ Arrow' }, recycle: { name: '♻ Recycle' },
  };
  function drawSymbol(ctx, id, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color || '#000'; ctx.strokeStyle = color || '#000';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const lw = s * 0.07; ctx.lineWidth = lw;
    const P = (fn) => { ctx.beginPath(); fn(); };
    switch (id) {
      case 'warning':
        P(() => { ctx.moveTo(s * 0.5, s * 0.1); ctx.lineTo(s * 0.94, s * 0.86); ctx.lineTo(s * 0.06, s * 0.86); ctx.closePath(); });
        ctx.stroke();
        ctx.fillRect(s * 0.46, s * 0.36, s * 0.08, s * 0.26);
        ctx.beginPath(); ctx.arc(s * 0.5, s * 0.74, s * 0.05, 0, 7); ctx.fill();
        break;
      case 'fragile':
        P(() => { ctx.moveTo(s * 0.38, s * 0.12); ctx.lineTo(s * 0.62, s * 0.12); ctx.lineTo(s * 0.57, s * 0.4);
          ctx.quadraticCurveTo(s * 0.5, s * 0.5, s * 0.43, s * 0.4); ctx.closePath(); }); ctx.fill();
        ctx.fillRect(s * 0.48, s * 0.5, s * 0.04, s * 0.28);
        ctx.fillRect(s * 0.34, s * 0.82, s * 0.32, s * 0.06);
        break;
      case 'up':
        [0.34, 0.66].forEach(cx => {
          P(() => { ctx.moveTo(s * cx, s * 0.16); ctx.lineTo(s * (cx + 0.13), s * 0.42); ctx.lineTo(s * (cx + 0.05), s * 0.42);
            ctx.lineTo(s * (cx + 0.05), s * 0.8); ctx.lineTo(s * (cx - 0.05), s * 0.8); ctx.lineTo(s * (cx - 0.05), s * 0.42);
            ctx.lineTo(s * (cx - 0.13), s * 0.42); ctx.closePath(); }); ctx.fill();
        });
        break;
      case 'dry':
        P(() => { ctx.arc(s * 0.5, s * 0.42, s * 0.3, Math.PI, 0); }); ctx.fill();
        ctx.fillRect(s * 0.47, s * 0.42, s * 0.06, s * 0.34);
        P(() => { ctx.arc(s * 0.5, s * 0.76, s * 0.1, 0, Math.PI); }); ctx.lineWidth = s * 0.06; ctx.stroke();
        break;
      case 'flammable':
        P(() => { ctx.moveTo(s * 0.5, s * 0.12); ctx.quadraticCurveTo(s * 0.82, s * 0.46, s * 0.66, s * 0.7);
          ctx.quadraticCurveTo(s * 0.64, s * 0.9, s * 0.4, s * 0.86); ctx.quadraticCurveTo(s * 0.2, s * 0.78, s * 0.34, s * 0.52);
          ctx.quadraticCurveTo(s * 0.38, s * 0.62, s * 0.46, s * 0.6); ctx.quadraticCurveTo(s * 0.4, s * 0.36, s * 0.5, s * 0.12); });
        ctx.fill();
        break;
      case 'bolt':
        P(() => { ctx.moveTo(s * 0.56, s * 0.1); ctx.lineTo(s * 0.28, s * 0.56); ctx.lineTo(s * 0.46, s * 0.56);
          ctx.lineTo(s * 0.4, s * 0.9); ctx.lineTo(s * 0.72, s * 0.42); ctx.lineTo(s * 0.52, s * 0.42); ctx.closePath(); });
        ctx.fill();
        break;
      case 'arrow':
        P(() => { ctx.moveTo(s * 0.12, s * 0.5); ctx.lineTo(s * 0.6, s * 0.5); }); ctx.lineWidth = s * 0.12; ctx.stroke();
        P(() => { ctx.moveTo(s * 0.56, s * 0.28); ctx.lineTo(s * 0.88, s * 0.5); ctx.lineTo(s * 0.56, s * 0.72); ctx.closePath(); }); ctx.fill();
        break;
      case 'recycle':
        ctx.lineWidth = s * 0.09;
        for (let k = 0; k < 3; k++) {
          ctx.save(); ctx.translate(s * 0.5, s * 0.5); ctx.rotate(k * 2 * Math.PI / 3);
          P(() => { ctx.arc(0, 0, s * 0.3, -Math.PI / 2 - 0.5, -Math.PI / 6); }); ctx.stroke();
          const ax = s * 0.3 * Math.cos(-Math.PI / 6), ay = s * 0.3 * Math.sin(-Math.PI / 6);
          P(() => { ctx.moveTo(ax - s * 0.02, ay - s * 0.12); ctx.lineTo(ax + s * 0.12, ay + s * 0.02); ctx.lineTo(ax - s * 0.12, ay + s * 0.06); ctx.closePath(); }); ctx.fill();
          ctx.restore();
        }
        break;
    }
    ctx.restore();
  }


  // Build the encoded string for a QR from its content-type fields.
  function qrPayload(s) {
    const v = x => (x || '').trim();
    const prim = v(s.qrData);
    switch (s.qrType) {
      case 'url': {
        let u = prim;
        if (u && !/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
        return u;
      }
      case 'phone': return prim ? 'tel:' + prim : '';
      case 'sms': return prim ? 'SMSTO:' + prim + (v(s.qrMsg) ? ':' + v(s.qrMsg) : '') : '';
      case 'email': {
        const q = [];
        if (v(s.qrSubject)) q.push('subject=' + encodeURIComponent(v(s.qrSubject)));
        if (v(s.qrBody)) q.push('body=' + encodeURIComponent(v(s.qrBody)));
        return prim ? 'mailto:' + prim + (q.length ? '?' + q.join('&') : '') : '';
      }
      case 'wifi': {
        const esc = x => String(x).replace(/([\\;,:"])/g, '\\$1');
        const enc = s.qrEnc || 'WPA';
        return prim ? `WIFI:T:${enc};S:${esc(prim)};` +
          (enc === 'nopass' ? '' : `P:${esc(v(s.qrPass))};`) +
          (s.qrHidden ? 'H:true;' : '') + ';' : '';
      }
      case 'contact':
        return prim ? ['BEGIN:VCARD', 'VERSION:3.0', `N:${prim}`, `FN:${prim}`,
          v(s.qrOrg) && `ORG:${v(s.qrOrg)}`, v(s.qrPhone) && `TEL:${v(s.qrPhone)}`,
          v(s.qrEmail) && `EMAIL:${v(s.qrEmail)}`, 'END:VCARD'].filter(Boolean).join('\n') : '';
      default: return prim;
    }
  }

  function drawQR(ctx, data, x, y, size, ecc, logoImage) {
    const qr = qrcode(0, ecc || 'M');
    qr.addData(data || ' ');
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 2;
    const cell = size / (n + quiet * 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c))
          ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell),
                       Math.ceil(cell), Math.ceil(cell));
    // Optional centre logo (knock out a white pad first; relies on high ECC).
    if (logoImage && logoImage.naturalWidth) {
      const ls = size * 0.22, pad = cell * 0.8;
      const lx = x + (size - ls) / 2, ly = y + (size - ls) / 2;
      ctx.fillStyle = '#fff';
      ctx.fillRect(lx - pad, ly - pad, ls + 2 * pad, ls + 2 * pad);
      drawLogo(ctx, logoImage, lx, ly, ls, ls);
    }
  }

  function drawBarcode(ctx, data, x, y, w, h) {
    try {
      const off = document.createElement('canvas');
      window.JsBarcode(off, String(data || ' '), {
        format: 'CODE128', displayValue: false, margin: 0, width: 2,
        height: Math.max(10, h), background: '#ffffff', lineColor: '#000000',
      });
      ctx.drawImage(off, x, y, w, h);
      return true;
    } catch (e) { return false; }
  }

  function drawLogo(ctx, img, x, y, boxW, boxH) {
    const s = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
  }

  // Compute a layout plan (positions only) shared by the canvas + SVG renderers.
  function planLabel(spec, heightMm, forcedLen, marginMm) {
    const idx = spec._index || 1;
    const lines = [spec.line1, spec.line2, spec.line3].map(l => applyTokens(l, idx)).filter(Boolean);
    const hasText = lines.length > 0;
    const hPx = mm(heightMm), mPx = mm(marginMm), innerH = hPx - 2 * mPx, gap = mm(2.5);
    const logoImage = spec.logo ? getLogoImg(spec.logoId) : null;
    const useLogo = !!(logoImage && logoImage.naturalWidth);
    const logoW = useLogo ? Math.min(logoImage.naturalWidth / logoImage.naturalHeight * innerH, innerH * 1.5) : 0;
    const logoRight = useLogo && spec.logoPos === 'right';
    const useSymbol = !!(spec.symbol && spec.symbol !== 'none' && SYMBOLS[spec.symbol]);
    const symW = useSymbol ? innerH * 0.95 : 0;

    let lengthMm;
    if (forcedLen != null) {
      lengthMm = clampLen(forcedLen);
    } else {
      const qrW = spec.qr ? innerH * clamp((spec.qrScale ?? 100) / 100, 0.4, 1) : 0;
      let textW = 0;
      if (hasText) {
        const probe = Math.min(MAX_FONT_PX, Math.round(innerH * (lines[1] ? 0.5 : 0.66)));
        scratch.font = fontStr(probe, spec.bold, spec.font);
        textW = scratch.measureText(lines[0]).width;
        for (let i = 1; i < lines.length; i++) {
          scratch.font = fontStr(Math.round(probe * 0.58), spec.bold, spec.font);
          textW = Math.max(textW, scratch.measureText(lines[i]).width);
        }
      }
      let lp = (2 * mPx + (symW ? symW + gap : 0) + (logoW ? logoW + gap : 0) + textW + (qrW ? qrW + gap : 0) + mm(4)) / PX;
      if (spec.barcode) lp = Math.max(lp, 55);
      lengthMm = clamp(lp, (spec.qr || useLogo || useSymbol) ? heightMm : 22, 2700);
    }

    const wPx = mm(lengthMm);
    const els = [];
    let x0 = mPx, y0 = mPx, x1 = wPx - mPx, y1 = hPx - mPx;
    if (spec.border && spec.border !== 'none') {
      const bw = spec.border === 'thick' ? mm(1.4) : mm(0.6);
      const inset = bw / 2 + mm(0.6);
      els.push({ t: 'border', x: inset, y: inset, w: wPx - 2 * inset, h: hPx - 2 * inset, lw: bw });
      const pad = bw + mm(1.2); x0 += pad; y0 += pad; x1 -= pad; y1 -= pad;
    }
    const innerHd = y1 - y0;
    if (useSymbol) { els.push({ t: 'symbol', id: spec.symbol, x: x0, y: y0 + (innerHd - symW) / 2, s: symW }); x0 += symW + gap; }
    if (useLogo && !logoRight) { els.push({ t: 'logo', img: logoImage, x: x0, y: y0, w: logoW, h: innerHd }); x0 += logoW + gap; }
    if (logoRight) { els.push({ t: 'logo', img: logoImage, x: x1 - logoW, y: y0, w: logoW, h: innerHd }); x1 -= logoW + gap; }
    if (spec.qr) {
      const scale = clamp((spec.qrScale ?? 100) / 100, 0.4, 1);
      const qsize = Math.min(innerHd * scale, (x1 - x0) * 0.85);
      const effEcc = spec.qrLogo ? 'H' : (spec.qrEcc || 'M');
      const li = spec.qrLogo ? (getLogoImg(spec.logoId) || firstLogoImg()) : null;
      els.push({ t: 'qr', data: applyTokens(qrPayload(spec), idx) || lines[0] || ' ', ecc: effEcc, centerLogo: li, x: x1 - qsize, y: y0 + (innerHd - qsize) / 2, size: qsize });
      x1 -= qsize + gap;
    }
    if (spec.barcode) {
      const bcH = Math.min(innerHd * 0.45, mm(14));
      els.push({ t: 'barcode', data: applyTokens(spec.bcData, idx) || lines[0] || ' ', x: x0, y: y1 - bcH, w: Math.max(1, x1 - x0), h: bcH });
      y1 -= bcH + mm(1.5);
    }
    if (hasText && x1 - x0 > 4) {
      const boxW = x1 - x0, boxH = y1 - y0;
      const f = fitFont(lines, boxW, boxH, spec.bold, spec.font);
      const f2 = Math.round(f * 0.58);
      let totalH = 0;
      const heights = lines.map((ln, i) => { const h = i === 0 ? f * 1.16 : f2 * 1.3; totalH += h; return h; });
      let ty = y0 + (boxH - totalH) / 2;
      const anchor = spec.align === 'center' ? 'center' : 'left';
      const tx = spec.align === 'center' ? x0 + boxW / 2 : x0;
      lines.forEach((ln, i) => {
        els.push({ t: 'text', text: ln, size: i === 0 ? f : f2, x: tx, y: ty, anchor, bold: spec.bold, font: spec.font });
        ty += heights[i];
      });
    }
    return { wPx, hPx, wmm: lengthMm, hmm: heightMm, els, invert: !!spec.invert };
  }
  function drawPlan(ctx, plan, bg) {
    const ink = plan.invert ? '#fff' : '#000';
    ctx.fillStyle = plan.invert ? '#000' : (bg || '#fff');
    ctx.fillRect(0, 0, plan.wPx, plan.hPx);
    plan.els.forEach(e => {
      if (e.t === 'border') { ctx.strokeStyle = ink; ctx.lineWidth = e.lw; ctx.strokeRect(e.x, e.y, e.w, e.h); }
      else if (e.t === 'symbol') drawSymbol(ctx, e.id, e.x, e.y, e.s, ink);
      else if (e.t === 'logo') drawLogo(ctx, e.img, e.x, e.y, e.w, e.h);
      else if (e.t === 'qr') drawQR(ctx, e.data, e.x, e.y, e.size, e.ecc, e.centerLogo);
      else if (e.t === 'barcode') drawBarcode(ctx, e.data, e.x, e.y, e.w, e.h);
      else if (e.t === 'text') {
        ctx.fillStyle = ink; ctx.textBaseline = 'top';
        ctx.textAlign = e.anchor === 'center' ? 'center' : 'left';
        ctx.font = fontStr(e.size, e.bold, e.font);
        ctx.fillText(e.text, e.x, e.y);
      }
    });
  }
  function composeHorizontal(spec, heightMm, forcedLen, marginMm, bg) {
    const plan = planLabel(spec, heightMm, forcedLen, marginMm);
    const canvas = document.createElement('canvas');
    canvas.width = plan.wPx; canvas.height = plan.hPx;
    drawPlan(canvas.getContext('2d'), plan, bg);
    return { canvas, wmm: plan.wmm, hmm: plan.hmm };
  }

  /* spec -> { canvas, wmm, hmm }. Handles die-cut + 90° rotation.
   * bg tints the label background for preview (visualising coloured tape);
   * exports always pass white. */
  function renderLabel(spec, bg) {
    const die = spec.type === 'diecut' ? DIECUTS[spec.dieIdx || 0] : null;
    const heightMm = die ? die.h : spec.widthMm;
    const forcedLen = die ? die.l : (spec.lengthMode === 'fixed' ? clampLen(spec.lengthMm) : null);
    const base = composeHorizontal(spec, heightMm, forcedLen, Math.max(0, spec.marginMm ?? 2), bg);

    if (spec.orient === 'v') {
      const r = document.createElement('canvas');
      r.width = base.canvas.height; r.height = base.canvas.width;
      const c = r.getContext('2d');
      c.translate(0, r.height); c.rotate(-Math.PI / 2); c.drawImage(base.canvas, 0, 0);
      return { canvas: r, wmm: base.hmm, hmm: base.wmm };
    }
    return base;
  }

  /* ---------------- Export / print ---------------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const exportPNG = (label, name) => label.canvas.toBlob(b => { download(b, name); toast('PNG saved'); }, 'image/png');
  async function exportPDF(labels, name) {
    toast('Building PDF…');
    const blob = await window.LabelPDF.buildPDF(
      labels.map(l => ({ canvas: l.canvas, wmm: l.wmm, hmm: l.hmm })), state.settings.cal);
    download(blob, name);
    toast(`PDF saved · ${labels.length} label${labels.length > 1 ? 's' : ''}`);
  }
  function printLabels(labels) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print'); return; }
    const cal = state.settings.cal || { dx: 0, dy: 0, scale: 100 };
    const tf = `translate(${cal.dx}mm, ${cal.dy}mm) scale(${(cal.scale || 100) / 100})`;
    const pages = labels.map(l => {
      const url = l.canvas.toDataURL('image/png');
      return `<div class="pg" style="width:${l.wmm}mm;height:${l.hmm}mm">` +
        `<img src="${url}" style="width:${l.wmm}mm;height:${l.hmm}mm;transform:${tf};transform-origin:center"/></div>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print labels</title>
      <style>@page{margin:0}html,body{margin:0;padding:0}.pg{page-break-after:always;display:block;overflow:hidden}img{display:block}
      @media screen{body{background:#777;padding:12px}.pg{background:#fff;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.4)}}</style>
      </head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }
  // Expand labels by a per-job copies count.
  const withCopies = (labels, n) => {
    n = Math.max(1, Math.min(99, n | 0));
    if (n === 1) return labels;
    const out = [];
    labels.forEach(l => { for (let i = 0; i < n; i++) out.push(l); });
    return out;
  };
  const labelName = s => (String(s || 'label').replace(/[^\w-]+/g, '_').slice(0, 24) || 'label');

  /* ---------------- SVG (vector) export ---------------- */
  // Text + QR + border are true vector; logo/symbol/barcode embed crisp rasters.
  function qrPathD(data, ecc, x, y, size) {
    const qr = qrcode(0, ecc || 'M'); qr.addData(data || ' '); qr.make();
    const n = qr.getModuleCount(), quiet = 2, cell = size / (n + quiet * 2);
    let d = '';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) {
          const px = x + (c + quiet) * cell, py = y + (r + quiet) * cell;
          d += `M${px.toFixed(2)} ${py.toFixed(2)}h${cell.toFixed(2)}v${cell.toFixed(2)}h${(-cell).toFixed(2)}z`;
        }
    return d;
  }
  function rasterDataURL(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    draw(c.getContext('2d'), c.width, c.height);
    return c.toDataURL('image/png');
  }
  function svgEl(e, ink) {
    ink = ink || '#000';
    if (e.t === 'border')
      return `<rect x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" width="${e.w.toFixed(2)}" height="${e.h.toFixed(2)}" fill="none" stroke="${ink}" stroke-width="${e.lw.toFixed(2)}"/>`;
    if (e.t === 'text')
      return `<text x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" font-family="${escapeHtml((FONTS[e.font] || FONTS.system).css)}" font-size="${e.size.toFixed(1)}" font-weight="${e.bold ? 700 : 500}" fill="${ink}" text-anchor="${e.anchor === 'center' ? 'middle' : 'start'}" dominant-baseline="text-before-edge">${escapeHtml(e.text)}</text>`;
    if (e.t === 'qr') {
      let s = `<rect x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" width="${e.size.toFixed(2)}" height="${e.size.toFixed(2)}" fill="#fff"/>` +
        `<path d="${qrPathD(e.data, e.ecc, e.x, e.y, e.size)}" fill="#000"/>`;
      if (e.centerLogo && e.centerLogo.src) {
        const ls = e.size * 0.22, lx = e.x + (e.size - ls) / 2, ly = e.y + (e.size - ls) / 2, pad = ls * 0.18;
        s += `<rect x="${(lx - pad).toFixed(2)}" y="${(ly - pad).toFixed(2)}" width="${(ls + 2 * pad).toFixed(2)}" height="${(ls + 2 * pad).toFixed(2)}" fill="#fff"/>` +
          `<image x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${ls.toFixed(2)}" height="${ls.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${e.centerLogo.src}"/>`;
      }
      return s;
    }
    if (e.t === 'logo')
      return `<image x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" width="${e.w.toFixed(2)}" height="${e.h.toFixed(2)}" preserveAspectRatio="xMidYMid meet" href="${e.img.src}"/>`;
    if (e.t === 'symbol') {
      const url = rasterDataURL(e.s, e.s, (c) => drawSymbol(c, e.id, 0, 0, e.s, ink));
      return `<image x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" width="${e.s.toFixed(2)}" height="${e.s.toFixed(2)}" href="${url}"/>`;
    }
    if (e.t === 'barcode') {
      const url = rasterDataURL(e.w, e.h, (c, w, h) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, h); drawBarcode(c, e.data, 0, 0, w, h); });
      return `<image x="${e.x.toFixed(2)}" y="${e.y.toFixed(2)}" width="${e.w.toFixed(2)}" height="${e.h.toFixed(2)}" preserveAspectRatio="none" href="${url}"/>`;
    }
    return '';
  }
  function svgForSpec(spec) {
    const die = spec.type === 'diecut' ? DIECUTS[spec.dieIdx || 0] : null;
    const heightMm = die ? die.h : spec.widthMm;
    const forcedLen = die ? die.l : (spec.lengthMode === 'fixed' ? clampLen(spec.lengthMm) : null);
    const plan = planLabel(spec, heightMm, forcedLen, Math.max(0, spec.marginMm ?? 2));
    const W = plan.wPx, H = plan.hPx;
    const ink = plan.invert ? '#fff' : '#000';
    let body = `<rect width="${W}" height="${H}" fill="${plan.invert ? '#000' : '#fff'}"/>` + plan.els.map(e => svgEl(e, ink)).join('');
    let wmm = plan.wmm, hmm = plan.hmm, vbW = W, vbH = H;
    if (spec.orient === 'v') {
      body = `<g transform="translate(0 ${W}) rotate(-90)">${body}</g>`;
      wmm = plan.hmm; hmm = plan.wmm; vbW = H; vbH = W;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" width="${wmm}mm" height="${hmm}mm" viewBox="0 0 ${vbW} ${vbH}">${body}</svg>`;
  }
  function exportSVG(spec, name) {
    download(new Blob([svgForSpec(spec)], { type: 'image/svg+xml' }), name);
    toast('SVG saved');
  }

  /* ---------------- Format control wiring (shared) ---------------- */
  // Populate a continuous-width <select> and die-cut <select>.
  function fillFormatSelects(prefix, st) {
    $(`#${prefix}_width`).innerHTML = WIDTHS.map(w =>
      `<option value="${w}" ${w === st.widthMm ? 'selected' : ''}>${w} mm${w === 88 ? ' (3.5")' : ''}</option>`).join('');
    $(`#${prefix}_die`).innerHTML = DIECUTS.map((d, i) =>
      `<option value="${i}" ${i === st.dieIdx ? 'selected' : ''}>${d.name}</option>`).join('');
  }
  function syncFormatUI(prefix, st) {
    const cont = st.type === 'continuous';
    $(`#${prefix}_widthWrap`).hidden = !cont;
    $(`#${prefix}_dieWrap`).hidden = cont;
    const lenWrap = $(`#${prefix}_lenWrap`);
    if (lenWrap) lenWrap.hidden = !cont;            // die-cut length is fixed
    $$(`#view-${prefix === 'd' ? 'design' : 'bulk'} [data-type]`).forEach(b =>
      b.classList.toggle('is-active', b.dataset.type === st.type));
    $$(`#view-${prefix === 'd' ? 'design' : 'bulk'} [data-orient]`).forEach(b =>
      b.classList.toggle('is-active', b.dataset.orient === st.orient));
  }

  /* ---------------- Design tab ---------------- */
  let currentDesignLabel = null;
  function readDesign() {
    const d = state.design;
    d.widthMm = +$('#d_width').value;
    d.dieIdx = +$('#d_die').value;
    d.lengthMm = uToMm(+$('#d_length').value || mmToU(100));
    d.logo = $('#d_logo').checked;
    d.font = $('#d_font').value;
    d.symbol = $('#d_symbol').value;
    d.border = $('#d_border').value;
    d.invert = $('#d_invert').checked;
    d.line1 = $('#d_line1').value;
    d.line2 = $('#d_line2').value;
    d.line3 = $('#d_line3').value;
    d.bold = $('#d_bold').checked;
    d.align = $('#d_align').value;
    d.qr = $('#d_qr').checked;
    d.qrData = $('#d_qrData').value;
    d.qrType = $('#d_qrType').value;
    d.qrEcc = $('#d_qrEcc').value;
    d.qrScale = +$('#d_qrSize').value;
    d.qrLogo = $('#d_qrLogo').checked;
    d.qrPass = $('#d_qrPass').value;
    d.qrEnc = $('#d_qrEnc').value;
    d.qrHidden = $('#d_qrHidden').checked;
    d.qrSubject = $('#d_qrSubject').value;
    d.qrBody = $('#d_qrBody').value;
    d.qrMsg = $('#d_qrMsg').value;
    d.qrOrg = $('#d_qrOrg').value;
    d.qrPhone = $('#d_qrPhone').value;
    d.qrEmail = $('#d_qrEmail').value;
    d.barcode = $('#d_barcode').checked;
    d.bcData = $('#d_bcData').value;
    d.marginMm = +$('#d_margin').value;
    return d;
  }
  function renderDesign() {
    const d = readDesign();
    $('#d_qrWrap').hidden = !d.qr;
    if (d.qr) syncQrTypeUI(d);
    $('#d_bcWrap').hidden = !d.barcode;
    $('#d_logoWrap').hidden = !d.logo;
    if (d.logo) renderLogoGallery('d', d);
    $('#d_marginVal').textContent = d.marginMm;
    $('#d_length').disabled = d.lengthMode !== 'fixed' || d.type !== 'continuous';
    syncFormatUI('d', d);
    const badge = d.type === 'diecut' ? DIECUTS[d.dieIdx].name.split(' — ')[0] : `${d.widthMm} mm`;
    $('#cartridgeBadge').innerHTML = `${badge} · 300 dpi`;

    const label = renderLabel(d);          // white background — used for export
    currentDesignLabel = label;
    // Preview is tinted to visualise the chosen tape colour (not exported).
    const tape = d.tape && d.tape !== '#ffffff' ? d.tape : null;
    const shown = tape ? renderLabel(d, tape) : label;
    const pc = $('#previewCanvas');
    pc.width = shown.canvas.width; pc.height = shown.canvas.height;
    pc.getContext('2d').drawImage(shown.canvas, 0, 0);
    $('#previewMeta').textContent =
      `${fmtU(label.wmm)} × ${fmtU(label.hmm)} ${unit()} · ${label.canvas.width} × ${label.canvas.height} px @ ${DPI} dpi`;
    save();
    recordHistory();
  }

  /* ---------------- Undo / redo (design) ---------------- */
  const undoStack = [], redoStack = [];
  let committed = null, histTimer = null, suppressHistory = false;
  const snapDesign = () => JSON.stringify(state.design);
  function updateUndoButtons() {
    const u = $('#undoBtn'), r = $('#redoBtn');
    if (u) u.disabled = !undoStack.length;
    if (r) r.disabled = !redoStack.length;
  }
  function recordHistory() {
    if (committed === null) { committed = snapDesign(); updateUndoButtons(); return; }
    if (suppressHistory) return;
    const cur = snapDesign();
    if (cur === committed) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(() => {
      if (snapDesign() === committed) return;
      undoStack.push(committed);
      if (undoStack.length > 60) undoStack.shift();
      committed = snapDesign();
      redoStack.length = 0;
      updateUndoButtons();
    }, 450);
  }
  function applyDesignSnapshot(str) {
    committed = str;
    state.design = JSON.parse(str);
    suppressHistory = true;
    fillDesignInputs();
    renderDesign();
    suppressHistory = false;
    updateUndoButtons();
  }
  function commitPending() {
    clearTimeout(histTimer);
    const cur = snapDesign();
    if (committed !== null && cur !== committed) { undoStack.push(committed); committed = cur; redoStack.length = 0; }
  }
  function undo() {
    commitPending();
    if (!undoStack.length) return;
    redoStack.push(committed);
    applyDesignSnapshot(undoStack.pop());
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(committed);
    applyDesignSnapshot(redoStack.pop());
  }
  // Update a length number input's range/step + its unit label for current unit.
  function applyUnitToLengthInput(inputSel, mmVal) {
    const inp = $(inputSel);
    const wrap = inp.closest('.segmented');
    if (wrap) wrap.querySelector('.unit').textContent = unit();
    if (unit() === 'in') { inp.min = '0.4'; inp.max = '106'; inp.step = '0.1'; }
    else { inp.min = '10'; inp.max = '2700'; inp.step = '1'; }
    inp.value = fmtU(mmVal);
  }
  // Labels for the QR "primary" field and which extra blocks show, per type.
  const QR_TYPES = {
    text: { label: 'Contents', extra: null },
    url: { label: 'Link (URL)', extra: null },
    wifi: { label: 'Network name (SSID)', extra: 'd_qrWifi' },
    email: { label: 'Email address', extra: 'd_qrEmailX' },
    phone: { label: 'Phone number', extra: null },
    sms: { label: 'Phone number', extra: 'd_qrSmsX' },
    contact: { label: 'Full name', extra: 'd_qrContactX' },
  };
  function syncQrTypeUI(d) {
    const t = QR_TYPES[d.qrType] || QR_TYPES.text;
    $('#d_qrPrimaryLabel').textContent = t.label;
    ['d_qrWifi', 'd_qrEmailX', 'd_qrSmsX', 'd_qrContactX'].forEach(id =>
      { $('#' + id).hidden = (id !== t.extra); });
    $('#d_qrSizeVal').textContent = d.qrScale;
    const hasLogo = state.assets.logos.length > 0;
    $('#d_qrLogo').disabled = !hasLogo;
    $('#d_qrLogoWrap').classList.toggle('disabled', !hasLogo);
  }
  function fillDesignInputs() {
    const d = state.design;
    fillFormatSelects('d', d);
    applyUnitToLengthInput('#d_length', d.lengthMm);
    $('#d_logo').checked = d.logo;
    $('#d_font').value = d.font;
    $('#d_symbol').value = d.symbol || 'none'; $('#d_border').value = d.border || 'none';
    $('#d_invert').checked = !!d.invert;
    $('#d_line1').value = d.line1; $('#d_line2').value = d.line2; $('#d_line3').value = d.line3 || '';
    $('#d_bold').checked = d.bold; $('#d_align').value = d.align;
    $('#d_qr').checked = d.qr; $('#d_qrData').value = d.qrData;
    $('#d_qrType').value = d.qrType; $('#d_qrEcc').value = d.qrEcc;
    $('#d_qrSize').value = d.qrScale; $('#d_qrLogo').checked = d.qrLogo;
    $('#d_qrPass').value = d.qrPass; $('#d_qrEnc').value = d.qrEnc; $('#d_qrHidden').checked = d.qrHidden;
    $('#d_qrSubject').value = d.qrSubject; $('#d_qrBody').value = d.qrBody; $('#d_qrMsg').value = d.qrMsg;
    $('#d_qrOrg').value = d.qrOrg; $('#d_qrPhone').value = d.qrPhone; $('#d_qrEmail').value = d.qrEmail;
    $('#d_barcode').checked = d.barcode; $('#d_bcData').value = d.bcData;
    $('#d_margin').value = d.marginMm;
    renderTapeSwatches(d.tape || '#ffffff');
    $$('#designForm [data-len]').forEach(b => b.classList.toggle('is-active', b.dataset.len === d.lengthMode));
  }
  function renderTapeSwatches(active) {
    const wrap = $('#d_tape');
    if (!wrap) return;
    wrap.innerHTML = TAPES.map(t =>
      `<button type="button" class="tape-sw ${t.c === active ? 'is-active' : ''}" data-tape="${t.c}" title="${t.n}" style="background:${t.c}"></button>`).join('');
  }

  function applyTemplate(id) {
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    state.design = { ...defaultDesign(), ...t.spec, bold: true, marginMm: state.design.marginMm };
    fillDesignInputs();
    renderDesign();
    toast(`Loaded “${t.name.replace(/^\S+\s/, '')}”`);
  }

  function initDesign() {
    $('#templateRail').innerHTML = TEMPLATES.map(t =>
      `<button type="button" class="tpl-chip" data-tpl="${t.id}">${t.name}</button>`).join('');
    $('#templateRail').addEventListener('click', e => {
      const c = e.target.closest('[data-tpl]'); if (c) applyTemplate(c.dataset.tpl);
    });
    fillDesignInputs();

    $('#designForm').addEventListener('input', renderDesign);
    $('#designForm').addEventListener('change', renderDesign);
    $$('#designForm [data-len]').forEach(b => b.addEventListener('click', () => {
      state.design.lengthMode = b.dataset.len; renderDesign();
    }));
    $$('#view-design [data-type]').forEach(b => b.addEventListener('click', () => {
      state.design.type = b.dataset.type; renderDesign();
    }));
    $$('#view-design [data-orient]').forEach(b => b.addEventListener('click', () => {
      state.design.orient = b.dataset.orient; renderDesign();
    }));

    // Logo gallery: enabling with no logos opens the picker.
    $('#d_logo').addEventListener('change', () => {
      if ($('#d_logo').checked && !state.assets.logos.length) $('#d_logoFile').click();
    });
    $('#d_logoFile').addEventListener('change', e => { addLogoFromFile(e.target.files[0], state.design); e.target.value = ''; });
    $('#d_logoGallery').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) { removeLogoAsset(del.dataset.del); renderDesign(); return; }
      if (e.target.closest('[data-add]')) { $('#d_logoFile').click(); return; }
      const t = e.target.closest('[data-logo]');
      if (t) { state.design.logoId = t.dataset.logo; state.design.logo = true; renderDesign(); }
    });
    $$('#d_logoWrap [data-pos]').forEach(b => b.addEventListener('click', () => {
      state.design.logoPos = b.dataset.pos; renderDesign();
    }));
    $('#d_tape').addEventListener('click', e => {
      const sw = e.target.closest('[data-tape]');
      if (sw) { state.design.tape = sw.dataset.tape; renderDesign(); }
    });

    $('#undoBtn').addEventListener('click', undo);
    $('#redoBtn').addEventListener('click', redo);
    document.addEventListener('keydown', e => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
    });

    $('#d_png').addEventListener('click', () => exportPNG(currentDesignLabel, labelName(state.design.line1) + '.png'));
    $('#d_pdf').addEventListener('click', () => exportPDF([currentDesignLabel], labelName(state.design.line1) + '.pdf'));
    $('#d_svg').addEventListener('click', () => exportSVG(state.design, labelName(state.design.line1) + '.svg'));
    $('#d_print').addEventListener('click', () => printLabels([currentDesignLabel]));
  }

  /* ---------------- Bulk tab ---------------- */
  function parseItems(text, b) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => {
      const parts = line.split('|').map(s => s.trim());
      const f0 = parts[0] || '', f1 = parts[1] || '', code = parts[2] || parts[0] || '';
      const spec = {
        type: b.type, widthMm: b.widthMm, dieIdx: b.dieIdx, orient: b.orient,
        lengthMode: b.lengthMode, lengthMm: b.lengthMm, _index: i + 1,
        line1: f0, line2: f1, line3: '', bold: true, align: 'left', font: b.font,
        symbol: b.symbol, border: b.border, invert: b.invert,
        qr: false, qrData: '', qrType: 'text', qrEcc: b.qrEcc, qrScale: 100,
        barcode: false, bcData: '',
        logo: b.logo, logoId: b.logoId, logoPos: b.logoPos, marginMm: 2,
      };
      const qrVal = (b.qrPrefix || '') + code;
      if (b.layout === 'text-qr') { spec.qr = true; spec.qrData = qrVal; }
      else if (b.layout === 'text-barcode') { spec.barcode = true; spec.bcData = code; }
      else if (b.layout === 'qr-only') { spec.qr = true; spec.qrData = qrVal; spec.line1 = ''; spec.line2 = ''; }
      return spec;
    });
  }
  function renderBulk() {
    const b = state.bulk;
    b.widthMm = +$('#b_width').value;
    b.dieIdx = +$('#b_die').value;
    b.layout = $('#b_layout').value;
    b.font = $('#b_font').value;
    b.symbol = $('#b_symbol').value;
    b.border = $('#b_border').value;
    b.invert = $('#b_invert').checked;
    b.copies = clamp(+$('#b_copies').value || 1, 1, 99);
    b.qrPrefix = $('#b_qrPrefix').value;
    b.qrEcc = $('#b_qrEcc').value;
    b.lengthMm = uToMm(+$('#b_length').value || mmToU(100));
    b.logo = $('#b_logo').checked;
    b.items = $('#b_items').value;
    $('#b_qrWrap').hidden = !/qr/.test(b.layout);
    $('#b_logoWrap').hidden = !b.logo;
    if (b.logo) renderLogoGallery('b', b);
    $('#b_length').disabled = b.lengthMode !== 'fixed' || b.type !== 'continuous';
    syncFormatUI('b', b);
    save();

    const specs = parseItems(b.items, b);
    const labels = specs.map(s => renderLabel(s));
    const thumbs = $('#bulkThumbs');
    thumbs.innerHTML = '';
    let totalLen = 0;
    labels.forEach(l => { totalLen += l.wmm; });
    labels.slice(0, 3).forEach(l => {
      const c = document.createElement('canvas');
      c.width = l.canvas.width; c.height = l.canvas.height;
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      thumbs.appendChild(c);
    });
    if (labels.length > 3) {
      const m = document.createElement('div'); m.className = 'more';
      m.textContent = `+ ${labels.length - 3} more`; thumbs.appendChild(m);
    }
    const fmt = b.type === 'diecut' ? DIECUTS[b.dieIdx].name.split(' — ')[0] : `${b.widthMm} mm`;
    const copies = b.copies > 1 ? ` × ${b.copies} copies` : '';
    $('#bulkSummary').textContent = specs.length
      ? `${specs.length} label${specs.length > 1 ? 's' : ''}${copies} · ${fmt} · ≈ ${(totalLen * b.copies / 10).toFixed(1)} cm of tape`
      : 'No items yet';
    return labels;
  }
  function fillBulkInputs() {
    const b = state.bulk;
    fillFormatSelects('b', b);
    $('#b_layout').value = b.layout;
    $('#b_font').value = b.font;
    $('#b_symbol').value = b.symbol || 'none';
    $('#b_border').value = b.border || 'none';
    $('#b_invert').checked = !!b.invert;
    $('#b_copies').value = b.copies || 1;
    $('#b_qrPrefix').value = b.qrPrefix;
    $('#b_qrEcc').value = b.qrEcc;
    applyUnitToLengthInput('#b_length', b.lengthMm);
    $('#b_logo').checked = b.logo;
    $('#b_items').value = b.items;
    $$('#view-bulk [data-len]').forEach(x => x.classList.toggle('is-active', x.dataset.len === b.lengthMode));
  }

  /* ---------------- CSV import ---------------- */
  function parseCSV(text) {
    const rows = []; let field = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }
  let csvRows = [];           // last imported rows (data only, header removed)
  let csvHeaders = [];        // header names or "Column N"
  function importCSV(text) {
    let rows = parseCSV(text);
    if (!rows.length) { toast('No rows found in CSV'); return; }
    const cols = Math.max(...rows.map(r => r.length));
    const first = rows[0].join(' ').toLowerCase();
    const hasHeader = rows.length > 1 && /name|label|line|code|qr|text|item|title|desc|sku|part|location|qty/.test(first);
    csvHeaders = [];
    for (let i = 0; i < cols; i++) csvHeaders.push(hasHeader ? (rows[0][i] || `Column ${i + 1}`) : `Column ${i + 1}`);
    csvRows = hasHeader ? rows.slice(1) : rows;
    // Build the mapper selects (default: 0→Line1, 1→Line2, 2→code).
    const opts = sel => `<option value="-1">— none —</option>` +
      csvHeaders.map((h, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${escapeHtml(h)}</option>`).join('');
    $('#csvMapL1').innerHTML = opts(0);
    $('#csvMapL2').innerHTML = opts(cols > 1 ? 1 : -1);
    $('#csvMapCode').innerHTML = opts(cols > 2 ? 2 : 0);
    $('#csvMapper').hidden = false;
    applyCsvMapping();
    toast(`Imported ${csvRows.length} row${csvRows.length > 1 ? 's' : ''}`);
  }
  function applyCsvMapping() {
    if (!csvRows.length) return;
    const l1 = +$('#csvMapL1').value, l2 = +$('#csvMapL2').value, cd = +$('#csvMapCode').value;
    const lines = csvRows.map(r => {
      const parts = [l1 >= 0 ? (r[l1] || '').trim() : '', l2 >= 0 ? (r[l2] || '').trim() : '', cd >= 0 ? (r[cd] || '').trim() : ''];
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts.join(' | ');
    }).filter(Boolean);
    $('#b_items').value = lines.join('\n');
    renderBulk();
  }
  function initBulk() {
    fillBulkInputs();
    renderPresetRail();
    $('#presetRail').addEventListener('click', e => {
      const del = e.target.closest('[data-delpreset]');
      if (del) { state.presets = state.presets.filter(x => x.id !== del.dataset.delpreset); save(); renderPresetRail(); return; }
      const ren = e.target.closest('[data-renpreset]');
      if (ren) {
        const p = state.presets.find(x => x.id === ren.dataset.renpreset);
        const name = (prompt('Rename preset:', p.name) || '').trim();
        if (name) { p.name = name; save(); renderPresetRail(); }
        return;
      }
      if (e.target.closest('#savePresetBtn')) { saveBulkPreset(); return; }
      const chip = e.target.closest('[data-preset]');
      if (chip) applyPreset(chip.dataset.preset);
    });
    ['#b_width', '#b_die', '#b_layout', '#b_length', '#b_items',
     '#b_font', '#b_symbol', '#b_border', '#b_invert', '#b_copies', '#b_qrPrefix', '#b_qrEcc'].forEach(sel =>
      $(sel).addEventListener('input', renderBulk));
    $$('#view-bulk [data-len]').forEach(x => x.addEventListener('click', () => {
      state.bulk.lengthMode = x.dataset.len; renderBulk();
    }));
    $$('#view-bulk [data-type]').forEach(b => b.addEventListener('click', () => {
      state.bulk.type = b.dataset.type; renderBulk();
    }));
    $$('#view-bulk [data-orient]').forEach(b => b.addEventListener('click', () => {
      state.bulk.orient = b.dataset.orient; renderBulk();
    }));

    $('#seq_add').addEventListener('click', () => {
      const prefix = $('#seq_prefix').value;
      const start = parseInt($('#seq_start').value, 10) || 0;
      const count = clamp(parseInt($('#seq_count').value, 10) || 1, 1, 999);
      const pad = clamp(parseInt($('#seq_pad').value, 10) || 0, 0, 6);
      const rows = [];
      for (let i = 0; i < count; i++) rows.push(prefix + String(start + i).padStart(pad, '0'));
      const ta = $('#b_items');
      ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n' : '') + rows.join('\n');
      renderBulk();
    });
    $('#b_csv').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) { const r = new FileReader(); r.onload = () => importCSV(String(r.result)); r.readAsText(f); }
      e.target.value = '';
    });
    $('#b_csvBtn').addEventListener('click', () => $('#b_csv').click());
    ['#csvMapL1', '#csvMapL2', '#csvMapCode'].forEach(s => $(s).addEventListener('change', applyCsvMapping));

    $('#b_logo').addEventListener('change', () => {
      if ($('#b_logo').checked && !state.assets.logos.length) $('#b_logoFile').click();
    });
    $('#b_logoFile').addEventListener('change', e => { addLogoFromFile(e.target.files[0], state.bulk); e.target.value = ''; });
    $('#b_logoGallery').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) { removeLogoAsset(del.dataset.del); renderBulk(); return; }
      if (e.target.closest('[data-add]')) { $('#b_logoFile').click(); return; }
      const t = e.target.closest('[data-logo]');
      if (t) { state.bulk.logoId = t.dataset.logo; state.bulk.logo = true; renderBulk(); }
    });
    $$('#b_logoWrap [data-pos]').forEach(b => b.addEventListener('click', () => {
      state.bulk.logoPos = b.dataset.pos; renderBulk();
    }));

    $('#b_pdf').addEventListener('click', async () => {
      const labels = withCopies(renderBulk(), state.bulk.copies);
      if (!labels.length) return toast('Add some items first');
      if (labels.length > 300 && !confirm(`Export ${labels.length} labels as PDF?`)) return;
      await exportPDF(labels, 'leitz-labels.pdf');
    });
    $('#b_print').addEventListener('click', () => {
      const labels = withCopies(renderBulk(), state.bulk.copies);
      if (!labels.length) return toast('Add some items first');
      printLabels(labels);
    });
  }

  /* ---------------- Batch print presets ---------------- */
  // A preset captures the Bulk tab's format config (not the item list).
  const PRESET_KEYS = ['type', 'widthMm', 'dieIdx', 'orient', 'font', 'layout',
    'lengthMode', 'lengthMm', 'logo', 'logoId', 'logoPos'];
  function bulkConfig() {
    const o = {}; PRESET_KEYS.forEach(k => (o[k] = state.bulk[k])); return o;
  }
  function suggestPresetName() {
    const b = state.bulk;
    const fmt = b.type === 'diecut' ? DIECUTS[b.dieIdx].name.split(' — ')[0] : `${b.widthMm} mm`;
    return `${fmt} · ${b.layout}`;
  }
  function saveBulkPreset() {
    renderBulk();
    const name = (prompt('Name this batch preset:', suggestPresetName()) || '').trim();
    if (!name) return;
    state.presets.unshift({ id: uid(), name, config: bulkConfig() });
    save(); renderPresetRail(); toast('Preset saved');
  }
  function applyPreset(id) {
    const p = state.presets.find(x => x.id === id);
    if (!p) return;
    Object.assign(state.bulk, p.config);
    fillBulkInputs(); renderBulk(); renderPresetRail();
    toast(`Preset “${p.name}”`);
  }
  function renderPresetRail() {
    const rail = $('#presetRail');
    if (!rail) return;
    rail.innerHTML = state.presets.map(p =>
      `<span class="preset-chip" data-preset="${p.id}">${escapeHtml(p.name)}` +
      `<button type="button" class="preset-ren" data-renpreset="${p.id}" aria-label="Rename preset">✎</button>` +
      `<button type="button" class="preset-del" data-delpreset="${p.id}" aria-label="Delete preset">✕</button></span>`).join('') +
      `<button type="button" class="preset-chip add" id="savePresetBtn">＋ Save preset</button>`;
  }

  /* ---------------- Saved designs ---------------- */
  function saveCurrentDesign() {
    readDesign();
    const def = state.design.line1 || 'My label';
    const name = (prompt('Name this design:', def) || '').trim();
    if (!name) return;
    state.saved.unshift({ id: uid(), name, spec: JSON.parse(JSON.stringify(state.design)), createdAt: Date.now() });
    save();
    toast('Design saved');
  }
  function loadSaved(id) {
    const s = state.saved.find(x => x.id === id);
    if (!s) return;
    state.design = { ...defaultDesign(), ...s.spec };
    fillDesignInputs();
    renderDesign();
    switchView('design');
    toast(`Loaded “${s.name}”`);
  }
  let savedFilter = '';
  function thumbCanvas(spec) {
    const label = renderLabel(spec);
    const cv = document.createElement('canvas');
    cv.width = label.canvas.width; cv.height = label.canvas.height;
    cv.getContext('2d').drawImage(label.canvas, 0, 0);
    return cv;
  }
  function renderSaved() {
    const list = $('#savedList');
    if (!list) return;
    list.innerHTML = '';
    const q = savedFilter.trim().toLowerCase();
    const items = q ? state.saved.filter(s => s.name.toLowerCase().includes(q)) : state.saved;
    if (!state.saved.length) {
      list.innerHTML = '<p class="empty">No saved designs yet. Build a label on the Design tab, then tap “Save current design”.</p>';
      return;
    }
    if (!items.length) { list.innerHTML = '<p class="empty">No designs match your search.</p>'; return; }
    items.forEach(s => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      const thumb = document.createElement('div');
      thumb.className = 'saved-thumb';
      thumb.appendChild(thumbCanvas(s.spec));
      const name = document.createElement('div');
      name.className = 'saved-name';
      name.textContent = s.name;
      const acts = document.createElement('div');
      acts.className = 'saved-acts';
      acts.innerHTML = `<button class="btn-ghost sm" data-load="${s.id}">Load</button>` +
        `<button class="btn-ghost sm" data-queue="${s.id}">＋ Queue</button>` +
        `<button class="btn-ghost sm" data-dup="${s.id}">Duplicate</button>` +
        `<button class="btn-ghost sm" data-ren="${s.id}">Rename</button>` +
        `<button class="btn-ghost sm" data-del="${s.id}">Delete</button>`;
      card.append(thumb, name, acts);
      list.appendChild(card);
    });
  }
  function initSaved() {
    $('#saveDesignBtn').addEventListener('click', () => { saveCurrentDesign(); renderSaved(); });
    $('#savedSearch').addEventListener('input', e => { savedFilter = e.target.value; renderSaved(); });
    $('#savedList').addEventListener('click', e => {
      const load = e.target.closest('[data-load]');
      if (load) return loadSaved(load.dataset.load);
      const q = e.target.closest('[data-queue]');
      if (q) { const s = state.saved.find(x => x.id === q.dataset.queue); if (s) addToQueue(s.spec, s.name); return; }
      const dup = e.target.closest('[data-dup]');
      if (dup) {
        const s = state.saved.find(x => x.id === dup.dataset.dup);
        if (s) { state.saved.unshift({ id: uid(), name: s.name + ' copy', spec: JSON.parse(JSON.stringify(s.spec)), createdAt: Date.now() }); save(); renderSaved(); }
        return;
      }
      const ren = e.target.closest('[data-ren]');
      if (ren) {
        const s = state.saved.find(x => x.id === ren.dataset.ren);
        const name = (prompt('Rename design:', s.name) || '').trim();
        if (name) { s.name = name; save(); renderSaved(); }
        return;
      }
      const del = e.target.closest('[data-del]');
      if (del) { state.saved = state.saved.filter(x => x.id !== del.dataset.del); save(); renderSaved(); }
    });
  }

  /* ---------------- Print queue ---------------- */
  function addToQueue(spec, name) {
    state.queue.push({ id: uid(), name: name || spec.line1 || 'Label', copies: 1, spec: JSON.parse(JSON.stringify(spec)) });
    save(); renderQueue();
    toast(`Added to queue (${state.queue.length})`);
  }
  // Expand the queue to a flat label list honouring per-item copies.
  const queueLabels = () => state.queue.flatMap(it => {
    const lab = renderLabel(it.spec);
    return Array.from({ length: Math.max(1, it.copies || 1) }, () => lab);
  });
  function moveQueue(id, dir) {
    const i = state.queue.findIndex(x => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.queue.length) return;
    const [it] = state.queue.splice(i, 1);
    state.queue.splice(j, 0, it);
    save(); renderQueue();
  }
  function renderQueue() {
    const wrap = $('#queueWrap'), list = $('#queueList');
    if (!list) return;
    $('#queueCount').textContent = state.queue.length;
    wrap.hidden = false;
    if (!state.queue.length) {
      list.innerHTML = '<p class="empty">Queue is empty. Add the current design here, or “＋ Queue” a saved design, to print several different labels in one run.</p>';
      $('#queuePrint').disabled = $('#queuePdf').disabled = $('#queueClear').disabled = true;
      return;
    }
    $('#queuePrint').disabled = $('#queuePdf').disabled = $('#queueClear').disabled = false;
    list.innerHTML = '';
    state.queue.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'queue-row';
      const th = document.createElement('div'); th.className = 'queue-thumb'; th.appendChild(thumbCanvas(it.spec));
      const nm = document.createElement('div'); nm.className = 'queue-name';
      const t = document.createElement('div'); t.textContent = it.name; nm.appendChild(t);
      const cp = document.createElement('label'); cp.className = 'queue-copies';
      cp.innerHTML = `×<input type="number" min="1" max="99" value="${it.copies || 1}" data-qcopies="${it.id}" inputmode="numeric"/>`;
      nm.appendChild(cp);
      const acts = document.createElement('div'); acts.className = 'queue-acts';
      acts.innerHTML = `<button class="btn-ghost sm" data-qup="${it.id}" ${i === 0 ? 'disabled' : ''}>↑</button>` +
        `<button class="btn-ghost sm" data-qdown="${it.id}" ${i === state.queue.length - 1 ? 'disabled' : ''}>↓</button>` +
        `<button class="btn-ghost sm" data-qdup="${it.id}">⧉</button>` +
        `<button class="btn-ghost sm" data-qdel="${it.id}">✕</button>`;
      row.append(th, nm, acts);
      list.appendChild(row);
    });
  }
  function initQueue() {
    $('#queueAddCurrent').addEventListener('click', () => { readDesign(); addToQueue(state.design, state.design.line1); });
    $('#queueList').addEventListener('click', e => {
      const up = e.target.closest('[data-qup]'); if (up) return moveQueue(up.dataset.qup, -1);
      const dn = e.target.closest('[data-qdown]'); if (dn) return moveQueue(dn.dataset.qdown, 1);
      const dup = e.target.closest('[data-qdup]');
      if (dup) {
        const i = state.queue.findIndex(x => x.id === dup.dataset.qdup);
        if (i >= 0) { const c = state.queue[i]; state.queue.splice(i + 1, 0, { ...c, id: uid(), spec: JSON.parse(JSON.stringify(c.spec)) }); save(); renderQueue(); }
        return;
      }
      const del = e.target.closest('[data-qdel]');
      if (del) { state.queue = state.queue.filter(x => x.id !== del.dataset.qdel); save(); renderQueue(); }
    });
    $('#queueList').addEventListener('input', e => {
      const cp = e.target.closest('[data-qcopies]');
      if (cp) {
        const it = state.queue.find(x => x.id === cp.dataset.qcopies);
        if (it) { it.copies = clamp(+cp.value || 1, 1, 99); save(); }
      }
    });
    $('#queueClear').addEventListener('click', () => {
      if (state.queue.length && confirm('Clear the print queue?')) { state.queue = []; save(); renderQueue(); }
    });
    $('#queuePdf').addEventListener('click', async () => {
      if (!state.queue.length) return;
      await exportPDF(queueLabels(), 'leitz-queue.pdf');
    });
    $('#queuePrint').addEventListener('click', () => {
      if (!state.queue.length) return;
      printLabels(queueLabels());
    });
  }

  /* ---------------- Tabs ---------------- */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
    $('.actions').style.display = (name === 'design' || name === 'bulk') ? 'flex' : 'none';
    if (name !== 'scan') stopScan();
    if (name === 'bulk') renderBulk();
    if (name === 'saved') { renderSaved(); renderQueue(); }
    if (name === 'more') updateStorageMeter();
  }

  function initUnits() {
    const sync = () => $$('#unitsToggle [data-unit]').forEach(b =>
      b.classList.toggle('is-active', b.dataset.unit === unit()));
    sync();
    $$('#unitsToggle [data-unit]').forEach(b => b.addEventListener('click', () => {
      state.settings.units = b.dataset.unit; save(); sync();
      applyUnitToLengthInput('#d_length', state.design.lengthMm);
      applyUnitToLengthInput('#b_length', state.bulk.lengthMm);
      rerenderActive();
    }));
  }

  /* ---------------- Scan test ---------------- */
  let scanStream = null, scanRAF = null, scanDetector = null;
  const scanCanvas = document.createElement('canvas');
  async function decodeCanvas(cv) {
    if (window.BarcodeDetector) {
      try {
        scanDetector = scanDetector || new BarcodeDetector();
        const codes = await scanDetector.detect(cv);
        if (codes && codes.length) return { value: codes[0].rawValue, format: codes[0].format || 'code' };
      } catch (e) { /* fall back to jsQR */ }
    }
    const ctx = cv.getContext('2d');
    const img = ctx.getImageData(0, 0, cv.width, cv.height);
    const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    return r ? { value: r.data, format: 'qr code' } : null;
  }
  function showScanResult(res) {
    stopScan();
    if (navigator.vibrate) navigator.vibrate(60);
    const box = $('#scanResult');
    const isUrl = /^https?:\/\//i.test(res.value);
    box.hidden = false;
    box.innerHTML = `<div class="scan-fmt">✓ ${escapeHtml(String(res.format).replace(/_/g, ' '))}</div>
      <div class="scan-val"></div>
      <div class="scan-acts">
        ${isUrl ? '<a class="btn-primary" id="scanOpen" target="_blank" rel="noopener">Open link</a>' : ''}
        <button class="btn-ghost" id="scanAdd">Add to list</button>
        <button class="btn-ghost" id="scanAgain">Scan again</button>
      </div>`;
    box.querySelector('.scan-val').textContent = res.value;
    if (isUrl) $('#scanOpen').href = res.value;
    $('#scanAdd').addEventListener('click', () => { addScan(res.value); box.hidden = true; startScan(); });
    $('#scanAgain').addEventListener('click', () => { box.hidden = true; startScan(); });
  }
  function addScan(value) {
    state.scanLog.unshift({ value, t: Date.now() });
    if (state.scanLog.length > 500) state.scanLog.length = 500;
    save(); renderScanLog();
    toast('Added to list');
  }
  function renderScanLog() {
    const wrap = $('#scanLogWrap'), list = $('#scanLog');
    if (!list) return;
    wrap.hidden = state.scanLog.length === 0;
    $('#scanLogCount').textContent = state.scanLog.length;
    list.innerHTML = state.scanLog.slice(0, 50).map((s, i) =>
      `<li><span class="sl-val"></span><button class="sl-del" data-sldel="${i}" aria-label="Remove">✕</button></li>`).join('');
    [...list.querySelectorAll('.sl-val')].forEach((el, i) => { el.textContent = state.scanLog[i].value; });
  }
  function exportScanCSV() {
    if (!state.scanLog.length) return toast('List is empty');
    const esc = v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    const rows = [['value', 'scanned_at'], ...state.scanLog.map(s =>
      [s.value, new Date(s.t).toISOString()])];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    download(new Blob([csv], { type: 'text/csv' }), 'scans.csv');
    toast(`Exported ${state.scanLog.length} scans`);
  }
  function initScanLog() {
    renderScanLog();
    $('#scanExport').addEventListener('click', exportScanCSV);
    $('#scanClear').addEventListener('click', () => {
      if (state.scanLog.length && confirm('Clear the scanned list?')) { state.scanLog = []; save(); renderScanLog(); }
    });
    $('#scanLog').addEventListener('click', e => {
      const d = e.target.closest('[data-sldel]');
      if (d) { state.scanLog.splice(+d.dataset.sldel, 1); save(); renderScanLog(); }
    });
  }
  async function startScan() {
    const video = $('#scanVideo');
    $('#scanResult').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#scanHint').textContent = 'Camera not available here — use “Scan a photo” instead.';
      return;
    }
    try {
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = scanStream;
      await video.play();
      $('#scanStart').hidden = true; $('#scanStop').hidden = false;
      $('#scanHint').textContent = 'Point at a printed QR code…';
      const tick = async () => {
        if (!scanStream) return;
        if (video.videoWidth) {
          scanCanvas.width = video.videoWidth; scanCanvas.height = video.videoHeight;
          scanCanvas.getContext('2d').drawImage(video, 0, 0);
          const res = await decodeCanvas(scanCanvas);
          if (res) { showScanResult(res); return; }
        }
        scanRAF = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      $('#scanHint').textContent = 'Camera permission denied or unavailable. Use “Scan a photo”.';
    }
  }
  function stopScan() {
    if (scanRAF) { cancelAnimationFrame(scanRAF); scanRAF = null; }
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
    const v = $('#scanVideo'); if (v) v.srcObject = null;
    if ($('#scanStart')) $('#scanStart').hidden = false;
    if ($('#scanStop')) $('#scanStop').hidden = true;
  }
  function scanPhoto(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        scanCanvas.width = img.naturalWidth; scanCanvas.height = img.naturalHeight;
        scanCanvas.getContext('2d').drawImage(img, 0, 0);
        const res = await decodeCanvas(scanCanvas);
        if (res) showScanResult(res);
        else { $('#scanResult').hidden = true; toast('No QR/barcode found in image'); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  function initScan() {
    $('#scanStart').addEventListener('click', startScan);
    $('#scanStop').addEventListener('click', () => { stopScan(); $('#scanHint').textContent = 'Camera stopped.'; });
    $('#scanFile').addEventListener('change', e => { scanPhoto(e.target.files[0]); e.target.value = ''; });
    $('#scanPhotoBtn').addEventListener('click', () => $('#scanFile').click());
  }

  /* ---------------- More tab: backup, storage, calibration ---------------- */
  function exportBackup() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const d = new Date().toISOString().slice(0, 10);
    download(blob, `leitz-label-studio-backup-${d}.json`);
    toast('Backup downloaded');
  }
  function importBackup(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { return toast('Not a valid backup file'); }
      if (!data || !data.design || !data.bulk) return toast('Not a Label Studio backup');
      if (!confirm('Restore this backup? It replaces your current designs, logos, presets and settings.')) return;
      state = normalizeState(data);
      persist();
      Object.keys(logoImgs).forEach(k => delete logoImgs[k]);
      loadAllLogos(() => {
        fillDesignInputs(); fillBulkInputs(); renderDesign(); renderPresetRail();
        renderSaved(); renderQueue(); renderScanLog(); updateStorageMeter();
      });
      toast('Backup restored');
    };
    reader.readAsText(file);
  }
  async function updateStorageMeter() {
    const el = $('#storageMeter'); if (!el) return;
    let used = 0;
    try { used = new Blob([JSON.stringify(state)]).size; } catch (e) {}
    let line = `${(used / 1024).toFixed(0)} KB of data`;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est.usage != null) line += ` · ${(est.usage / 1048576).toFixed(1)} MB total cached`;
      }
    } catch (e) {}
    el.textContent = `${line} · ${state.assets.logos.length} logo(s)`;
  }
  // A printable alignment test: a framed label with centre cross + corner ticks.
  function buildCalTest() {
    const wmm = 88, hmm = 40;
    const c = document.createElement('canvas');
    c.width = mm(wmm); c.height = mm(hmm);
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#000'; x.lineWidth = mm(0.5);
    x.strokeRect(mm(1), mm(1), c.width - mm(2), c.height - mm(2));
    x.beginPath();
    x.moveTo(c.width / 2, mm(3)); x.lineTo(c.width / 2, c.height - mm(3));
    x.moveTo(mm(3), c.height / 2); x.lineTo(c.width - mm(3), c.height / 2);
    x.stroke();
    x.fillStyle = '#000'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = fontStr(mm(5), true, 'system');
    x.fillText('ALIGN 88 × 40 mm', c.width / 2, c.height / 2 - mm(8));
    return { canvas: c, wmm, hmm };
  }
  function initMore() {
    $('#backupBtn').addEventListener('click', exportBackup);
    $('#restoreBtn').addEventListener('click', () => $('#restoreFile').click());
    $('#restoreFile').addEventListener('change', e => { importBackup(e.target.files[0]); e.target.value = ''; });

    const cal = state.settings.cal;
    const syncCal = () => {
      $('#cal_dx').value = cal.dx; $('#cal_dy').value = cal.dy; $('#cal_scale').value = cal.scale;
      $('#cal_dxv').textContent = cal.dx; $('#cal_dyv').textContent = cal.dy; $('#cal_scalev').textContent = cal.scale;
    };
    syncCal();
    ['dx', 'dy', 'scale'].forEach(k => $('#cal_' + k).addEventListener('input', e => {
      cal[k] = +e.target.value; save(); syncCal();
    }));
    $('#cal_reset').addEventListener('click', () => { cal.dx = 0; cal.dy = 0; cal.scale = 100; save(); syncCal(); });
    $('#cal_test').addEventListener('click', () => printLabels([buildCalTest()]));

    $('#sheetBtn').addEventListener('click', exportSheet);
    updateStorageMeter();
  }
  // Tile copies of the current design onto an A4/Letter sheet for ordinary printers.
  async function exportSheet() {
    readDesign();
    const label = renderLabel(state.design);
    const page = $('#sheet_size').value === 'letter'
      ? { pageWmm: 215.9, pageHmm: 279.4 } : { pageWmm: 210, pageHmm: 297 };
    const count = clamp(+$('#sheet_count').value || 1, 1, 1000);
    const gap = clamp(+$('#sheet_gap').value || 0, 0, 30);
    toast('Building sheet…');
    const blob = await window.LabelPDF.buildSheetPDF(label, count, { ...page, gapMm: gap, marginMm: 8 });
    if (!blob) { toast('Label is too big for that page size'); return; }
    download(blob, 'leitz-sheet.pdf');
    toast('Sheet PDF saved');
  }

  /* ---------------- Service-worker update prompt ---------------- */
  function initSW() {
    if (!('serviceWorker' in navigator)) return;
    let updating = false;
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = w => {
        if (!w) return;
        $('#updateBanner').hidden = false;
        $('#updateReload').onclick = () => { updating = true; w.postMessage('SKIP_WAITING'); };
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
        });
      });
    }).catch(() => {});
    // Only reload when the user accepted an update (avoids first-visit reload).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updating) location.reload();
    });
  }

  function init() {
    initDesign();
    initBulk();
    initUnits();
    initSaved();
    initQueue();
    initScan();
    initScanLog();
    initMore();
    loadAllLogos(() => rerenderActive());
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    renderDesign();
    initSW();
  }
  async function boot() {
    state = await loadState();
    init();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
