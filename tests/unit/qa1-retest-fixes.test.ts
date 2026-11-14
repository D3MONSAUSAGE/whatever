import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { filledSections, menuCounts, sectionLimitMessage, shownSections } from "@/lib/menu-fields";
import { layoutSvg, sampleLayout } from "@/lib/layout-studio";
import { menuSvg } from "@/lib/server/menu-render";
import { duplicateMessage, libraryLookupUrl, lookupWithTimeout, sameLibraryVideo } from "@/lib/media-dupes";
import { vi } from "vitest";
import { createHash } from "node:crypto";
import type { MediaItem } from "@/lib/api";

const it1 = (name: string) => ({ name, price: "$5", description: "" });

describe("B1-04 retest: empty sections never count or show, whatever their name", () => {
  const sections = [
    { name: "Tacos", items: [it1("Al pastor")] },
    { name: "Section", items: [] },
    { name: "Section", items: [{ name: "", price: "", description: "" }] },
    { name: "Drinks", items: [it1("Horchata")] },
  ];
  it("counts only sections with named items", () => {
    expect(filledSections(sections)).toBe(2);
    expect(menuCounts(sections).sections).toBe(2);
  });
  it("keeps every section that has items, in order", () => {
    expect(shownSections(sections).map((s) => s.name)).toEqual(["Tacos", "Drinks"]);
  });
  it("points at the empty section when the rows are full", () => {
    expect(sectionLimitMessage(sections)).toMatch(/Section 2 is empty/);
    expect(sectionLimitMessage([sections[0], sections[3]])).toMatch(/Remove one to add another/);
  });
  it("studio board draws no SECTION heading for empty sections (preview and saved render share layoutSvg)", () => {
    const doc = { ...sampleLayout("menu-promo-67"), sections };
    const svg = layoutSvg(doc);
    expect(svg).toContain("TACOS");
    expect(svg).toContain("DRINKS");
    expect(svg).not.toContain(">SECTION<");
  });
  it("fixed-column boards keep column places and skip the empty one", () => {
    const doc = { ...sampleLayout("two-column"), sections: [{ name: "Section", items: [] }, { name: "Mains", items: [it1("Fish")] }] };
    const svg = layoutSvg(doc);
    expect(svg).toContain("MAINS");
    expect(svg).not.toContain(">SECTION<");
  });
  it("classic TV render skips empty sections", () => {
    const svg = menuSvg("classic" as never, { title: "Menu", subtitle: "", sections, footer: "" } as never);
    expect(svg).toContain("TACOS");
    expect(svg).not.toContain(">SECTION<");
  });
});

describe("B1-10 retest: library upload offers the copy already there", () => {
  const items = [
    { id: "v1", fileName: "qa-promo-video.mp4", sizeBytes: 98304, createdAt: "", url: null, kind: "video" },
    { id: "i1", fileName: "qa-promo-video.mp4", sizeBytes: 98304, createdAt: "", url: null, kind: "image" },
  ] as MediaItem[];
  it("matches a video by name and size only", () => {
    expect(sameLibraryVideo(items, { name: "qa-promo-video.mp4", size: 98304 })?.id).toBe("v1");
    expect(sameLibraryVideo(items, { name: "qa-promo-video.mp4", size: 1 })).toBeNull();
    expect(sameLibraryVideo(items, { name: "other.mp4", size: 98304 })).toBeNull();
  });
  it("looks up through the existing read-only media list", () => {
    const url = libraryLookupUrl("qa promo.mp4");
    expect(url.startsWith("/api/media?")).toBe(true);
    expect(new URLSearchParams(url.split("?")[1]).get("q")).toBe("qa promo.mp4");
    expect(new URLSearchParams(url.split("?")[1]).get("kind")).toBe("video");
  });
  it("asks before making a second copy; upload pipeline untouched", () => {
    expect(duplicateMessage(["a.mp4"])).toMatch(/already in your library/);
    const lib = readFileSync("components/media-library.tsx", "utf8");
    expect(lib).toMatch(/Keep the one I have/);
    expect(lib).toMatch(/Upload a copy anyway/);
    expect(readFileSync("components/uploads.tsx", "utf8")).toMatch(/\/api\/media\/upload/);
  });
});

describe("Add screen address", () => {
  it("links to /dashboard/screens/add and keeps /dashboard/displays", () => {
    expect(existsSync("app/dashboard/screens/add/page.tsx")).toBe(true);
    expect(existsSync("app/dashboard/displays/page.tsx")).toBe(true);
    expect(readFileSync("components/my-screens.tsx", "utf8")).not.toMatch(/displays#add-screen/);
  });
});

import { findOverlaps, type RuleLike } from "@/lib/schedule-checks";
describe("B2-04 note: expired rules are left out of overlap lines", () => {
  const base: RuleLike = { id: "a", name: "Lunch", displayId: "d1", groupId: null, weekdays: [1, 2, 3, 4, 5, 6, 7], startTime: "11:00", endTime: "15:00", startsOn: null, endsOn: null, priority: 0 };
  const past: RuleLike = { ...base, id: "b", name: "Old brunch", startTime: "10:00", endTime: "12:00", startsOn: "2026-01-01", endsOn: "2026-01-31" };
  it("a live rule ignores an expired one", () => {
    expect(findOverlaps(base, [past], [], "2026-11-14")).toEqual([]);
  });
  it("an expired rule lists no 'plays there' lines", () => {
    expect(findOverlaps(past, [base], [], "2026-11-14")).toEqual([]);
  });
  it("still warns while the dates are current", () => {
    expect(findOverlaps(base, [past], [], "2026-01-15")).toHaveLength(1);
  });
});

describe("Gother PR94 lows", () => {
  it("a hung duplicate lookup is aborted and falls back to the normal upload", async () => {
    vi.useFakeTimers();
    let aborted = false;
    const pending = lookupWithTimeout((signal) => new Promise((_, reject) => { signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }); }), 4000);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBeNull();
    expect(aborted).toBe(true);
    vi.useRealTimers();
    await expect(lookupWithTimeout(async () => ({ items: [] }))).resolves.toEqual({ items: [] });
    await expect(lookupWithTimeout(async () => { throw new Error("x"); })).resolves.toBeNull();
  });
  it("boards where every section has items render byte-identical to before this change (SHA-256 of main 77ae704 output)", () => {
    const filled = [
      { name: "Tacos", items: [it1("Al pastor"), it1("Pollo")] },
      { name: "Drinks", items: [it1("Horchata")] },
    ];
    const golden: Record<string, string> = {
      "menu-promo-67": "6d977eec267cecf5cf9cf3ff33f704dfe1cd6904e5130f7bb12194c6ba3673e5",
      "menu-promo-67:sample": "c906e1d96de39eaa0bee6ed19f28be44c87875cef4ef2442785dc10de541b579",
      "menu-banner": "6be17cf6409233d19cbf0a3d7fa50aaa7e88f87935336af756ce86f9a2848d21",
      "menu-banner:sample": "1803dd569a25c6a70bd3759654c4dc26bce3600ff702df4a611e5a637a807c60",
      "signature": "48c2fd20331c72bb0629086a256c1e8b72aeb682bbdacc6adfc6e4d1c192ea33",
      "signature:sample": "2d5f52a8c8e5c4b05bb40078c9c34ce920234c8c2c92fc2fa40ff494a4e69927",
      "two-column": "da0e65fa5b26e3776d32c10a8cde751ee4f666c0d4703f0eec7c49eae1003976",
      "two-column:sample": "f96c427c1dffa753d1f4bbe6c992a9b13f3b8722b36d72e5c0d14b9fd0bd1a06",
      "triple-column": "a61df553e715735483b3ac17c1138af66b00f42430e113024f8f6ae83356b01c",
      "triple-column:sample": "196f27335eb13b6d04c3cdb794da28d7820ae60015923effd37fe0ef45d8100c",
      "two-menu-promo": "aecd15eef72185ca6a576096a7ce1c72209862ce8b09e2ccb4d79232e52bdc4b",
      "two-menu-promo:sample": "77bb8456a0c8e3372f5f439f60fa0c9a25b1d41e1aa556000814c5396c7dcc1f",
      "classic": "551137380eeaa914948a3493758190b114fa5d090d7c56845da814d870122bb1"
    };
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    for (const template of ["menu-promo-67", "menu-banner", "signature", "two-column", "triple-column", "two-menu-promo"] as const) {
      expect(sha(layoutSvg({ ...sampleLayout(template), sections: filled }))).toBe(golden[template]);
      expect(sha(layoutSvg(sampleLayout(template)))).toBe(golden[`${template}:sample`]);
    }
    expect(sha(menuSvg("classic" as never, { title: "Menu", subtitle: "", sections: filled, footer: "" } as never))).toBe(golden.classic);
  });
});
