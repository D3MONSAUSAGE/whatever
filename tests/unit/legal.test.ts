import { readFileSync } from "node:fs";
import { describe, it, expect, vi, afterEach } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("legal config", () => {
  it("shows placeholders when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME", ""); vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");
    const m = await import("@/lib/legal");
    expect(m.legalOperator()).toMatch(/to be confirmed/); expect(m.SUPPORT_EMAIL).toBeNull();
  });
  it("uses env values and rejects a bad email", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME", "Example Operator"); vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "not-an-email");
    const m = await import("@/lib/legal");
    expect(m.legalOperator()).toBe("Example Operator"); expect(m.SUPPORT_EMAIL).toBeNull();
  });
  it("keeps the sole-proprietor drafts unpublished and free of other entity names", () => {
    const files = [
      "docs/legal/DRAFT-terms.md",
      "docs/legal/DRAFT-privacy.md",
      "docs/legal/DRAFT-billing-refunds.md",
    ];
    const operator = "Francisco Lopez, a sole proprietor doing business as Pekko";
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toContain("UNPUBLISHED DRAFT");
      expect(text, file).toContain(operator);
      expect(text, file).toContain("[Business address: to be confirmed]");
      expect(text, file).not.toMatch(/Pekko LLC|Pekko Technologies|Teamtegrate/);
    }
    const footer = readFileSync("components/site/site-footer.tsx", "utf8");
    expect(footer).not.toContain("docs/legal");
  });
});
