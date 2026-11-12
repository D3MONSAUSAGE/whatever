export type ContentTabId = "media" | "menus" | "promotions" | "studio" | "playlists" | "presentations";

export const CONTENT_TABS: { id: ContentTabId; href: string; label: string }[] = [
  { id: "media", href: "/dashboard/media", label: "Media" },
  { id: "menus", href: "/dashboard/media/menus", label: "Menus" },
  { id: "promotions", href: "/dashboard/media/promos", label: "Promotions" },
  { id: "studio", href: "/dashboard/media/layout-studio", label: "Layout Studio" },
  { id: "playlists", href: "/dashboard/playlists", label: "Playlists" },
  { id: "presentations", href: "/dashboard/media?kind=presentation", label: "Presentations" },
];

/** Strip query and trailing slash so path checks stay consistent. */
export function cleanPath(path: string): string {
  return path.split("?")[0].replace(/\/$/, "") || "/";
}

/** Which content tab is current. The Content hub itself matches none of them. */
export function activeContentTab(path: string, kind: string | null): ContentTabId | null {
  const clean = cleanPath(path);
  if (clean.startsWith("/dashboard/media/menus")) return "menus";
  if (clean.startsWith("/dashboard/media/promos")) return "promotions";
  if (clean.startsWith("/dashboard/media/layout-studio")) return "studio";
  if (clean.startsWith("/dashboard/media/presentations")) return "presentations";
  if (clean.startsWith("/dashboard/playlists")) return "playlists";
  if (clean === "/dashboard/media") return kind === "presentation" ? "presentations" : "media";
  return null;
}

/** Pages that show the shared Content navigation in the dashboard shell. */
export function isContentPath(path: string): boolean {
  const clean = cleanPath(path);
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
