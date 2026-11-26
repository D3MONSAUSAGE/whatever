# Pekko brand assets

The official site and app icon is the Peek TV mark: a yellow television (`#FFC53D`) on indigo (`#4A2FBD`). The vector source of truth is `public/peek/brand/pekko-app-icon-master.svg` (copied to `public/icon.svg`). Raster favicons are generated from that SVG by `scripts/generate-favicons.mjs`. There was no separate approved favicon set; every size below is derived from the approved master, not new artwork.

In this repo:

- `public/favicon-96x96.png`: stable, publicly crawlable 96×96 PNG. The homepage `<head>` lists this as the first `rel="icon"` (see `app/layout.tsx`) so Google Search can use it. Also published at `public/favicon-48x48.png` and `public/favicon-192x192.png` (48-pixel multiples).
- `public/icon.svg`: the same approved mark as an SVG favicon.
- `public/favicon.ico`: 16, 32 and 48 px ICO for older browsers (still requested at `/favicon.ico`). Kept in `public/` rather than `app/` so Next.js does not auto-inject it ahead of the 96×96 PNG.
- `public/brand/favicon-{16,32,48}.png`, `apple-touch-icon.png` (180): PNG favicons and the Apple touch icon.
- `public/brand/icon-{192,512}.png`, `icon-maskable-{192,512}.png`: PWA manifest icons (`app/manifest.ts`). Maskable sizes keep the mark in the center 80% safe zone.
- `public/brand/icon-512.png` is also the Organization logo in homepage structured data.
- `public/peek/brand/*`: Peek wordmark and lockup SVGs used in the marketing site and app chrome.
- `public/brand/pekko-p-{64,128,256,512}.png`: the earlier transparent Pekko “P” still used by `LogoMark` (`components/brand.tsx`) on a few leftover pages. Not used as a favicon.
- `public/brand/pekko-wordmark.png` / `pekko-wordmark-white.png`: earlier P-plus-wordmark assets.
- `app/opengraph-image.png` (1200x630): social sharing image (still the earlier Pekko P composition).

The TV player and its service worker are unchanged. Their caches keep their existing names.
