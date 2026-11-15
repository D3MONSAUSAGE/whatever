import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { DisplayItem } from "@/lib/api";
import { replaceNotes, screenChoices, shouldOfferScreens } from "@/lib/show-on-screens";

const tv = (id: string, name: string, playlist: { id: string; name: string } | null, extra: Partial<DisplayItem> = {}) =>
  ({ id, name, connected: true, online: true, playlist, media: null, ...extra }) as unknown as DisplayItem;

const displays = [
  tv("d1", "QA Bar TV", { id: "loop", name: "QA Mixed Loop" }, { online: false }),
  tv("d2", "QA Bar TV 2", { id: "loop", name: "QA Mixed Loop" }),
  tv("d3", "Patio TV", null),
];

describe("E2b: Show on which screen? after saving a classic board", () => {
  it("names what each ticked screen loses", () => {
    const choices = screenChoices(displays, "board-pl");
    expect(replaceNotes(choices, [])).toEqual(["Ticking a screen replaces what it's set to show."]);
    expect(replaceNotes(choices, ["d2"])).toEqual(["Replaces QA Mixed Loop on QA Bar TV 2."]);
    expect(replaceNotes(choices, ["d2", "d3"])).toEqual(["Patio TV isn't set to show anything yet.", "Replaces QA Mixed Loop on QA Bar TV 2."]);
  });

  it("ignores screens that already show the board", () => {
    const choices = screenChoices([tv("d2", "QA Bar TV 2", { id: "board-pl", name: "Lunch" })], "board-pl");
    expect(replaceNotes(choices, ["d2"])).toEqual(["Ticking a screen replaces what it's set to show."]);
  });

  it("offers the picker only when no screen was ticked and no screen plays the board", () => {
    const base = { fromScreen: false, tickedScreens: 0, playlistId: "board-pl", displays };
    expect(shouldOfferScreens(base)).toBe(true);
    expect(shouldOfferScreens({ ...base, tickedScreens: 1 })).toBe(false);
    expect(shouldOfferScreens({ ...base, fromScreen: true })).toBe(false);
    expect(shouldOfferScreens({ ...base, playlistId: null })).toBe(false);
    expect(shouldOfferScreens({ ...base, displays: [...displays, tv("d4", "Bar", { id: "board-pl", name: "Lunch" })] })).toBe(false);
    // An unpaired screen that still points at the board doesn't count.
    expect(shouldOfferScreens({ ...base, displays: [tv("d5", "Old", { id: "board-pl", name: "Lunch" }, { connected: false })] })).toBe(true);
    expect(shouldOfferScreens({ ...base, displays: [] })).toBe(true);
  });

  it("classic assigns through the existing playlist publish route; nothing changes until a screen is ticked and confirmed", () => {
    const boards = readFileSync("components/menu-boards.tsx", "utf8");
    expect(boards).toMatch(/api\(`\/api\/playlists\/\$\{pickClassic\.playlistId\}\/publish`, \{ method: "POST", body: JSON\.stringify\(\{ displayIds \}\) \}\)/);
    expect(boards).toMatch(/afterClassicSave\(\{ created, fromScreen, tickedScreens: saved\.tickedScreens/); // E2b-F1: new boards only
    const card = readFileSync("components/show-on-screens.tsx", "utf8");
    expect(card).toMatch(/if \(!targets\.length \|\| busy\) return;/);
    expect(card).toMatch(/replaceNotes\(choices, picked, t\)/);
    expect(card).not.toMatch(/This replaces what a ticked screen is set to show\./);
    // Layout boards still use the per-screen layout assign route.
    expect(card).toMatch(/\/api\/layout-studio\/assign/);
    const editor = readFileSync("components/classic-editor.tsx", "utf8");
    expect(editor).toMatch(/tickedScreens: draft\.displayIds\.length/);
  });
});

describe("Brand Kit: a save always leaves a visible result (QA r7)", () => {
  it("shows a persistent success or error line next to Save brand, never only a toast", () => {
    const kit = readFileSync("components/brand-kit.tsx", "utf8");
    expect(kit).toMatch(/data-testid="brand-save-result"/);
    expect(kit).toMatch(/setSaveResult\(\{ ok: true, text: `Brand saved at/);
    expect(kit).toMatch(/const message = \(err as Error\)\?\.message \|\| "Couldn't save your brand\. Try again\.";[\s\S]*?setSaveResult\(\{ ok: false, text: message \}\)/);
    expect(kit).toMatch(/setSaveResult\(\{ ok: false, text: payload\.error \}\)/);
  });
});

describe("E2b Gother lows", () => {
  it("clears the Brand Kit result line on edits and resets the classic picker on every save", () => {
    expect(readFileSync("components/brand-kit.tsx", "utf8")).toMatch(/setForm=\{\(next\) => \{ setSaveResult\(null\); setForm\(next\); \}\}/);
    expect(readFileSync("components/menu-boards.tsx", "utf8")).toMatch(/onSaved=\{async \(message, saved\) => \{\s+setPickClassic\(null\);/);
  });
});
