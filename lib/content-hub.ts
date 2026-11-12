/** Content landing categories. Promotions copy and position live here so they are easy to change. */

export type ContentCategoryId = "media" | "menus" | "promotions" | "playlists" | "presentations";

export type ContentCategory = {
  id: ContentCategoryId;
  title: string;
  href: string;
  createHref: string;
  createLabel: string;
  lede: string;
};

/**
 * Promotions card for the Content landing page.
 * Pantalla's verdict: keep both Promotions and Menu boards (editors and data).
 * They share a playback path but do different jobs. Do not merge or remove either.
 * Create must open /dashboard/media/promos, never the layout picker.
 */
export const PROMOTIONS_CARD: ContentCategory = {
  id: "promotions",
  title: "Promotions",
  href: "/dashboard/media/promos",
  createHref: "/dashboard/media/promos?new=1",
  createLabel: "Create promotion",
  lede: "A special, deal or happy-hour slide. Add it to a menu, or set dates so it comes and goes on its own.",
};

/** Five category cards, in display order. Move PROMOTIONS_CARD to change its position. */
export const CONTENT_CATEGORIES: ContentCategory[] = [
  {
    id: "media",
    title: "Media",
    href: "/dashboard/media",
    createHref: "/dashboard/media",
    createLabel: "Upload media",
    lede: "Pictures, video, and documents in your library.",
  },
  {
    id: "menus",
    title: "Menu boards",
    href: "/dashboard/media/menus",
    createHref: "/dashboard/media/menus?new=1",
    createLabel: "Create menu board",
    lede: "A full-screen menu or layout for your TVs.",
  },
  PROMOTIONS_CARD,
  {
    id: "playlists",
    title: "Playlists",
    href: "/dashboard/playlists",
    createHref: "/dashboard/playlists",
    createLabel: "Create playlist",
    lede: "A sequence of slides to play on your screens.",
  },
  {
    id: "presentations",
    title: "Presentations",
    href: "/dashboard/media?kind=presentation",
    createHref: "/dashboard/media?kind=presentation",
    createLabel: "Upload presentation",
    lede: "A PowerPoint or PDF, shown as ordered slides.",
  },
];

export type ContentRecentItem = {
  id: string;
  name: string;
  href: string;
  kind: ContentCategoryId;
  kindLabel: string;
};

export type ContentHubFixture = {
  recent: ContentRecentItem[];
};

const KIND_LABEL: Record<ContentCategoryId, string> = {
  media: "Media",
  menus: "Menu boards",
  promotions: "Promotions",
  playlists: "Playlists",
  presentations: "Presentations",
};

export function kindLabel(kind: ContentCategoryId): string {
  return KIND_LABEL[kind];
}

/** Up to `limit` recent items for one category, keeping Menu boards and Promotions in separate lists. */
export function recentFor(items: ContentRecentItem[], kind: ContentCategoryId, limit = 3): ContentRecentItem[] {
  return items.filter((item) => item.kind === kind).slice(0, limit);
}

export function promotionsCreateOpensPromoEditor(href: string): boolean {
  return href.startsWith("/dashboard/media/promos") && !href.includes("menus") && !href.includes("layout");
}
