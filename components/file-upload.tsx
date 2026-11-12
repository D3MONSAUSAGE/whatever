"use client";

import { useId, useState } from "react";
import { FILE_UPLOAD, selectedFilename, type FileUploadKind } from "@/lib/file-upload";

export function FileUploadControl({
  kind,
  onFiles,
  disabled,
  multiple,
  accept,
  label,
  buttonClass,
  filename: filenameOverride,
}: {
  kind: FileUploadKind;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  label?: string;
  buttonClass?: string;
  filename?: string | null;
}) {
  const meta = FILE_UPLOAD[kind];
  const inputId = useId();
  const [picked, setPicked] = useState("");
  const filename = filenameOverride !== undefined ? (filenameOverride ?? "") : picked;

  return (
    <div className="min-w-0" data-testid={`file-upload-${kind}`}>
      <label
        htmlFor={inputId}
        className={buttonClass ?? `btn btn-quiet cursor-pointer min-h-11 ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {label ?? meta.label}
        <input
          id={inputId}
          type="file"
          accept={accept ?? meta.accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            if (!files.length) return;
            setPicked(selectedFilename(files));
            onFiles(files);
          }}
        />
      </label>
      <p className="text-sm text-muted mt-1">{meta.acceptLabel}. {meta.limitLabel}.</p>
      <p className="text-sm mt-0.5" data-testid="upload-filename">
        {filename ? filename : "No file chosen yet."}
      </p>
    </div>
  );
}
