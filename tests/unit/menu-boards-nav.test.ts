import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_NAV, MENU_BOARDS_HREF, isContentPath, isMainNavActive, isMenuBoardsPath } from "@/lib/content-nav";

const active = (path: string) => MAIN_NAV.filter((item) => isMainNavActive(item.href, path)).map((item) => item.label);

describe("Menu Boards in the main navigation (t248u)", () => {
  it("is a top-level item right after My Screens, pointing at the existing board list route", () => {
    expect(MAIN_NAV.map((item) => item.label)).toEqual(["My Screens", "Menu Boards", "Content", "Playlists", "Schedules", "Account"]);
    expect(MAIN_NAV[1].href).toBe("/dashboard/media/menus");
    expect(MENU_BOARDS_HREF).toBe("/dashboard/media/menus");
    expect(existsSync("app/dashboard/media/menus/page.tsx")).toBe(true);
  });

  it("highlights Menu Boards (and only Menu Boards) on the list and in both editors", () => {
    for (const path of [
      "/dashboard/media/menus",
      "/dashboard/media/menus/",
      "/dashboard/media/menus?board=board-lunch",
      "/dashboard/media/menus?menu=menu-dinner",
      "/dashboard/media/layout-studio",
      "/dashboard/media/layout-studio?screen=abc",
      "/layout-studio",
    ]) {
      expect(isMenuBoardsPath(path)).toBe(true);
      expect(active(path)).toEqual(["Menu Boards"]);
      expect(isContentPath(path)).toBe(false);
    }
  });

  it("keeps Content current for the rest of the library", () => {
    for (const path of ["/dashboard/content", "/dashboard/media", "/dashboard/media?kind=presentation", "/dashboard/media/promos", "/dashboard/media/presentations/deck-1"]) {
      expect(active(path)).toEqual(["Content"]);
      expect(isContentPath(path)).toBe(true);
    }
    expect(isMenuBoardsPath("/dashboard/media/menusx")).toBe(false);
    expect(active("/dashboard/screens")).toEqual(["My Screens"]);
    expect(active("/dashboard/playlists/pl-1")).toEqual(["Playlists"]);
    expect(active("/dashboard/account/brand-kit")).toEqual(["Account"]);
  });

  it("renders the item in the sidebar and a six-column mobile bar from the shared list, with an existing icon", () => {
    const shell = readFileSync("components/shell.tsx", "utf8");
    expect(shell).toContain("MAIN_NAV.map");
    expect(shell).toContain("IconGrid");
    expect(shell).toContain("grid grid-cols-6 border-t");
    expect(shell).toContain("isMainNavActive(href, path)");
    expect(readFileSync("components/icons.tsx", "utf8")).toContain("export function IconGrid()");
  });

  it("fits the phone bar with short labels while keeping the full name for screen readers", () => {
    expect(MAIN_NAV.find((item) => item.label === "Menu Boards")?.short).toBe("Menus");
    expect(MAIN_NAV.find((item) => item.label === "My Screens")?.short).toBe("Screens");
    for (const item of MAIN_NAV) expect((item.short ?? item.label).length).toBeLessThanOrEqual(9);
    const shell = readFileSync("components/shell.tsx", "utf8");
    // WCAG 2.5.3: the accessible name contains the visible text, e.g. "Menus (Menu Boards)".
    expect(shell).toContain("aria-label={phoneAria(t(item.shortKey ?? item.labelKey), t(item.labelKey))}");
    expect(shell).not.toContain("sr-only");
    // Icons are keyed by href, so reordering MAIN_NAV can't mismatch them.
    expect(shell).toContain('"/dashboard/media/menus": IconGrid');
    for (const item of MAIN_NAV) expect(shell).toContain(`"${item.href}": Icon`);
    expect(readFileSync("components/menu-boards.tsx", "utf8")).toContain('eyebrow="Menu Boards"');
  });

  it("styles Brand Kit as a proper sub-item of Account, not a bare text line or a new section", () => {
    const shell = readFileSync("components/shell.tsx", "utf8");
    expect(shell).toContain('className="nav-link nav-sublink"');
    expect(shell).not.toContain("md:pl-8 text-[13px]");
    expect(MAIN_NAV.some((item) => item.label === "Brand Kit")).toBe(false);
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.nav-sublink \{[^}]*min-height: 36px/);
    expect(css).toContain('.nav-sublink[aria-current="page"]');
  });
});
