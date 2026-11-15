"use client";
import { useT } from "@/lib/i18n/client";

import { useRef, useState } from "react";
import { uploadArtImage } from "@/components/uploads";
import type { MediaItem } from "@/lib/api";
import { useConfirm } from "@/components/confirm";
import { duplicateImageMessage, sameLibraryImage } from "@/lib/media-dupes";
import { ART_UPLOAD_ACCEPT, artUploadError, directUploadStatus, openFilePicker, type DirectUploadState } from "@/lib/direct-upload";

/**
 * Upload a logo or photo without leaving the editor (E3). Uses the Media page's image
 * pipeline (same preparation, limit and endpoint), then hands the new media id back.
 */
export function DirectImageUpload({
  what,
  onUploaded,
  disabled,
  upload = uploadArtImage,
  library,
}: {
  what: "logo" | "photo";
  /** Called with the new media id, or with the existing one when the owner keeps the copy already in Media. */
  onUploaded: (id: string) => Promise<void> | void;
  disabled?: boolean;
  upload?: typeof uploadArtImage;
  /** The logo/photo choices already in Media, for the t("diu.dupTitle") check (QA U1-04d). */
  library?: MediaItem[];
}) {
  const t = useT();
  const [state, setState] = useState<DirectUploadState>({ phase: "idle" });
  const confirm = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.phase === "busy";
  const status = directUploadStatus(state, what, t);

  async function onFiles(files: File[]) {
    const file = files[0];
    if (!file || busy) return;
    const invalid = artUploadError(file, t);
    if (invalid) {
      setState({ phase: "error", message: invalid });
      return;
    }
    // Same choice the Media page gives (QA B1-10): keep the one already there, or upload a copy.
    const existing = sameLibraryImage(library, file);
    if (existing) {
      const copy = await confirm.ask({
        title: t("diu.dupTitle"),
        body: duplicateImageMessage(file.name, t),
        confirmLabel: t("diu.dupCopy"),
        cancelLabel: t("diu.dupKeep"),
      });
      if (!copy) {
        try {
          await onUploaded(existing.id);
          setState({ phase: "kept", name: existing.fileName });
        } catch (err) {
          setState({ phase: "error", message: (err as Error).message || t("common.somethingWrong") });
        }
        return;
      }
    }
    setState({ phase: "busy", name: file.name, progress: 0 });
    try {
      const id = await upload(file, (progress) => setState({ phase: "busy", name: file.name, progress }), t);
      await onUploaded(id);
      setState({ phase: "done", name: file.name });
    } catch (err) {
      setState({ phase: "error", message: (err as Error).message || t("common.somethingWrong") });
    }
  }

  return (
    <div className="grid gap-1" data-testid={`direct-upload-${what}`}>
      {/* A real button (mouse, Enter and Space) that opens the hidden file input directly (E3 hotfix). */}
      <button
        type="button"
        className="btn btn-quiet min-h-11 justify-self-start"
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onClick={() => openFilePicker(inputRef.current)}
      >
        {busy ? t("ed.uploading") : what === "logo" ? t("diu.logo") : t("diu.photo")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ART_UPLOAD_ACCEPT}
        disabled={disabled || busy}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={`direct-upload-${what}-input`}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void onFiles(files);
        }}
      />
      {confirm.node}
      <p className="text-xs text-muted">{t("diu.hint")}</p>
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
