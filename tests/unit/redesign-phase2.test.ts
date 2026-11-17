import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "@/components/ui";
import { LocaleProvider } from "@/lib/i18n/client";
import { CONTENT_TABS, isContentPath, isMainNavActive } from "@/lib/content-nav";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

const wrap = (node: ReactNode) => renderToStaticMarkup(createElement(LocaleProvider, { initial: "en", children: node }));
const read = (f: string) => readFileSync(f, "utf8");

describe("redesign phase 2: page header", () => {
  it("is a light header with the display-face title, description and actions, no dark banner", () => {
    const html = wrap(createElement(PageHeader, { title: "Menu boards", eyebrow: "Pekko", lede: "Pick a layout.", action: createElement("button", { className: "btn btn-primary" }, "New menu board") }));
    expect(html).toContain('class="ps-h1 break-words"');
    expect(html).toContain("page-header-action");
    expect(html).toContain('data-testid="page-header"');
    expect(html).not.toMatch(/banner-dark|hero-gradient|text-white/);
    // The old white-on-ink override would turn primary buttons white on a light header.
    expect(read("app/globals.css")).not.toContain(".page-header-action .btn-primary");
  });
});

describe("redesign phase 2: Overview", () => {
  const src = read("components/overview-screen.tsx");
  it("links every count to its page and adds the quick actions from the prototype", () => {
    for (const href of ["/dashboard/screens", "/dashboard/media", "/dashboard/playlists", "/dashboard/schedule"]) expect(src).toContain(`href="${href}" className="ps-stat-link"`);
    expect(src).toContain('href="/dashboard/screens/add#add-screen"');
    expect(src).toContain('href="/dashboard/media/menus?new=1"');
  });
  it("surfaces the Analytics page (reliability and activity), which had no menu entry", () => {
    expect(src).toContain('href="/dashboard/analytics"');
    expect(en["ov.activityLink"]).toBe("Screen reliability and recent activity");
    expect(es["ov.activityLink"]).not.toBe(en["ov.activityLink"]);
  });
  it("shows offline screens and billing in a Needs attention panel, not a strip", () => {
    expect(src).toContain("<NeedsAttention displays={displayData} />");
    expect(src).not.toContain("<OfflineAlert");
    expect(src).toContain("useOptionalNotifications()");
  });
});

describe("redesign phase 2: offline state", () => {
  const tv = read("components/tv.tsx");
  it("keeps the '(N offline)' tab title on Overview, My Screens and Displays", () => {
    expect(tv).toContain("export function useOfflineTitle(displays: DisplayItem[])");
    expect(tv.match(/useOfflineTitle\(displays\);/g)?.length).toBeGreaterThanOrEqual(2); // OfflineAttention + OfflineAlert
    expect(read("components/my-screens.tsx")).toContain("useOfflineTitle(displays);");
    expect(read("components/displays-screen.tsx")).toContain("<OfflineAlert displays={displays.data} />");
  });
  it("gives each offline screen its own callout with a link to it", () => {
    expect(tv).toContain('data-testid="offline-attention"');
    expect(tv).toContain("href={`/dashboard/screens/${d.id}`}");
  });
});

describe("redesign phase 2: screen cards", () => {
  const src = read("components/my-screens.tsx");
  it("keeps Change content as the one primary action and every other action in the ⋯ menu", () => {
    expect(src).toContain("?panel=change`}>{t(\"sa.change\")}</Link>");
    expect(src).toContain("?panel=schedule`, label: t(\"sa.schedule\")");
    expect(src).toContain("?panel=playlist`, label: t(\"sa.playlist\")");
    expect(src).toContain('label: t("screens.openScreen")');
    expect(src).toContain('<OverflowMenu label={t("screens.moreFor", { name: display.name })}');
  });
  it("the menu is keyboard-operable and guarded against unsaved changes", () => {
    const menu = read("components/menu.tsx");
    expect(menu).toContain('aria-haspopup="menu"');
    expect(menu).toContain('role="menuitem"');
    for (const key of ["Escape", "ArrowDown", "ArrowUp", "Home", "End"]) expect(menu).toContain(`e.key === "${key}"`);
    expect(menu).toContain("<StudioGuardedLink");
  });
});

describe("redesign phase 2: dialogs", () => {
  it("leaves no hand-built overlay outside the shared Dialog and the confirm dialog", () => {
    const offenders = readdirSync("components").filter((f) => f.endsWith(".tsx") && !["dialog.tsx", "confirm.tsx"].includes(f))
      .filter((f) => /className="fixed inset-0/.test(read(`components/${f}`)));
    expect(offenders).toEqual([]);
  });
  it("traps focus, closes on Escape and the backdrop, locks scroll and restores focus", () => {
    const d = read("components/dialog.tsx");
    expect(d).toContain('aria-modal="true"');
    expect(d).toContain('event.key === "Escape"');
    expect(d).toContain('event.key !== "Tab"');
    expect(d).toContain('document.body.style.overflow = "hidden"');
    expect(d).toContain("opener.focus()");
    expect(d).toContain("createPortal(");
  });
  it("is used by all six former hand-built modals", () => {
    const uses = ["components/displays-screen.tsx", "components/media-library.tsx", "components/playlist-editor.tsx"]
      .map((f) => (read(f).match(/<Dialog /g) ?? []).length);
    expect(uses).toEqual([2, 2, 2]);
  });
});

describe("redesign phase 2: Content tabs (decision D1)", () => {
  it("drops Playlists from Content; Playlists stays a main section", () => {
    expect(CONTENT_TABS.map((t) => t.id)).toEqual(["media", "promotions", "presentations"]);
    expect(isContentPath("/dashboard/playlists")).toBe(false);
    expect(isMainNavActive("/dashboard/playlists", "/dashboard/playlists/pl-1")).toBe(true);
  });
});
