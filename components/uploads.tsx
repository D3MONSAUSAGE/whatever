"use client";
import { useT } from "@/lib/i18n/client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api, authToken, uploadForm } from "@/lib/api";
import { prepareImage } from "@/lib/prepare-image";
import { heicToJpegName, looksLikeHeic } from "@/lib/heic";
import { isImageUploadFile } from "@/lib/media-accept";
import { blobToBase64, prepareVideo, uploadToSignedUrl } from "@/lib/prepare-video";
import { useToast } from "@/components/toast";
import { UPLOAD_SUCCESS_TOAST_MS, bannerJobs, uploadSuccessCopy } from "@/lib/upload-notice";
import { makeT, type T } from "@/lib/i18n";

const EN: T = makeT("en");

const MAX = 15 * 1024 * 1024;
const PPTX_MAX = 50 * 1024 * 1024;

export type UploadJob = {
  key: string;
  name: string;
  progress: number;
  state: "queued" | "active" | "done" | "error";
  detail: string;
  playlistId?: string | null;
};

type UploadKind = "image" | "video" | "presentation";

type UploadsApi = {
  jobs: UploadJob[];
  busy: boolean;
  enqueue: (files: File[], kind: UploadKind) => void;
  dismiss: (key: string) => void;
};

const UploadsContext = createContext<UploadsApi | null>(null);

export function useUploads() {
  const value = useContext(UploadsContext);
  if (!value) throw new Error("Uploads are only available in the dashboard.");
  return value;
}

/** Uploads live for the whole dashboard visit, so opening another page does not drop them. */
export function UploadsProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const tail = useRef(Promise.resolve());

  const patch = useCallback((key: string, next: Partial<UploadJob>) => {
    setJobs((current) => current.map((job) => (job.key === key ? { ...job, ...next } : job)));
  }, []);

  const run = useCallback(async (files: File[], kind: UploadKind) => {
    const queue: UploadJob[] = files.map((file, index) => ({
      key: `${file.name}-${file.size}-${index}-${Date.now()}`,
      name: file.name,
      progress: 0,
      state: "queued",
      detail: t("up.waiting"),
    }));
    setJobs(queue);
    setBusy(true);
    let failed = 0;
    let firstError = "";
    let playlistHref: string | undefined;
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const key = queue[index].key;
      const detail =
        kind === "image" ? t("up.prepImage")
        : kind === "video" ? t("up.checkVideo")
        : t("up.checkPres");
      patch(key, { state: "active", detail });
      try {
        if (kind === "image") await uploadImage(file, (progress, d) => patch(key, { progress, detail: d, state: "active" }), t);
        else if (kind === "video") await uploadVideo(file, (progress, d) => patch(key, { progress, detail: d, state: "active" }), t);
        else {
          const result = await uploadPresentation(file, (progress, d) => patch(key, { progress, detail: d, state: "active" }), t);
          patch(key, { playlistId: result.playlistId });
          if (result.playlistId) playlistHref = `/dashboard/playlists/${result.playlistId}`;
        }
        patch(key, { state: "done", progress: 100, detail: t("up.uploaded") });
      } catch (err) {
        failed += 1;
        const message = (err as Error).message;
        if (!firstError) firstError = message;
        patch(key, { state: "error", detail: message });
      }
    }
    if (failed === 0) {
      toast.show(uploadSuccessCopy(files.length, kind, t), false, {
        durationMs: UPLOAD_SUCCESS_TOAST_MS,
        href: playlistHref,
        hrefLabel: playlistHref ? t("up.openPlaylist") : undefined,
      });
    } else if (files.length === 1) toast.show(firstError, true, { durationMs: null });
    else toast.show(t("up.failedSome", { failed, total: files.length, error: firstError }), true, { durationMs: null });
    setBusy(false);
  }, [patch, toast, t]);

  const recent = useRef(new Map<string, number>());
  const dismiss = useCallback((key: string) => {
    setJobs((current) => current.filter((job) => job.key !== key));
  }, []);

  const enqueue = useCallback((files: File[], kind: UploadKind) => {
    const now = Date.now();
    const fresh = files.filter((file) => {
      const key = `${kind}\0${file.name}\0${file.size}\0${file.lastModified}`;
      const seen = recent.current.get(key);
      if (seen != null && now - seen < 4000) return false;
      recent.current.set(key, now);
      return true;
    });
    if (!fresh.length) return;
    tail.current = tail.current.then(() => run(fresh, kind));
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
    <UploadsContext.Provider value={{ jobs, busy, enqueue, dismiss }}>
      {children}
      {toast.node}
    </UploadsContext.Provider>
  );
}

export function UploadProgress({ jobs: jobsOverride, onDismiss }: { jobs?: UploadJob[]; onDismiss?: (key: string) => void } = {}) {
  const t = useT();
  const uploads = useUploads();
  const jobs = bannerJobs(jobsOverride ?? uploads.jobs);
  const dismiss = onDismiss ?? uploads.dismiss;
  if (!jobs.length) return null;
  const active = jobs.some((job) => job.state === "queued" || job.state === "active");
  return (
    <ul className="card mb-6 divide-y divide-line" aria-label={t("up.aria")}>
      {active ? <li className="px-4 py-2 text-xs text-muted">{t("up.note")}</li> : null}
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
          {job.state === "error" ? (
            <>
              <p role="alert" className="text-sm text-danger mt-2">{job.detail}</p>
              <button type="button" className="btn btn-quiet min-h-11 mt-2" onClick={() => dismiss(job.key)}>{t("up.dismiss")}</button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

async function uploadImage(file: File, onProgress: (progress: number, detail: string) => void, t: T = EN) {
  if (!isImageUploadFile(file)) throw new Error(t("up.badImage"));
  if (file.size > MAX) throw new Error(t("up.imageTooBig"));
  onProgress(5, t("up.prepImage"));
  const blob = await prepareImage(file, t);
  onProgress(15, t("ed.uploading"));
  const form = new FormData();
  const uploadName = looksLikeHeic(file) ? heicToJpegName(file.name) : "image.jpg";
  form.append("file", blob, uploadName);
  form.append("name", looksLikeHeic(file) ? heicToJpegName(file.name) : file.name);
  const token = await authToken();
  return uploadForm("/api/media", form, token, (progress) => onProgress(Math.max(15, progress), t("ed.uploading")));
}

/**
 * Upload one logo or photo straight from an editor (E3). Same checks, image preparation,
 * 15 MB limit and /api/media endpoint as the Media page; it only also returns the new id
 * so the editor can select it.
 */
export async function uploadArtImage(file: File, onProgress: (progress: number, detail: string) => void, t: T = EN): Promise<string> {
  const result = await uploadImage(file, onProgress, t);
  if (!result?.id) throw new Error(t("common.somethingWrong"));
  return result.id;
}

async function uploadVideo(file: File, onProgress: (progress: number, detail: string) => void, t: T = EN) {
  onProgress(0, t("up.checkVideo"));
  const prepared = await prepareVideo(file);
  onProgress(5, t("up.uploadingVideo"));
  const signed = await api<{ mediaId: string; signedUrl: string; token: string }>("/api/media/upload", {
    method: "POST",
    body: JSON.stringify({ fileName: file.name, sizeBytes: file.size }),
  });
  await uploadToSignedUrl(signed.signedUrl, file, (progress) => onProgress(Math.max(5, Math.min(90, progress)), t("up.uploadingVideo")), file.name, signed.token);
  onProgress(92, t("ed.saving"));
  const thumbnailBase64 = await blobToBase64(prepared.thumbnail);
  const completed = await api<{ id: string; processingStatus?: string }>("/api/media/upload/complete", {
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
  onProgress(100, completed.processingStatus === "processing" ? t("up.convertingVideo") : t("up.uploaded"));
}

async function uploadPresentation(file: File, onProgress: (progress: number, detail: string) => void, t: T = EN) {
  const name = file.name || "presentation.pptx";
  const pdf = /\.pdf$/i.test(name);
  if (!pdf && !/\.pptx$/i.test(name)) throw new Error(t("up.badPres"));
  if (/\.pptm$/i.test(name)) throw new Error(t("up.macro"));
  if (file.size > PPTX_MAX) throw new Error(t("up.presTooBig"));
  if (file.size <= 0) throw new Error(t("up.empty"));

  onProgress(5, t("up.starting"));
  const signed = await api<{ mediaId: string; signedUrl: string }>("/api/media/presentation", {
    method: "POST",
    body: JSON.stringify({ fileName: name, sizeBytes: file.size }),
  });
  onProgress(10, pdf ? t("up.uploadingPdf") : t("up.uploadingPptx"));
  await uploadToSignedUrl(
    signed.signedUrl,
    file,
    (progress) => onProgress(Math.max(10, Math.min(55, 10 + progress * 0.45)), pdf ? t("up.uploadingPdf") : t("up.uploadingPptx")),
    name,
  );
  onProgress(60, t("up.convertingVideo"));
  const done = await finishPresentation(signed.mediaId, name, onProgress, t);
  onProgress(100, done.slideCount === 1 ? "1 slide ready" : `${done.slideCount} slides ready`);
  return { playlistId: done.playlistId };
}

async function finishPresentation(
  mediaId: string,
  fileName: string,
  onProgress: (progress: number, detail: string) => void,
  t: T = EN,
) {
  const token = await authToken();
  let stop = false;
  const watch = (async () => {
    while (!stop) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (stop) return;
      try {
        const status = await api<{ processingStatus?: string; processingDone?: number; slideCount?: number; processingError?: string | null }>(
          `/api/media/presentation/${mediaId}`,
        );
        const total = Number(status.slideCount ?? 0);
        const done = Number(status.processingDone ?? 0);
        if (status.processingStatus === "ready") {
          onProgress(96, total === 1 ? "1 slide ready" : `${total} slides ready`);
          return;
        }
        const percent = total > 0 ? 60 + Math.round(35 * Math.min(1, done / total)) : 64;
        onProgress(percent, total > 0 ? t("up.savingSlide", { n: Math.min(done + 1, total), total }) : t("up.convertingVideo"));
      } catch {
        onProgress(64, t("up.convertingVideo"));
      }
    }
  })();
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("/api/media/presentation/complete", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, fileName, asGroup: true, createPlaylist: false }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string; slideCount?: number; playlistId?: string | null; processingStatus?: string };
      if (res.status === 202) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (res.ok) return { slideCount: Number(payload.slideCount ?? 0), playlistId: payload.playlistId ?? null };
      if (res.status >= 500 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      throw new Error(payload.error || t("up.convertFailed"));
    }
  } finally {
    stop = true;
    await watch.catch(() => undefined);
  }
  throw new Error(t("up.convertFailed"));
}
