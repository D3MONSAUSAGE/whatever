import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Menu boards render PNGs with resvg (native, free) and bundled Inter fonts.
  serverExternalPackages: ["@resvg/resvg-js"],
  outputFileTracingIncludes: {
    "/api/menus": ["./assets/fonts/**"],
    "/api/menus/[id]": ["./assets/fonts/**"],
    "/api/menus/preview": ["./assets/fonts/**"],
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
