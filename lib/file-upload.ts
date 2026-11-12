import { MAX_VIDEO_MB } from "@/lib/mp4";

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
    accept: "image/jpeg,image/png,image/webp",
    acceptLabel: "JPG, PNG, or WebP",
    limitLabel: "15 MB or smaller",
    limitBytes: 15 * 1024 * 1024,
  },
  video: {
    kind: "video",
    label: "Upload video",
    accept: "video/mp4,.mp4",
    acceptLabel: "MP4 (H.264)",
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

export function selectedFilename(files: File[]): string {
  if (!files.length) return "";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} and ${files.length - 1} more`;
}
