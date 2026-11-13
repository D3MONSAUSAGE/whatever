/** Assigned-content preview for a screen card. Uses only fields already on DisplayItem. No new API. */

import type { DisplayItem } from "@/lib/api";

export type AssignedKind = "image" | "video" | "menu-board" | "playlist" | "presentation" | "empty";

export type AssignedPreview = {
  /** Image URL suitable for an <img>. Null when no still exists in the current payload. */
  src: string | null;
  kind: AssignedKind;
  /** Short chip on the thumbnail, never implying a live TV feed. Empty screens are not "Assigned". */
  label: "Assigned" | "No content";
  name: string;
};

const VIDEO_EXT = /\.(mp4|m4v|webm|mov)(\?|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i;
const PRESENTATION_EXT = /\.(pptx?|pdf)(\?|$)/i;

export function isProbablyVideo(fileName?: string | null, url?: string | null): boolean {
  return VIDEO_EXT.test(fileName ?? "") || VIDEO_EXT.test(url ?? "");
}

export function isProbablyImage(fileName?: string | null, url?: string | null): boolean {
  if (isProbablyVideo(fileName, url)) return false;
  if (isProbablyPresentation(fileName, url)) return IMAGE_EXT.test(url ?? "");
  return IMAGE_EXT.test(fileName ?? "") || IMAGE_EXT.test(url ?? "");
}

export function isProbablyPresentation(fileName?: string | null, url?: string | null): boolean {
  return PRESENTATION_EXT.test(fileName ?? "") || PRESENTATION_EXT.test(url ?? "");
}

/**
 * Only a recognizable still may be used as an <img> src. A signed PPTX/PDF path,
 * a raw video, or an extensionless private storage object is not a still.
 * Direct-assigned images with a file name like "dinner.png" still qualify even
 * when the signed URL itself has no extension.
 */
export function stillUrl(fileName?: string | null, url?: string | null): string | null {
  if (!url) return null;
  if (!isProbablyImage(fileName, url)) return null;
  return url;
}

function assignedName(display: DisplayItem): string {
  if (display.media) return display.media.fileName;
  if (display.playlist) return display.playlist.name;
  if (!display.connected) return "Waiting for the TV to finish pairing";
  return "No content assigned";
}

/**
 * Pick a still for the screen card from data the displays list already returns:
 * boardPreviewUrl (rendered menu board), playlist.url (first item or its video poster),
 * or media.url when it is an image. A raw video file is never used as an <img> src —
 * DisplayItem.media has no thumbnailUrl today, so those cards get a typed placeholder.
 * A presentation playlist's first item is often the PPTX itself (the API signs
 * storage_path, not thumbnail_path, for non-video media); that URL is not a still.
 */
export function assignedContentPreview(display: DisplayItem): AssignedPreview {
  const name = assignedName(display);
  if (display.boardPreviewUrl) {
    // Rendered menu-board PNGs come from the menus pipeline. Keep a signed path
    // even when it has no extension, but never use a video or PPTX as an <img>.
    const src = isProbablyVideo(null, display.boardPreviewUrl) || isProbablyPresentation(null, display.boardPreviewUrl)
      ? null
      : display.boardPreviewUrl;
    return { src, kind: "menu-board", label: "Assigned", name };
  }
  if (display.media) {
    if (isProbablyPresentation(display.media.fileName, display.media.url)) {
      const src = stillUrl(display.media.fileName, display.media.url);
      return { src, kind: "presentation", label: "Assigned", name };
    }
    if (isProbablyVideo(display.media.fileName, display.media.url)) {
      return { src: null, kind: "video", label: "Assigned", name };
    }
    if (display.media.url) {
      // Direct-assigned photos: fileName usually has an image extension; if it does
      // not, the signed URL is still the photo itself (video and presentations already returned).
      const src = stillUrl(display.media.fileName, display.media.url) ?? display.media.url;
      return { src, kind: "image", label: "Assigned", name };
    }
  }
  if (display.playlist) {
    // playlist.url is the signed first-item path. Use it only when it is clearly a still.
    const src = stillUrl(display.playlist.name, display.playlist.url);
    return { src, kind: "playlist", label: "Assigned", name };
  }
  return { src: null, kind: "empty", label: "No content", name };
}

export function assignedKindLabel(kind: AssignedKind): string {
  switch (kind) {
    case "image": return "Image";
    case "video": return "Video";
    case "menu-board": return "Menu board";
    case "playlist": return "Playlist";
    case "presentation": return "Presentation";
    default: return "No content";
  }
}
