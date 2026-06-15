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
- **Logo / image** — add a logo (placed at the left of the label, shared
  across Design and Bulk); auto-downscaled and rendered in monochrome.
- **CSV import** — import a list in the Bulk tab; columns map to
  Line 1 / Line 2 / code and a header row is skipped automatically.
- **mm / inch toggle** — switch measurement units in the header (88 mm ≈
  3.46 in); lengths and the preview readout follow the chosen unit.
- **Export & print** — lossless **PDF** (one label per page, exact mm) or
  **PNG**, plus a **Print** sheet (AirPrint / Save to Files as PDF).
- **Offline** via service worker; **dark mode**, safe-area insets, home-screen
  install, native-feeling tab bar.

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
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker (offline cache) |
| `icons/` | App icons (generated, full-bleed for iOS masking) |
| `tools/make_icons.py` | Regenerates the icons (pure Python, no deps) |

Regenerate icons with `python3 tools/make_icons.py`.

*Not affiliated with or endorsed by Leitz / Esselte. "Leitz" and "Leitz Icon"
are trademarks of their respective owner.*
