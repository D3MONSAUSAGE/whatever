import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { peekAllowedForBuild, peekBuildAllowed, peekExcludedPath, peekOptedIn, PEEK_COOKIE } from "@/lib/peek-gate";
import { setupCardVisible } from "@/components/peek/shell-extras";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

describe("Peek preview flag (PR1)", () => {
  it("is never allowed on a Vercel Production build", () => {
    expect(peekAllowedForBuild({ VERCEL_ENV: "production" })).toBe("0");
    expect(peekAllowedForBuild({ VERCEL_ENV: "production", PEEK_WEB: "on" })).toBe("0");
    expect(peekAllowedForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "off" })).toBe("0");
    expect(peekAllowedForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "yes" })).toBe("0");
    // t425u: the Production kill switch.
    expect(peekAllowedForBuild({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "on" })).toBe("1");
  });
  it("is allowed on Preview and local builds unless PEEK_WEB=off", () => {
    expect(peekAllowedForBuild({ VERCEL_ENV: "preview" })).toBe("1");
    expect(peekAllowedForBuild({})).toBe("1");
    expect(peekAllowedForBuild({ VERCEL_ENV: "preview", PEEK_WEB: "off" })).toBe("0");
    expect(peekBuildAllowed("1")).toBe(true);
    expect(peekBuildAllowed("0")).toBe(false);
    expect(peekBuildAllowed(undefined)).toBe(false);
  });
  it("needs this browser's opt-in (cookie or ?peek=1); ?peek=0 wins over the cookie", () => {
    expect(peekOptedIn("", null)).toBe(false);
    expect(peekOptedIn("a=1; pekko_locale=es", null)).toBe(false);
    expect(peekOptedIn(`a=1; ${PEEK_COOKIE}=1`, null)).toBe(true);
    expect(peekOptedIn(`${PEEK_COOKIE}=0`, null)).toBe(false);
    expect(peekOptedIn("", "1")).toBe(true);
    expect(peekOptedIn(`${PEEK_COOKIE}=1`, "0")).toBe(false);
  });
  it("keeps internal Staff on the current shell", () => {
    expect(peekExcludedPath("/dashboard/staff")).toBe(true);
    expect(peekExcludedPath("/dashboard/staff/x?y=1")).toBe(true);
    expect(peekExcludedPath("/dashboard/screens")).toBe(false);
    expect(peekExcludedPath("/dashboard/staffing")).toBe(false);
  });
  it("setup card follows the existing setup v2 visibility (hidden when finished, dismissed or never shown)", () => {
    expect(setupCardVisible({ show: true, finished: false })).toBe(true);
    expect(setupCardVisible({ show: false, finished: false })).toBe(false);
    expect(setupCardVisible({ show: true, finished: true })).toBe(false);
    expect(setupCardVisible(null)).toBe(false);
  });
  it("next.config inlines the build gate from VERCEL_ENV", () => {
    const cfg = readFileSync("next.config.ts", "utf8");
    expect(cfg).toContain("PEEK_WEB_ALLOWED: peekAllowedForBuild(process.env)");
  });
});

describe("Peek CSS stays scoped", () => {
  const css = readFileSync("app/peek.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("every selector is under .peek / body.peek or a pk- primitive", () => {
    const selectors: string[] = [];
    const re = /([^{}@;]+)\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css))) {
      const sel = m[1].trim();
      if (!sel || /^(media|keyframes|layer|font-face|supports)\b/.test(sel) || /^(from|to|\d+%)$/.test(sel)) continue;
      selectors.push(...sel.split(",").map((s) => s.trim()));
    }
    expect(selectors.length).toBeGreaterThan(50);
    const bad = selectors.filter((s) => !(s.startsWith(".peek") || s.startsWith("body.peek") || s.startsWith(".pk-") || s.startsWith("a.pk-") || s.startsWith("body:has(.pk-") || s.startsWith("body:has(.ps-sheet-wrap) .pk-") || s.startsWith("body:has(.ps-dialog-backdrop) .pk-") || s.startsWith("body:has([data-testid=\"confirm-dialog\"]) .pk-")));
    expect(bad).toEqual([]);
  });
  it("dark mode (build step 10) is opt-in: tokens only under body.peek[data-theme=\"dark\"], never from a media query", () => {
    // The device preference is only followed after ?theme=system (lib/peek-flag.ts), so no CSS media query.
    expect(css).not.toMatch(/prefers-color-scheme/);
    expect(css).toContain('body.peek[data-theme="dark"] {');
    expect(css).toContain("--pk-bg: #171127;");
  });
});

describe("Peek stays out of out-of-scope surfaces", () => {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  it("marketing, TV pairing/player and Staff never import the Peek code", () => {
    const files = [
      ...walk("app").filter((f) => !f.startsWith(path.join("app", "dashboard")) && !f.startsWith(path.join("app", "preview")) && /\.(tsx?|css)$/.test(f) && !f.endsWith("peek.css") && !f.endsWith("globals.css")),
      ...walk("components/site"),
      "app/dashboard/staff/page.tsx",
      "public/player.html",
      "public/player-sw.js",
    ];
    const hits = files.filter((f) => /peek-flag|peek-gate|components\/peek\//.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("Peek copy", () => {
  it("every new peek.* string has Spanish", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("peek."));
    expect(keys.length).toBe(32); // 29 from new-strings.json + 3 singular forms
    for (const k of keys) expect((es as Record<string, string>)[k]).toBeTruthy();
  });
});

describe("Peek lockup (UPDATE-1)", () => {
  it("adds the lockup as new assets and keeps the marketing logo files", () => {
    for (const f of ["pekko-lockup-light.svg", "pekko-lockup-dark.svg", "peek-mark.svg"]) expect(statSync(`public/peek/brand/${f}`).size).toBeGreaterThan(100);
    expect(readdirSync("public/brand").length).toBeGreaterThan(0);
    expect(readFileSync("public/peek/brand/pekko-lockup-light.svg", "utf8")).toContain('aria-label="Pekko"');
  });
  it("auth frame and sign-up use only the lockup in Peek mode", () => {
    const frame = readFileSync("components/auth-frame.tsx", "utf8");
    const signup = readFileSync("components/auth/signup-view.tsx", "utf8");
    expect(frame).toMatch(/peek \? \(\s*<Link[^]*?<PeekLockup/);
    expect(signup).toContain("{peek ? <PeekLockup height={48} /> :");
  });
});
