/**
 * E3: upload a logo or photo straight from Brand Kit or the classic editor.
 * Only JPG and PNG are offered, because only those appear in the logo and photo
 * pickers (see artImages in lib/brand-kit.ts). Size limits are the existing 15 MB.
 */
export const ART_UPLOAD_ACCEPT = "image/jpeg,image/png";
export const ART_UPLOAD_TYPES = ["image/jpeg", "image/png"] as const;

export type DirectUploadState =
  | { phase: "idle" }
  | { phase: "busy"; name: string; progress: number }
  | { phase: "done"; name: string }
  | { phase: "kept"; name: string }
  | { phase: "error"; message: string };

/** Reject files the logo/photo pickers could not list, before anything is sent. */
export function artUploadError(file: Pick<File, "type" | "name">): string | null {
  if (!(ART_UPLOAD_TYPES as readonly string[]).includes(file.type) || !/\.(png|jpe?g)$/i.test(file.name)) {
    return "Choose a JPG or PNG image.";
  }
  return null;
}

export function directUploadStatus(state: DirectUploadState, what: "logo" | "photo"): string {
  switch (state.phase) {
    case "busy":
      return `Uploading ${state.name}… ${Math.round(state.progress)}%`;
    case "done":
      return what === "logo"
        ? `Uploaded ${state.name} to Media and selected. Click Save brand to apply.`
        : `Uploaded ${state.name} to Media and selected. Save the board to apply.`;
    case "kept":
      return what === "logo"
        ? `Selected ${state.name} from your library. Click Save brand to apply.`
        : `Selected ${state.name} from your library. Save the board to apply.`;
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
