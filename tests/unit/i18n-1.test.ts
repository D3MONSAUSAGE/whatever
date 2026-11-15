import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { chromium } from "playwright";

vi.mock("@/lib/server/supabase", () => ({ BUCKET: "media", db: () => ({}) }));

import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { ENGLISH_ONLY, format, makeT, translate } from "@/lib/i18n/index";
import { DEFAULT_LOCALE, localeCookie, localeFromAcceptLanguage, readLocaleCookie, toLocale } from "@/lib/i18n/locales";
import { codeForMessage, errorCatalog, localizeError, messageFor } from "@/lib/server/error-codes";
import { fail } from "@/lib/server/http";
import { FAQ, FEATURES } from "@/lib/marketing";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

describe("I18N-1 dictionaries", () => {
  it("es has every en key, nothing extra, no empty values", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(es)) expect(v.trim(), k).not.toBe("");
  });

  it("keeps the same {placeholders} and <tags> in both languages", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(es[k]), k).toEqual(placeholders(en[k]));
      expect(tags(es[k]), k).toEqual(tags(en[k]));
    }
  });

  it("English-only billing keys repeat the English text; everything else is translated", () => {
    for (const k of ENGLISH_ONLY) expect(es[k]).toBe(en[k]);
    const same = (Object.keys(en) as (keyof typeof en)[]).filter((k) => es[k] === en[k] && !ENGLISH_ONLY.includes(k));
    // Words that are the same in both languages.
    expect(same.sort()).toEqual(["auth.legalNav", "footer.legal", "lang.en", "lang.es", "site.popular", "kind.video", "tv.hours", "tv.min", "cp.filter.video", "cp.type.video", "fu.video.accept"].sort());
  });

  it("uses formal usted (no tú forms) and never translates Pekko", () => {
    const all = Object.values(es).join("\n");
    expect(all).not.toMatch(/\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b/i);
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      if (en[k].includes("Pekko")) expect(es[k], k).toContain("Pekko");
    }
  });

  it("follows Gother's glossary for the shared terms", () => {
    const all = Object.values(es).join("\n");
    expect(all).not.toMatch(/televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/);
    expect(es["nav.startTrial"]).toBe("Prueba gratis");
    expect(es["apiError.pairing_code_not_found"]).toBe("Ese código no corresponde a ninguna TV. Revise la pantalla: los códigos vencen a los 10 minutos.");
    expect(es["apiError.rate_limited_15m"]).toBe("Demasiados intentos. Espere 15 minutos e intente de nuevo.");
    expect(es["apiError.pair_failed"]).toBe("No se pudo vincular la TV. Intente de nuevo."); // glossary: pair = vincular (Gother #106 low 2)
  });

  it("formats, falls back to English, and leaves unknown placeholders visible", () => {
    expect(format("Hi {name} {x}", { name: "Ana" })).toBe("Hi Ana {x}");
    expect(translate("es", "site.upToScreens", { screens: 3 })).toBe("Hasta 3 pantallas");
    expect(makeT("en")("site.upToScreens", { screens: 3 })).toBe("Up to 3 screens");
  });

  it("marketing lists keep the exact English text", () => {
    expect(FEATURES.find((f) => f.id === "media")?.title).toBe("Turn presentations into screen content");
    expect(FAQ[0].a).toContain("14-day");
  });
});

describe("I18N-1 locale preference", () => {
  it("defaults to English; Accept-Language is only read for error text", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(toLocale("fr")).toBe("en");
    expect(localeFromAcceptLanguage("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(localeFromAcceptLanguage("en-US,es;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage(null)).toBe("en");
    // Gother #106 MEDIUM: q-values are stripped, the list is walked by weight, regional tags count.
    const cases: [string, "en" | "es"][] = [
      ["es", "es"], ["es;q=0.9", "es"], ["ES-mx", "es"], ["es-419", "es"], ["es-US;q=0.5", "es"],
      ["es-MX,es;q=0.9,en;q=0.8", "es"], ["fr-FR,fr;q=0.9,es;q=0.8,en;q=0.7", "es"], ["de, es;q=0.3, en;q=0.2", "es"],
      ["en;q=0.5,es;q=0.9", "es"], ["en-US,es;q=0.9", "en"], ["es;q=0.9,en", "en"], ["es;q=0,en;q=0.1", "en"],
      ["fr,de", "en"], ["*", "en"], ["", "en"], [" es ; q=0.8 ", "es"], ["es;q=abc", "en"], ["es;q=0.8,en;q=0.8", "es"],
    ];
    for (const [header, want] of cases) expect([header, localeFromAcceptLanguage(header)]).toEqual([header, want]);
    // Gother #106 low 1: Secure in production; plain on http dev.
    expect(localeCookie("es")).toBe("pekko_locale=es; Path=/; Max-Age=31536000; SameSite=Lax");
    vi.stubEnv("NODE_ENV", "production");
    expect(localeCookie("es")).toBe("pekko_locale=es; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    vi.unstubAllEnvs();
    expect(readLocaleCookie("a=1; pekko_locale=es")).toBe("es");
    expect(readLocaleCookie("pekko_locale=xx")).toBeNull();
  });

  it("server pages read the cookie, not Accept-Language", () => {
    const server = readFileSync("lib/i18n/server.ts", "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    expect(server).toContain("LOCALE_COOKIE");
    expect(server).not.toMatch(/accept-language/i);
    expect(readFileSync("app/layout.tsx", "utf8")).toContain("<html lang={locale}");
  });

  it("migration 0028 is additive and nullable (null = English)", () => {
    const sql = readFileSync("supabase/migrations/0028_account_locale.sql", "utf8");
    expect(sql).toMatch(/add column if not exists locale text;/);
    expect(sql).toMatch(/check \(locale is null or locale in \('en', 'es'\)\)/);
    const live = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(live).not.toMatch(/\b(drop|delete|update|truncate)\b/i);
  });

  it("does not touch the TV player or auth code", () => {
    expect(readFileSync("lib/server/auth.ts", "utf8")).not.toMatch(/locale|i18n/);
    expect(readFileSync("public/player.html", "utf8")).not.toMatch(/pekko_locale|i18n/);
  });
});

describe("I18N-1 API error codes", () => {
  it("fail() adds a stable code and keeps the English message", async () => {
    const res = fail("That code doesn't match a TV. Check the screen — codes expire after 10 minutes.", 404);
    expect(await res.json()).toEqual({ error: "That code doesn't match a TV. Check the screen — codes expire after 10 minutes.", code: "pairing_code_not_found" });
    expect(await fail("Something odd.", 404).json()).toEqual({ error: "Something odd.", code: "not_found" });
    expect(await fail("Something odd.", 500).json()).toEqual({ error: "Something odd.", code: "server_error" });
    expect(await fail("Something odd.", 422).json()).toEqual({ error: "Something odd.", code: "validation_failed" });
    expect(await fail("x", 400, "custom").json()).toEqual({ error: "x", code: "custom" });
    expect(codeForMessage("Sign in to continue.", 401)).toBe("auth_required");
  });

  it("the catalog lists every code with en and es text", () => {
    const cat = errorCatalog();
    expect(cat.length).toBeGreaterThan(20);
    for (const row of cat) { expect(row.en).toBeTruthy(); expect(row.es).toBeTruthy(); }
    expect(messageFor("auth_required", "Sign in to continue.", "es")).toBe("Inicie sesión para continuar.");
    expect(messageFor("auth_required", "Some other text", "es")).toBeNull();
  });

  const pairFail = () => fail("Enter the 6-digit code shown on the TV.", 400);
  const req = (lang?: string) => new Request("https://x.test/api", { headers: lang ? { "accept-language": lang } : {} });

  it("localizes only exact catalog messages; English callers get the response untouched", async () => {
    const original = pairFail();
    expect(await localizeError(req(), original)).toBe(original);
    expect(await localizeError(req("en-US"), original)).toBe(original);
    const es = await localizeError(req("es-MX"), pairFail());
    expect(es.status).toBe(400);
    expect(await es.json()).toEqual({ error: "Escriba el código de 6 dígitos que aparece en la TV.", code: "pairing_code_invalid" });
    const other = await localizeError(req("es"), fail("Unknown wording.", 400));
    expect(await other.json()).toEqual({ error: "Unknown wording.", code: "validation_failed" });
  });

  it("the account's saved locale wins over Accept-Language; headers like Retry-After are kept", async () => {
    const res = Response.json({ error: "Too many attempts. Wait 15 minutes, then try again.", code: "rate_limited_15m" }, { status: 429, headers: { "Retry-After": "60" } });
    const out = await localizeError(req("en"), res, async () => "es");
    expect(out.headers.get("retry-after")).toBe("60");
    expect((await out.json()).error).toBe("Demasiados intentos. Espere 15 minutos e intente de nuevo.");
    const kept = await localizeError(req("es"), pairFail(), async () => "en");
    expect((await kept.json()).error).toBe("Enter the 6-digit code shown on the TV.");
    const failing = await localizeError(req("es"), pairFail(), async () => { throw new Error("db down"); });
    expect((await failing.json()).error).toBe("Escriba el código de 6 dígitos que aparece en la TV.");
  });

  it("success responses and non-JSON bodies pass through", async () => {
    const ok = Response.json({ id: 1 });
    expect(await localizeError(req("es"), ok)).toBe(ok);
    const png = new Response("x", { status: 503, headers: { "content-type": "image/png" } });
    expect(await localizeError(req("es"), png)).toBe(png);
  });

  it("Android-visible routes are wrapped", () => {
    for (const f of ["app/api/me/route.ts", "app/api/displays/pair/route.ts", "app/api/displays/[id]/reconnect/route.ts", "app/api/menus/preview/route.ts", "app/api/promos/preview/route.ts"]) {
      expect(readFileSync(f, "utf8"), f).toContain("withLocalizedErrors(");
    }
  });
});

describe("I18N-1 switching language keeps unsaved work", () => {
  const hasBrowser = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/navigation": `export function useRouter(){return {replace(p){window.__replaced=p},refresh(){window.__refreshed=(window.__refreshed||0)+1}}} export function useSearchParams(){return new URLSearchParams(location.search)}`,
    "next/link": `import React from "react"; export default function Link(p){return React.createElement("a",{href:p.href,className:p.className},p.children)}`,
    "@/lib/supabase-browser": `export function supabaseConfigured(){return true}
      export function getSupabase(){return {auth:{getSession: async()=>({data:{session:null}}),
        signInWithPassword: async()=>({data:{session:null},error:{message:"Invalid login credentials"}})}}}`,
  };
  const stubPlugin: Plugin = { name: "stubs", setup(b) {
    b.onResolve({ filter: /^(next\/navigation|next\/link|@\/lib\/supabase-browser)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js", resolveDir: root }));
  } };

  it.skipIf(!hasBrowser)("the sign-in form keeps typed text, switches in place, saves the cookie and translates errors", async () => {
    const out = await build({
      stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import LoginPage from "@/app/login/page"; import { LocaleProvider } from "@/lib/i18n/client";
        createRoot(document.getElementById("root")).render(React.createElement(LocaleProvider, { initial: "en" }, React.createElement(LoginPage)));`, resolveDir: root, loader: "tsx" },
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent", plugins: [stubPlugin],
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.route("https://pekkotv.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<html lang="en"><body><div id="root"></div></body></html>` }));
      await page.goto("https://pekkotv.test/login");
      await page.addScriptTag({ content: out.outputFiles[0].text });
      await page.getByLabel("Email").fill("owner@example.com");
      await page.getByLabel("Password").fill("correct-horse-1");
      await page.getByTestId("language-select").selectOption("es");
      await expect.poll(() => page.locator("h1").textContent()).toBe("Iniciar sesión");
      expect(await page.getByLabel("Correo electrónico").inputValue()).toBe("owner@example.com");
      expect(await page.getByLabel("Contraseña").inputValue()).toBe("correct-horse-1");
      expect(await page.evaluate(() => document.cookie)).toContain("pekko_locale=es");
      expect(await page.evaluate(() => document.documentElement.lang)).toBe("es");
      expect(await page.evaluate(() => (window as unknown as { __refreshed?: number }).__refreshed ?? 0)).toBe(0); // auth pages switch without a refresh
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await expect.poll(() => page.getByRole("alert").textContent()).toBe("El correo y la contraseña no coinciden.");
      await page.getByTestId("language-select").selectOption("en");
      await expect.poll(() => page.locator("h1").textContent()).toBe("Sign in");
      expect(await page.getByLabel("Email").inputValue()).toBe("owner@example.com");
    } finally {
      await browser.close();
    }
  }, 60_000);
});

describe("I18N-1 stable codes for Android", () => {
  it("the 15-minute pair/reconnect limit always sends rate_limited_15m explicitly", async () => {
    for (const f of ["app/api/displays/pair/route.ts", "app/api/displays/[id]/reconnect/route.ts"]) {
      expect(readFileSync(f, "utf8")).toContain('fail("Too many attempts. Wait 15 minutes, then try again.", 429, "rate_limited_15m")');
    }
    const { fail } = await import("@/lib/server/http");
    expect(await fail("Too many attempts. Wait 15 minutes, then try again.", 429, "rate_limited_15m").json()).toEqual({ error: "Too many attempts. Wait 15 minutes, then try again.", code: "rate_limited_15m" });
  });
});

