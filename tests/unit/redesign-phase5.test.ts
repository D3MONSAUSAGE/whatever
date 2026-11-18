import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { formatDuration } from "@/components/analytics-screen";

describe("redesign phase 5: Analytics in English and Spanish", () => {
  const src = () => readFileSync("components/analytics-screen.tsx", "utf8");

  it("has no hard-coded English copy left in the page", () => {
    const s = src();
    for (const phrase of ["Screen reliability", "Recent activity", "Content and storage", "Offline history", "No screens yet", "Show older", "last seen", ">Loading…<", 'label="'] ) {
      expect(s, phrase).not.toContain(phrase);
    }
    expect(s).toContain('<PageHeader title={t("an.title")}');
  });

  it("keeps the English wording the e2e checks use, and translates every key", () => {
    expect(en["an.title"]).toBe("Analytics");
    expect(en["an.confirmed"]).toBe("Confirmed by the TV");
    const keys = Object.keys(en).filter((k) => k.startsWith("an."));
    expect(keys.length).toBeGreaterThan(60);
    for (const k of keys) {
      expect(es[k as keyof typeof es], k).toBeTruthy();
      expect(es[k as keyof typeof es], k).not.toBe(en[k as keyof typeof en]);
    }
  });

  it("formats long outages in the reader's language", () => {
    expect(formatDuration(3 * 86400)).toBe("3 days");
    expect(formatDuration(3 * 86400, es["an.daysWord"])).toBe("3 días");
  });
});

describe("redesign phase 5: accessibility fixes", () => {
  it("names the open-in-new-tab media thumbnails", () => {
    expect(readFileSync("components/media-library.tsx", "utf8")).toContain('aria-label={t("ml.openNewTab", { name: item.fileName })}');
    expect(es["ml.openNewTab"]).toContain("{name}");
  });

  it("gives the editor Back link AA contrast on the toolbar", () => {
    const chrome = readFileSync("components/studio-chrome.tsx", "utf8");
    expect(chrome).toContain(".studio-back { border: 0; background: transparent; color: #134be0;");
  });
});
