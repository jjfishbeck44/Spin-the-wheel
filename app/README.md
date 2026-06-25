# Leitz Label Studio

An **offline-first label designer for the Leitz Icon label maker**, delivered as
an installable iOS/Android/desktop **Progressive Web App**. It lays out labels
at the exact size of Leitz Icon continuous cartridges and renders them at the
printer's native **300 dpi**, so output prints **1:1**. No App Store, no build
step, no backend — your designs stay on your device.

![App icon](icons/icon-512.png)

## Features

- **Starter templates** — one-tap presets: Storage tote, Tool/equipment,
  Shelf/bin, Cable flag (rotated), Scan-to-open (QR link), Address, Shipping,
  Name badge.
- **Label designer** — **continuous** widths (12–88 mm; 88 mm = the 3.5″
  totes/tools cartridge) or **die-cut** sizes (36×88, 28×88, 26×88, 50×88,
  59×102 mm). Auto-fit or fixed length, **Rotate 90°** orientation, two
  auto-sizing text lines, bold + alignment, optional **QR code** and **Code 128
  barcode**. Live, true-to-size preview.
- **Bulk / asset labeling** — paste a list (or generate a sequence like
  `TOTE-001…TOTE-050`), choose a layout (Text, Text + QR, Text + Barcode,
  QR only), pick any cartridge/die-cut + orientation, and produce the whole
  batch at once. Use `Line 1 | Line 2 | code` per row for full control.
- **Fonts** — choose per-label type style: System, Rounded, Condensed, Serif,
  or Mono (system fonts, no downloads).
- **Logos** — keep a small gallery of logos; pick one per label and place it
  **left or right**. Auto-downscaled, rendered in monochrome, shared across
  Design and Bulk.
- **Up to three text lines**, plus **symbols** (warning, fragile, this-way-up,
  keep-dry, flammable, electrical, recycle, arrow) and an optional **border**.
- **Tokens** — `{date}`, `{time}`, and `{n}` / `{n:3}` (zero-padded) expand in
  text, QR, and barcodes; in **Bulk**, `{n}` is the row number.
- **Copies** per label in Bulk.
- **Saved designs** — save the current label by name and reload it any time
  from the **Saved** tab (stored on-device); **search**, **folders**,
  **duplicate**, rename or delete saved designs and batch presets.
- **Share a design** — generate a compact **link + QR**; opening it on another
  device loads the design (logos stay local). On the receiving device you can
  **scan the share QR** or **paste the link** in the Scan tab to import it.
- **Per-line text size** — set each line to XS–XL independently (the auto-fit
  scales them together).
- **Inverse mode** — white-on-black labels for high-visibility warnings; QR and
  barcodes keep a white patch so they still scan.
- **Print queue** — collect several *different* labels (the current design or
  any saved ones), reorder them, set **per-item copies**, duplicate, and
  **print / export them together** in one run.
- **Sheet layout** — tile copies of the current design onto an **A4/Letter**
  PDF for an ordinary inkjet/laser printer (sticker paper), no Icon required.
- **Tape-colour preview** — visualise your design on a coloured cartridge
  (preview only; printing is always black on the physical tape).
- **Backup & restore** — export everything (designs, logos, presets, saved
  labels, settings) to a JSON file and restore it on any device. The **More**
  tab also shows storage usage.
- **Printer calibration** — nudge every label (X/Y offset) and fine-tune the
  scale to match your Icon; applies to PDF and Print, with a one-tap alignment
  test print.
- **Scan capture** — on the **Scan** tab, add scans to a list and export it as
  CSV (a lightweight inventory check).
- **Update prompt** — when a new version deploys, a banner offers to reload.
- **Batch presets** — save a Bulk tab format setup (cartridge, layout, font,
  orientation, logo…) as a named preset and re-apply it in one tap.
- **Scan test** — verify a printed label scans cleanly: scan with the camera
  or test an exported PNG, and tap through to a URL it encodes. Uses the native
  `BarcodeDetector` where available, falling back to a bundled offline QR
  decoder.
- **CSV import** — import a list in the Bulk tab; columns map to
  Line 1 / Line 2 / code and a header row is skipped automatically.
- **mm / inch toggle** — switch measurement units in the header (88 mm ≈
  3.46 in); lengths and the preview readout follow the chosen unit.
- **Export & print** — lossless **PDF** (one label per page, exact mm), **PNG**,
  or true-vector **SVG** (crisp text + QR at any scale), plus a **Print** sheet
  (AirPrint / Save to Files as PDF).
- **Undo / redo** in the designer (buttons + ⌘/Ctrl-Z, ⇧⌘Z / Ctrl-Y).
- **CSV column mapper** — after importing, choose which column maps to
  Line 1 / Line 2 / QR.
- **Large on-device storage** — data is kept in **IndexedDB** (with automatic
  migration from older versions), so many logos and backups fit comfortably.
- **Offline** via service worker; **dark mode**, safe-area insets, home-screen
  install, native-feeling tab bar.

### QR codes

- **Content types** — encode plain text/ID, a **link (URL)**, **Wi-Fi**
  network, **email**, **phone**, **SMS**, or a **contact card**, with the right
  format generated for you.
- **Error correction** (L/M/Q/H) for durability, an adjustable **size**, and an
  optional **logo in the centre** (auto-uses high error correction so it still
  scans).
- In **Bulk**, set a **QR link/prefix** so each row's code becomes a unique URL
  (e.g. `…/TOTE-001`), pairing with the sequence generator for serials.

### QR vs barcode

- **QR code** scans with any phone camera — encode a **web link** to open a
  page (like scanning a product in a store app), or just store an ID. Best for
  most labels.
- **Code 128 barcode** is the 1-D stripe format for dedicated inventory-scanner
  apps; it holds a code only (no link).

## About printing to the Leitz Icon

The Icon uses Leitz's own wireless protocol, which third-party apps can't drive
directly (and iOS Safari has no Web Bluetooth). So this app produces a
**perfectly-sized file** and you send it the last step — open the exported
PDF/PNG in the official *Leitz Icon Software* app, or use the iOS print sheet —
always printing at **100% / actual size** so the millimetres stay accurate. See
the in-app **Guide** tab for details.

## Run it

```bash
cd app
python3 -m http.server 8000   # open http://localhost:8000
```

### Install on iPhone / iPad

1. Open the app URL in **Safari**.
2. **Share → Add to Home Screen**.
3. Launch **Label Studio** — full-screen and offline.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | App shell: Design / Bulk / Guide tabs |
| `styles.css` | Theming, layout, light + dark mode |
| `app.js` | Rendering engine, designer, bulk, export/print (no build) |
| `pdf.js` | Dependency-free PDF writer (lossless grayscale, 1 label/page) |
| `vendor/qrcode-generator.js` | QR generation — MIT, Kazuhiko Arase |
| `vendor/jsbarcode-code128.min.js` | Code 128 barcodes — MIT, JsBarcode |
| `vendor/jsqr.js` | Offline QR decoding for the scan test — Apache-2.0, jsQR |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (generated, full-bleed for iOS masking) |
| `tools/make_icons.py` | Regenerates the icons (pure Python, no deps) |

Regenerate icons with `python3 tools/make_icons.py`.

*Not affiliated with or endorsed by Leitz / Esselte. "Leitz" and "Leitz Icon"
are trademarks of their respective owner.*
