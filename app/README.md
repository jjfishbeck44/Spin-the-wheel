# Leitz Flow

A fast, **offline-first productivity app** with a Leitz-inspired icon and brand
look. It installs to the iOS (and Android/desktop) home screen as a Progressive
Web App — no App Store, no build step, no backend. Everything is plain
HTML/CSS/JS and your data stays on your device.

![App icon](icons/icon-512.png)

## Features

- **Colour-coded folders** — organise tasks the way you'd organise Leitz
  binders. Built-in smart views for **All** and **Today**.
- **Quick capture** — type a task and add `!today`, `!tomorrow`, or
  `!YYYY-MM-DD` to set a due date inline. Tap the ⚑ flag to cycle priority.
- **Progress ring** — see completion at a glance per folder, plus a
  "done today" counter.
- **Built-in focus timer** — a Pomodoro-style dial (25/15/50/5 min presets)
  with focus/break phases, a soft chime, and haptic buzz on completion. Start
  a focus session directly from any task with the ◐ button.
- **Works offline** — a service worker caches the whole app shell.
- **iOS-native feel** — safe-area insets, standalone display, dark mode,
  tab bar, and a home-screen icon.

## Run it

Because it registers a service worker, serve it over HTTP (not `file://`):

```bash
cd app
python3 -m http.server 8000
# open http://localhost:8000
```

### Install on iPhone / iPad

1. Open the app's URL in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch it from the new **Leitz Flow** icon — it runs full-screen like a
   native app and works offline.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | App shell / markup |
| `styles.css` | Theming, layout, light + dark mode |
| `app.js` | State, tasks, folders, focus timer (no dependencies) |
| `manifest.webmanifest` | PWA metadata for home-screen install |
| `sw.js` | Service worker for offline caching |
| `icons/` | App icons (generated, full-bleed for iOS masking) |
| `tools/make_icons.py` | Regenerates the icons (pure Python, no deps) |

Regenerate icons with `python3 tools/make_icons.py`.
