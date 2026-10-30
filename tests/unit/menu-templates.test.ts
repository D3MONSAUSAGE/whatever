import { describe, expect, it } from "vitest";
import { MENU_LIMITS, parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { columnsFor, fit, menuSvg, renderMenuPng } from "@/lib/server/menu-render";

describe("menu content", () => {
  it("accepts the sample and drops blank rows", () => {
    const m = sampleMenu();
    m.sections[0].items.push({ name: "  ", price: "", description: "" });
    const r = parseMenuContent(m);
    expect(r.ok && r.value.sections[0].items).toHaveLength(3);
  });
  it("rejects too many items, long text, and empty menus", () => {
    const many = { title: "x", sections: [0, 1, 2, 3].map(() => ({ name: "s", items: Array.from({ length: 7 }, () => ({ name: "a", price: "1" })) })) };
    expect(parseMenuContent(many).ok).toBe(false);
    expect(parseMenuContent({ title: "x".repeat(MENU_LIMITS.title + 1), sections: [] }).ok).toBe(false);
    expect(parseMenuContent({ title: "", sections: [] }).ok).toBe(false);
    expect(parseMenuContent(null).ok).toBe(false);
  });
});

describe("menu render", () => {
  it("escapes text and shortens long names", () => {
    const svg = menuSvg("classic", { title: "<b>&", subtitle: "", footer: "", sections: [{ name: "", items: [{ name: "x".repeat(40), price: "$1", description: "" }] }] });
    expect(svg).toContain("&lt;b&gt;&amp;");
    expect(fit("a".repeat(200), 40, 300)).toMatch(/…$/);
  });
  it("balances sections into columns", () => {
    expect(columnsFor(sampleMenu().sections)).toHaveLength(2);
    expect(columnsFor([{ name: "", items: [{ name: "a", price: "", description: "" }] }])).toHaveLength(1);
  });
  it("renders a 1920x1080 PNG for every template", () => {
    for (const t of ["classic", "fresh", "bold"] as const) {
      const png = renderMenuPng(t, sampleMenu());
      expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
      const view = new DataView(png.buffer, png.byteOffset);
      expect([view.getUint32(16), view.getUint32(20)]).toEqual([1920, 1080]);
    }
  });
});
