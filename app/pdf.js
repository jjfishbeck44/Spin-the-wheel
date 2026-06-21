/* Minimal, dependency-free PDF writer for Leitz Label Studio.
 * Builds a PDF where each page is exactly one label at its real-world
 * size (points), embedding a lossless 8-bit DeviceGray image so QR codes
 * and text stay crisp. Works fully offline. */
(() => {
  'use strict';
  const MM_PER_IN = 25.4;
  const PT_PER_IN = 72;
  const mmToPt = mm => (mm / MM_PER_IN) * PT_PER_IN;

  // Valid zlib (RFC1950) stream using stored/uncompressed blocks — no deps,
  // always available. Used as a fallback when CompressionStream is absent.
  function zlibStore(data) {
    const out = [0x78, 0x01];
    let i = 0;
    while (i < data.length) {
      const n = Math.min(65535, data.length - i);
      const last = (i + n >= data.length) ? 1 : 0;
      out.push(last, n & 0xff, (n >> 8) & 0xff, ~n & 0xff, (~n >> 8) & 0xff);
      for (let j = 0; j < n; j++) out.push(data[i + j]);
      i += n;
    }
    let a = 1, b = 0;
    for (let k = 0; k < data.length; k++) { a = (a + data[k]) % 65521; b = (b + a) % 65521; }
    const adler = ((b << 16) | a) >>> 0;
    out.push((adler >>> 24) & 0xff, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff);
    return new Uint8Array(out);
  }

  async function deflate(bytes) {
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate');
        const w = cs.writable.getWriter();
        w.write(bytes); w.close();
        const ab = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(ab);
      } catch (e) { /* fall through */ }
    }
    return zlibStore(bytes);
  }

  // Convert a canvas to 8-bit grayscale samples (top row first).
  function canvasToGray(canvas) {
    const ctx = canvas.getContext('2d');
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Uint8Array(width * height);
    for (let p = 0, q = 0; p < data.length; p += 4, q++) {
      gray[q] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8;
    }
    return { gray, width, height };
  }

  /* pages: [{ canvas, wmm, hmm }] -> Blob(application/pdf)
   * cal: optional { dx, dy, scale } print calibration (mm offset, % scale). */
  async function buildPDF(pages, cal) {
    const enc = new TextEncoder();
    const chunks = [];
    let len = 0;
    const offsets = [];
    const push = u8 => { chunks.push(u8); len += u8.length; };
    const pushStr = s => push(enc.encode(s));

    // header with binary marker
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a,
                         0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    const obj = (num, fn) => { offsets[num] = len; pushStr(`${num} 0 obj\n`); fn(); pushStr('\nendobj\n'); };

    const N = pages.length;
    const kids = [];
    for (let i = 0; i < N; i++) kids.push(`${3 + i * 3} 0 R`);

    obj(1, () => pushStr('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => pushStr(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>`));

    for (let i = 0; i < N; i++) {
      const pg = pages[i];
      const pageNum = 3 + i * 3, contentNum = 4 + i * 3, imageNum = 5 + i * 3;
      const wpt = mmToPt(pg.wmm).toFixed(3);
      const hpt = mmToPt(pg.hmm).toFixed(3);

      obj(pageNum, () => pushStr(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wpt} ${hpt}] ` +
        `/Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>`));

      const s = cal && cal.scale ? cal.scale / 100 : 1;
      const dxpt = mmToPt((cal && cal.dx) || 0);
      const dypt = mmToPt((cal && cal.dy) || 0);
      const wp = mmToPt(pg.wmm), hp = mmToPt(pg.hmm);
      const sx = (wp * s).toFixed(3), sy = (hp * s).toFixed(3);
      const tx = (dxpt + (wp - wp * s) / 2).toFixed(3);
      const ty = (-dypt + (hp - hp * s) / 2).toFixed(3);
      const content = enc.encode(`q\n${sx} 0 0 ${sy} ${tx} ${ty} cm\n/Im0 Do\nQ\n`);
      offsets[contentNum] = len;
      pushStr(`${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n`);
      push(content);
      pushStr('\nendstream\nendobj\n');

      const { gray, width, height } = canvasToGray(pg.canvas);
      const stream = await deflate(gray);              // eslint-disable-line no-await-in-loop
      offsets[imageNum] = len;
      pushStr(`${imageNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} ` +
        `/Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 ` +
        `/Filter /FlateDecode /Length ${stream.length} >>\nstream\n`);
      push(stream);
      pushStr('\nendstream\nendobj\n');
    }

    const count = 2 + N * 3;
    const xrefOffset = len;
    let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= count; n++) {
      xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    }
    pushStr(xref);
    pushStr(`trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* Tile `count` copies of one label onto pages of size pageWmm×pageHmm.
   * opts: { pageWmm, pageHmm, marginMm, gapMm }. Returns Blob or null if the
   * label is too big for the page. */
  async function buildSheetPDF(label, count, opts) {
    const o = Object.assign({ pageWmm: 210, pageHmm: 297, marginMm: 8, gapMm: 3 }, opts || {});
    const cols = Math.floor((o.pageWmm - 2 * o.marginMm + o.gapMm) / (label.wmm + o.gapMm));
    const rows = Math.floor((o.pageHmm - 2 * o.marginMm + o.gapMm) / (label.hmm + o.gapMm));
    if (cols < 1 || rows < 1) return null;
    const perPage = cols * rows;
    const pages = Math.max(1, Math.ceil(count / perPage));

    const enc = new TextEncoder();
    const chunks = [];
    let len = 0;
    const offsets = [];
    const push = u8 => { chunks.push(u8); len += u8.length; };
    const pushStr = s => push(enc.encode(s));
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    const obj = (num, fn) => { offsets[num] = len; pushStr(`${num} 0 obj\n`); fn(); pushStr('\nendobj\n'); };

    const pageWpt = mmToPt(o.pageWmm).toFixed(3), pageHpt = mmToPt(o.pageHmm).toFixed(3);
    const lwpt = mmToPt(label.wmm), lhpt = mmToPt(label.hmm);
    const mpt = mmToPt(o.marginMm), gpt = mmToPt(o.gapMm);

    // obj1 Catalog, obj2 Pages, obj3 shared image, then content+page per page.
    const kids = [];
    for (let i = 0; i < pages; i++) kids.push(`${4 + i * 2} 0 R`);
    obj(1, () => pushStr('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => pushStr(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`));

    const { gray, width, height } = canvasToGray(label.canvas);
    const stream = await deflate(gray);
    offsets[3] = len;
    pushStr(`3 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${stream.length} >>\nstream\n`);
    push(stream); pushStr('\nendstream\nendobj\n');

    // Kids reference 4+p*2 as the page object; content stream is 5+p*2.
    let placed = 0;
    for (let p = 0; p < pages; p++) {
      const pageNum = 4 + p * 2, contentNum = 5 + p * 2;
      let ops = '';
      for (let r = 0; r < rows && placed < count; r++) {
        for (let c = 0; c < cols && placed < count; c++, placed++) {
          const tx = (mpt + c * (lwpt + gpt)).toFixed(3);
          const ty = (mmToPt(o.pageHmm) - mpt - r * (lhpt + gpt) - lhpt).toFixed(3);
          ops += `q ${lwpt.toFixed(3)} 0 0 ${lhpt.toFixed(3)} ${tx} ${ty} cm /Im0 Do Q\n`;
        }
      }
      obj(pageNum, () => pushStr(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWpt} ${pageHpt}] ` +
        `/Resources << /XObject << /Im0 3 0 R >> >> /Contents ${contentNum} 0 R >>`));
      const content = enc.encode(ops);
      offsets[contentNum] = len;
      pushStr(`${contentNum} 0 obj\n<< /Length ${content.length} >>\nstream\n`);
      push(content);
      pushStr('\nendstream\nendobj\n');
    }

    const total = 3 + pages * 2;
    const xrefOffset = len;
    let xref = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let n = 1; n <= total; n++) xref += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    pushStr(xref);
    pushStr(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  window.LabelPDF = { buildPDF, buildSheetPDF };
})();
