import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
import { MAIN_NAV } from "@/lib/content-nav";
import { makeT } from "@/lib/i18n/index";
import { phoneAria } from "@/components/shell";

describe("I18N-2: dashboard shell nav through t()", () => {
  const en = makeT("en"), es = makeT("es");
  it("English text is unchanged", () => {
    for (const item of MAIN_NAV) {
      expect(en(item.labelKey)).toBe(item.label);
      if (item.short) expect(en(item.shortKey!)).toBe(item.short);
    }
  });
  it("Spanish follows the glossary and fits the phone bar", () => {
    expect(MAIN_NAV.map((i) => es(i.labelKey))).toEqual(["Mis pantallas", "Menús digitales", "Archivos", "Listas de reproducción", "Horarios", "Cuenta"]);
    for (const item of MAIN_NAV) expect(es(item.shortKey ?? item.labelKey).length).toBeLessThanOrEqual(9);
    expect(es("dash.nav.brandKit")).toBe("Kit de marca");
    expect(es("dash.signOut")).toBe("Cerrar sesión");
  });
  it("phone bar aria keeps the full name only when the short label differs (WCAG 2.5.3)", () => {
    expect(phoneAria("Menús", "Menús digitales")).toBe("Menús (Menús digitales)");
    expect(phoneAria("Playlists", "Playlists")).toBeUndefined();
  });
});
