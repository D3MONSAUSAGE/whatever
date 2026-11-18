import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { itemInitials, ProductCard, ProductThumb } from "@/components/menu-item-fields";
import { LocaleProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { MENU_FIELD_STYLES } from "@/lib/menu-fields";
import type { Locale } from "@/lib/i18n/locales";

type Item = { name: string; price: string; description: string };
const LONG = { name: "Super Deluxe Triple-Stacked Smoked Brisket Burger with Extra Everything", price: "$1,234.99", description: "Slow-smoked brisket, aged cheddar, pickled onions, crispy shallots, house sauce, ".repeat(3).slice(0, 140) };

function card(item: Item, open = false, locale: Locale = "en") {
  return renderToStaticMarkup(h(LocaleProvider, { initial: locale, children:
    h(ProductCard, { item, idBase: "t-0-0", open, onToggle: () => {}, onRemove: () => {}, removeLabel: "Remove item 1 in section 1",
      order: h("div", { className: "item-order product-order" }, h("button", { className: "order-btn" }, "↑ Up"), h("button", { className: "order-btn" }, "↓ Down")),
      children: [h("input", { key: "n", id: "t-0-0-name", className: "item-name", defaultValue: item.name }), h("input", { key: "p", className: "item-price", defaultValue: item.price }), h("input", { key: "d", className: "item-desc", defaultValue: item.description })] }),
  }));
}

describe("MB-1 product cards", () => {
  it("shows the item as typed: placeholder thumbnail, name, description, price; fields only when open", () => {
    const closed = card({ name: "al pastor", price: "$3.50", description: "Pork & pineapple <b>" });
    expect(closed).toMatch(/class="product-thumb" aria-hidden="true" data-testid="product-thumb">AP</); // initials, uppercased; menu items have no photo field
    expect(closed).toContain(">al pastor<"); // customer text untouched (not title-cased, not translated)
    expect(closed).toContain("Pork &amp; pineapple &lt;b&gt;"); // escaped
    expect(closed).toContain(">$3.50<");
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain('aria-label="Edit al pastor"');
    expect(closed).not.toContain("item-name");
    const open = card({ name: "al pastor", price: "$3.50", description: "" }, true);
    expect(open).toContain('aria-expanded="true"');
    expect(open).toContain('id="t-0-0-edit"');
    expect(open).toContain('class="item-card product-editor"');
    expect(open).not.toContain("product-desc"); // no empty description line
    const blank = card({ name: "", price: "", description: "" });
    expect(blank).toContain("product-thumb is-empty");
    expect(blank).toContain("<svg");
    expect(blank).toContain(">New item<");
    expect(blank).toContain(">No price<");
  });

  it("speaks Spanish for its own labels only", () => {
    const html = card({ name: "Tacos de birria", price: "$4", description: "" }, false, "es");
    expect(html).toContain(">Editar<");
    expect(html).toContain('aria-label="Editar Tacos de birria"');
    expect(html).toContain(">Tacos de birria<");
    expect(card({ name: "", price: "", description: "" }, true, "es")).toMatch(/>Producto nuevo<[\s\S]*>Sin precio<[\s\S]*>Listo</);
    for (const k of Object.keys(en).filter((k) => k.startsWith("menuCard."))) expect(es[k as keyof typeof es]).toBeTruthy();
    expect(es["menuCard.priceLabel"]).toBe("Precio {item} de la sección {section}"); // glossary: price = precio; product = producto
  });

  it("Gother #108 lows: field labels/placeholders/remove via t(), every menuCard key used, AA placeholder colour, prices wrap", () => {
    const keys = Object.keys(en).filter((k) => k.startsWith("menuCard."));
    const src = ["components/menu-item-fields.tsx", "components/classic-editor.tsx", "components/layout-studio.tsx"].map((f) => readFileSync(f, "utf8")).join("\n");
    for (const k of keys) expect(src, k).toContain(`"${k}"`);
    for (const f of ["components/classic-editor.tsx", "components/layout-studio.tsx"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/`(Item|Price|Description|Remove item) \$\{ii \+ 1\}/);
      expect(s).not.toMatch(/placeholder="(Item name|Description|Short description \(optional\))"/);
    }
    // English stays byte-identical for screen readers and e2e selectors.
    expect(en["menuCard.removeLabel"].replace("{item}", "1").replace("{section}", "1")).toBe("Remove item 1 in section 1");
    expect(en["menuCard.nameLabel"].replace("{item}", "2").replace("{section}", "1")).toBe("Item 2 in section 1");
    // #5b6577 on white is 5.9:1 (AA 4.5:1); on the card's #f3f5f9 it's 5.4:1.
    expect(MENU_FIELD_STYLES).toMatch(/\.product-name\.is-placeholder \{ color: #5b6577;/);
    expect(MENU_FIELD_STYLES).toMatch(/\.product-price\.is-empty \{[^}]*color: #5b6577;/);
    const price = /\.product-price \{[^}]*\}/.exec(MENU_FIELD_STYLES)![0];
    expect(price).not.toContain("ellipsis");
    expect(price).not.toContain("nowrap");
    expect(price).toContain("overflow-wrap: anywhere");
  });

  it("both editors use the card; menu data, limits and TV layouts are unchanged", () => {
    for (const f of ["components/classic-editor.tsx", "components/layout-studio.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("<ProductCard ");
      expect(src).toContain("cards.moved(si, ii, dir)");
      expect(src).toMatch(/open=\{cards\.isOpen\(si, ii\) \|\| nameInvalid\}/); // a missing name always shows its field
      expect(src).toContain("className=\"item-order product-order\"");
    }
    // Classic items keep the same three fields; the only addition is an optional item photo (unified menu designer).
    const menuTypes = readFileSync("lib/menu-templates.ts", "utf8");
    expect(menuTypes).toMatch(/export type MenuItem = \{\s*name: string; price: string; description: string;\s*(\/\*\*[^*]*\*\/\s*)?imageMediaId\?: string;\s*\};/);
  });

  it("long text never breaks the card, and narrow panels stack price under the name", async () => {
    let chromium: typeof import("@playwright/test").chromium;
    try { chromium = (await import("@playwright/test")).chromium; } catch { return; }
    let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
    try { browser = await chromium.launch({ timeout: 20000 }); } catch { return; }
    try {
      const chrome = readFileSync("components/studio-chrome.tsx", "utf8").match(/<style>\{`([\s\S]*?)`\}<\/style>/)?.[1] ?? "";
      const style = chrome.replace("${MENU_FIELD_STYLES}", MENU_FIELD_STYLES).replace(/\$\{[A-Z_]+\}/g, "");
      const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
      for (const width of [560, 330]) {
        await page.setContent(`<!doctype html><style>*{box-sizing:border-box}body{margin:0;font-family:sans-serif}${style}</style><div id="w" style="width:${width}px">${card(LONG)}${card(LONG, true)}</div>`);
        const m = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const cardEl = document.querySelector(".product-card")!;
          return { card: r(".product-card"), name: r(".product-name"), price: r(".product-price"), edit: r(".product-edit"), remove: r(".product-card .item-remove"),
            overflow: cardEl.scrollWidth - cardEl.clientWidth, nameLines: Math.round(r(".product-name").height / parseFloat(getComputedStyle(document.querySelector(".product-name")!).lineHeight)),
            editorOverflow: document.querySelectorAll(".product-card")[1]!.scrollWidth - document.querySelectorAll(".product-card")[1]!.clientWidth };
        });
        expect(m.overflow).toBeLessThanOrEqual(0);
        expect(m.editorOverflow).toBeLessThanOrEqual(0);
        expect(m.nameLines).toBeLessThanOrEqual(2);
        expect(m.price.width).toBeGreaterThan(20);
        expect(m.remove.right).toBeLessThanOrEqual(m.card.right);
        expect(m.edit.height).toBeGreaterThanOrEqual(36);
        expect(m.remove.width).toBeGreaterThanOrEqual(44);
        if (width === 330) expect(m.price.top).toBeGreaterThanOrEqual(m.name.bottom - 1); // stacked on phones/narrow panels
        else expect(m.price.top).toBeLessThan(m.name.bottom); // one row on wider panels
      }
    } finally { await browser.close(); }
  }, 30000);

  it("the image slot: initials tile today, a real image can drop in later at the same size (no data field)", () => {
    expect(itemInitials("Carne asada")).toBe("CA");
    expect(itemInitials("pozole")).toBe("P");
    expect(itemInitials("  \"Ñandú\" special  ")).toBe("ÑS");
    expect(itemInitials("Tacos – 3 pcs")).toBe("T3");
    expect(itemInitials("")).toBe("");
    const withImage = renderToStaticMarkup(h(ProductThumb, { name: "Carne asada", imageSrc: "/x.jpg" }));
    expect(withImage).toContain('class="product-thumb has-image"');
    expect(withImage).toContain('alt=""');
    expect(MENU_FIELD_STYLES).toMatch(/\.product-thumb img \{[^}]*object-fit: cover/);
    // Nothing passes an image today: the cards never render <img>.
    expect(card({ name: "Carne asada", price: "$9", description: "" })).not.toContain("<img");
  });
});
