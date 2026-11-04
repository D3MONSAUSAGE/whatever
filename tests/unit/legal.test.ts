import { describe, it, expect, vi, afterEach } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
describe("legal config", () => {
  it("shows placeholders when unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME", ""); vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "");
    const m = await import("@/lib/legal");
    expect(m.legalOperator()).toMatch(/to be confirmed/); expect(m.SUPPORT_EMAIL).toBeNull();
  });
  it("uses env values and rejects a bad email", async () => {
    vi.stubEnv("NEXT_PUBLIC_LEGAL_OPERATOR_NAME", "Example LLC"); vi.stubEnv("NEXT_PUBLIC_SUPPORT_EMAIL", "not-an-email");
    const m = await import("@/lib/legal");
    expect(m.legalOperator()).toBe("Example LLC"); expect(m.SUPPORT_EMAIL).toBeNull();
  });
});
