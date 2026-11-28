import type { NextConfig } from "next";
import { peekAllowedForBuild, peekDefaultForBuild } from "./lib/peek-gate";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Peek redesign (lib/peek-gate.ts): off on Production builds unless the PEEK_WEB_PRODUCTION=on kill switch is set;
  // PEEK_WEB_DEFAULT makes it the default there (visitors can still opt out with ?peek=0).
  env: { PEEK_WEB_ALLOWED: peekAllowedForBuild(process.env), PEEK_WEB_DEFAULT: peekDefaultForBuild(process.env) },
  // SEO: Next 15 streams page metadata (description, canonical, hreflang) after <head> for most user agents,
  // including Googlebot, and Google ignores a canonical outside <head>. Our metadata only reads the locale
  // cookie, so rendering it in <head> for every request costs nothing noticeable.
  htmlLimitedBots: /.*/,
  // Menu boards render PNGs with resvg (native, free) and bundled Inter fonts.
  serverExternalPackages: ["@resvg/resvg-js", "pptx-glimpse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/menus": ["./assets/fonts/**"],
    // Template boards draw bundled stock photos (assets/menu-templates) into the published PNG.
    "/api/layout-studio": ["./assets/fonts/**", "./assets/menu-templates/**"],
    "/api/layout-studio/boards": ["./assets/fonts/**", "./assets/menu-templates/**"],
    "/api/menus/[id]": ["./assets/fonts/**"],
    "/api/menus/preview": ["./assets/fonts/**"],
    "/api/health": ["./assets/fonts/**"],
    "/api/brand/apply": ["./assets/fonts/**"],
    "/api/promos": ["./assets/fonts/**"],
    "/api/promos/[id]": ["./assets/fonts/**"],
    "/api/promos/preview": ["./assets/fonts/**"],
    "/api/media/presentation/complete": [
      "./assets/fonts/**",
      "./node_modules/@resvg/resvg-wasm/**",
      "./node_modules/pptx-glimpse/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
      "./node_modules/pdfjs-dist/cmaps/**",
      "./node_modules/pdfjs-dist/legacy/build/pdf.mjs",
      // Node disables the worker thread but still imports this file for the fake worker.
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/@napi-rs/canvas/**",
      // Optional native package. The loader require() is inside try/catch, so the tracer skips it.
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
  },
  // Lint runs as `npm run lint`. Skipping it here avoids a warning about the Next.js ESLint plugin.
  eslint: { ignoreDuringBuilds: true },
  // The TV player is a plain static HTML page (no React) for old Tizen/webOS browsers.
  async rewrites() {
    return [
      { source: "/player", destination: "/player.html" },
      { source: "/tv", destination: "/player.html" },
      { source: "/pair", destination: "/player.html" },
    ];
  },
  // HeyCatch channel attribution (https://heycatch.ai/agents.md step 4): single-character paths (/a-/z, /0-/9) are reserved
  // for HeyCatch short links and forward to the home page with the attribution query. No real route uses one character.
  async redirects() {
    return [{ source: "/:l([a-z0-9])", destination: "/?utm_source=heycatch&utm_campaign=:l", permanent: false }];
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    return [
      { source: "/:path*", headers: security },
      // SEO: the old production alias serves the same pages as pekkotv.com (TVs and the Android app still use
      // it). Keep it working, but out of search results; canonical tags already point to pekkotv.com.
      { source: "/:path*", has: [{ type: "host", value: "pantalla-chi.vercel.app" }], headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      // B2-07A: email links carry a one-time token_hash in the URL; never send it on as a Referer.
      { source: "/auth/:path*", headers: [...security.filter((h) => h.key !== "Referrer-Policy"), { key: "Referrer-Policy", value: "no-referrer" }] },
      ...["/player", "/player.html", "/tv", "/pair"].map((source) => ({
        source,
        headers: [
          ...security,
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      })),
      // Stable favicon URLs (not hashed). Cache for a day; revalidate in the background for a week.
      ...[
        "/favicon-96x96.png",
        "/favicon-48x48.png",
        "/favicon-192x192.png",
        "/icon.svg",
        "/favicon.ico",
        "/brand/favicon-16.png",
        "/brand/favicon-32.png",
        "/brand/favicon-48.png",
        "/brand/apple-touch-icon.png",
        "/brand/icon-192.png",
        "/brand/icon-512.png",
        "/brand/icon-maskable-192.png",
        "/brand/icon-maskable-512.png",
      ].map((source) => ({
        source,
        headers: [
          ...security,
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
        ],
      })),
    ];
  },
};

export default nextConfig;
