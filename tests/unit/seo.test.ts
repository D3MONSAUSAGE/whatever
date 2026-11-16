import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { languageSwitchRedirect, spanishMarketingRewrite } from "@/middleware";
import { localizedPath, marketingBaseOf, marketingHref, marketingMetadata, MARKETING_PATHS, parseSpanishPath } from "@/lib/seo";
import { softwareApplication } from "@/components/site/structured-data";
import { makeT, en, es } from "@/lib/i18n/index";
import { PLANS } from "@/lib/plans";

describe("SEO: Spanish marketing URLs", () => {
  it("maps /es URLs to the six marketing pages and nothing else", () => {
    expect(parseSpanishPath("/es")).toEqual({ base: "/" });
    expect(parseSpanishPath("/es/")).toEqual({ base: "/" });
    expect(parseSpanishPath("/es/pricing")).toEqual({ base: "/pricing" });
    expect(parseSpanishPath("/es/faq/")).toEqual({ base: "/faq" });
    for (const p of ["/es/dashboard", "/es/terms", "/es/api/health", "/es/player", "/escape", "/pricing", "/"]) expect(parseSpanishPath(p), p).toBeNull();
    expect(localizedPath("/", "es")).toBe("/es");
    expect(localizedPath("/pricing", "es")).toBe("/es/pricing");
    expect(localizedPath("/pricing", "en")).toBe("/pricing");
    expect(marketingHref("/faq", "es")).toBe("/es/faq");
    expect(marketingHref("/signup", "es")).toBe("/signup");
    expect(marketingHref("/terms#billing", "es")).toBe("/terms#billing");
    expect(marketingBaseOf("/es/features")).toBe("/features");
    expect(marketingBaseOf("/features")).toBe("/features");
    expect(marketingBaseOf("/dashboard")).toBeNull();
  });

  it("rewrites /es pages to the English route with the Spanish locale, and leaves other paths alone", () => {
    const res = spanishMarketingRewrite(new NextRequest("https://pekkotv.com/es/pricing", { headers: { cookie: "pekko_locale=en; other=1" } }));
    expect(res).not.toBeNull();
    expect(res!.headers.get("x-middleware-rewrite")).toBe("https://pekkotv.com/pricing");
    const forwarded = res!.headers.get("x-middleware-request-cookie") ?? "";
    expect(forwarded).toContain("pekko_locale=es");
    expect(forwarded).not.toContain("pekko_locale=en");
    expect(forwarded).toContain("other=1");
    expect(res!.headers.get("set-cookie")).toMatch(/^pekko_locale=es; Path=\/;.*Secure$/);
    // Background prefetch of an /es link renders Spanish but never changes the visitor's saved language.
    const prefetch = spanishMarketingRewrite(new NextRequest("https://pekkotv.com/es/faq?_rsc=abc", { headers: { rsc: "1", "next-router-prefetch": "1" } }));
    expect(prefetch!.headers.get("x-middleware-rewrite")).toContain("/faq");
    expect(prefetch!.headers.get("set-cookie")).toBeNull();
    for (const p of ["/pricing", "/es/dashboard", "/api/player/state", "/player", "/es/api/health"]) {
      expect(spanishMarketingRewrite(new NextRequest(`https://pekkotv.com${p}`)), p).toBeNull();
    }
  });
});

describe("Language switch on marketing pages", () => {
  it("saves the chosen language on the server and redirects to the clean URL in that language", () => {
    const toEs = languageSwitchRedirect(new NextRequest("https://pekkotv.com/pricing?lang=es"));
    expect(toEs!.status).toBe(307);
    expect(toEs!.headers.get("location")).toBe("https://pekkotv.com/es/pricing");
    expect(toEs!.headers.get("set-cookie")).toMatch(/^pekko_locale=es;/);
    const toEn = languageSwitchRedirect(new NextRequest("https://pekkotv.com/es/faq?lang=en"));
    expect(toEn!.headers.get("location")).toBe("https://pekkotv.com/faq");
    expect(toEn!.headers.get("set-cookie")).toMatch(/^pekko_locale=en;/);
    expect(languageSwitchRedirect(new NextRequest("https://pekkotv.com/es?lang=en"))!.headers.get("location")).toBe("https://pekkotv.com/");
    // Legal pages keep their own ?lang=en (English original); other values and paths are ignored.
    for (const u of ["/terms?lang=en", "/privacy?lang=es", "/dashboard?lang=es", "/pricing?lang=fr", "/pricing"]) {
      expect(languageSwitchRedirect(new NextRequest(`https://pekkotv.com${u}`)), u).toBeNull();
    }
  });
});

describe("SEO: robots, sitemap and metadata", () => {
  it("lets crawlers in, keeps private areas out, and points at the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.allow).toBe("/");
    for (const d of ["/api/", "/dashboard", "/developer", "/player", "/pair", "/tv"]) expect(rule.disallow).toContain(d);
    expect(rule.disallow).not.toContain("/pricing");
    expect(r.sitemap).toBe("https://pekkotv.com/sitemap.xml");
  });

  it("lists every marketing page in both languages with hreflang alternates, and no invented dates", () => {
    const urls = sitemap();
    for (const p of MARKETING_PATHS) {
      expect(urls.some((u) => u.url === `https://pekkotv.com${p === "/" ? "/" : p}`), p).toBe(true);
      expect(urls.some((u) => u.url === `https://pekkotv.com${localizedPath(p, "es")}`), p).toBe(true);
    }
    const home = urls.find((u) => u.url === "https://pekkotv.com/")!;
    expect(home.alternates?.languages).toEqual({ en: "https://pekkotv.com/", es: "https://pekkotv.com/es", "x-default": "https://pekkotv.com/" });
    expect(urls.some((u) => u.url.includes("/dashboard") || u.url.includes("/login") || u.url.includes("/api"))).toBe(false);
    expect(urls.every((u) => u.lastModified === undefined)).toBe(true);
  });

  it("gives each language its own canonical and both hreflang alternates", () => {
    const esMeta = marketingMetadata({ path: "/pricing", locale: "es", title: "T", description: "D" });
    expect(esMeta.alternates?.canonical).toBe("/es/pricing");
    expect(esMeta.alternates?.languages).toEqual({ en: "/pricing", es: "/es/pricing", "x-default": "/pricing" });
    const enMeta = marketingMetadata({ path: "/", locale: "en", title: "T", description: "D" });
    expect(enMeta.alternates?.canonical).toBe("/");
    expect(enMeta.openGraph).toMatchObject({ url: "/", locale: "en_US" });
  });

  it("puts metadata in <head> for every crawler and keeps the old alias out of the index", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("htmlLimitedBots: /.*/");
    expect(config).toMatch(/pantalla-chi\.vercel\.app[\s\S]{0,80}X-Robots-Tag[\s\S]{0,30}noindex/);
    for (const p of ["app/login/layout.tsx", "app/forgot-password/layout.tsx", "app/reset-password/layout.tsx"]) {
      expect(readFileSync(p, "utf8"), p).toContain("index: false");
    }
  });

  it("has meta titles and descriptions of search-friendly length in both languages", () => {
    for (const dict of [en, es]) {
      for (const page of ["home", "features", "pricing", "faq", "support", "contact"]) {
        const title = dict[`${page}.metaTitle` as keyof typeof en];
        const desc = dict[`${page}.metaDescription` as keyof typeof en];
        expect(title.length, title).toBeLessThanOrEqual(70);
        expect(desc.length, desc).toBeGreaterThan(50);
        expect(desc.length, desc).toBeLessThanOrEqual(240);
      }
    }
  });
});

describe("SEO: structured data", () => {
  it("describes the real plans and never fabricates ratings or reviews", () => {
    const app = softwareApplication("en", makeT("en"));
    expect(app.offers.map((o) => [o.name, o.price, o.priceCurrency])).toEqual(PLANS.map((p) => [p.name, p.price.toFixed(2), "USD"]));
    const src = readFileSync("components/site/structured-data.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(JSON.stringify(app)).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review"/i);
    expect(src).not.toMatch(/aggregateRating|ratingValue|reviewCount|Review"/);
  });
});
