import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canAddItem, canAddSection, filledSections, firstNamelessItem, menuCounts, needsName, normalizePrice, priceHint, withoutNamelessItems,
} from "@/lib/menu-fields";
import { frameFor, layoutSvg, longMenuColumns, LONG_MENU_ITEMS, parseLayout, sampleLayout, type LayoutTemplate } from "@/lib/layout-studio";
import { previewHits } from "@/lib/layout-studio-editor";
import { MENU_LIMITS, parseMenuContent } from "@/lib/menu-templates";
import { menuSvg } from "@/lib/server/menu-render";

const item = (name: string, price = "$5", description = "") => ({ name, price, description });

describe("B1-01 prices: gentle normalisation, never blocking", () => {
  it("tidies plain numbers on blur and keeps free text as typed", () => {
    expect(normalizePrice("12")).toBe("$12");
    expect(normalizePrice("12.5")).toBe("$12.50");
    expect(normalizePrice("$12.5")).toBe("$12.50");
    expect(normalizePrice(" $ 9.9 ")).toBe("$9.90");
    expect(normalizePrice("$3.75")).toBe("$3.75");
    for (const free of ["Market price", "abc", "2 for $10", "€8", "6:30", ""]) expect(normalizePrice(free)).toBe(free);
  });
  it("hints (does not block) for text that is not a number", () => {
    expect(priceHint("Market price")).toMatch(/exactly as typed/);
    expect(priceHint("abc")).toMatch(/exactly as typed/);
    expect(priceHint("$12.50")).toBeNull();
    expect(priceHint("€8")).toBeNull();
    expect(priceHint("")).toBeNull();
    // Stored boards with free-text prices still parse and save unchanged.
    const parsed = parseMenuContent({ title: "T", subtitle: "", footer: "", sections: [{ name: "S", items: [item("Oysters", "Market price")] }] });
    expect(parsed.ok && parsed.value.sections[0].items[0].price).toBe("Market price");
  });
});

describe("B1-02 item name required", () => {
  it("flags rows with a price or description but no name, and ignores fully blank rows", () => {
    expect(needsName(item("", "abc"))).toBe(true);
    expect(needsName(item("", "", "Spicy"))).toBe(true);
    expect(needsName(item("", ""))).toBe(false);
    expect(firstNamelessItem([{ name: "A", items: [item("x"), item("", "")] }, { name: "B", items: [item("y"), item("", "abc")] }])).toEqual({ section: 1, item: 1 });
    const preview = withoutNamelessItems({ sections: [{ name: "A", items: [item("Taco"), item("", "abc")] }] });
    expect(preview.sections[0].items.map((i) => i.name)).toEqual(["Taco"]);
  });
  it("both editors block the save with an inline message instead of silently dropping the row", () => {
    const classic = readFileSync("components/classic-editor.tsx", "utf8");
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(classic).toContain("firstNamelessItem(c.sections)");
    expect(studio).toContain("if (namelessBlocked()) return null;");
    expect(studio).toContain("withoutNamelessItems(previewDraft)");
    expect(readFileSync("components/menu-item-fields.tsx", "utf8")).toContain('role="alert"');
  });
});

describe("B1-03 restaurant sample content for new boards", () => {
  it("has no gym, grocery or unrelated placeholders", () => {
    const templates: LayoutTemplate[] = ["menu-promo-67", "triple-column", "split-50", "menu-banner", "signature", "two-menu-promo", "two-column"];
    const text = JSON.stringify(templates.map((t) => sampleLayout(t))).toLowerCase();
    for (const word of ["gym", "grocer", "studio a", "studio b", "bikes", "noon ride", "towels", "flowers", "members save", "citrus bag"]) {
      expect(text).not.toContain(word);
    }
  });
  it("does not touch stored boards (legacy fixtures still parse unchanged)", () => {
    const legacy = JSON.parse(readFileSync("tests/fixtures/legacy-layout-split-50.json", "utf8"));
    const parsed = parseLayout(legacy);
    expect(parsed.ok && parsed.value.title).toBe("Harbor Gym");
  });
});

describe("B1-04 limits up front, removable sections, emptied sections do not count", () => {
  it("counts only filled sections and items", () => {
    const sections = [{ name: "A", items: [item("x"), item("", "")] }, { name: "", items: [item("", "")] }];
    expect(filledSections(sections)).toBe(1);
    expect(menuCounts(sections)).toMatchObject({ sections: 1, items: 1, maxSections: 4, maxItems: 24 });
  });
  it("disables Add at the limits", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, items: [item("x")] }));
    expect(canAddSection(four)).toBe(false);
    expect(canAddSection(four.slice(0, 3))).toBe(true);
    const fullSection = [{ name: "S", items: Array.from({ length: MENU_LIMITS.itemsPerSection }, (_, i) => item(`i${i}`)) }];
    expect(canAddItem(fullSection, 0)).toBe(false);
    const twentyFour = [0, 1].map((s) => ({ name: `S${s}`, items: Array.from({ length: 12 }, (_, i) => item(`i${i}`)) }));
    expect(canAddItem([...twentyFour, { name: "C", items: [] }], 2)).toBe(false);
  });
  it("saves a board whose extra sections were emptied, in both parsers", () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => ({ name: `S${i}`, items: [item("x")] })),
      { name: "", items: [item("", "")] },
      { name: "", items: [] },
    ];
    expect(parseLayout({ ...sampleLayout("menu-promo-67"), sections: rows }).ok).toBe(true);
    expect(parseMenuContent({ title: "T", subtitle: "", footer: "", sections: rows }).ok).toBe(true);
    const five = [...rows.slice(0, 4), { name: "S5", items: [item("y")] }];
    expect(parseLayout({ ...sampleLayout("menu-promo-67"), sections: five })).toMatchObject({ ok: false, error: "Use up to 4 sections." });
    expect(parseMenuContent({ title: "T", subtitle: "", footer: "", sections: five })).toMatchObject({ ok: false });
  });
  it("studio offers Remove section and shows the counters", () => {
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(studio).toContain("Remove section");
    expect(studio).toContain("<MenuLimits");
    expect(readFileSync("components/classic-editor.tsx", "utf8")).toContain("<MenuLimits");
  });
});

describe("B1-05 long menus use two columns and the full height", () => {
  const long = ["Starters", "Salads", "Mains", "Seafood"].map((n) => ({ name: n, items: Array.from({ length: 6 }, (_, i) => item(`${n} ${i + 1}`, `$${10 + i}`, i % 2 ? "House sauce" : "")) }));
  it("splits only above the threshold", () => {
    expect(longMenuColumns(sampleLayout("menu-promo-67").sections, 1190)).toBeNull();
    const cols = longMenuColumns(long, 1190);
    expect(cols).toHaveLength(2);
    expect(cols![0].reduce((n, s) => n + s.items.length, 0) + cols![1].reduce((n, s) => n + s.items.length, 0)).toBe(24);
    expect(LONG_MENU_ITEMS).toBe(12);
  });
  it("renders 24 items at a readable size down the board", () => {
    const svg = layoutSvg({ ...sampleLayout("menu-promo-67"), sections: long });
    const sizes = [...svg.matchAll(/font-size="(\d+)" font-weight="700"/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(20);
    const ys = [...svg.matchAll(/<text x="[\d.]+" y="([\d.]+)"[^>]*font-weight="700"/g)].map((m) => Number(m[1]));
    expect(Math.max(...ys)).toBeGreaterThan(1080 * 0.75);
    expect(Math.max(...ys)).toBeLessThan(1080 - 60);
  });
  it("short menus render exactly as before (golden legacy fixtures are checked in menu-board-unify)", () => {
    expect(readFileSync("tests/unit/menu-board-unify.test.ts", "utf8")).toContain("legacy-layout-");
  });
});

describe("B1-06 overflow and cropping", () => {
  it("long classic titles shrink before they are shortened", () => {
    const svg = menuSvg("fresh", { title: "QA – Harbor Street Kitchen & Bar", subtitle: "Made fresh every day", footer: "", sections: [{ name: "Griddle", items: [item("Pancakes")] }] }, { photo: "data:image/png;base64,AA==", logo: "data:image/png;base64,AA==" });
    expect(svg).toContain(">QA – Harbor Street Kitchen &amp; Bar<");
  });
  it("column targets do not cut through the shared title band", () => {
    const frame = frameFor("two-menu-promo", 0.35);
    const hits = previewHits("two-menu-promo", frame);
    expect(hits.find((h) => h.id === "column-0")!.box.y).toBeGreaterThanOrEqual(132);
    expect(hits.find((h) => h.id === "feature")!.box.y).toBe(0);
  });
  it("new banner boards start with a taller banner", () => {
    expect(sampleLayout("menu-banner").split).toBe(0.25);
  });
});

describe("U1-04a / U1-05 / U1-10", () => {
  it("classic photo area opens the photo controls under the board", () => {
    const classic = readFileSync("components/classic-editor.tsx", "utf8");
    expect(classic).toContain("photoPanelRef.current.open = true");
    expect(classic).toContain("Add a photo");
  });
  it("description counter is shown", () => {
    expect(readFileSync("components/menu-item-fields.tsx", "utf8")).toContain("charCount(item.description, MENU_LIMITS.description)");
  });
  it("selected zone uses an outline, not a cream tint", () => {
    const studio = readFileSync("components/layout-studio.tsx", "utf8");
    expect(studio).not.toContain("rgba(255, 211, 77, 0.28)");
    expect(studio).toContain('border: active === hit.id ? "3px solid #0066ff"');
  });
});
