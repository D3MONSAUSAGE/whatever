import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/dashboard", useSearchParams: () => new URLSearchParams() }));
import { makeT } from "@/lib/i18n";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { validityMessageFor, requiredMessageFor } from "@/components/ui";

const ok = { valueMissing: false, typeMismatch: false, tooShort: false };
const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|Inténtelo|Ingrese/i;

describe("Localized native validation messages (Spanish only; English keeps the browser's own)", () => {
  const tes = makeT("es");
  it("empty, bad email, too short, valid", () => {
    expect(validityMessageFor("es", { ...ok, valueMissing: true }, 8, tes)).toBe("Complete este campo.");
    expect(validityMessageFor("es", { ...ok, typeMismatch: true }, -1, tes, "email")).toBe(es["common.invalidEmail"]);
    // Gother LOW: schedule start/end are type=time; a non-email typeMismatch keeps the browser's message.
    for (const type of ["time", "url", "number", undefined]) expect(validityMessageFor("es", { ...ok, typeMismatch: true }, -1, tes, type)).toBeNull();
    expect(validityMessageFor("es", { ...ok, valueMissing: true }, -1, tes, "time")).toBe("Complete este campo.");
    expect(validityMessageFor("es", { ...ok, tooShort: true }, 8, tes)).toBe("Use al menos 8 caracteres.");
    expect(validityMessageFor("es", ok, 8, tes)).toBeNull();
  });
  it("English never overrides the browser", () => {
    const ten = makeT("en");
    for (const v of [{ ...ok, valueMissing: true }, { ...ok, typeMismatch: true }, { ...ok, tooShort: true }]) expect(validityMessageFor("en", v, 8, ten, "email")).toBeNull();
    expect(requiredMessageFor("en", true, ten)).toBeNull();
  });
  it("Spanish copy follows usted and the glossary", () => {
    for (const k of ["common.required", "common.invalidEmail", "common.tooShort"] as const) { expect(es[k]).not.toMatch(ES_RULES); expect(en[k]).toBeTruthy(); }
  });
});

// Every required field that shows a native tooltip is wired. Validation attributes themselves are unchanged.
const FILES = [
  "components/day-parts.tsx", "app/dashboard/settings/page.tsx", "components/schedule-screen.tsx", "app/login/page.tsx",
  "components/playlist-list.tsx", "app/reset-password/page.tsx", "app/forgot-password/page.tsx", "components/displays-screen.tsx",
  "components/auth/resend-confirmation.tsx", "components/confirm.tsx", "components/my-screens.tsx",
];
describe("wiring", () => {
  for (const f of FILES) it(f, () => {
    const src = readFileSync(f, "utf8");
    const lines = src.split("\n").filter((l) => /<(input|select)\b|^\s+[a-zA-Z].*\brequired\b/.test(l) && /\brequired\b(?![=\w:])/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    for (const l of lines) expect(l, `${f}: ${l.trim()}`).toContain("{...requiredMsg}");
    expect(src).toContain("useRequiredMessage()");
  });
});
