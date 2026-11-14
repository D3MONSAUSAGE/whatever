export type ContentTabId = "media" | "promotions" | "playlists" | "presentations";

export const CONTENT_TABS: { id: ContentTabId; href: string; label: string }[] = [
  { id: "media", href: "/dashboard/media", label: "Media" },
  { id: "promotions", href: "/dashboard/media/promos", label: "Promotions" },
  { id: "playlists", href: "/dashboard/playlists", label: "Playlists" },
  { id: "presentations", href: "/dashboard/media?kind=presentation", label: "Presentations" },
];

/** Strip query and trailing slash so path checks stay consistent. */
export function cleanPath(path: string): string {
  return path.split("?")[0].replace(/\/$/, "") || "/";
}

/** The top-level Menu Boards destination: the board list and both editors (classic and Layout Studio).
 *  URLs are unchanged; the old Layout Studio route still redirects to the list. */
export const MENU_BOARDS_HREF = "/dashboard/media/menus";

export function isMenuBoardsPath(path: string): boolean {
  const clean = cleanPath(path);
  return (
    clean === MENU_BOARDS_HREF ||
    clean.startsWith(`${MENU_BOARDS_HREF}/`) ||
    clean === "/dashboard/media/layout-studio" ||
    clean.startsWith("/dashboard/media/layout-studio/") ||
    clean === "/layout-studio" ||
    clean.startsWith("/layout-studio/")
  );
}

/** Which content tab is current. The Content hub and Menu Boards match none of them. */
export function activeContentTab(path: string, kind: string | null): ContentTabId | null {
  const clean = cleanPath(path);
  if (isMenuBoardsPath(clean)) return null;
  if (clean.startsWith("/dashboard/media/promos")) return "promotions";
  if (clean.startsWith("/dashboard/media/presentations")) return "presentations";
  if (clean.startsWith("/dashboard/playlists")) return "playlists";
  if (clean === "/dashboard/media") return kind === "presentation" ? "presentations" : "media";
  return null;
}

/** Pages that show the shared Content navigation in the dashboard shell. Menu Boards has its own nav entry. */
export function isContentPath(path: string): boolean {
  const clean = cleanPath(path);
  if (isMenuBoardsPath(clean)) return false;
  return (
    clean === "/dashboard/content" ||
    clean.startsWith("/dashboard/content/") ||
    clean === "/dashboard/media" ||
    clean.startsWith("/dashboard/media/") ||
    clean === "/dashboard/playlists" ||
    clean.startsWith("/dashboard/playlists/")
  );
}

/** Read a `kind` query from a path or a standalone search-param value. */
export function kindFromPath(path: string, kind: string | null | undefined): string | null {
  if (kind) return kind;
  try {
    const query = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    if (!query) return null;
    return new URLSearchParams(query).get("kind");
  } catch {
    return null;
  }
}

/** Main dashboard navigation, in order. Icons are attached in the shell. */
export const MAIN_NAV: { href: string; label: string; short?: string }[] = [
  // `short` is the label under the icon in the six-column phone bar (about 60px per item at 360-390px).
  { href: "/dashboard/screens", label: "My Screens", short: "Screens" },
  { href: MENU_BOARDS_HREF, label: "Menu Boards", short: "Menus" },
  { href: "/dashboard/content", label: "Content" },
  { href: "/dashboard/playlists", label: "Playlists" },
  { href: "/dashboard/schedule", label: "Schedules" },
  { href: "/dashboard/account", label: "Account" },
];

/** Whether a main-nav item is the current section for this path. */
export function isMainNavActive(href: string, rawPath: string): boolean {
  const path = cleanPath(rawPath);
  if (href === MENU_BOARDS_HREF) return isMenuBoardsPath(path);
  if (href === "/dashboard/content") return (path.startsWith("/dashboard/content") || path.startsWith("/dashboard/media")) && !isMenuBoardsPath(path);
  if (href === "/dashboard/account") return path.startsWith("/dashboard/account") || path.startsWith("/dashboard/settings") || path.startsWith("/dashboard/billing");
  return href === "/dashboard" ? path === href : path.startsWith(href);
}
