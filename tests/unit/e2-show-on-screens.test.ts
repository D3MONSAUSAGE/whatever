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
      { id: "b", name: "Bar TV", status: "Offline", showing: false },
      { id: "a", name: "Front counter", status: "Online", showing: true },
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
});
