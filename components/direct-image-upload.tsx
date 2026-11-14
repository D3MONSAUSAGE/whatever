"use client";

import { useState } from "react";
import { uploadArtImage } from "@/components/uploads";
import { ART_UPLOAD_ACCEPT, artUploadError, directUploadStatus, type DirectUploadState } from "@/lib/direct-upload";

/**
 * Upload a logo or photo without leaving the editor (E3). Uses the Media page's image
 * pipeline (same preparation, limit and endpoint), then hands the new media id back.
 */
export function DirectImageUpload({
  what,
  onUploaded,
  disabled,
  upload = uploadArtImage,
}: {
  what: "logo" | "photo";
  onUploaded: (id: string) => Promise<void> | void;
  disabled?: boolean;
  upload?: typeof uploadArtImage;
}) {
  const [state, setState] = useState<DirectUploadState>({ phase: "idle" });
  const busy = state.phase === "busy";
  const status = directUploadStatus(state, what);

  async function onFiles(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    const invalid = artUploadError(file);
    if (invalid) {
      setState({ phase: "error", message: invalid });
      return;
    }
    setState({ phase: "busy", name: file.name, progress: 0 });
    try {
      const id = await upload(file, (progress) => setState({ phase: "busy", name: file.name, progress }));
      await onUploaded(id);
      setState({ phase: "done", name: file.name });
    } catch (err) {
      setState({ phase: "error", message: (err as Error).message || "Something went wrong. Try again." });
    }
  }

  return (
    <div className="grid gap-1" data-testid={`direct-upload-${what}`}>
      <label className={`btn btn-quiet cursor-pointer min-h-11 justify-self-start ${disabled || busy ? "pointer-events-none opacity-60" : ""}`}>
        {busy ? "Uploading…" : what === "logo" ? "Upload a logo" : "Upload a photo"}
        <input
          type="file"
          accept={ART_UPLOAD_ACCEPT}
          disabled={disabled || busy}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void onFiles(files);
          }}
        />
      </label>
      <p className="text-xs text-muted">JPG or PNG, 15 MB or smaller. It's also saved in Media.</p>
      <p
        className={`text-sm ${state.phase === "error" ? "text-danger" : "text-muted"}`}
        role={state.phase === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}
