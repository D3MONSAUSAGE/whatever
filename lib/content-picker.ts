export type PickerCategory = "all" | "picture" | "video" | "presentation" | "playlist" | "menu" | "layout";

export type PickerEntry = {
  id: string;
  fileName: string;
  category: Exclude<PickerCategory, "all">;
  /** Image preview only. Video files are not used as the img src. */
  thumbnailUrl: string | null;
  action: "select" | "publish";
};

export const PICKER_FILTERS: { id: PickerCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "picture", label: "Pictures" },
  { id: "video", label: "Videos" },
  { id: "presentation", label: "Presentations" },
  { id: "playlist", label: "Playlists" },
  { id: "menu", label: "Menus" },
  { id: "layout", label: "Layouts" },
];

export function pickerTypeLabel(category: Exclude<PickerCategory, "all">) {
  switch (category) {
    case "picture": return "Image";
    case "video": return "Video";
    case "presentation": return "Presentation";
    case "playlist": return "Playlist";
    case "menu": return "Menu";
    case "layout": return "Layout";
  }
}

type MediaRow = {
  id: string;
  fileName: string;
  kind?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  coverUrl?: string | null;
  sourceMediaId?: string | null;
};

export function buildScreenPickerEntries(input: {
  media: MediaRow[];
  playlists: { id: string; name: string; thumbnailUrl?: string | null }[];
  menus: { id: string; name: string; playlistId: string | null; imageUrl?: string | null }[];
  layouts: { id: string; name: string; thumbnailUrl?: string | null }[];
}): PickerEntry[] {
  const layoutIds = new Set(input.layouts.map((layout) => layout.id));
  const entries: PickerEntry[] = [];
  for (const item of input.media) {
    if (item.sourceMediaId) continue;
    if (item.kind === "video") {
      entries.push({
        id: item.id,
        fileName: item.fileName,
        category: "video",
        thumbnailUrl: item.thumbnailUrl || null,
        action: "publish",
      });
      continue;
    }
    if (item.kind === "presentation") {
      entries.push({
        id: item.id,
        fileName: item.fileName,
        category: "presentation",
        thumbnailUrl: item.thumbnailUrl || item.coverUrl || null,
        action: "publish",
      });
      continue;
    }
    entries.push({
      id: item.id,
      fileName: item.fileName,
      category: "picture",
      thumbnailUrl: item.thumbnailUrl || item.url || null,
      action: "select",
    });
  }
  for (const playlist of input.playlists) {
    entries.push({
      id: playlist.id,
      fileName: playlist.name,
      category: "playlist",
      thumbnailUrl: playlist.thumbnailUrl || null,
      action: "publish",
    });
  }
  for (const menu of input.menus) {
    if (!menu.playlistId || layoutIds.has(menu.id)) continue;
    entries.push({
      id: menu.playlistId,
      fileName: menu.name,
      category: "menu",
      thumbnailUrl: menu.imageUrl || null,
      action: "publish",
    });
  }
  for (const layout of input.layouts) {
    entries.push({
      id: layout.id,
      fileName: layout.name,
      category: "layout",
      thumbnailUrl: layout.thumbnailUrl || null,
      action: "publish",
    });
  }
  return entries;
}

export function filterPickerEntries(entries: PickerEntry[], query: string, category: PickerCategory) {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (needle && !entry.fileName.toLowerCase().includes(needle)) return false;
    return true;
  });
}

/** Pictures stay selected until another picture is chosen. Publishing still uses that id. */
export function pictureSelection(_selectedId: string, id: string) {
  return id;
}
