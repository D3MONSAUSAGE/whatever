import { MAX_VIDEO_MB } from "@/lib/mp4";
import { IMAGE_UPLOAD_ACCEPT, VIDEO_UPLOAD_ACCEPT } from "@/lib/media-accept";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");

export type FileUploadKind = "image" | "video" | "document";

export type FileUploadMeta = {
  kind: FileUploadKind;
  label: string;
  accept: string;
  acceptLabel: string;
  limitLabel: string;
  limitBytes: number;
};

/** Client-visible limits that already apply in the upload path. Picker UI only. */
export const FILE_UPLOAD: Record<FileUploadKind, FileUploadMeta> = {
  image: {
    kind: "image",
    label: "Upload image",
    accept: IMAGE_UPLOAD_ACCEPT,
    acceptLabel: "JPG, PNG, WebP, or HEIC",
    limitLabel: "15 MB or smaller",
    limitBytes: 15 * 1024 * 1024,
  },
  video: {
    kind: "video",
    label: "Upload video",
    accept: VIDEO_UPLOAD_ACCEPT,
    acceptLabel: "MP4, MOV, or M4V (H.264)",
    limitLabel: `${MAX_VIDEO_MB} MB or smaller`,
    limitBytes: MAX_VIDEO_MB * 1024 * 1024,
  },
  document: {
    kind: "document",
    label: "Upload document",
    accept: ".pptx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    acceptLabel: "PowerPoint (.pptx) or PDF",
    limitLabel: "50 MB or smaller",
    limitBytes: 50 * 1024 * 1024,
  },
};

export function selectedFilename(files: File[], t: T = EN): string {
  if (!files.length) return "";
  if (files.length === 1) return files[0].name;
  return t("fu.more", { name: files[0].name, count: files.length - 1 });
}
