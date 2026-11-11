export type ContentTabId = "media" | "menus" | "promotions" | "studio" | "playlists" | "presentations";

export const CONTENT_TABS: { id: ContentTabId; href: string; label: string }[] = [
  { id: "media", href: "/dashboard/media", label: "Media" },
  { id: "menus", href: "/dashboard/media/menus", label: "Menus" },
  { id: "promotions", href: "/dashboard/media/promos", label: "Promotions" },
  { id: "studio", href: "/dashboard/media/layout-studio", label: "Layout Studio" },
  { id: "playlists", href: "/dashboard/playlists", label: "Playlists" },
  { id: "presentations", href: "/dashboard/media?kind=presentation", label: "Presentations" },
];

/** Which content tab is current. The Content hub itself matches none of them. */
export function activeContentTab(path: string, kind: string | null): ContentTabId | null {
  const clean = path.split("?")[0].replace(/\/$/, "") || "/";
  if (clean.startsWith("/dashboard/media/menus")) return "menus";
  if (clean.startsWith("/dashboard/media/promos")) return "promotions";
  if (clean.startsWith("/dashboard/media/layout-studio")) return "studio";
  if (clean.startsWith("/dashboard/media/presentations")) return "presentations";
  if (clean.startsWith("/dashboard/playlists")) return "playlists";
  if (clean === "/dashboard/media") return kind === "presentation" ? "presentations" : "media";
  return null;
}
