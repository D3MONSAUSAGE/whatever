import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/dashboard" }));
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { makeT } from "@/lib/i18n/index";
import { LocaleProvider } from "@/lib/i18n/client";
import { API_MESSAGES_ES, apiMessageEs } from "@/lib/i18n/api-messages";
import { codeForMessage, localizeError } from "@/lib/server/error-codes";
import { fail } from "@/lib/server/http";
import { SetupTracker } from "@/components/setup-tracker";
import type { OnboardingState } from "@/lib/api";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/i;

describe("I18N-2: dictionaries", () => {
  it("every new I18N-2 key has Spanish in usted, following the glossary", () => {
    const prefixes = ["setup.", "disp.", "acct.", "settings.", "del.", "alerts.", "gp.", "ov.", "rc."];
    const keys = (Object.keys(en) as (keyof typeof en)[]).filter((k) => prefixes.some((p) => k.startsWith(p)));
    expect(keys.length).toBeGreaterThan(250);
    for (const k of keys) {
      expect(es[k], k).toBeTruthy();
      expect(es[k], k).not.toMatch(ES_RULES);
      expect(es[k].match(/\{\w+\}/g)?.sort(), k).toEqual(en[k].match(/\{\w+\}/g)?.sort());
      if (en[k].includes("Pekko")) expect(es[k], k).toContain("Pekko");
    }
  });
  it("Delete account keeps the literal DELETE the server checks", () => {
    expect(es["del.typeDelete"]).toContain("DELETE");
    expect(readFileSync("app/dashboard/settings/delete/page.tsx", "utf8")).toContain('confirm !== "DELETE"');
  });
  it("unpairing uses 'desvincular' (pair = vincular), never 'desconectado'", () => {
    expect(es["disp.disconnect"]).toBe("Desvincular");
    expect(es["disp.disconnectTitle"]).toBe("¿Desvincular esta pantalla?");
  });
});

describe("I18N-2: in-scope screens route their copy through t()", () => {
  const files: Record<string, string[]> = {
    "components/setup-tracker.tsx": ["Set up your first screen", "Hide setup", "Resume setup", "Business name", "Save location", "Common (US)"],
    "components/displays-screen.tsx": ["Add and manage screens", "Connect TV", "Assign playlist", "Disconnect this screen?", "Publish to selected screens", "Choose a playlist"],
    "components/group-publish.tsx": ["Publish to this group", "Overridden by schedule.", "Publish to these screens"],
    "components/overview-screen.tsx": ["Welcome back!", "Recent Screens", "Media files"],
    "components/reconnect-tv.tsx": ["Reconnect a TV to this screen", "Connect this TV"],
    "app/dashboard/account/page.tsx": ["Open settings", "Contact support", "Settings, your brand"],
    "app/dashboard/settings/page.tsx": ["Change password", "Sign out of all devices", "Display name", "Save business name", "Not set"],
    "app/dashboard/settings/delete/page.tsx": ["Delete my account", "Deletion scheduled", "Type DELETE to confirm"],
    "components/alerts.tsx": ["Screen alerts", "Mark all as read", "went offline around"],
  };
  for (const [file, strings] of Object.entries(files)) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      for (const s of strings) expect(src, s).not.toContain(s);
      expect(src).toMatch(/useT\(\)|useLocale\(\)/);
    });
  }
  it("English wording is unchanged (spot checks)", () => {
    expect(en["setup.heading"]).toBe("Set up your first screen");
    expect(en["disp.title"]).toBe("Add and manage screens");
    expect(en["settings.signOutAllBody"]).toBe("This signs you out here and on every phone, tablet, and computer. Your TVs keep playing; they don't use your sign-in.");
    expect(en["del.afterConfirm"]).toBe("after you confirm; you can cancel until then. It can't be undone afterwards.");
  });
  it("the setup tracker renders in Spanish", () => {
    const state: OnboardingState = {
      steps: [{ id: "account", done: true }, { id: "business", done: true }, { id: "location", done: true }, { id: "screen", done: false }, { id: "media", done: false }, { id: "playlist", done: false }, { id: "publish", done: false }, { id: "playing", done: false, confirmed: false }],
      completed: 3, total: 8, nextStep: "screen", dismissed: false, finished: false, show: true, firstLocationId: null,
    };
    const html = renderToStaticMarkup(createElement(LocaleProvider, { initial: "es", children: createElement(SetupTracker, { fixture: state, origin: "https://pekkotv.com" }) }));
    expect(html).toContain("Configure su primera pantalla");
    expect(html).toContain("3 de 8 pasos completados.");
    expect(html).toContain("Vincular una pantalla");
    expect(html).toContain("Crear un menú digital");
    expect(html).toContain("pekkotv.com/tv abre el mismo reproductor.");
    expect(html).not.toMatch(/Set up your first screen|Hide setup|steps done/);
  });
});

describe("I18N-2: Spanish for API errors Android can show (codes unchanged)", () => {
  const req = (lang: string) => new Request("https://x.test/api", { headers: { "accept-language": lang } });

  it("a generic-code message is translated for Spanish callers; the code and status stay the same", async () => {
    const out = await localizeError(req("es-MX"), fail("Screen not found.", 404));
    expect(out.status).toBe(404);
    expect(await out.json()).toEqual({ error: "No se encontró la pantalla.", code: "not_found" });
    const en = fail("Screen not found.", 404);
    expect(await localizeError(req("en-US"), en)).toBe(en);
  });
  it("unknown wording passes through untouched", async () => {
    const out = await localizeError(req("es"), fail("Unknown wording.", 400));
    expect(await out.json()).toEqual({ error: "Unknown wording.", code: "validation_failed" });
  });
  it("placeholder messages translate, and nested ones only when the inner text is known", () => {
    expect(apiMessageEs("This account already has 20 menus.")).toBe("Esta cuenta ya tiene 20 menús.");
    expect(apiMessageEs("Add 1 to 6 parts of the day.")).toBe("Agregue de 1 a 6 franjas horarias.");
    expect(apiMessageEs("“Lunch” hasn't been published yet. Publish this board first, then schedule it.")).toBe("“Lunch” todavía no se ha publicado. Publique primero este menú digital y luego agréguelo a un horario.");
    expect(apiMessageEs("Front: Screen not found.")).toBe("Front: No se encontró la pantalla.");
    expect(apiMessageEs("Front: something new")).toBeNull();
  });
  it("adding Spanish never changes a code: the table doesn't overlap the apiError catalog and codes still come from status", () => {
    const catalog = new Set((Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("apiError.")).map((k) => en[k] as string));
    for (const english of Object.keys(API_MESSAGES_ES)) expect(catalog.has(english), english).toBe(false);
    expect(codeForMessage("Screen not found.", 404)).toBe("not_found");
    expect(codeForMessage("Choose at least one screen.", 400)).toBe("validation_failed");
    expect(codeForMessage("A group with that name already exists.", 409)).toBe("conflict");
  });
  it("Spanish API text is usted and follows the glossary", () => {
    for (const [english, spanish] of Object.entries(API_MESSAGES_ES)) {
      expect(spanish, english).not.toMatch(ES_RULES);
      expect(spanish.match(/\{\w+\}/g)?.sort(), english).toEqual(english.match(/\{\w+\}/g)?.sort());
    }
  });

  // Every literal fail("…") message is either translated, already in the apiError catalog, or listed as developer/billing-only.
  const DEV_OR_BILLING_ONLY = new Set([
    "Cleanup isn't configured.", "Cron isn't configured.", "Couldn't clean up uploads.", "Couldn't deliver alert emails.",
    "Couldn't deliver alert pushes.", "Couldn't run account deletions.", "Couldn't run billing reminders.",
    "Couldn't load your plan. Try again.", "Saved, but couldn't reload your plan. Refresh to see it.",
    "No attribution to save.", "Not paired.", "Send command \\", "Send { ids: [...] } (up to 100) or { all: true }.",
    "appVersion must be a string of up to 40 characters.", "bad count", "bad index", "bad seq", "bad version",
    "before must be an ISO date.", "confirmBusiness must be true.", "days must be 7 or 30.", "dismissed must be true or false.",
    "emailEnabled must be true or false.", "enabled must be true or false.", "platform must be 'android' or 'ios'.",
    "pushEnabled must be true or false.", "token must be an FCM registration token.", "unauthorized", "unavailable", "…",
  ]);
  // Field-name validation for developers and devices, never shown to a customer as a sentence.
  const DEV_OR_BILLING_ONLY_TEMPLATES = new Set([
    "${k} must be true or false.",
    "thresholdMinutes must be a whole number from ${THRESHOLD_MIN} to ${THRESHOLD_MAX}.",
  ]);
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; });
  }
  it("no customer-facing API message is left without Spanish", () => {
    const catalog = new Set((Object.keys(en) as (keyof typeof en)[]).filter((k) => k.startsWith("apiError.")).map((k) => en[k] as string));
    const missing = new Set<string>();
    for (const f of [...walk("app/api"), ...walk("lib/server")]) {
      for (const m of readFileSync(f, "utf8").matchAll(/fail\(\s*"([^"]+)"/g)) {
        const text = m[1];
        if (!catalog.has(text) && apiMessageEs(text) === null && !DEV_OR_BILLING_ONLY.has(text)) missing.add(`${f}: ${text}`);
      }
      // Gother #111 LOW: template fail(`…`) calls too. Each ${…} is filled with a sample value before the lookup;
      // `${name}: ${error}` wrappers only pass through inner messages, which this walk already checks on their own.
      for (const m of readFileSync(f, "utf8").matchAll(/fail\(\s*`([^`]+)`/g)) {
        const raw = m[1];
        if (/^\$\{[^}]+\}: \$\{[^}]+\}$/.test(raw) || DEV_OR_BILLING_ONLY_TEMPLATES.has(raw)) continue;
        const sample = raw.replace(/\$\{[^}]+\}/g, "7");
        if (!catalog.has(sample) && apiMessageEs(sample) === null) missing.add(`${f}: ${raw}`);
      }
    }
    expect([...missing]).toEqual([]);
  });
  it("the template walk sees fail(`…`) calls and catches an untranslated one", () => {
    const src = 'return fail(`This account already has ${MAX_MENUS} menus.`, 400); return fail(`Only ${n} left on this plan.`, 400);';
    const found = [...src.matchAll(/fail\(\s*`([^`]+)`/g)].map((m) => m[1].replace(/\$\{[^}]+\}/g, "7"));
    expect(found).toEqual(["This account already has 7 menus.", "Only 7 left on this plan."]);
    expect(apiMessageEs(found[0])).toBe("Esta cuenta ya tiene 7 menús.");
    expect(apiMessageEs(found[1])).toBeNull();
  });
  it("customer routes are wrapped so errors come back in the caller's language; player, cron, billing and webhooks are not", () => {
    const skip = /app\/api\/(admin|billing|cron|config|health|player|webhooks)\//;
    for (const f of walk("app/api").filter((p) => p.endsWith("route.ts"))) {
      const src = readFileSync(f, "utf8");
      if (f === "app/api/brand/apply/route.ts") continue; // byte-identical by design (brand-identity test)
      if (skip.test(f)) { expect(src, f).not.toContain("withLocalizedErrors"); continue; }
      expect(src, f).not.toMatch(/^export async function (GET|POST|PATCH|PUT|DELETE)\b/m);
      expect(src, f).toContain("withLocalizedErrors(");
    }
  });
  it("the player and TV paths stay English-only", () => {
    expect(makeT("es")("disp.connectTv")).toBe("Conectar TV");
    expect(readFileSync("app/api/player/state/route.ts", "utf8")).not.toContain("withLocalizedErrors");
  });
});
