import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/dashboard" }));

import { LocaleProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { makeT } from "@/lib/i18n";
import { MENU_TEMPLATES } from "@/lib/menu-templates";
import { LAYOUT_OPTIONS } from "@/lib/menu-board-unify";
import { templateSpec } from "@/lib/layout-studio";
import { PROMO_TEMPLATES, samplePromoFor } from "@/lib/promo-templates";
import { freshBoard } from "@/lib/layout-account";
import { ToastView } from "@/components/toast";
import { AssignedThumb } from "@/components/assigned-thumb";
import { LayoutGallery } from "@/components/layout-gallery";
import { LimitNote, requiredMessageFor } from "@/components/ui";
import { billingNotices } from "@/lib/server/billing-notices";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese|tuvo contacto/i;
const LAYOUT_TEMPLATES = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"] as const;
const wrap = (locale: "en" | "es", node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: node }));
const enDict = en as Record<string, string>;
const esDict = es as Record<string, string>;

describe("R12 display labels: English is unchanged, Spanish is translated, stored data untouched", () => {
  it("R12-01 Classic theme names", () => {
    for (const tpl of MENU_TEMPLATES) {
      expect(enDict[`tpl.${tpl.id}.name`]).toBe(tpl.name);
      expect(esDict[`tpl.${tpl.id}.name`]).not.toBe(tpl.name);
    }
    expect(MENU_TEMPLATES.map((t) => [t.id, t.name])).toEqual([["classic", "Classic night"], ["fresh", "Fresh day"], ["bold", "Bold blue"]]);
  });
  it("R12-02 Studio layout names (ids and spec names unchanged)", () => {
    for (const id of LAYOUT_TEMPLATES) {
      expect(enDict[`lt.${id}.name`]).toBe(templateSpec(id).name);
      expect(esDict[`lt.${id}.name`]).not.toBe(templateSpec(id).name);
    }
  });
  it("R12-03 all 8 template picker names and descriptions", () => {
    expect(LAYOUT_OPTIONS).toHaveLength(8);
    for (const o of LAYOUT_OPTIONS) {
      expect(enDict[`lo.${o.id}.name`]).toBe(o.name);
      expect(enDict[`lo.${o.id}.blurb`]).toBe(o.blurb);
      expect(esDict[`lo.${o.id}.name`]).not.toBe(o.name);
      expect(esDict[`lo.${o.id}.blurb`]).not.toBe(o.blurb);
    }
    const html = wrap("es", createElement(LayoutGallery, { options: LAYOUT_OPTIONS, selectedId: "signature", onSelect() {}, onContinue() {}, onCancel() {} }));
    for (const o of LAYOUT_OPTIONS) expect(html).toContain(esDict[`lo.${o.id}.name`]);
    expect(html).toContain(esDict["lo.promoHint"]);
    for (const o of LAYOUT_OPTIONS) expect(html).not.toContain(o.blurb);
    const enHtml = wrap("en", createElement(LayoutGallery, { options: LAYOUT_OPTIONS, selectedId: "signature", onSelect() {}, onContinue() {}, onCancel() {} }));
    for (const o of LAYOUT_OPTIONS) { expect(enHtml).toContain(o.name.replace("&", "&amp;")); expect(enHtml).toContain(o.blurb); }
  });
  it("R12-04 new Studio default name in the UI language; English bytes as before", () => {
    expect(freshBoard(10).name).toBe("Untitled board 11");
    expect(freshBoard(10, undefined, en["ls.untitled"]).name).toBe("Untitled board 11");
    expect(freshBoard(10, undefined, es["ls.untitled"]).name).toBe("Menú sin nombre 11");
    expect(freshBoard(10, "Mi menú", es["ls.untitled"]).name).toBe("Mi menú");
  });
  it("R12-05 toast Dismiss / Open", () => {
    const msg = { text: "x", error: true, href: "/a" } as Parameters<typeof ToastView>[0]["message"];
    expect(wrap("es", createElement(ToastView, { message: msg, onDismiss() {} }))).toMatch(/Cerrar<\/button>/);
    expect(wrap("es", createElement(ToastView, { message: msg, onDismiss() {} }))).toContain(">Abrir</a>");
    expect(wrap("en", createElement(ToastView, { message: msg, onDismiss() {} }))).toMatch(/>Dismiss<\/button>/);
  });
  it("R12-06 'hora feliz' everywhere in Spanish (matches the ES promo sample tag); English and stored template ids unchanged", () => {
    expect(es["ptpl.happy.name"]).toBe("Hora feliz");
    expect(samplePromoFor("happy", "es").tag).toBe("Hora feliz");
    expect(Object.values(esDict).some((v) => /happy hour/i.test(v))).toBe(false);
    expect(en["ptpl.happy.name"]).toBe("Happy hour");
    expect(PROMO_TEMPLATES.map((p) => p.id)).toEqual(["happy", "deal", "special"]);
  });
  it("R12-07 screen-card badge and screen-reader text; the customer's playlist name stays as typed", () => {
    const display = { id: "d", name: "TV 2", connected: true, online: true, lastSeenAt: null, media: null, playlist: { id: "p", name: "QA Mixed Loop", url: null } };
    const esHtml = wrap("es", createElement(AssignedThumb, { display }));
    expect(esHtml).toContain(">Asignado<");
    expect(esHtml).toContain("Lista de reproducción: QA Mixed Loop");
    expect(esHtml).not.toMatch(/>Assigned<|Playlist:/);
    const enHtml = wrap("en", createElement(AssignedThumb, { display }));
    expect(enHtml).toContain(">Assigned<");
    expect(enHtml).toContain("Playlist: QA Mixed Loop");
  });
  it("R12-08 common.cancel is Spanish (confirm dialog default)", () => {
    expect(es["common.cancel"]).toBe("Cancelar");
  });
  it("R12-09 subscription_canceled ES points to the real ES UI (Cuenta → Facturación card), like EN 'in Billing'", () => {
    const row = { state: "canceled", current_period_end: "2026-11-20T08:00:00.000Z", grace_ends_at: null, server_time: "2026-11-15T08:00:00.000Z" } as unknown as Parameters<typeof billingNotices>[0];
    const esN = billingNotices(row, { locale: "es" }).find((n) => n.kind === "subscription_canceled")!;
    const enN = billingNotices(row).find((n) => n.kind === "subscription_canceled")!;
    expect(esN.text).toContain(`en ${es["acct.billing.title"]} para volver`);
    expect(enN.text).toContain(`in ${en["acct.billing.title"]} to turn`);
    expect(esN.text).not.toContain("Configuración → Plan y facturación");
  });
  it("R12-10 required-field message: Spanish only, and only when empty", () => {
    const t = makeT("es");
    expect(requiredMessageFor("es", true, t)).toBe("Complete este campo.");
    expect(requiredMessageFor("es", false, t)).toBeNull();
    expect(requiredMessageFor("en", true, makeT("en"))).toBeNull();
  });
  it("new Spanish labels follow usted and the glossary", () => {
    const keys = Object.keys(esDict).filter((k) => /^(tpl\.[a-z]+\.name|lt\.|lo\.|toast\.|common\.required|ls\.namePrompt)/.test(k));
    expect(keys.length).toBeGreaterThanOrEqual(31);
    for (const k of keys) expect(esDict[k], k).not.toMatch(ES_RULES);
  });
});

describe("R12 schedule limit notes render in Spanish (they only show near the limit)", () => {
  for (const [nounKey, max, word] of [["ss.noun.locations", 50, "ubicaciones"], ["groups.limitNoun", 100, "grupos"], ["ss.noun.schedules", 200, "horarios"]] as const) {
    it(`${nounKey}: near and at the limit`, () => {
      const near = wrap("es", createElement(LimitNote, { count: Math.ceil(max * 0.8), max, noun: "x", nounKey }));
      const full = wrap("es", createElement(LimitNote, { count: max, max, noun: "x", nounKey }));
      expect(near).toContain(es[nounKey]);
      expect(full).toContain(es[nounKey]);
      expect(es[nounKey].toLowerCase()).toContain(word);
      expect(`${near} ${full}`).not.toMatch(/\b(used|reached|locations|schedules|screen groups)\b/);
      expect(wrap("es", createElement(LimitNote, { count: Math.ceil(max * 0.8) - 1, max, noun: "x", nounKey }))).toBe("");
    });
  }
});
