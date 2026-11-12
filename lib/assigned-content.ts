/** Assigned-content preview for a screen card. Uses only fields already on DisplayItem. No new API. */

import type { DisplayItem } from "@/lib/api";

export type AssignedKind = "image" | "video" | "menu-board" | "playlist" | "presentation" | "empty";

export type AssignedPreview = {
  /** Image URL suitable for an <img>. Null when no still exists in the current payload. */
  src: string | null;
  kind: AssignedKind;
  /** Short chip on the thumbnail, never implying a live TV feed. */
  label: "Assigned";
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
  if (PRESENTATION_EXT.test(fileName ?? "")) return IMAGE_EXT.test(url ?? "");
  return IMAGE_EXT.test(fileName ?? "") || IMAGE_EXT.test(url ?? "") || Boolean(url);
}

export function isProbablyPresentation(fileName?: string | null): boolean {
  return PRESENTATION_EXT.test(fileName ?? "");
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
 */
export function assignedContentPreview(display: DisplayItem): AssignedPreview {
  const name = assignedName(display);
  if (display.boardPreviewUrl) {
    return { src: display.boardPreviewUrl, kind: "menu-board", label: "Assigned", name };
  }
  if (display.media) {
    if (isProbablyPresentation(display.media.fileName)) {
      const src = display.media.url && isProbablyImage(display.media.fileName, display.media.url) ? display.media.url : null;
      return { src, kind: "presentation", label: "Assigned", name };
    }
    if (isProbablyVideo(display.media.fileName, display.media.url)) {
      return { src: null, kind: "video", label: "Assigned", name };
    }
    if (display.media.url) {
      return { src: display.media.url, kind: "image", label: "Assigned", name };
    }
  }
  if (display.playlist) {
    const src = display.playlist.url && !isProbablyVideo(display.playlist.name, display.playlist.url)
      ? display.playlist.url
      : null;
    return { src, kind: display.playlist.url ? "playlist" : "playlist", label: "Assigned", name };
  }
  return { src: null, kind: "empty", label: "Assigned", name };
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
