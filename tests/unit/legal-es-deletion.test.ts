import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { ReactElement } from "react";

let cookieLocale: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "pekko_locale" && cookieLocale ? { value: cookieLocale } : undefined) }) }));

import Page, { generateMetadata } from "@/app/account-deletion/page";
import { COURTESY_NOTICE_ES, LEGAL_OPERATOR_ES } from "@/lib/legal-es";
import { LEGAL_ADDRESS, LEGAL_OPERATOR } from "@/lib/legal";
import { deletionSnapshot, renderWithContact } from "./helpers/deletion-markup";

const golden = JSON.parse(readFileSync("tests/fixtures/account-deletion-en.golden.json", "utf8"));
type P = (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>;
const page = (q?: Record<string, string>) => (Page as unknown as P)({ searchParams: Promise.resolve(q ?? {}) });
const meta = async (q?: Record<string, string>) => (await generateMetadata({ searchParams: Promise.resolve(q ?? {}) })).title;
const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese|tuvo contacto/i;
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
const numbers = (s: string) => (s.match(/\d+/g) ?? []).sort();

beforeEach(() => { cookieLocale = undefined; });

describe("/account-deletion: the English page stays byte-identical", () => {
  for (const [label, locale, q] of [["en cookie", "en", undefined], ["no cookie", undefined, undefined], ["es + ?lang=en", "es", { lang: "en" }]] as const) {
    it(`${label}: same markup and title as the golden captured before this branch`, async () => {
      cookieLocale = locale;
      const snap = await deletionSnapshot(await page(q));
      expect(snap.html).toBe(golden.html);
      expect(await meta(q)).toBe(golden.title);
      if (!locale || locale === "en") expect(snap.contact).toBe(golden.contact);
    });
  }
  it("the English contact block still prints the English operator line", async () => {
    const snap = await deletionSnapshot(await page());
    expect(snap.contact).toContain(LEGAL_OPERATOR);
  });
});

describe("/account-deletion: Spanish courtesy translation", () => {
  beforeEach(() => { cookieLocale = "es"; });
  it("shows only for locale es, with the notice first and a link to the English original", async () => {
    const h = await renderWithContact(await page());
    expect(h.indexOf(COURTESY_NOTICE_ES)).toBeGreaterThan(-1);
    expect(h.indexOf("courtesy-notice")).toBeLessThan(h.indexOf("<h1"));
    expect(h).toContain('href="/account-deletion?lang=en"');
    expect(h).toContain('lang="es"');
    expect(await meta()).toBe("Eliminar su cuenta · Pekko");
  });
  it("keeps the same steps, links, 7 days, DELETE and table rows as English", async () => {
    const es = await renderWithContact(await page());
    expect(es).toContain('href="/login?next=/dashboard/settings/delete"');
    expect(es).toContain('href="/forgot-password"');
    expect(es).toContain("<strong>DELETE</strong>");
    expect(es).toContain("<strong>7 días</strong>");
    for (const id of ["deleted-table", "retained-table", "deletion-signin"]) expect(es.split(id).length).toBe(golden.html.split(id).length);
    const rows = (h: string) => h.split("<tr").length - 1;
    expect(rows(es)).toBe(rows(golden.html));
    cookieLocale = "en";
    const en = (await deletionSnapshot(await page())).html;
    expect(numbers(text(es).replace(LEGAL_ADDRESS, ""))).toEqual(numbers(text(en)).concat(numbers(text(golden.contact).replace(LEGAL_ADDRESS, ""))).sort());
  });
  it("keeps the retention caveats (no destruction date, Supabase backups, Stripe records, no charges enabled)", async () => {
    const t = text(await renderWithContact(await page()));
    for (const phrase of ["no fija una fecha de destrucción", "copia de seguridad hasta que el propio ciclo", "no almacena números de tarjeta", "esta página no activa cobros", "no los encabezados, las cookies ni el cuerpo", "nunca elimina nada; solo esta solicitud"]) expect(t).toContain(phrase);
  });
  it("uses the Spanish operator line and never names an LLC", async () => {
    const h = await renderWithContact(await page());
    expect(h).toContain(LEGAL_OPERATOR_ES);
    expect(h).toContain(LEGAL_ADDRESS);
    expect(h).not.toMatch(/Teamtegrate|Pekko LLC/);
  });
  it("uses usted and the glossary", async () => {
    expect(text(await renderWithContact(await page()))).not.toMatch(ES_RULES);
  });
});

describe("/account-deletion branch scope", () => {
  it("touches only the deletion page, its Spanish component, the contact block operator prop and its tests", () => {
    const files = execSync('git log --no-merges --format= --name-only --grep="^Legal ES deletion: " HEAD', { encoding: "utf8" }).split("\n").filter(Boolean);
    const allowed = /^(app\/account-deletion\/page\.tsx|components\/legal\/account-deletion-es\.tsx|components\/contact-block\.tsx|tests\/unit\/legal-es-deletion\.test\.ts|tests\/unit\/helpers\/deletion-markup\.ts|tests\/fixtures\/account-deletion-en\.golden\.json)$/;
    for (const f of new Set(files)) expect(f).toMatch(allowed);
  });
});
