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

  const defaultDesign = () => ({
    type: 'continuous', widthMm: 88, dieIdx: 0, orient: 'h',
    lengthMode: 'auto', lengthMm: 100,
    line1: 'GARAGE — POWER TOOLS', line2: 'Tote 01',
    bold: true, align: 'left', font: 'system',
    qr: true, qrData: 'TOTE-01', barcode: false, bcData: '',
    logo: false, logoId: null, logoPos: 'left', marginMm: 2,
  });
  const defaultBulk = () => ({
    type: 'continuous', widthMm: 88, dieIdx: 0, orient: 'h',
    lengthMode: 'auto', lengthMm: 100, layout: 'text-qr', font: 'system',
    logo: false, logoId: null, logoPos: 'left', items: '',
  });
  const defaults = () => ({
    design: defaultDesign(), bulk: defaultBulk(),
    settings: { units: 'mm' }, assets: { logos: [] }, saved: [],
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const d = defaults();
        const s = {
          design: { ...d.design, ...p.design }, bulk: { ...d.bulk, ...p.bulk },
          settings: { ...d.settings, ...p.settings },
          assets: { logos: (p.assets && p.assets.logos) || [] },
          saved: p.saved || [],
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
    } catch (e) {}
    return defaults();
  }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} };

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
      scratch.font = fontStr(f, bold, font);
      let widest = scratch.measureText(lines[0]).width;
      let totalH = f * 1.16;
      if (lines[1]) {
        scratch.font = fontStr(f2, bold, font);
        widest = Math.max(widest, scratch.measureText(lines[1]).width);
        totalH += f2 * 1.3;
      }
      if (widest <= boxW && totalH <= boxH) { best = f; lo = f + 1; }
      else hi = f - 1;
    }
    return best;
  }

  function drawQR(ctx, data, x, y, size) {
    const qr = qrcode(0, 'M');
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

  // Build the label horizontally (text reads left-to-right).
  function composeHorizontal(spec, heightMm, forcedLen, marginMm) {
    const hasText = !!(spec.line1 || spec.line2);
    const lines = [spec.line1 || '', spec.line2 || ''].filter(Boolean);
    const hPx = mm(heightMm), mPx = mm(marginMm), innerH = hPx - 2 * mPx, gap = mm(2.5);
    const logoImage = spec.logo ? getLogoImg(spec.logoId) : null;
    const useLogo = !!(logoImage && logoImage.naturalWidth);
    const logoW = useLogo ? Math.min(logoImage.naturalWidth / logoImage.naturalHeight * innerH, innerH * 1.5) : 0;
    const logoRight = useLogo && spec.logoPos === 'right';

    let lengthMm;
    if (forcedLen != null) {
      lengthMm = clampLen(forcedLen);
    } else {
      const qrW = spec.qr ? innerH : 0;
      let textW = 0;
      if (hasText) {
        const probe = Math.min(MAX_FONT_PX, Math.round(innerH * (lines[1] ? 0.5 : 0.66)));
        scratch.font = fontStr(probe, spec.bold, spec.font);
        textW = scratch.measureText(lines[0]).width;
        if (lines[1]) { scratch.font = fontStr(Math.round(probe * 0.58), spec.bold, spec.font);
          textW = Math.max(textW, scratch.measureText(lines[1]).width); }
      }
      let lp = (2 * mPx + (logoW ? logoW + gap : 0) + textW + (qrW ? qrW + gap : 0) + mm(4)) / PX;
      if (spec.barcode) lp = Math.max(lp, 55);
      lengthMm = clamp(lp, (spec.qr || useLogo) ? heightMm : 22, 2700);
    }

    const wPx = mm(lengthMm);
    const canvas = document.createElement('canvas');
    canvas.width = wPx; canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, wPx, hPx);

    let x0 = mPx, y0 = mPx, x1 = wPx - mPx, y1 = hPx - mPx;
    if (useLogo && !logoRight) {
      drawLogo(ctx, logoImage, x0, y0, logoW, innerH);
      x0 += logoW + gap;
    }
    if (logoRight) {
      drawLogo(ctx, logoImage, x1 - logoW, y0, logoW, innerH);
      x1 -= logoW + gap;
    }
    if (spec.qr) {
      const qsize = Math.min(innerH, (x1 - x0) * 0.85);
      drawQR(ctx, spec.qrData || spec.line1 || ' ', x1 - qsize, y0 + (innerH - qsize) / 2, qsize);
      x1 -= qsize + gap;
    }
    if (spec.barcode) {
      const bcH = Math.min(innerH * 0.45, mm(14));
      if (drawBarcode(ctx, spec.bcData || spec.line1 || ' ', x0, y1 - bcH, Math.max(1, x1 - x0), bcH))
        y1 -= bcH + mm(1.5);
    }
    if (hasText && x1 - x0 > 4) {
      const boxW = x1 - x0, boxH = y1 - y0;
      const f = fitFont(lines, boxW, boxH, spec.bold, spec.font);
      const f2 = Math.round(f * 0.58);
      const h1 = f * 1.16, h2 = lines[1] ? f2 * 1.3 : 0;
      let ty = y0 + (boxH - (h1 + h2)) / 2;
      ctx.textBaseline = 'top';
      ctx.textAlign = spec.align === 'center' ? 'center' : 'left';
      const tx = spec.align === 'center' ? x0 + boxW / 2 : x0;
      ctx.fillStyle = '#000';
      ctx.font = fontStr(f, spec.bold, spec.font);
      ctx.fillText(lines[0], tx, ty);
      if (lines[1]) { ctx.font = fontStr(f2, spec.bold, spec.font); ctx.fillText(lines[1], tx, ty + h1); }
    }
    return { canvas, wmm: lengthMm, hmm: heightMm };
  }

  /* spec -> { canvas, wmm, hmm }. Handles die-cut + 90° rotation. */
  function renderLabel(spec) {
    const die = spec.type === 'diecut' ? DIECUTS[spec.dieIdx || 0] : null;
    const heightMm = die ? die.h : spec.widthMm;
    const forcedLen = die ? die.l : (spec.lengthMode === 'fixed' ? clampLen(spec.lengthMm) : null);
    const base = composeHorizontal(spec, heightMm, forcedLen, Math.max(0, spec.marginMm ?? 2));

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
    const blob = await window.LabelPDF.buildPDF(labels.map(l => ({ canvas: l.canvas, wmm: l.wmm, hmm: l.hmm })));
    download(blob, name);
    toast(`PDF saved · ${labels.length} label${labels.length > 1 ? 's' : ''}`);
  }
  function printLabels(labels) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print'); return; }
    const pages = labels.map(l => {
      const url = l.canvas.toDataURL('image/png');
      return `<div class="pg" style="width:${l.wmm}mm;height:${l.hmm}mm"><img src="${url}" style="width:${l.wmm}mm;height:${l.hmm}mm"/></div>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print labels</title>
      <style>@page{margin:0}html,body{margin:0;padding:0}.pg{page-break-after:always;display:block}img{display:block}
      @media screen{body{background:#777;padding:12px}.pg{background:#fff;margin:0 auto 12px;box-shadow:0 2px 8px rgba(0,0,0,.4)}}</style>
      </head><body>${pages}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
    w.document.close();
  }
  const labelName = s => (String(s || 'label').replace(/[^\w-]+/g, '_').slice(0, 24) || 'label');

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
    d.line1 = $('#d_line1').value;
    d.line2 = $('#d_line2').value;
    d.bold = $('#d_bold').checked;
    d.align = $('#d_align').value;
    d.qr = $('#d_qr').checked;
    d.qrData = $('#d_qrData').value;
    d.barcode = $('#d_barcode').checked;
    d.bcData = $('#d_bcData').value;
    d.marginMm = +$('#d_margin').value;
    return d;
  }
  function renderDesign() {
    const d = readDesign();
    $('#d_qrWrap').hidden = !d.qr;
    $('#d_bcWrap').hidden = !d.barcode;
    $('#d_logoWrap').hidden = !d.logo;
    if (d.logo) renderLogoGallery('d', d);
    $('#d_marginVal').textContent = d.marginMm;
    $('#d_length').disabled = d.lengthMode !== 'fixed' || d.type !== 'continuous';
    syncFormatUI('d', d);
    const badge = d.type === 'diecut' ? DIECUTS[d.dieIdx].name.split(' — ')[0] : `${d.widthMm} mm`;
    $('#cartridgeBadge').innerHTML = `${badge} · 300 dpi`;

    const label = renderLabel(d);
    currentDesignLabel = label;
    const pc = $('#previewCanvas');
    pc.width = label.canvas.width; pc.height = label.canvas.height;
    pc.getContext('2d').drawImage(label.canvas, 0, 0);
    $('#previewMeta').textContent =
      `${fmtU(label.wmm)} × ${fmtU(label.hmm)} ${unit()} · ${label.canvas.width} × ${label.canvas.height} px @ ${DPI} dpi`;
    save();
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
  function fillDesignInputs() {
    const d = state.design;
    fillFormatSelects('d', d);
    applyUnitToLengthInput('#d_length', d.lengthMm);
    $('#d_logo').checked = d.logo;
    $('#d_font').value = d.font;
    $('#d_line1').value = d.line1; $('#d_line2').value = d.line2;
    $('#d_bold').checked = d.bold; $('#d_align').value = d.align;
    $('#d_qr').checked = d.qr; $('#d_qrData').value = d.qrData;
    $('#d_barcode').checked = d.barcode; $('#d_bcData').value = d.bcData;
    $('#d_margin').value = d.marginMm;
    $$('#designForm [data-len]').forEach(b => b.classList.toggle('is-active', b.dataset.len === d.lengthMode));
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

    $('#d_png').addEventListener('click', () => exportPNG(currentDesignLabel, labelName(state.design.line1) + '.png'));
    $('#d_pdf').addEventListener('click', () => exportPDF([currentDesignLabel], labelName(state.design.line1) + '.pdf'));
    $('#d_print').addEventListener('click', () => printLabels([currentDesignLabel]));
  }

  /* ---------------- Bulk tab ---------------- */
  function parseItems(text, b) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(s => s.trim());
      const f0 = parts[0] || '', f1 = parts[1] || '', code = parts[2] || parts[0] || '';
      const spec = {
        type: b.type, widthMm: b.widthMm, dieIdx: b.dieIdx, orient: b.orient,
        lengthMode: b.lengthMode, lengthMm: b.lengthMm,
        line1: f0, line2: f1, bold: true, align: 'left', font: b.font,
        qr: false, qrData: '', barcode: false, bcData: '',
        logo: b.logo, logoId: b.logoId, logoPos: b.logoPos, marginMm: 2,
      };
      if (b.layout === 'text-qr') { spec.qr = true; spec.qrData = code; }
      else if (b.layout === 'text-barcode') { spec.barcode = true; spec.bcData = code; }
      else if (b.layout === 'qr-only') { spec.qr = true; spec.qrData = code; spec.line1 = ''; spec.line2 = ''; }
      return spec;
    });
  }
  function renderBulk() {
    const b = state.bulk;
    b.widthMm = +$('#b_width').value;
    b.dieIdx = +$('#b_die').value;
    b.layout = $('#b_layout').value;
    b.font = $('#b_font').value;
    b.lengthMm = uToMm(+$('#b_length').value || mmToU(100));
    b.logo = $('#b_logo').checked;
    b.items = $('#b_items').value;
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
    $('#bulkSummary').textContent = specs.length
      ? `${specs.length} label${specs.length > 1 ? 's' : ''} · ${fmt} · ≈ ${(totalLen / 10).toFixed(1)} cm of tape`
      : 'No items yet';
    return labels;
  }
  function fillBulkInputs() {
    const b = state.bulk;
    fillFormatSelects('b', b);
    $('#b_layout').value = b.layout;
    $('#b_font').value = b.font;
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
  function importCSV(text) {
    let rows = parseCSV(text);
    if (!rows.length) { toast('No rows found in CSV'); return; }
    const first = rows[0].join(' ').toLowerCase();
    if (rows.length > 1 && /name|label|line|code|qr|text|item|title|desc|sku|part/.test(first))
      rows = rows.slice(1);
    const lines = rows.map(r => {
      const parts = [(r[0] || '').trim(), (r[1] || '').trim(), (r[2] || '').trim()];
      while (parts.length && parts[parts.length - 1] === '') parts.pop();
      return parts.join(' | ');
    }).filter(Boolean);
    $('#b_items').value = lines.join('\n');
    renderBulk();
    toast(`Imported ${lines.length} row${lines.length > 1 ? 's' : ''}`);
  }
  function initBulk() {
    fillBulkInputs();
    ['#b_width', '#b_die', '#b_layout', '#b_length', '#b_items'].forEach(sel =>
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
      const labels = renderBulk();
      if (!labels.length) return toast('Add some items first');
      if (labels.length > 300 && !confirm(`Export ${labels.length} labels as PDF?`)) return;
      await exportPDF(labels, 'leitz-labels.pdf');
    });
    $('#b_print').addEventListener('click', () => {
      const labels = renderBulk();
      if (!labels.length) return toast('Add some items first');
      printLabels(labels);
    });
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
  function renderSaved() {
    const list = $('#savedList');
    if (!list) return;
    list.innerHTML = '';
    if (!state.saved.length) {
      list.innerHTML = '<p class="empty">No saved designs yet. Build a label on the Design tab, then tap “Save current design”.</p>';
      return;
    }
    state.saved.forEach(s => {
      const card = document.createElement('div');
      card.className = 'saved-card';
      const thumb = document.createElement('div');
      thumb.className = 'saved-thumb';
      const label = renderLabel(s.spec);
      const cv = document.createElement('canvas');
      cv.width = label.canvas.width; cv.height = label.canvas.height;
      cv.getContext('2d').drawImage(label.canvas, 0, 0);
      thumb.appendChild(cv);
      const name = document.createElement('div');
      name.className = 'saved-name';
      name.textContent = s.name;
      const acts = document.createElement('div');
      acts.className = 'saved-acts';
      acts.innerHTML = `<button class="btn-ghost sm" data-load="${s.id}">Load</button><button class="btn-ghost sm" data-del="${s.id}">Delete</button>`;
      card.append(thumb, name, acts);
      list.appendChild(card);
    });
  }
  function initSaved() {
    $('#saveDesignBtn').addEventListener('click', () => { saveCurrentDesign(); renderSaved(); });
    $('#savedList').addEventListener('click', e => {
      const load = e.target.closest('[data-load]');
      if (load) return loadSaved(load.dataset.load);
      const del = e.target.closest('[data-del]');
      if (del) { state.saved = state.saved.filter(x => x.id !== del.dataset.del); save(); renderSaved(); }
    });
  }

  /* ---------------- Tabs ---------------- */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
    $('.actions').style.display = (name === 'guide' || name === 'saved') ? 'none' : 'flex';
    if (name === 'bulk') renderBulk();
    if (name === 'saved') renderSaved();
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

  function init() {
    initDesign();
    initBulk();
    initUnits();
    initSaved();
    loadAllLogos(() => rerenderActive());
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    renderDesign();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', init);
})();
