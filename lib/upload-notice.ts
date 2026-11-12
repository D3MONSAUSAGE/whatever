/** Success toast lifetime for a finished upload. Errors are not on this timer. */
export const UPLOAD_SUCCESS_TOAST_MS = 5_000;

export function bannerJobs<T extends { state: string }>(jobs: T[]) {
  return jobs.filter((job) => job.state !== "done");
}

/**
 * Milliseconds until a toast dismisses itself.
 * `null` means it stays until the person dismisses it (upload errors).
 */
export function toastDurationMs(error: boolean, durationMs?: number | null) {
  if (durationMs === null) return null;
  if (typeof durationMs === "number") return durationMs;
  return error ? 8_000 : 3_500;
}

export function armToastTimer(
  error: boolean,
  durationMs: number | null | undefined,
  dismiss: () => void,
  schedule: (fn: () => void, ms: number) => number,
) {
  const ms = toastDurationMs(error, durationMs);
  if (ms == null) return null;
  return schedule(dismiss, ms);
}

export function uploadSuccessCopy(count: number, kind: "image" | "video" | "presentation") {
  if (kind === "presentation") return count === 1 ? "Presentation uploaded" : `Uploaded ${count} presentations`;
  return count === 1 ? "Uploaded" : `Uploaded ${count} files`;
}
