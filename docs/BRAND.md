# Pekko brand assets

The official Pekko "P" logo replaces the old Seemple "S". The source of truth is the shared set in /workspace/pekko-logo (README lists every file). Pantalla and Gother use the same files.

In this repo:
- `public/brand/pekko-p-{64,128,256,512}.png`: transparent P, used by `LogoMark` (components/brand.tsx) on auth, dashboard header, overview, legal and error pages.
- `public/brand/pekko-wordmark.png` / `pekko-wordmark-white.png`: P plus "Pekko™ / TECHNOLOGIES".
- `app/favicon.ico`, `public/brand/favicon-{16,32,48}.png`, `apple-touch-icon.png` (180): browser icons (app/layout.tsx).
- `public/brand/icon-{192,512}.png`, `icon-maskable-{192,512}.png`: PWA manifest (app/manifest.ts).
- `app/opengraph-image.png` (1200x630): social sharing image.

The TV player and its service worker are unchanged. Their caches keep their existing names.
