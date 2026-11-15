import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/dashboard" }));

import { LocaleProvider } from "@/lib/i18n/client";
import { makeT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { PLAYER_ERROR_KEYS, playerErrorLabel } from "@/lib/player-error-label";
import { assignedContentPreview } from "@/lib/assigned-content";
import { AssignedThumb } from "@/components/assigned-thumb";
import { ScreenCard } from "@/components/tv";
import type { DisplayItem } from "@/lib/api";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|desconectad|programación|Inténtelo|Ingrese/i;
const wrap = (locale: "en" | "es", node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: node }));
const base = { id: "d", name: "QA Bar TV", connected: true, online: false, lastSeenAt: "2026-11-15T08:00:00Z", media: null, playlist: null } as unknown as DisplayItem;

describe("R13-01 player error sentences on the dashboard", () => {
  it("every sentence the player can report has a key, and the player file is unchanged", () => {
    const player = readFileSync("public/player.html", "utf8");
    const reported = new Set<string>();
    for (const m of player.matchAll(/(?:failOnce|reportError|failVideo\([^,]*,[^,]*,)\s*\(?\s*(['"])(.+?)\1\s*\)/g)) reported.add(m[2]);
    expect([...reported].sort()).toEqual(Object.keys(PLAYER_ERROR_KEYS).sort());
    for (const [sentence, key] of Object.entries(PLAYER_ERROR_KEYS)) {
      expect(en[key]).toBe(sentence);
      expect(es[key]).not.toBe(sentence);
      expect(es[key]).not.toMatch(ES_RULES);
    }
  });
  it("ES label, EN unchanged, unknown messages shown as reported", () => {
    expect(playerErrorLabel("This video stalled.", makeT("es"))).toBe("Este video se detuvo.");
    expect(playerErrorLabel("This video stalled.", makeT("en"))).toBe("This video stalled.");
    expect(playerErrorLabel("Something new", makeT("es"))).toBe("Something new");
  });
  it("the screen card shows it in Spanish", () => {
    const d = { ...base, playerError: "This video stalled." } as DisplayItem;
    expect(wrap("es", createElement(ScreenCard, { display: d }))).toContain("Este video se detuvo.");
    expect(wrap("en", createElement(ScreenCard, { display: d }))).toContain("This video stalled.");
  });
});

describe("R13-02 empty / pairing screen card accessibility text", () => {
  it("Spanish names, English unchanged", () => {
    expect(assignedContentPreview(base).name).toBe("No content assigned");
    expect(assignedContentPreview(base, makeT("es")).name).toBe(es["tv.noContent"]);
    expect(assignedContentPreview({ ...base, connected: false } as DisplayItem, makeT("es")).name).toBe(es["tv.waitingPairing"]);
    const html = wrap("es", createElement(AssignedThumb, { display: base }));
    expect(html).toContain(es["tv.noContent"]);
    expect(html).not.toContain("No content assigned");
    expect(wrap("en", createElement(AssignedThumb, { display: base }))).toContain("No content assigned");
  });
});

describe("R13-03 one Spanish name for the two-column + promo layout", () => {
  it("board list (lo) and Studio picker (lt) agree in Spanish; English unchanged", () => {
    expect(es["lo.two-menu-promo.name"]).toBe(es["lt.two-menu-promo.name"]);
    expect(en["lo.two-menu-promo.name"]).toBe("Two menus + promo");
    expect(en["lt.two-menu-promo.name"]).toBe("Two-column menu + promo");
  });
});
