import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { screenChoices, screensToAssign } from "@/lib/show-on-screens";
import type { DisplayItem } from "@/lib/api";

const d = (id: string, name: string, extra: Partial<DisplayItem> = {}) =>
  ({ id, name, connected: true, online: true, lastSeenAt: null, media: null, playlist: null, ...extra }) as DisplayItem;

describe("E2: optional Show on which screen? after Publish", () => {
  const displays = [
    d("b", "Bar TV", { online: false }),
    d("a", "Front counter", { playlist: { id: "pl-1", name: "Lunch", url: null } }),
    d("c", "Pairing TV", { connected: false }),
  ];
  it("offers paired screens only, sorted, and marks ones already showing the board", () => {
    expect(screenChoices(displays, "pl-1")).toEqual([
      { id: "b", name: "Bar TV", status: "Offline", showing: false, nowShowing: null },
      { id: "a", name: "Front counter", status: "Online", showing: true, nowShowing: "Lunch" },
    ]);
  });
  it("assigns nothing unless a screen is ticked, and skips screens already showing it", () => {
    const choices = screenChoices(displays, "pl-1");
    expect(screensToAssign(choices, [])).toEqual([]);
    expect(screensToAssign(choices, ["a", "b", "zzz"])).toEqual(["b"]);
  });
  it("uses the existing assignment route only on the user's click, and Publish never auto-assigns", () => {
    const comp = readFileSync("components/show-on-screens.tsx", "utf8");
    expect(comp).toMatch(/\/api\/layout-studio\/assign/);
    expect(comp).toMatch(/Not now/);
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    const publishBranch = studio.slice(studio.indexOf("} else if (board?.playlistId) {"), studio.indexOf("} else {", studio.indexOf("} else if (board?.playlistId) {")));
    expect(publishBranch).toMatch(/setPickFor/);
    expect(publishBranch).not.toMatch(/layout-studio\/assign/);
  });
  it("warns that assigning replaces the screen's content and names what it shows now (Gother PR95 MEDIUM)", () => {
    const choices = screenChoices([d("x", "Patio", { playlist: { id: "pl-9", name: "Happy hour", url: null } })], "pl-1");
    expect(choices[0].nowShowing).toBe("Happy hour");
    const comp = readFileSync("components/show-on-screens.tsx", "utf8");
    expect(comp).toMatch(/This replaces what a ticked screen is set to show\./);
    expect(comp).toMatch(/Now showing: /);
  });
  it("lows: add-screen link, heading focus, Escape, wording, loading state", () => {
    const comp = readFileSync("components/show-on-screens.tsx", "utf8");
    expect(comp).toMatch(/\/dashboard\/screens\/add/);
    expect(comp).toMatch(/headingRef\.current\?\.focus\(\)/);
    expect(comp).toMatch(/event\.key === "Escape"/);
    expect(comp).toMatch(/Set to show this board/);
    expect(comp).not.toMatch(/Already showing this board/);
    expect(comp).toMatch(/Loading your screens/);
    expect(readFileSync("components/menu-boards.tsx", "utf8")).toMatch(/displays=\{displays\.data \?\? null\}/);
  });
});
