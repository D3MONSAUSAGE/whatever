import { describe, expect, it } from "vitest";
import { emailProvider } from "@/lib/server/email";
import { emailFor, formatAt } from "@/lib/server/alerts";

describe("alert email", () => {
  it("is inactive unless a provider, key, and sender are all configured", () => {
    expect(emailProvider({})).toBeNull();
    expect(emailProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" })).toBeNull();
    expect(emailProvider({ EMAIL_PROVIDER: "other", RESEND_API_KEY: "k", ALERT_EMAIL_FROM: "a@b.c" })).toBeNull();
    expect(emailProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", ALERT_EMAIL_FROM: "a@b.c" })?.name).toBe("resend");
  });

  it("writes plain offline and recovery messages in the location's time zone", () => {
    const off = emailFor({ kind: "screen.offline", display_name: "Bar TV", offline_since: "2026-10-30T01:00:00Z", offline_seconds: null }, "America/Los_Angeles", "https://x.app");
    expect(off.subject).toBe('Pekko: "Bar TV" is offline');
    expect(off.text).toContain("6:00 PM PDT");
    expect(off.text).toContain("https://x.app/dashboard/displays");
    const back = emailFor({ kind: "screen.recovered", display_name: "Bar TV", offline_since: "2026-10-30T01:00:00Z", offline_seconds: 1500 }, "UTC", "https://x.app");
    expect(back.subject).toContain("back online");
    expect(back.text).toContain("25 min");
    expect(formatAt("2026-10-30T01:00:00Z", "Not/AZone")).toContain("UTC");
  });
});
