/* Leitz Label Studio — offline label designer for the Leitz Icon.
 * Renders labels at the printer's native 300 dpi so output is 1:1.
 * Vendored deps: qrcode-generator (QR), JsBarcode (Code 128). */
(() => {
  'use strict';

  const DPI = 300;
  const PX = DPI / 25.4;                 // pixels per millimetre
  const mm = v => Math.round(v * PX);
  const STORE_KEY = 'leitzlabels.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Continuous cartridge widths (mm). 88 mm = the 3.5" totes/tools cartridge.
  const WIDTHS = [88, 59, 50, 36, 32, 25, 19, 12];

  const defaults = () => ({
    design: {
      widthMm: 88, lengthMode: 'auto', lengthMm: 100,
      line1: 'GARAGE — SCREWS', line2: 'Bin A3 · M3–M6',
      bold: true, align: 'left',
      qr: false, qrData: '', barcode: false, bcData: '', marginMm: 2,
    },
    bulk: {
      widthMm: 88, lengthMode: 'auto', lengthMm: 100,
      template: 'text-qr', items: '',
    },
  });

  let state = load();
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        return { design: { ...defaults().design, ...p.design },
                 bulk: { ...defaults().bulk, ...p.bulk } };
      }
    } catch (e) {}
    return defaults();
  }
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} };

  /* ---------------- Rendering engine ---------------- */

  // Measure helper using a shared scratch context.
  const scratch = document.createElement('canvas').getContext('2d');
  function fontStr(px, bold) { return `${bold ? '700' : '500'} ${px}px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`; }

  // Cap auto text height so a single long line doesn't create a metre-long
  // label. ~24 mm tall caps are big and readable; Fixed length overrides this.
  const MAX_FONT_PX = mm(24);

  // Find the largest font size so the lines fit a box. line2 is ~58% of line1.
  function fitFont(lines, boxW, boxH, bold) {
    let lo = 6, hi = Math.min(Math.floor(boxH), MAX_FONT_PX), best = lo;
    while (lo <= hi) {
      const f = (lo + hi) >> 1;
      const f2 = Math.round(f * 0.58);
      scratch.font = fontStr(f, bold);
      let widest = scratch.measureText(lines[0]).width;
      let totalH = f * 1.16;
      if (lines[1]) {
        scratch.font = fontStr(f2, bold);
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
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(Math.floor(x + (c + quiet) * cell),
                       Math.floor(y + (r + quiet) * cell),
                       Math.ceil(cell), Math.ceil(cell));
        }
      }
    }
  }

  function drawBarcode(ctx, data, x, y, w, h) {
    try {
      const off = document.createElement('canvas');
      window.JsBarcode(off, String(data || ' '), {
        format: 'CODE128', displayValue: false, margin: 0, width: 2, height: Math.max(10, h),
        background: '#ffffff', lineColor: '#000000',
      });
      ctx.drawImage(off, x, y, w, h);
      return true;
    } catch (e) { return false; }
  }

  /* spec -> { canvas, wmm, hmm }. fullRes=false renders a smaller preview. */
  function renderLabel(spec, opts = {}) {
    const heightMm = spec.widthMm;            // tape width = label height
    const marginMm = Math.max(0, spec.marginMm ?? 2);
    const hasText = !!(spec.line1 || spec.line2);
    const lines = [spec.line1 || '', spec.line2 || ''].filter(Boolean);

    const hPx = mm(heightMm);
    const mPx = mm(marginMm);
    const innerH = hPx - 2 * mPx;
    const gap = mm(2.5);

    // ----- determine length -----
    let lengthMm;
    if (spec.lengthMode === 'fixed') {
      lengthMm = Math.min(2700, Math.max(10, spec.lengthMm || 100));
    } else {
      const qrW = spec.qr ? innerH : 0;
      let textW = 0;
      if (hasText) {
        const probe = Math.min(MAX_FONT_PX, Math.round(innerH * (lines[1] ? 0.5 : 0.66)));
        scratch.font = fontStr(probe, spec.bold);
        textW = scratch.measureText(lines[0]).width;
        if (lines[1]) { scratch.font = fontStr(Math.round(probe * 0.58), spec.bold);
          textW = Math.max(textW, scratch.measureText(lines[1]).width); }
      }
      let lenPx = 2 * mPx + textW + (qrW ? qrW + gap : 0) + mm(4);
      let lp = lenPx / PX;
      if (spec.barcode) lp = Math.max(lp, 55);     // keep barcodes scannable
      lengthMm = Math.min(2700, Math.max(spec.qr ? heightMm : 22, lp));
    }

    const wPx = mm(lengthMm);
    const canvas = document.createElement('canvas');
    canvas.width = wPx; canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, wPx, hPx);
    ctx.fillStyle = '#000';

    let x0 = mPx, y0 = mPx, x1 = wPx - mPx, y1 = hPx - mPx;

    // QR on the right
    if (spec.qr) {
      const qsize = Math.min(innerH, (x1 - x0) * 0.8);
      drawQR(ctx, spec.qrData || spec.line1 || ' ', x1 - qsize, y0 + (innerH - qsize) / 2, qsize);
      x1 -= qsize + gap;
    }
    // Barcode along the bottom of the text area
    if (spec.barcode) {
      const bcH = Math.min(innerH * 0.45, mm(14));
      if (drawBarcode(ctx, spec.bcData || spec.line1 || ' ', x0, y1 - bcH, Math.max(1, x1 - x0), bcH)) {
        y1 -= bcH + mm(1.5);
      }
    }

    // Text block
    if (hasText && x1 - x0 > 4) {
      const boxW = x1 - x0, boxH = y1 - y0;
      const f = fitFont(lines, boxW, boxH, spec.bold);
      const f2 = Math.round(f * 0.58);
      const h1 = f * 1.16;
      const h2 = lines[1] ? f2 * 1.3 : 0;
      const totalH = h1 + h2;
      let ty = y0 + (boxH - totalH) / 2;
      ctx.textBaseline = 'top';
      ctx.textAlign = spec.align === 'center' ? 'center' : 'left';
      const tx = spec.align === 'center' ? x0 + boxW / 2 : x0;
      ctx.fillStyle = '#000';
      ctx.font = fontStr(f, spec.bold);
      ctx.fillText(lines[0], tx, ty);
      if (lines[1]) {
        ctx.font = fontStr(f2, spec.bold);
        ctx.fillText(lines[1], tx, ty + h1);
      }
    }

    return { canvas, wmm: lengthMm, hmm: heightMm };
  }

  /* ---------------- Export / print ---------------- */
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function exportPNG(label, name) {
    label.canvas.toBlob(b => { download(b, name); toast('PNG saved'); }, 'image/png');
  }
  async function exportPDF(labels, name) {
    toast('Building PDF…');
    const blob = await window.LabelPDF.buildPDF(labels.map(l => ({ canvas: l.canvas, wmm: l.wmm, hmm: l.hmm })));
    download(blob, name);
    toast(`PDF saved · ${labels.length} label${labels.length > 1 ? 's' : ''}`);
  }
  // Print via the OS sheet, each label sized exactly with an @page rule.
  function printLabels(labels) {
    const w = window.open('', '_blank');
    if (!w) { toast('Allow pop-ups to print'); return; }
    const pages = labels.map(l => {
      const url = l.canvas.toDataURL('image/png');
      return `<div class="pg" style="width:${l.wmm}mm;height:${l.hmm}mm">
        <img src="${url}" style="width:${l.wmm}mm;height:${l.hmm}mm"/></div>`;
    }).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Print labels</title>
      <style>
        @page { margin: 0; }
        html,body { margin: 0; padding: 0; }
        .pg { page-break-after: always; display: block; }
        img { display: block; }
        @media screen { body { background:#777; padding:12px } .pg{ background:#fff; margin:0 auto 12px; box-shadow:0 2px 8px rgba(0,0,0,.4) } }
      </style></head><body>${pages}
      <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
      </body></html>`);
    w.document.close();
  }

  /* ---------------- Design tab ---------------- */
  function readDesign() {
    const d = state.design;
    d.widthMm = +$('#d_width').value;
    d.lengthMm = +$('#d_length').value || 100;
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
  let currentDesignLabel = null;
  function renderDesign() {
    const d = readDesign();
    $('#d_qrWrap').hidden = !d.qr;
    $('#d_bcWrap').hidden = !d.barcode;
    $('#d_marginVal').textContent = d.marginMm;
    $('#d_length').disabled = d.lengthMode !== 'fixed';
    $('#cartridgeBadge').innerHTML = `${d.widthMm} mm · 300 dpi`;

    const label = renderLabel(d);
    currentDesignLabel = label;
    const pc = $('#previewCanvas');
    pc.width = label.canvas.width; pc.height = label.canvas.height;
    pc.getContext('2d').drawImage(label.canvas, 0, 0);
    $('#previewMeta').textContent =
      `${label.wmm.toFixed(0)} × ${label.hmm} mm · ${label.canvas.width} × ${label.canvas.height} px @ ${DPI} dpi`;
    save();
  }

  function initDesign() {
    const d = state.design;
    $('#d_width').innerHTML = WIDTHS.map(w =>
      `<option value="${w}" ${w === d.widthMm ? 'selected' : ''}>${w} mm${w === 88 ? ' (3.5" totes)' : ''}</option>`).join('');
    $('#d_length').value = d.lengthMm;
    $('#d_line1').value = d.line1;
    $('#d_line2').value = d.line2;
    $('#d_bold').checked = d.bold;
    $('#d_align').value = d.align;
    $('#d_qr').checked = d.qr; $('#d_qrData').value = d.qrData;
    $('#d_barcode').checked = d.barcode; $('#d_bcData').value = d.bcData;
    $('#d_margin').value = d.marginMm;
    $$('#designForm [data-len]').forEach(b =>
      b.classList.toggle('is-active', b.dataset.len === d.lengthMode));

    $('#designForm').addEventListener('input', renderDesign);
    $$('#designForm [data-len]').forEach(b => b.addEventListener('click', () => {
      state.design.lengthMode = b.dataset.len;
      $$('#designForm [data-len]').forEach(x => x.classList.toggle('is-active', x === b));
      renderDesign();
    }));

    $('#d_png').addEventListener('click', () => exportPNG(currentDesignLabel, labelName(state.design.line1) + '.png'));
    $('#d_pdf').addEventListener('click', () => exportPDF([currentDesignLabel], labelName(state.design.line1) + '.pdf'));
    $('#d_print').addEventListener('click', () => printLabels([currentDesignLabel]));
  }
  const labelName = s => (String(s || 'label').replace(/[^\w-]+/g, '_').slice(0, 24) || 'label');

  /* ---------------- Bulk tab ---------------- */
  function parseItems(text, template) {
    return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(s => s.trim());
      const f0 = parts[0] || '', f1 = parts[1] || '', code = parts[2] || parts[0] || '';
      const spec = {
        widthMm: state.bulk.widthMm,
        lengthMode: state.bulk.lengthMode, lengthMm: state.bulk.lengthMm,
        line1: f0, line2: f1, bold: true, align: 'left',
        qr: false, qrData: '', barcode: false, bcData: '', marginMm: 2,
      };
      if (template === 'text-qr') { spec.qr = true; spec.qrData = code; }
      else if (template === 'text-barcode') { spec.barcode = true; spec.bcData = code; }
      else if (template === 'qr-only') { spec.qr = true; spec.qrData = code; spec.line1 = ''; spec.line2 = ''; }
      return spec;
    });
  }
  function bulkSpecs() { return parseItems($('#b_items').value, $('#b_template').value); }

  function renderBulk() {
    state.bulk.widthMm = +$('#b_width').value;
    state.bulk.template = $('#b_template').value;
    state.bulk.lengthMm = +$('#b_length').value || 100;
    state.bulk.items = $('#b_items').value;
    $('#b_length').disabled = state.bulk.lengthMode !== 'fixed';
    save();

    const specs = bulkSpecs();
    const thumbs = $('#bulkThumbs');
    thumbs.innerHTML = '';
    let totalLen = 0;
    const labels = specs.map(s => renderLabel(s));
    labels.forEach(l => { totalLen += l.wmm; });
    labels.slice(0, 3).forEach(l => {
      const c = document.createElement('canvas');
      c.width = l.canvas.width; c.height = l.canvas.height;
      c.getContext('2d').drawImage(l.canvas, 0, 0);
      thumbs.appendChild(c);
    });
    if (labels.length > 3) {
      const m = document.createElement('div');
      m.className = 'more'; m.textContent = `+ ${labels.length - 3} more`;
      thumbs.appendChild(m);
    }
    $('#bulkSummary').textContent = specs.length
      ? `${specs.length} label${specs.length > 1 ? 's' : ''} · ${state.bulk.widthMm} mm · ≈ ${(totalLen / 10).toFixed(1)} cm of tape`
      : 'No items yet';
    return labels;
  }

  function initBulk() {
    const b = state.bulk;
    $('#b_width').innerHTML = WIDTHS.map(w =>
      `<option value="${w}" ${w === b.widthMm ? 'selected' : ''}>${w} mm${w === 88 ? ' (3.5")' : ''}</option>`).join('');
    $('#b_template').value = b.template;
    $('#b_length').value = b.lengthMm;
    $('#b_items').value = b.items;
    $$('#view-bulk [data-blen]').forEach(x =>
      x.classList.toggle('is-active', x.dataset.blen === b.lengthMode));

    ['#b_width', '#b_template', '#b_length', '#b_items'].forEach(sel =>
      $(sel).addEventListener('input', renderBulk));
    $$('#view-bulk [data-blen]').forEach(x => x.addEventListener('click', () => {
      state.bulk.lengthMode = x.dataset.blen;
      $$('#view-bulk [data-blen]').forEach(y => y.classList.toggle('is-active', y === x));
      renderBulk();
    }));

    $('#seq_add').addEventListener('click', () => {
      const prefix = $('#seq_prefix').value;
      const start = parseInt($('#seq_start').value, 10) || 0;
      const count = Math.min(999, Math.max(1, parseInt($('#seq_count').value, 10) || 1));
      const pad = Math.min(6, Math.max(0, parseInt($('#seq_pad').value, 10) || 0));
      const rows = [];
      for (let i = 0; i < count; i++) rows.push(prefix + String(start + i).padStart(pad, '0'));
      const ta = $('#b_items');
      ta.value = (ta.value.trim() ? ta.value.replace(/\s*$/, '') + '\n' : '') + rows.join('\n');
      renderBulk();
    });

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

  /* ---------------- Tabs ---------------- */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
    // hide the actions bar on the guide view
    $('.actions').style.display = name === 'guide' ? 'none' : 'flex';
    if (name === 'bulk') renderBulk();
  }

  function init() {
    initDesign();
    initBulk();
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    renderDesign();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  document.addEventListener('DOMContentLoaded', init);
})();
