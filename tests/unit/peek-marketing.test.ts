import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { homeVariant, MARKETING_DEFAULT, marketingPeek } from "@/lib/home-variant";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const read = (f: string) => readFileSync(f, "utf8");
const PEEK = ["components/site/peek/shell.tsx", "components/site/peek/home-peek.tsx", "components/site/peek/sections.tsx", "components/site/peek/pages.tsx", "components/site/peek/client.tsx"];

describe("Peek marketing site: variant gate", () => {
  it("is launched: Peek is the default everywhere, independent of the web app's PEEK_WEB_PRODUCTION switch", () => {
    expect(MARKETING_DEFAULT).toBe("peek");
    expect(homeVariant({ VERCEL_ENV: "production" })).toBe("peek");
    expect(homeVariant({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "off" })).toBe("peek");
    expect(homeVariant({ VERCEL_ENV: "production", PEEK_WEB_PRODUCTION: "on" })).toBe("peek");
    expect(homeVariant({ VERCEL_ENV: "preview" })).toBe("peek");
    expect(homeVariant({})).toBe("peek");
  });
  it("rolls the marketing site back with HOME_VARIANT only (no web-app flag involved)", () => {
    expect(homeVariant({ VERCEL_ENV: "production", HOME_VARIANT: "b" })).toBe("b");
    expect(homeVariant({ VERCEL_ENV: "production", HOME_VARIANT: " B ", PEEK_WEB_PRODUCTION: "on" })).toBe("b");
    expect(homeVariant({ VERCEL_ENV: "production", HOME_VARIANT: "classic" })).toBe("classic");
    expect(homeVariant({ VERCEL_ENV: "production", HOME_VARIANT: "other" })).toBe("peek");
    expect(marketingPeek({ VERCEL_ENV: "production", HOME_VARIANT: "b" })).toBe(false);
    // PEEK_WEB=off (local/preview opt-out) never applies to Production.
    expect(homeVariant({ VERCEL_ENV: "preview", PEEK_WEB: "off" })).toBe("b");
    expect(homeVariant({ VERCEL_ENV: "production", PEEK_WEB: "off" })).toBe("peek");
  });
  it("keeps the marketing gate out of the web app's Peek flag code", () => {
    const gate = read("lib/home-variant.ts");
    expect(gate).not.toMatch(/^import /m);
    expect(gate).not.toContain("env.PEEK_WEB_PRODUCTION");
  });
  it("routes home, /features, /pricing and /faq through the gate and keeps the current pages as the fallback", () => {
    expect(read("app/page.tsx")).toContain('variant === "peek"');
    for (const p of ["features", "pricing", "faq"]) {
      const page = read(`app/${p}/page.tsx`);
      expect(page, p).toContain("if (marketingPeek())");
      expect(page, p).toContain('<PublicPage bare theme="dark">');
    }
  });
});

describe("Peek marketing site: scope", () => {
  it("scopes every style rule to .pkm", () => {
    const css = read("components/site/peek/peek-marketing.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = css.split("}").map((b) => b.split("{")[0].trim()).filter((s) => s && !s.startsWith("@") && !/^(from|to|\d+%)$/.test(s));
    expect(selectors.length).toBeGreaterThan(50);
    for (const sel of selectors) for (const part of sel.split(",")) expect(part.trim(), part).toMatch(/^\.pkm(\b|$)/);
  });
  it("does not use the shared marketing shell, nav or footer, and only reads Peek brand files", () => {
    const shell = read("components/site/peek/shell.tsx");
    expect(shell).not.toMatch(/import[^\n]*(SiteNav|SiteFooter|PublicPage)/);
    expect(shell).toContain("/peek/brand/pekko-lockup-light.svg");
    for (const f of PEEK) expect(read(f), f).not.toMatch(/@font-face|LogoMark|Wordmark/);
  });
});

describe("Peek marketing site: offer, prices and CTAs unchanged", () => {
  it("sends every trial CTA to /signup and keeps funnel locations", () => {
    expect(read("components/site/peek/shell.tsx")).toContain('export const SIGNUP_HREF = "/signup"');
    const home = read("components/site/peek/home-peek.tsx");
    for (const loc of ['location="hero"', 'location="demo"']) expect(home).toContain(loc);
    expect(home).toContain('<PeekPricingCards testPrefix="landing-plan" track />');
    expect(home).toContain("track />"); // final CTA keeps location "final"
    expect(read("components/site/peek/sections.tsx")).toContain('location="final"');
    expect(read("components/site/peek/shell.tsx")).toContain('location="nav"');
    expect(home).toContain("<StickyCta"); // location "sticky"
  });
  it("takes prices, plans and trial terms from the shared constants", () => {
    const all = PEEK.map(read).join("\n");
    expect(all).not.toMatch(/\$\s?(19|39|59)\b|\b14[- ]day|\bup to 5\b/i);
    expect(read("components/site/peek/sections.tsx")).toContain("PLANS.map");
    const home = read("components/site/peek/home-peek.tsx");
    expect(home).toContain("TRIAL.days");
    expect(home).toContain("PLAYBACK_GRACE_DAYS");
  });
  it("keeps the interactive menu demo with the real renderer", () => {
    const home = read("components/site/peek/home-peek.tsx");
    expect(home).toContain('<LiveDemo ns="pkm" initial="taqueria-specials"');
    expect(read("components/site/marketing/home-b-client.tsx")).toContain('import("@/lib/menu-design-svg")');
  });
});

describe("Peek marketing site: copy", () => {
  const NEW = ["home2.peekHeroSub", "home2.heroSwipe", "home2.heroSlide", "home2.featTitle", "home2.featLede", "home2.feat5Title", "home2.feat6Title", "home2.feat6Body"] as const;
  it("has every new string in English and Spanish", () => {
    for (const k of NEW) {
      expect(en[k], k).toBeTruthy();
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toBe(en[k]);
    }
  });
  it("uses the approved subheadline and keeps the Option B copy unchanged", () => {
    expect(en["home2.peekHeroSub"]).toContain("about 30 seconds");
    expect(en["home2.how4Body"]).toContain("about 30 seconds");
    expect(en["home2.heroSub"]).toBe("Pick a template, add your items, prices and food photos, and publish. <b>No design skills needed.</b>");
    expect(en["nav.startTrial"]).toBe("Start Free Trial");
  });
});
