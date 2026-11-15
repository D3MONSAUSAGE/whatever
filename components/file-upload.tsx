"use client";
import { useT } from "@/lib/i18n/client";

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
  limitLabel,
}: {
  kind: FileUploadKind;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  multiple?: boolean;
  accept?: string;
  label?: string;
  buttonClass?: string;
  filename?: string | null;
  limitLabel?: string;
}) {
  const t = useT();
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
        {label ?? t(`fu.${kind}.label`)}
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
            setPicked(selectedFilename(files, t));
            onFiles(files);
          }}
        />
      </label>
      <p className="text-sm text-muted mt-1">{t(`fu.${kind}.accept`)}. {limitLabel ?? t("fu.limit", { mb: Math.round(meta.limitBytes / 1024 / 1024) })}.</p>
      <p className="text-sm mt-0.5" data-testid="upload-filename">
        {filename ? filename : t("fu.none")}
      </p>
    </div>
  );
}
