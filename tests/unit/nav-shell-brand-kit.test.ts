import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTENT_TABS,
  activeContentTab,
  cleanPath,
  isContentPath,
  kindFromPath,
} from "@/lib/content-nav";
import {
  artImages,
  brandFormUnchanged,
  brandSavePayload,
  EMPTY_IDENTITY,
  prefillBrandForm,
  type Brand,
  type BrandFields,
} from "@/lib/brand-kit";
import { BrandSummary } from "@/components/brand-kit";
import { PageHeader } from "@/components/ui";

const loaded: BrandFields = {
  primaryColor: "#c8102e",
  accentColor: "#ffd34d",
  logoMediaId: "logo-1",
  ...EMPTY_IDENTITY,
};

describe("content navigation mapping", () => {
  it("names the five library destinations", () => {
    expect(CONTENT_TABS.map((tab) => tab.label)).toEqual([
      "Media", "Menu boards", "Promotions", "Playlists", "Presentations",
    ]);
  });

  it("marks the current page, including presentations versus the rest of the library", () => {
    expect(activeContentTab("/dashboard/content", null)).toBeNull();
    expect(activeContentTab("/dashboard/media", null)).toBe("media");
    expect(activeContentTab("/dashboard/media/", null)).toBe("media");
    expect(activeContentTab("/dashboard/media?kind=image", null)).toBe("media");
    expect(activeContentTab("/dashboard/media", "presentation")).toBe("presentations");
    expect(activeContentTab("/dashboard/media?kind=presentation", "presentation")).toBe("presentations");
    expect(activeContentTab("/dashboard/media/menus", null)).toBe("menus");
    expect(activeContentTab("/dashboard/media/menus/", null)).toBe("menus");
    expect(activeContentTab("/dashboard/media/promos", null)).toBe("promotions");
    expect(activeContentTab("/dashboard/media/layout-studio", null)).toBe("menus");
    expect(activeContentTab("/dashboard/media/layout-studio?screen=abc", null)).toBe("menus");
    expect(activeContentTab("/dashboard/playlists/pl-1", null)).toBe("playlists");
    expect(activeContentTab("/dashboard/media/presentations/deck-1", null)).toBe("presentations");
    expect(activeContentTab("/dashboard/screens", null)).toBeNull();
    expect(activeContentTab("/dashboard/account", null)).toBeNull();
  });

  it("shows the shared Content nav on library routes and not on account or screens", () => {
    expect(isContentPath("/dashboard/content")).toBe(true);
    expect(isContentPath("/dashboard/media")).toBe(true);
    expect(isContentPath("/dashboard/media/menus")).toBe(true);
    expect(isContentPath("/dashboard/media/layout-studio")).toBe(true);
    expect(isContentPath("/dashboard/playlists/pl-1")).toBe(true);
    expect(isContentPath("/dashboard/media?kind=presentation")).toBe(true);
    expect(isContentPath("/dashboard/screens")).toBe(false);
    expect(isContentPath("/dashboard/account")).toBe(false);
    expect(isContentPath("/dashboard/account/brand-kit")).toBe(false);
    expect(isContentPath("/dashboard/billing")).toBe(false);
    expect(isContentPath("/login")).toBe(false);
    expect(cleanPath("/dashboard/media/?x=1")).toBe("/dashboard/media");
    expect(kindFromPath("/dashboard/media?kind=presentation", null)).toBe("presentation");
    expect(kindFromPath("/dashboard/media", "video")).toBe("video");
  });
});

describe("brand kit value handling", () => {
  it("prefills the exact loaded values and does not substitute defaults", () => {
    expect(prefillBrandForm(loaded)).toEqual(loaded);
    expect(prefillBrandForm(loaded).primaryColor).not.toBe("#0066ff");
  });

  it("sends the same values when the form is unchanged", () => {
    const form = prefillBrandForm(loaded);
    const payload = brandSavePayload(loaded, form);
    expect(payload).toEqual({ ok: true, body: loaded });
    expect(brandFormUnchanged(loaded, form)).toBe(true);
  });

  it("keeps the loaded colour when a field is cleared or invalid, and never writes a default over a custom brand", () => {
    const blank = brandSavePayload(loaded, { ...loaded, primaryColor: "", accentColor: "red" });
    expect(blank).toEqual({ ok: true, body: loaded });
    const partial = brandSavePayload(loaded, { primaryColor: "", accentColor: "#00aa00", logoMediaId: "logo-1" });
    expect(partial.ok && partial.body.primaryColor).toBe("#c8102e");
    expect(partial.ok && partial.body.accentColor).toBe("#00aa00");
    expect(partial.ok && partial.body.logoMediaId).toBe("logo-1");
    expect(brandSavePayload(loaded, { ...loaded, primaryColor: "#0066ff" }).ok && (brandSavePayload(loaded, { ...loaded, primaryColor: "#0066ff" }) as { body: BrandFields }).body.primaryColor).toBe("#0066ff");
  });

  it("treats a cleared logo as intentional after prefill, and keeps the logo when only a colour changes", () => {
    const cleared = brandSavePayload(loaded, { ...prefillBrandForm(loaded), logoMediaId: null });
    expect(cleared).toEqual({ ok: true, body: { ...loaded, logoMediaId: null } });
    const colourOnly = brandSavePayload(loaded, { ...prefillBrandForm(loaded), accentColor: "#112233" });
    expect(colourOnly.ok && colourOnly.body.logoMediaId).toBe("logo-1");
    expect(colourOnly.ok && colourOnly.body.primaryColor).toBe("#c8102e");
  });

  it("rejects a save only when neither the form nor the loaded brand has valid colours", () => {
    const empty: BrandFields = { primaryColor: "", accentColor: "", logoMediaId: null, ...EMPTY_IDENTITY };
    expect(brandSavePayload(empty, empty)).toEqual({ ok: false, error: "Choose colours like #0066ff." });
  });

  it("filters logo candidates the same way menus already did", () => {
    const rows = artImages([
      { id: "1", fileName: "logo.png", kind: "image", url: "https://cdn.example/logo.png", sizeBytes: 1, createdAt: "" },
      { id: "2", fileName: "clip.mp4", kind: "video", url: null, sizeBytes: 1, createdAt: "" },
      { id: "3", fileName: "Lunch (menu).png", kind: "image", url: "https://cdn.example/menu.png", sizeBytes: 1, createdAt: "" },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["1"]);
  });
});

describe("brand summary and page header", () => {
  it("renders existing brand values and a link to Brand Kit, without a save control", () => {
    const brand: Brand = { ...loaded, available: true, custom: true };
    const html = renderToStaticMarkup(createElement(BrandSummary, {
      fixture: {
        brand,
        images: [{ id: "logo-1", fileName: "demo-cafe-logo.png", kind: "image", url: "https://cdn.example/logo.png", sizeBytes: 1, createdAt: "" }],
      },
    }));
    expect(html).toContain("Edit in Brand Kit");
    expect(html).toContain("/dashboard/account/brand-kit");
    expect(html).toContain("demo-cafe-logo.png");
    expect(html).toContain("#c8102e");
    expect(html).not.toContain("Save brand");
    expect(html).toContain("id=\"brand\"");
  });

  it("puts one primary action in the page header", () => {
    const html = renderToStaticMarkup(createElement(PageHeader, {
      title: "Menu boards",
      lede: "Pick a template.",
      action: createElement("button", { className: "btn btn-primary", type: "button" }, "New menu board"),
    }));
    expect(html).toContain("New menu board");
    expect(html).toContain("page-header-action");
    expect(html).toContain("<h1");
    expect(html).toContain("Pick a template.");
  });
});

describe("legacy and current routes still resolve", () => {
  const root = join(__dirname, "../..");

  const pages: { route: string; file: string }[] = [
    { route: "/dashboard", file: "app/dashboard/page.tsx" },
    { route: "/dashboard/displays", file: "app/dashboard/displays/page.tsx" },
    { route: "/dashboard/account", file: "app/dashboard/account/page.tsx" },
    { route: "/dashboard/account/brand-kit", file: "app/dashboard/account/brand-kit/page.tsx" },
    { route: "/dashboard/settings", file: "app/dashboard/settings/page.tsx" },
    { route: "/dashboard/billing", file: "app/dashboard/billing/page.tsx" },
    { route: "/dashboard/content", file: "app/dashboard/content/page.tsx" },
    { route: "/dashboard/media", file: "app/dashboard/media/page.tsx" },
    { route: "/dashboard/media/menus", file: "app/dashboard/media/menus/page.tsx" },
    { route: "/dashboard/media/promos", file: "app/dashboard/media/promos/page.tsx" },
    { route: "/dashboard/media/layout-studio", file: "app/dashboard/media/layout-studio/page.tsx" },
    { route: "/dashboard/media/presentations/[id]", file: "app/dashboard/media/presentations/[id]/page.tsx" },
    { route: "/dashboard/playlists", file: "app/dashboard/playlists/page.tsx" },
    { route: "/dashboard/playlists/[id]", file: "app/dashboard/playlists/[id]/page.tsx" },
    { route: "/dashboard/screens", file: "app/dashboard/screens/page.tsx" },
    { route: "/dashboard/screens/[id]", file: "app/dashboard/screens/[id]/page.tsx" },
    { route: "/dashboard/screens/groups", file: "app/dashboard/screens/groups/page.tsx" },
    { route: "/dashboard/screens/groups/[id]", file: "app/dashboard/screens/groups/[id]/page.tsx" },
    { route: "/dashboard/schedule", file: "app/dashboard/schedule/page.tsx" },
    { route: "/dashboard/alerts", file: "app/dashboard/alerts/page.tsx" },
    { route: "/dashboard/analytics", file: "app/dashboard/analytics/page.tsx" },
    { route: "/login", file: "app/login/page.tsx" },
    { route: "/signup", file: "app/signup/page.tsx" },
    { route: "/reset-password", file: "app/reset-password/page.tsx" },
    { route: "/forgot-password", file: "app/forgot-password/page.tsx" },
    { route: "/layout-studio", file: "app/layout-studio/page.tsx" },
  ];

  it("has a page file for every authenticated and public route that must keep working", () => {
    const missing = pages.filter((item) => !existsSync(join(root, item.file))).map((item) => item.route);
    expect(missing).toEqual([]);
  });

  it("rewrites /player, /tv, and /pair to the existing static player", () => {
    const config = readFileSync(join(root, "next.config.ts"), "utf8");
    for (const route of ["/player", "/tv", "/pair"]) {
      expect(config).toContain(`source: "${route}"`);
      expect(config).toContain('destination: "/player.html"');
    }
    expect(existsSync(join(root, "public/player.html"))).toBe(true);
  });
});

describe("web Brand Kit and Account hub (no bulk apply)", () => {
  it("does not expose Apply to all on the web, and leaves the apply API unreferenced from the client", () => {
    const dir = join(__dirname, "../..");
    const kit = readFileSync(join(dir, "components/brand-kit.tsx"), "utf8");
    const account = readFileSync(join(dir, "app/dashboard/account/page.tsx"), "utf8");
    const layout = readFileSync(join(dir, "components/layout-studio.tsx"), "utf8");
    const classic = readFileSync(join(dir, "components/classic-editor.tsx"), "utf8");
    expect(kit).not.toContain("Apply to all menus and promos");
    expect(kit).not.toContain("/api/brand/apply");
    expect(kit).not.toContain("applyAll");
    expect(kit).toContain("Save brand");
    expect(kit).toContain("aria-label=\"Brand preview\"");
    expect(layout).not.toContain("/api/brand/apply");
    expect(classic).not.toContain("/api/brand/apply");
    expect(layout).toContain(">Apply brand<");
    expect(layout).toContain("{!menuId ? (");
    expect(account).toContain("Contact support");
    expect(account).not.toContain("Open support");
    expect(account).not.toContain("ContactBlock");
    expect(account).not.toContain("ManageBilling");
    expect(account).toContain("btn btn-primary min-h-11 mt-auto");
    for (const action of ["Open settings", "Open Brand Kit", "Open billing", "Contact support"]) {
      expect(account).toContain(action);
    }
  });
});

