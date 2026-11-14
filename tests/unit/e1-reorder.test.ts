import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { moveEntry, moveItem, moveSection } from "@/lib/menu-fields";

const sections = [
  { name: "Starters", items: [{ name: "A" }, { name: "B" }, { name: "C" }] },
  { name: "Mains", items: [{ name: "D" }] },
];

describe("E1 move up/down", () => {
  it("swaps neighbours and ignores moves past either end", () => {
    expect(moveEntry([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveEntry([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    const list = [1, 2];
    expect(moveEntry(list, 0, -1)).toBe(list);
    expect(moveEntry(list, 1, 1)).toBe(list);
  });
  it("moves a whole section with its items", () => {
    const moved = moveSection(sections, 1, -1);
    expect(moved.map((s) => s.name)).toEqual(["Mains", "Starters"]);
    expect(moved[1].items.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });
  it("moves an item only inside its section and leaves the original untouched", () => {
    const moved = moveItem(sections, 0, 2, -1);
    expect(moved[0].items.map((i) => i.name)).toEqual(["A", "C", "B"]);
    expect(moved[1]).toBe(sections[1]);
    expect(sections[0].items.map((i) => i.name)).toEqual(["A", "B", "C"]);
  });
  it("both editors show the buttons for items and sections", () => {
    for (const file of ["components/classic-editor.tsx", "components/layout-studio.tsx"]) {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/OrderButtons className="section-order"[\s\S]*moveSection/);
      expect(src).toMatch(/OrderButtons label=\{`item[\s\S]*moveItem/);
      expect(src).not.toMatch(/draggable/);
    }
  });
});
