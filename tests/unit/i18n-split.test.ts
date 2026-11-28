import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { ERROR_COPY } from "@/lib/i18n/error-copy";

const read = (p: string) => readFileSync(p, "utf8");

describe("public pages don't ship the dictionaries or the auth client", () => {
  it("the root layout mounts the dictionary-free locale provider", () => {
    expect(read("app/layout.tsx")).toContain('from "@/lib/i18n/locale-context"');
    expect(read("lib/i18n/locale-context.tsx")).not.toMatch(/from "\.\/(index|en|es)"/);
  });
  it("root-level and shared public client components never import the dictionaries", () => {
    for (const f of ["app/error.tsx", "components/site/site-nav.tsx", "components/i18n/language-select-base.tsx", "components/not-found-actions.tsx", "components/heycatch-identity.tsx", "components/signup-attribution.tsx"]) {
      const src = read(f);
      expect(src.split("\n").filter((l) => !l.startsWith("import type")).join("\n"), f).not.toMatch(/from "@\/lib\/i18n\/(client|index|en|es)"/);
    }
  });
  it("root-level listeners load Supabase lazily", () => {
    for (const f of ["components/heycatch-identity.tsx", "components/signup-attribution.tsx", "components/not-found-actions.tsx"]) {
      expect(read(f), f).not.toContain("@/lib/supabase-browser");
      expect(read(f), f).toContain("@/lib/supabase-lazy");
    }
  });
  it("the error page copy matches the dictionaries exactly", () => {
    for (const [loc, d] of [["en", en], ["es", es]] as const) {
      const c = ERROR_COPY[loc];
      expect(c.title).toBe(d["error.title"]);
      expect(c.body).toBe(d["error.body"]);
      expect(c.bodyCode).toBe(d["error.bodyCode"]);
      expect(c.dashboard).toBe(d["common.goToDashboard"]);
      expect(c.retry).toBe(d["common.tryAgain"]);
    }
  });
});
