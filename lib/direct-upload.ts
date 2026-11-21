import { makeT, type T } from "@/lib/i18n";
import { ART_UPLOAD_ACCEPT, isArtUploadFile } from "@/lib/media-accept";

const EN: T = makeT("en");

/**
 * E3: upload a logo or photo straight from Brand Kit or the classic editor.
 * JPG, PNG, and HEIC are offered. HEIC is converted to JPEG before upload so it
 * appears in the logo and photo pickers (see artImages in lib/brand-kit.ts). Size
 * limits are the existing 15 MB. WebP stays out of this picker.
 */
export { ART_UPLOAD_ACCEPT };

export type DirectUploadState =
  | { phase: "idle" }
  | { phase: "busy"; name: string; progress: number }
  | { phase: "done"; name: string }
  | { phase: "kept"; name: string }
  | { phase: "error"; message: string };

/** Reject files the logo/photo pickers could not list, before anything is sent. */
export function artUploadError(file: Pick<File, "type" | "name">, t: T = EN): string | null {
  if (!isArtUploadFile(file)) {
    return t("diu.badType");
  }
  return null;
}

export function directUploadStatus(state: DirectUploadState, what: "logo" | "photo", t: T = EN): string {
  switch (state.phase) {
    case "busy":
      return t("diu.progress", { name: state.name, pct: Math.round(state.progress) });
    case "done":
      return what === "logo"
        ? t("diu.doneBrand", { name: state.name })
        : t("diu.doneBoard", { name: state.name });
    case "kept":
      return what === "logo"
        ? t("diu.keptBrand", { name: state.name })
        : t("diu.keptBoard", { name: state.name });
    case "error":
      return state.message;
    default:
      return "";
  }
}

/**
 * Open the browser's file chooser for a hidden file input (E3 hotfix). Called from the
 * button's click handler, so it runs inside the user's click or key press.
 */
export function openFilePicker(input: Pick<HTMLInputElement, "click" | "disabled"> | null): boolean {
  if (!input || input.disabled) return false;
  input.click();
  return true;
}
