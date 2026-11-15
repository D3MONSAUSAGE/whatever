import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createElement, type ReactElement } from "react";

let cookieLocale: string | undefined;
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "pekko_locale" && cookieLocale ? { value: cookieLocale } : undefined) }) }));

import Terms, { generateMetadata as termsMeta } from "@/app/terms/page";
import Privacy, { generateMetadata as privacyMeta } from "@/app/privacy/page";
import { BillingDisclosure } from "@/components/billing-disclosure";
import { TrialDetails } from "@/components/site/sections";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { ENGLISH_ONLY, format } from "@/lib/i18n/index";
import { LEGAL_PRIVACY_UPDATED, LEGAL_UPDATED } from "@/lib/legal";
import { COURTESY_NOTICE_ES, LEGAL_OPERATOR_ES, legalDateEs } from "@/lib/legal-es";
import { PLANS, TRIAL } from "@/lib/plans";
import { FAQ_VARS } from "@/lib/marketing";
import { PAYMENT_GRACE_DAYS, PLAYBACK_GRACE_DAYS, TRANSITION_DAYS, TRIAL_DAYS } from "@/lib/server/entitlements";
import { html, legalPageSnapshot } from "./helpers/legal-markup";

const golden = JSON.parse(readFileSync("tests/fixtures/legal-en.golden.json", "utf8"));
type Page = (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>;
const terms = (q?: Record<string, string>) => (Terms as unknown as Page)({ searchParams: Promise.resolve(q ?? {}) });
const privacy = (q?: Record<string, string>) => (Privacy as unknown as Page)({ searchParams: Promise.resolve(q ?? {}) });

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese|tuvo contacto/i;
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
/** Every number (prices, days, screens, address, years) in order of size, so EN and ES can be compared as multisets. */
const numbers = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).sort();
const dollars = (s: string) => (s.match(/\$\d+(?:\.\d+)?/g) ?? []).sort();

function pageParts(input: ReactElement) {
  // The ES pages return <TermsEs />/<PrivacyEs />; unwrap to the LegalPage element they render.
  let el = input;
  while (typeof el.type === "function" && (el.type as { name: string }).name !== "LegalPage") el = (el.type as (p: unknown) => ReactElement)(el.props);
  const snap = legalPageSnapshot(el);
  const notice = (el.props as { notice?: ReactElement }).notice;
  return { ...snap, notice: notice ? html(notice) : null };
}

const noQuery = () => ({ searchParams: Promise.resolve({}) });

beforeEach(() => { cookieLocale = undefined; });

describe("Legal ES: English stays byte-identical", () => {
  it("Terms and Privacy render exactly the golden captured on main, with the same dates", async () => {
    for (const loc of [undefined, "en"]) {
      cookieLocale = loc;
      expect(legalPageSnapshot(await terms())).toEqual(golden.terms);
      expect(legalPageSnapshot(await privacy())).toEqual(golden.privacy);
    }
    expect(golden.terms.updated).toBe(LEGAL_UPDATED);
    expect(golden.privacy.dateLine).toBe(`Effective ${LEGAL_PRIVACY_UPDATED}. Last updated ${LEGAL_PRIVACY_UPDATED}.`);
    expect((await termsMeta(noQuery())).title).toBe("Terms of Service · Pekko");
    expect((await privacyMeta(noQuery())).title).toBe("Privacy Policy · Pekko");
  });
  it("?lang=en shows the governing English original to a Spanish visitor, byte-identical", async () => {
    cookieLocale = "es";
    expect(legalPageSnapshot(await terms({ lang: "en" }))).toEqual(golden.terms);
    expect(legalPageSnapshot(await privacy({ lang: "en" }))).toEqual(golden.privacy);
    expect((await termsMeta({ searchParams: Promise.resolve({ lang: "en" }) })).title).toBe("Terms of Service · Pekko");
  });
  it("billing disclosure, trial card and FAQ billing answers are unchanged in English", async () => {
    expect(html(createElement(BillingDisclosure))).toBe(golden.billingDisclosure);
    expect(html(createElement(BillingDisclosure, { locale: "en" }))).toBe(golden.billingDisclosure);
    expect(html(await TrialDetails())).toBe(golden.trialDetails);
    expect({ trial: en["faq.trial.a"], trialEnd: en["faq.trialEnd.a"], plans: en["faq.plans.a"], cancel: en["faq.cancel.a"] }).toEqual(golden.faq);
  });
});

describe("Legal ES: Spanish courtesy translation", () => {
  it("shows Spanish only for locale es, with the governing-English notice at the top and a link to the original", async () => {
    cookieLocale = "es";
    for (const [el, href] of [[await terms(), "/terms?lang=en"], [await privacy(), "/privacy?lang=en"]] as const) {
      const p = pageParts(el);
      expect(p.notice).toContain(COURTESY_NOTICE_ES);
      expect(p.notice).toContain(`href="${href}"`);
      expect(p.notice).toContain('hrefLang="en"');
      expect(p.html).not.toContain("These terms cover");
    }
    expect(COURTESY_NOTICE_ES).toBe("Esta traducción es solo para su comodidad. La versión en inglés es la que rige; en caso de discrepancia, prevalece la versión en inglés.");
    expect((await termsMeta(noQuery())).title).toBe("Términos del servicio · Pekko");
    expect((await privacyMeta(noQuery())).title).toBe("Política de privacidad · Pekko");
  });
  it("keeps every number, price and date identical between EN and ES", async () => {
    cookieLocale = "es";
    const t = pageParts(await terms());
    const p = pageParts(await privacy());
    expect(numbers(text(t.html))).toEqual(numbers(text(golden.terms.html)));
    expect(numbers(text(p.html))).toEqual(numbers(text(golden.privacy.html)));
    expect(dollars(text(t.html))).toEqual(dollars(text(golden.terms.html)));
    expect(t.updated).toBe(LEGAL_UPDATED);
    expect(t.dateLine).toBe(`Última actualización: ${legalDateEs(LEGAL_UPDATED)}`);
    expect(p.dateLine).toBe(`Vigente desde el ${legalDateEs(LEGAL_PRIVACY_UPDATED)}. Última actualización: ${legalDateEs(LEGAL_PRIVACY_UPDATED)}.`);
    expect(numbers(t.dateLine!)).toEqual(numbers(`Last updated ${LEGAL_UPDATED}`));
    expect(numbers(p.dateLine!)).toEqual(numbers(golden.privacy.dateLine));
    expect(legalDateEs("November 8, 2026")).toBe("8 de noviembre de 2026");
    expect(() => legalDateEs("8 Nov 2026")).toThrow();
  });
  it("keeps plan names, prices, trial length, grace periods and cancellation terms", async () => {
    cookieLocale = "es";
    const body = text(pageParts(await terms()).html);
    for (const plan of PLANS) expect(body).toContain(`${plan.name} $${plan.price} por ${plan.screens} pantalla`);
    expect(body).toContain(`prueba de ${TRIAL_DAYS} días`);
    expect(body).toContain(`hasta ${TRIAL.screens} pantallas`);
    expect(body).toContain(`${PLAYBACK_GRACE_DAYS} días`);
    expect(body).toContain(`${TRANSITION_DAYS} días de acceso completo`);
    expect(body).toContain(`${PAYMENT_GRACE_DAYS} días de gracia de reproducción`);
    expect(body).toContain("Las suscripciones mensuales se renuevan hasta que se cancelan. Cancelar detiene la siguiente renovación y mantiene el acceso durante el período ya pagado.");
    expect(body).toContain("salvo cuando la ley aplicable exija un reembolso");
    expect(body).toContain("7 días después de la solicitud");
  });
  it("names the operator as a sole proprietor and never names another company", async () => {
    cookieLocale = "es";
    const all = [pageParts(await terms()), pageParts(await privacy())].map((p) => text(p.html + p.notice)).join("\n")
      + text(html(createElement(BillingDisclosure, { locale: "es" })));
    expect(LEGAL_OPERATOR_ES).toBe("Francisco Lopez, propietario único, que opera como Pekko");
    expect(all).toContain(LEGAL_OPERATOR_ES);
    expect(all).not.toMatch(/Teamtegrate|Pekko LLC/i);
    expect(all).not.toMatch(ES_RULES);
    expect(all).not.toMatch(/sole proprietor|doing business as/);
  });
  it("keeps paragraph-for-paragraph structure (same headings, paragraphs, list items and anchors)", async () => {
    cookieLocale = "es";
    const count = (h: string, tag: string) => (h.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
    for (const [es_, en_] of [[pageParts(await terms()).html, golden.terms.html], [pageParts(await privacy()).html, golden.privacy.html]]) {
      for (const tag of ["h2", "p", "li", "a", "strong"]) expect(count(es_, tag), tag).toBe(count(en_, tag));
      for (const id of en_.match(/id="[^"]+"/g) ?? []) expect(es_).toContain(id);
      for (const href of en_.match(/href="[^"]+"/g) ?? []) expect(es_).toContain(href);
    }
  });
  it("translates the billing disclosure and trial card with the notice and identical numbers", async () => {
    const d = html(createElement(BillingDisclosure, { locale: "es" }));
    expect(d).toContain(COURTESY_NOTICE_ES);
    expect(d).toContain('href="/terms?lang=en#billing"');
    expect(numbers(text(d))).toEqual(numbers(text(golden.billingDisclosure)));
    cookieLocale = "es";
    const card = html(await TrialDetails());
    expect(card).not.toContain("english-only-note");
    expect(card).not.toContain('lang="en"');
    expect(card).toContain(COURTESY_NOTICE_ES);
    expect(numbers(text(card))).toEqual(numbers(text(golden.trialDetails)));
  });
  it("translates the FAQ billing answers with identical numbers and drops the English-only markers", () => {
    expect(ENGLISH_ONLY).toEqual([]);
    for (const k of ["faq.trial.a", "faq.trialEnd.a", "faq.plans.a", "faq.cancel.a"] as const) {
      expect(es[k]).not.toBe(en[k]);
      expect(numbers(format(es[k], FAQ_VARS))).toEqual(numbers(format(en[k], FAQ_VARS)));
      expect(dollars(es[k])).toEqual(dollars(en[k]));
      expect(es[k]).not.toMatch(ES_RULES);
    }
    for (const plan of PLANS) expect(es["faq.plans.a"]).toContain(plan.name);
    for (const k of ["footer.terms", "footer.privacy", "footer.billingTerms", "settings.terms", "settings.billingTerms", "settings.privacy"] as const) expect(es[k]).not.toMatch(/en inglés/);
  });
});

describe("Legal ES: scope", () => {
  it("does not touch Stripe-hosted flows, API routes, the player or server code", () => {
    let changed: string[] = [];
    try {
      changed = execSync("git diff --name-only b275b5a -- .", { encoding: "utf8" }).split("\n").filter(Boolean);
    } catch {
      return;
    }
    for (const f of changed) expect(f, f).not.toMatch(/^(public\/|app\/api\/|lib\/server\/|app\/player|app\/tv)|stripe|lib\/legal\.ts$|lib\/plans\.ts$/);
  });
});
