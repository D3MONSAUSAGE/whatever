import { describe, expect, it } from "vitest";
import {
  MAX_AGE_SECONDS,
  MAX_VALUE_LENGTH,
  captureFirstTouch,
  isNewAccount,
  parseStored,
  sanitizeAttribution,
  serializeStored,
} from "@/lib/signup-attribution";

const LANDING = {
  utm_source: "meta",
  utm_medium: "paid",
  utm_campaign: "pekko-test-01",
  utm_content: "ad-a-taping",
};

describe("sanitizeAttribution", () => {
  it("keeps the whitelist and drops unknown keys", () => {
    expect(
      sanitizeAttribution({
        ...LANDING,
        utm_term: "menus",
        referrer: "https://facebook.com/ads",
        extra: "nope",
        utm_id: "drop-me",
      }),
    ).toEqual({ ...LANDING, utm_term: "menus", referrer: "https://facebook.com/ads" });
  });

  it("trims, strips controls, and caps length", () => {
    const long = "m".repeat(MAX_VALUE_LENGTH + 40);
    const dirty = " meta\u0000paid ";
    const out = sanitizeAttribution({ utm_source: dirty, utm_campaign: long });
    expect(out?.utm_source).toBe("metapaid");
    expect(out?.utm_campaign).toHaveLength(MAX_VALUE_LENGTH);
  });

  it("rejects non-http referrers and empty objects", () => {
    expect(sanitizeAttribution({ referrer: "javascript:alert(1)" })).toBeNull();
    expect(sanitizeAttribution({ referrer: "data:text/html,hi" })).toBeNull();
    expect(sanitizeAttribution({ utm_source: "   " })).toBeNull();
    expect(sanitizeAttribution(null)).toBeNull();
    expect(sanitizeAttribution(["utm_source"])).toBeNull();
    expect(sanitizeAttribution({ utm_source: 12 })).toBeNull();
  });
});

describe("captureFirstTouch", () => {
  const search = "?utm_source=meta&utm_medium=paid&utm_campaign=pekko-test-01&utm_content=ad-a-taping&unused=1";

  it("captures UTMs and a http referrer from the first landing", () => {
    expect(captureFirstTouch(search, "https://l.facebook.com/", null)).toEqual({
      ...LANDING,
      referrer: "https://l.facebook.com/",
    });
  });

  it("does not overwrite a stored first touch", () => {
    const first = captureFirstTouch(search, "https://l.facebook.com/", null);
    expect(captureFirstTouch("?utm_source=google&utm_campaign=later", "https://google.com", first)).toEqual(first);
  });

  it("returns null when there is nothing to save", () => {
    expect(captureFirstTouch("", "", null)).toBeNull();
    expect(captureFirstTouch("?foo=bar", "not-a-url", null)).toBeNull();
  });
});

describe("parseStored", () => {
  it("returns values inside the 90-day window and expires after", () => {
    const values = { utm_source: "meta" };
    const now = 1_700_000_000_000;
    const raw = serializeStored(values, now);
    expect(parseStored(raw, now + 1000)).toEqual(values);
    expect(parseStored(raw, now + (MAX_AGE_SECONDS + 1) * 1000)).toBeNull();
    expect(parseStored("not-json", now)).toBeNull();
    expect(parseStored(null, now)).toBeNull();
  });
});

describe("isNewAccount", () => {
  it("is true within seven days and false for older or invalid dates", () => {
    const now = Date.parse("2026-11-12T22:00:00.000Z");
    expect(isNewAccount("2026-11-12T20:00:00.000Z", now)).toBe(true);
    expect(isNewAccount("2026-11-06T22:00:00.000Z", now)).toBe(true);
    expect(isNewAccount("2026-11-04T21:00:00.000Z", now)).toBe(false);
    expect(isNewAccount("not-a-date", now)).toBe(false);
    expect(isNewAccount(undefined, now)).toBe(false);
  });
});
