/**
 * Menu Builder video preview: which box a video may play in, which poster to show, and
 * which photo/video areas can be tapped. Pure helpers shared by the editor and tests.
 * The published PNG and the TV composition are unchanged.
 */
import { BOARD_H, BOARD_W, mediaVideoBox, type LayoutDocument, type ZoneBox } from "@/lib/layout-studio";

export type PreviewMedia = {
  id: string;
  name: string;
  kind: "image" | "video";
  url?: string | null;
  thumbnailUrl?: string | null;
};

export type VideoPreview = {
  box: ZoneBox;
  src: string | null;
  poster: string | null;
  fileName: string;
  mediaId: string;
  /** True when there is no still or thumbnail; the editor should draw a labeled fallback. */
  placeholder: boolean;
};

export type SelectedVideo = {
  id: string;
  name: string;
  /** True when the id is on the board but not in the loaded library list (or is not a video). */
  missing: boolean;
};

export type MediaHit = { id: "photo" | "video"; box: ZoneBox };

function isPlayableBox(box: ZoneBox) {
  if (box.w < 1 || box.h < 1) return false;
  // A full-board box would cover the menu. The player also rejects it.
  if (box.w >= BOARD_W && box.h >= BOARD_H) return false;
  return true;
}

/** The live preview for a board's selected video, or null when there is no video area (or no video). */
export function videoPreview(
  doc: LayoutDocument,
  library: PreviewMedia[] | null | undefined,
  stillHref?: string | null,
): VideoPreview | null {
  if (!doc.videoMediaId) return null;
  const box = mediaVideoBox(doc);
  if (!box || !isPlayableBox(box)) return null;
  const file = (library ?? []).find((item) => item.id === doc.videoMediaId);
  const src = file?.kind === "video" && file.url ? file.url : null;
  const thumb = file?.kind === "video" && file.thumbnailUrl ? file.thumbnailUrl : null;
  const poster = thumb || stillHref || null;
  return {
    box,
    src,
    poster,
    fileName: (file?.name ?? "").trim(),
    mediaId: doc.videoMediaId,
    placeholder: !poster,
  };
}

/** Keeps the selected video in the Photos dropdown even if the library list omitted it. */
export function selectedVideoOption(
  library: PreviewMedia[] | null | undefined,
  videoMediaId: string | null,
): SelectedVideo | null {
  if (!videoMediaId) return null;
  const file = (library ?? []).find((item) => item.id === videoMediaId);
  if (file?.kind === "video") return { id: file.id, name: file.name, missing: false };
  return { id: videoMediaId, name: file?.name ?? "", missing: true };
}

/**
 * Tappable photo/video regions for the Menu Builder preview.
 * Only the dedicated media box is included, never the full board or menu text.
 */
export function mediaHits(doc: LayoutDocument): MediaHit[] {
  const box = mediaVideoBox(doc);
  if (!box || !isPlayableBox(box)) return [];
  return [{ id: doc.videoMediaId ? "video" : "photo", box }];
}

export function boxStyle(box: ZoneBox, units: "px" | "percent"): {
  position: "absolute";
  left: number | string;
  top: number | string;
  width: number | string;
  height: number | string;
  objectFit: "cover";
  pointerEvents: "none";
} {
  if (units === "px") {
    return { position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, objectFit: "cover", pointerEvents: "none" };
  }
  return {
    position: "absolute",
    left: `${(box.x / BOARD_W) * 100}%`,
    top: `${(box.y / BOARD_H) * 100}%`,
    width: `${(box.w / BOARD_W) * 100}%`,
    height: `${(box.h / BOARD_H) * 100}%`,
    objectFit: "cover",
    pointerEvents: "none",
  };
}
