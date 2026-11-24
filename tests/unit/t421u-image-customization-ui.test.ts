import { readFileSync } from "node:fs";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase-browser", () => ({ getSupabase: () => { throw new Error("no supabase"); }, supabaseConfigured: () => false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }), usePathname: () => "/dashboard" }));
import { LocaleProvider } from "@/lib/i18n/client";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";
import { CustomizeLook } from "@/components/menu-customize";
import { dragFocus } from "@/components/menu-templates";
import { designById, designDocument } from "@/lib/menu-designs";
import { sampleLayout, type LayoutDocument } from "@/lib/layout-studio";

const wrap = (locale: "en" | "es", node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: locale, children: node }));
const look = (doc: LayoutDocument, props: Partial<Parameters<typeof CustomizeLook>[0]> = {}, locale: "en" | "es" = "en") => wrap(locale, createElement(CustomizeLook, {
  doc, update: () => undefined, hasPhoto: true, open: true, onOpen: () => undefined, scope: "all", onScope: () => undefined,
  itemPhotos: { requested: doc.itemPhotoSize ?? "small", effective: doc.itemPhotoSize ?? "small" }, ...props,
}));
const pressed = (html: string, testid: string) => new RegExp(`aria-pressed="true"[^>]*data-testid="${testid}"`).test(html);

describe("t421u Step 4 Look: Basic and Advanced controls", () => {
  const seed = designDocument(designById("modern-restaurant")!);

  it("Basic shows Item photo size (the board's value, absent = Small) and Fill/Fit", () => {
    const fresh = look(seed);
    expect(fresh).toContain('data-testid="tpl-cz-item-photos"');
    expect(pressed(fresh, "tpl-cz-item-photo-medium")).toBe(true);
    const { itemPhotoSize: _s, ...legacy } = seed; void _s;
    expect(pressed(look(legacy as LayoutDocument), "tpl-cz-item-photo-small")).toBe(true);
    expect(fresh.indexOf("tpl-cz-framing")).toBeLessThan(fresh.indexOf("tpl-cz-advanced"));
    expect(fresh.indexOf("tpl-cz-item-photos")).toBeLessThan(fresh.indexOf("tpl-cz-advanced"));
    for (const id of ["tpl-cz-item-photo-small", "tpl-cz-item-photo-medium", "tpl-cz-item-photo-large", "tpl-cz-fill", "tpl-cz-fit"]) {
      expect(fresh, id).toMatch(new RegExp(`class="[^"]*min-h-11[^"]*"[^>]*data-testid="${id}"`));
    }
  });

  it("Advanced has zoom, drag hint, X/Y in both Fill and Fit, and Reset photo once something changed", () => {
    for (const fit of ["cover", "contain"] as const) {
      const html = look({ ...seed, imageFit: fit });
      for (const id of ["tpl-cz-zoom", "tpl-cz-focus-x", "tpl-cz-focus-y"]) expect(html, `${fit} ${id}`).toContain(`data-testid="${id}"`);
      expect(html).toContain(en["cz.dragHint"]);
    }
    expect(look(seed)).not.toContain("tpl-cz-photo-reset");
    expect(look({ ...seed, custom: { v: 1, imageZoom: 1.5 } })).toContain("tpl-cz-photo-reset");
    expect(look({ ...seed, imageFit: "contain" })).toContain("tpl-cz-photo-reset");
    // Sliders start at the template anchor, so the first move never jumps.
    expect(/<input[^>]*data-testid="tpl-cz-focus-y"[^>]*>/.exec(look({ ...seed, imageAnchor: "top" }))?.[0]).toContain('value="0"');
  });

  it("hides the framing controls for a video, and the size control where it does not apply", () => {
    const html = look(seed, { video: true });
    for (const id of ["tpl-cz-framing", "tpl-cz-photo", "tpl-cz-zoom", "tpl-cz-fill"]) expect(html, id).not.toContain(`data-testid="${id}"`);
    expect(look(sampleLayout("split-50"), { itemPhotos: undefined })).not.toContain("tpl-cz-item-photos");
    expect(look(seed, { itemPhotos: undefined })).not.toContain("tpl-cz-item-photos");
  });

  it("explains when a size was reduced to fit (EN and ES, with the size)", () => {
    const doc = { ...seed, itemPhotoSize: "large" as const };
    expect(look(doc, { itemPhotos: { requested: "large", effective: "medium" } })).toContain("Showing medium so every item and price still fits.");
    expect(look(doc, { itemPhotos: { requested: "large", effective: "small" } }, "es")).toContain("Se muestra en pequeño para que todos los artículos y precios quepan.");
    expect(look(doc, { itemPhotos: { requested: "large", effective: "large" } })).not.toContain("tpl-cz-item-photo-reduced");
  });

  it("renders the Spanish labels", () => {
    const html = look(seed, {}, "es");
    for (const k of ["cz.itemPhotoSize", "cz.itemPhoto.small", "cz.itemPhoto.medium", "cz.itemPhoto.large", "cz.featuredFraming", "cz.dragHint"] as const) expect(html, k).toContain(es[k]);
    expect(html).toContain("Ampliación 100%");
  });
});

describe("t421u drag to position", () => {
  it("moves the photo with the pointer: Fill overflow pans, Fit spare space slides, no slack = no change", () => {
    // Fill: photo 2160 wide in a 780 box (slack −1380): dragging right by 138 px reveals the left part → focus x down 10.
    expect(dragFocus({ x: 50, y: 50 }, { x: 138, y: 0 }, { x: -1380, y: 0 })).toEqual({ x: 40, y: 50 });
    // Fit: 690 px spare height; dragging down by 69 px moves the photo down → focus y up 10.
    expect(dragFocus({ x: 50, y: 50 }, { x: 0, y: 69 }, { x: 0, y: 690 })).toEqual({ x: 50, y: 60 });
    expect(dragFocus({ x: 0, y: 100 }, { x: -999, y: 999 }, { x: -100, y: 100 })).toEqual({ x: 100, y: 100 });
  });

  it("is touch friendly and keyboard accessible", () => {
    const src = readFileSync("components/menu-templates.tsx", "utf8");
    expect(src).toContain("touch-action: none");
    expect(src).toContain("const DRAG_THRESHOLD = 6;");
    expect(src).toMatch(/setPointerCapture/);
    expect(src).toMatch(/ArrowLeft: \[-step, 0\]/);
    expect(src).toContain('data-testid="tpl-photo-drag"');
    // Both the pinned preview and the expanded vertical preview get the drag layer.
    expect(src.match(/photoDrag=\{/g)?.length).toBeGreaterThanOrEqual(2);
    // Step 3's position select steps aside once a focal point is set.
    expect(src).toContain('data-testid="tpl-position-in-look"');
  });

  it("writes Small explicitly (a save replaces the content)", () => {
    const src = readFileSync("components/menu-customize.tsx", "utf8");
    expect(src).toContain("update({ ...doc, itemPhotoSize: size })");
    expect(src).toContain("update(resetFeaturedPhoto(doc))");
  });
});
