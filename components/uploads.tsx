"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, authToken, uploadForm } from "@/lib/api";
import { prepareImage } from "@/lib/prepare-image";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { useToast } from "@/components/toast";

const TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX = 15 * 1024 * 1024;

export type UploadJob = {
  key: string;
  name: string;
  progress: number;
  state: "queued" | "active" | "done" | "error";
  detail: string;
};

type UploadsApi = {
  jobs: UploadJob[];
  busy: boolean;
  enqueue: (files: File[], kind: "image" | "video") => void;
};

const UploadsContext = createContext<UploadsApi | null>(null);

export function useUploads() {
  const value = useContext(UploadsContext);
  if (!value) throw new Error("Uploads are only available in the dashboard.");
  return value;
}

/** Uploads live for the whole dashboard visit, so opening another page does not drop them. */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const tail = useRef(Promise.resolve());

  const patch = useCallback((key: string, next: Partial<UploadJob>) => {
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...next } : job)));
  }, []);

  const run = useCallback(async (files: File[], kind: "image" | "video") => {
    const queue: UploadJob[] = files.map((file, index) => ({
      key: `${file.name}-${file.size}-${index}-${Date.now()}`,
      name: file.name,
      progress: 0,
      state: "queued",
      detail: "Waiting",
    }));
    setJobs(queue);
    setBusy(true);
    let failed = 0;
    let firstError = "";
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const key = queue[index].key;
      patch(key, { state: "active", detail: kind === "image" ? "Preparing image…" : "Checking video…" });
      try {
        if (kind === "image") await uploadImage(file, (progress, detail) => patch(key, { progress, detail, state: "active" }));
        else await uploadVideo(file, (progress, detail) => patch(key, { progress, detail, state: "active" }));
        patch(key, { state: "done", progress: 100, detail: "Uploaded" });
      } catch (err) {
        failed += 1;
        const message = (err as Error).message;
        if (!firstError) firstError = message;
        patch(key, { state: "error", detail: message });
      }
    }
    if (failed === 0) toast.show(files.length === 1 ? "Uploaded" : `Uploaded ${files.length} files`);
    else if (files.length === 1) toast.show(firstError, true);
    else toast.show(`${failed} of ${files.length} files could not be uploaded. ${firstError}`, true);
    setBusy(false);
  }, [patch, toast]);

  const enqueue = useCallback((files: File[], kind: "image" | "video") => {
    if (!files.length) return;
    tail.current = tail.current.then(() => run(files, kind));
  }, [run]);

  const inFlight = jobs.some((job) => job.state === "queued" || job.state === "active");
  useEffect(() => {
    if (!inFlight) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inFlight]);

  return (
    <UploadsContext.Provider value={{ jobs, busy, enqueue }}>
      {children}
      {toast.node}
    </UploadsContext.Provider>
  );
}

export function UploadProgress() {
  const { jobs } = useUploads();
  if (!jobs.length) return null;
  const active = jobs.some((job) => job.state === "queued" || job.state === "active");
  return (
    <ul className="card mb-6 divide-y divide-line" aria-label="Upload progress">
      {active ? <li className="px-4 py-2 text-xs text-muted">Uploads keep going if you open another page. Leaving the site stops them.</li> : null}
      {jobs.map((job) => (
        <li key={job.key} className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium truncate">{job.name}</span>
            <span className={job.state === "error" ? "text-danger" : "text-muted"}>
              {job.state === "active" || job.state === "queued" ? `${job.progress}%` : job.detail}
            </span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress} aria-label={job.name}>
            <div className={`h-full ${job.state === "error" ? "bg-danger" : "bg-primary"}`} style={{ width: `${job.progress}%` }} />
          </div>
          {job.state === "error" ? <p className="text-sm text-danger mt-2">{job.detail}</p> : null}
        </li>
      ))}
    </ul>
  );
}

async function uploadImage(file: File, onProgress: (progress: number, detail: string) => void) {
  if (!TYPES.includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > MAX) throw new Error("Images must be 15 MB or smaller.");
  onProgress(5, "Preparing image…");
  const blob = await prepareImage(file);
  onProgress(15, "Uploading…");
  const form = new FormData();
  form.append("file", blob, "image.jpg");
  form.append("name", file.name);
  const token = await authToken();
  await uploadForm("/api/media", form, token, (progress) => onProgress(Math.max(15, progress), "Uploading…"));
}

async function uploadVideo(file: File, onProgress: (progress: number, detail: string) => void) {
  onProgress(0, "Checking video…");
  const prepared = await prepareVideo(file);
  onProgress(5, "Uploading video…");
  const signed = await api<{ mediaId: string; signedUrl: string }>("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
  });
  await uploadToSignedUrl(signed.signedUrl, file, (progress) => onProgress(Math.max(5, Math.min(90, progress)), "Uploading video…"));
  onProgress(92, "Saving…");
  const thumbnailBase64 = await blobToBase64(prepared.thumbnail);
  await api("/api/media/upload/complete", {
    method: "POST",
    body: JSON.stringify({
      mediaId: signed.mediaId,
      fileName: file.name,
      durationMs: prepared.durationMs,
      width: prepared.width,
      height: prepared.height,
      thumbnailBase64,
    }),
  });
  onProgress(100, "Uploaded");
}
