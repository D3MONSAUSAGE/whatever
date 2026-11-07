import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Menu boards render PNGs with resvg (native, free) and bundled Inter fonts.
  serverExternalPackages: ["@resvg/resvg-js", "pptx-glimpse", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/menus": ["./assets/fonts/**"],
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
    return [{ source: "/player", destination: "/player.html" }];
  },
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ];
    return [
      { source: "/:path*", headers: security },
      ...["/player", "/player.html"].map((source) => ({
        source,
        headers: [
          ...security,
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
        ],
      })),
    ];
  },
};

export default nextConfig;
