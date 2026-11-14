import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { filledSections, menuCounts, sectionLimitMessage, shownSections } from "@/lib/menu-fields";
import { layoutSvg, sampleLayout } from "@/lib/layout-studio";
import { menuSvg } from "@/lib/server/menu-render";
import { duplicateMessage, libraryLookupUrl, sameLibraryVideo } from "@/lib/media-dupes";
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
