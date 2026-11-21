import { afterEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { entitlementsLocale } from "@/lib/server/locale";

afterEach(() => setTestDb(null));

function dbWithLocale(locale: string | null) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: { locale }, error: null }),
      };
    },
  };
}

describe("entitlementsLocale precedence", () => {
  it("prefers the saved account locale over Accept-Language", async () => {
    setTestDb(dbWithLocale("en") as never);
    const req = new Request("https://pekkotv.com/api/entitlements", { headers: { "accept-language": "es" } });
    expect(await entitlementsLocale("acct_1", req)).toBe("en");
  });

  it("falls back to Accept-Language when the account has no saved locale", async () => {
    setTestDb(dbWithLocale(null) as never);
    const req = new Request("https://pekkotv.com/api/entitlements", { headers: { "accept-language": "es-MX,es;q=0.9" } });
    expect(await entitlementsLocale("acct_1", req)).toBe("es");
  });

  it("ignores a locale query parameter", async () => {
    setTestDb(dbWithLocale(null) as never);
    const req = new Request("https://pekkotv.com/api/entitlements?locale=es", { headers: { "accept-language": "en" } });
    expect(await entitlementsLocale("acct_1", req)).toBe("en");
  });
});
