import { describe, expect, it } from "vitest";
import { displayNameSuggestion, parsePhone, PHONE_FORMAT_ERROR } from "@/lib/brand-kit";
import { COMMON_ZONES, orderedZones, otherZones, zoneLabel } from "@/lib/time-zones";
import { findSameVideo, readAccountStudio, type AccountLibraryFile } from "@/lib/layout-account";
import { boardRenderFileName } from "@/lib/server/layout-boards";
import { pairingSettled } from "@/components/displays-screen";
import type { DisplayItem } from "@/lib/api";
import { readFileSync } from "node:fs";

describe("B1-07 phone formats", () => {
  it.each(["(555) 010-0199", "555-010-0199", "555.010.0199", "+1 555 010 0199", "5550100199", "+44 20 7946 0958"])("accepts %s as typed", (value) => {
    expect(parsePhone(value)).toEqual({ ok: true, value });
  });
  it("still allows an empty phone", () => {
    expect(parsePhone("   ")).toEqual({ ok: true, value: null });
  });
  it("gives a specific message for letters or symbols", () => {
    expect(parsePhone("call us")).toEqual({ ok: false, error: PHONE_FORMAT_ERROR });
    expect(parsePhone("555#0100")).toEqual({ ok: false, error: PHONE_FORMAT_ERROR });
    expect(PHONE_FORMAT_ERROR).toContain("(555) 010-0199");
  });
  it("explains short and long numbers", () => {
    const short = parsePhone("(55)");
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toMatch(/too short/);
    const long = parsePhone("1234567890123456");
    expect(long.ok).toBe(false);
  });
});

describe("U1-06a display name suggestion", () => {
  it("suggests the business name only when the display name is empty", () => {
    expect(displayNameSuggestion(null, "Harbor Street Kitchen")).toBe("Harbor Street Kitchen");
    expect(displayNameSuggestion("  ", " Harbor Street Kitchen ")).toBe("Harbor Street Kitchen");
    expect(displayNameSuggestion("Harbor St.", "Harbor Street Kitchen")).toBeNull();
    expect(displayNameSuggestion(null, "")).toBeNull();
  });
});

describe("U1-08 time zones", () => {
  const all = ["Africa/Abidjan", "America/Chicago", "Europe/London", "America/Los_Angeles", "Asia/Tokyo", "UTC"];
  it("puts the common US zones first, Pacific leading", () => {
    const list = orderedZones(all);
    expect(list.slice(0, COMMON_ZONES.length)).toEqual(COMMON_ZONES.map((zone) => zone.id));
    expect(list[0]).toBe("America/Los_Angeles");
  });
  it("sorts the rest A–Z without repeating the common zones", () => {
    expect(otherZones(all)).toEqual(["Africa/Abidjan", "Asia/Tokyo", "Europe/London"]);
  });
  it("labels zones in plain words", () => {
    expect(zoneLabel("America/New_York")).toBe("Eastern (New York)");
    expect(zoneLabel("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos Aires");
  });
});

describe("B1-08 pairing watch", () => {
  const base = { online: false, media: null, playlist: null } as const;
  const tv = (id: string, connected: boolean, lastSeenAt: string | null) => ({ ...base, id, name: id, connected, lastSeenAt }) as DisplayItem;
  const offlineOld = tv("old", true, "2026-11-13T20:00:00Z");
  const waitingOther = tv("other", false, null);
  it("settles on the newly paired screen, by id", () => {
    const watch = { id: "new", before: ["old", "other"] };
    expect(pairingSettled(null, watch)).toBe(false);
    expect(pairingSettled([offlineOld, waitingOther, tv("new", false, null)], watch)).toBe(false);
    expect(pairingSettled([offlineOld, waitingOther, tv("new", true, null)], watch)).toBe(false);
    // Another screen still waiting or offline no longer holds the banner up (Gother #91 MEDIUM).
    expect(pairingSettled([offlineOld, waitingOther, tv("new", true, "2026-11-14T20:00:00Z")], watch)).toBe(true);
  });
  it("without an id, settles when a screen that wasn't there before checks in", () => {
    const watch = { id: null, before: ["old", "other"] };
    expect(pairingSettled([offlineOld, waitingOther], watch)).toBe(false);
    expect(pairingSettled([offlineOld, waitingOther, tv("new", true, null)], watch)).toBe(false);
    expect(pairingSettled([offlineOld, waitingOther, tv("new", true, "2026-11-14T20:00:00Z")], watch)).toBe(true);
  });
});

describe("B1-10 duplicate media causes", () => {
  it("names a board's render after the board, not the business title", () => {
    expect(boardRenderFileName("QA Lunch", "QA – Harbor Street Kitchen & Bar")).toBe("QA Lunch (menu).png");
    expect(boardRenderFileName("", "Harbor")).toBe("Harbor (menu).png");
    expect(boardRenderFileName(null, "")).toBe("Menu (menu).png");
    expect(boardRenderFileName("x".repeat(80), null)).toBe(`${"x".repeat(50)} (menu).png`);
  });
  const library: AccountLibraryFile[] = [
    { id: "v1", name: "qa-sizzle-video.mp4", kind: "video", mime: "video/mp4", url: null, sizeBytes: 98229 },
    { id: "p1", name: "photo.jpg", kind: "image", mime: "image/jpeg", url: null, sizeBytes: 5000 },
  ];
  it("reuses a library video with the same name and size", () => {
    expect(findSameVideo(library, { name: "qa-sizzle-video.mp4", size: 98229 })?.id).toBe("v1");
    expect(findSameVideo(library, { name: "qa-sizzle-video.mp4", size: 98230 })).toBeNull();
    expect(findSameVideo(library, { name: "photo.jpg", size: 5000 })).toBeNull();
    expect(findSameVideo(undefined, { name: "a", size: 1 })).toBeNull();
  });
  it("reads the size from the studio response and tolerates older responses", () => {
    const read = readAccountStudio({ boards: [], legacy: [], library: [
      { id: "v1", name: "a.mp4", kind: "video", mime: "video/mp4", url: null, sizeBytes: 10 },
      { id: "v2", name: "b.mp4", kind: "video", mime: "video/mp4", url: null },
    ] });
    expect(read?.library.map((item) => item.sizeBytes)).toEqual([10, null]);
  });
});

describe("U1-07 / U1-09 copy and preview", () => {
  it("no longer sends people to a 'Displays' page", () => {
    for (const file of ["components/setup-tracker.tsx", "components/tv.tsx", "components/playlist-editor.tsx", "app/support/page.tsx", "components/displays-screen.tsx"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/Displays (page|→)|Open Displays|under Displays|title="Displays"/);
    }
  });
  it("shows the whole assigned image on screen cards", () => {
    expect(readFileSync("components/assigned-thumb.tsx", "utf8")).toMatch(/\.assigned-thumb-img \{[^}]*object-fit: contain/);
  });
});
