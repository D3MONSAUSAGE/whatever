import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

const INDIGO = "#4A2FBD";
const YELLOW = "#FFC53D";

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe("Peek favicon set", () => {
  const rasters: Array<[string, number]> = [
    ["public/favicon-48x48.png", 48],
    ["public/favicon-96x96.png", 96],
    ["public/favicon-192x192.png", 192],
    ["public/brand/favicon-16.png", 16],
    ["public/brand/favicon-32.png", 32],
    ["public/brand/favicon-48.png", 48],
    ["public/brand/apple-touch-icon.png", 180],
    ["public/brand/icon-192.png", 192],
    ["public/brand/icon-512.png", 512],
    ["public/brand/icon-maskable-192.png", 192],
    ["public/brand/icon-maskable-512.png", 512],
  ];

  it("ships the approved Peek TV SVG and a stable 96x96 PNG", () => {
    const svg = readFileSync("public/icon.svg", "utf8");
    const master = readFileSync("public/peek/brand/pekko-app-icon-master.svg", "utf8");
    expect(svg).toContain(INDIGO);
    expect(svg).toContain(YELLOW);
    expect(svg).toContain("#251A3A");
    expect(svg.replace(/\s+|<!--.*?-->/gs, "")).toContain(
      master.replace(/\s+/g, "").replace(/^.*?<rect width="108"/, '<rect width="108"').replace(/<\/svg>$/, "")
    );
    expect(existsSync("public/favicon-96x96.png")).toBe(true);
    expect(pngSize("public/favicon-96x96.png")).toEqual({ width: 96, height: 96 });
  });

  it("has the expected square sizes for every published raster", () => {
    for (const [path, size] of rasters) {
      expect(pngSize(path), path).toEqual({ width: size, height: size });
    }
  });

  it("packs 16, 32 and 48 px images into public/favicon.ico", () => {
    const buf = readFileSync("public/favicon.ico");
    expect(buf.readUInt16LE(0)).toBe(0);
    expect(buf.readUInt16LE(2)).toBe(1); // ICO
    expect(buf.readUInt16LE(4)).toBe(3);
    const sizes = [0, 1, 2].map((i) => buf[6 + i * 16]);
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });

  it("declares the stable 96x96 PNG as the first rel=icon in the root layout", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    const icons = layout.slice(layout.indexOf("icons:"), layout.indexOf("openGraph:"));
    expect(icons.indexOf('url: "/favicon-96x96.png"')).toBeGreaterThanOrEqual(0);
    expect(icons.indexOf('url: "/favicon-96x96.png"')).toBeLessThan(icons.indexOf('url: "/favicon.ico"'));
    expect(icons).toContain('sizes: "96x96"');
    expect(icons).toContain('url: "/icon.svg"');
    expect(icons).toContain('url: "/brand/apple-touch-icon.png"');
    // Nested layouts must not override icons (they only set robots / referrer).
    for (const file of [
      "app/login/layout.tsx",
      "app/developer/layout.tsx",
      "app/dashboard/layout.tsx",
      "app/forgot-password/layout.tsx",
      "app/reset-password/layout.tsx",
      "app/auth/confirm/layout.tsx",
    ]) {
      if (!existsSync(file)) continue;
      expect(readFileSync(file, "utf8"), file).not.toMatch(/\bicons\s*:/);
    }
  });

  it("points the PWA manifest and Organization logo at the new icon files", () => {
    const manifest = readFileSync("app/manifest.ts", "utf8");
    expect(manifest).toContain('src: "/brand/icon-192.png"');
    expect(manifest).toContain('src: "/brand/icon-512.png"');
    expect(manifest).toContain('src: "/brand/icon-maskable-192.png"');
    expect(manifest).toContain('src: "/brand/icon-maskable-512.png"');
    const data = readFileSync("components/site/structured-data.tsx", "utf8");
    expect(data).toContain('logo: `${origin}/brand/icon-512.png`');
    expect(data).not.toContain("/brand/pekko-p-512.png");
  });

  it("lets crawlers fetch the stable favicon PNG (robots.txt allow /)", () => {
    const rules = robots();
    const rule = (Array.isArray(rules.rules) ? rules.rules[0] : rules.rules) as { allow?: string | string[]; disallow?: string | string[] };
    const allow = rule.allow;
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    expect(allow === "/" || (Array.isArray(allow) && allow.includes("/"))).toBe(true);
    for (const path of ["/favicon-96x96.png", "/favicon-48x48.png", "/favicon-192x192.png", "/icon.svg", "/favicon.ico", "/brand/icon-512.png"]) {
      expect(disallow.some((d) => path === d || path.startsWith(d.endsWith("/") ? d : `${d}/`)), path).toBe(false);
    }
  });
});
