import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  MAX_CONVERT_EDGE,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_DURATION_MS,
  conversionDecision,
  enforceVideoLimits,
  inspectMp4,
  memorySource,
  mp4ErrorMessage,
  probeMp4,
  type ConversionCandidate,
  type ByteSource,
} from "@/lib/mp4";
import { isUuid, sha256 } from "@/lib/server/crypto";
import { BUCKET, db } from "@/lib/server/supabase";
import { removeStored } from "@/lib/server/video";
import { getConversionProvider, type ConversionProvider } from "@/lib/server/conversion-provider";

/** Exactly "1", same convention as LAYOUT_STUDIO. Unset in production until Francisco approves activation. */
export function hevcConversionEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HEVC_CONVERSION_ENABLED === "1";
}

/** $15.00 expressed in thousandths of a US dollar. */
export const CONVERSION_CAP_MILLIS = 15_000;
/** Coconut HD output: $0.015 per output minute (docs fetched 21 Nov 2026). */
export const HD_RATE_MILLIS_PER_MINUTE = 15;
export const CONVERSION_PROVIDER = "coconut";

export type ConversionErrorCode =
  | "conversion_failed"
  | "conversion_invalid_output"
  | "conversion_budget"
  | "conversion_provider"
  | "conversion_unavailable";

export function budgetMonthStart(now = new Date(), timeZone = "America/Los_Angeles"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Couldn't compute the conversion budget month.");
  return `${year}-${month}-01`;
}

/** Worst-case reserve: one HD output, at least one billed minute, at most our 3-minute limit. */
export function reserveMillisForDuration(durationMs: number): number {
  const minutes = Math.max(1, Math.min(3, Math.ceil(Math.max(0, durationMs) / 60_000)));
  return HD_RATE_MILLIS_PER_MINUTE * minutes;
}

export function canAcceptReservation(
  reservedMillis: number,
  spentMillis: number,
  amountMillis: number,
  capMillis = CONVERSION_CAP_MILLIS,
): boolean {
  if (!Number.isInteger(amountMillis) || amountMillis <= 0) return false;
  if (!Number.isInteger(reservedMillis) || reservedMillis < 0) return false;
  if (!Number.isInteger(spentMillis) || spentMillis < 0) return false;
  return reservedMillis + spentMillis + amountMillis <= capMillis;
}

/** Actual charge after a successful Coconut job: same rate, based on output duration, never above the reserve. */
export function actualMillisForOutput(durationMs: number, reservedMillis: number): number {
  const actual = reserveMillisForDuration(durationMs);
  return Math.min(actual, reservedMillis);
}

export async function inspectForConversion(
  source: ByteSource,
  sizeBytes: number,
): Promise<ConversionCandidate | { convertible: false; message: string; status: number }> {
  const probe = await probeMp4(source);
  const decision = conversionDecision(probe, sizeBytes);
  if (!decision.convertible) {
    const reason = decision.reason === "unsupported" ? "codec" : decision.reason;
    const status = reason === "size" ? 413 : 415;
    return { convertible: false, message: mp4ErrorMessage(reason), status };
  }
  return decision;
}

export function newWebhookToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("hex");
  return { token, hash: sha256(token) };
}

export function webhookTokenMatches(token: string, hash: string): boolean {
  if (!token || !hash) return false;
  const left = Buffer.from(sha256(token));
  const right = Buffer.from(hash);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function originalVideoPath(accountId: string, mediaId: string) {
  return `${accountId}/${mediaId}.mp4`;
}

export function convertedVideoPath(accountId: string, mediaId: string) {
  return `${accountId}/${mediaId}.converted.mp4`;
}

export function isJobStoragePath(accountId: string, mediaId: string, path: string): boolean {
  const allowed = new Set([
    originalVideoPath(accountId, mediaId),
    convertedVideoPath(accountId, mediaId),
    `${accountId}/${mediaId}-thumb.jpg`,
  ]);
  return allowed.has(path) && path.startsWith(`${accountId}/`);
}

export type ConversionStart = {
  accountId: string;
  mediaId: string;
  fileName: string;
  sizeBytes: number;
  candidate: ConversionCandidate;
  thumbnailPath: string | null;
  thumbBytes?: Uint8Array | null;
};

export type ConversionStartResult =
  | { ok: true; mediaId: string; processingStatus: "processing" }
  | { ok: false; message: string; status: number; code?: ConversionErrorCode };

/**
 * Insert a processing media row, reserve budget, and submit the provider job.
 * On any failure before submit succeeds, stored objects for this id are removed and no job stays reserved.
 */
export async function startVideoConversion(
  input: ConversionStart,
  deps: { provider?: ConversionProvider } = {},
): Promise<ConversionStartResult> {
  if (!hevcConversionEnabled()) {
    return { ok: false, message: mp4ErrorMessage("codec"), status: 415 };
  }
  const path = originalVideoPath(input.accountId, input.mediaId);
  const outputPath = convertedVideoPath(input.accountId, input.mediaId);
  const thumbPath = input.thumbnailPath;
  const reserved = reserveMillisForDuration(input.candidate.durationMs);
  const month = budgetMonthStart();
  const { token, hash } = newWebhookToken();

  if (input.thumbBytes && thumbPath) {
    const uploaded = await db().storage.from(BUCKET).upload(thumbPath, input.thumbBytes, {
      contentType: "image/jpeg",
      cacheControl: "86400",
      upsert: false,
    });
    if (uploaded.error && !alreadyExists(uploaded.error)) {
      await removeStored([path, thumbPath]);
      return { ok: false, message: "Couldn't save the preview image for that video. Try again.", status: 415 };
    }
  }

  const inserted = await db().from("media").insert({
    id: input.mediaId,
    account_id: input.accountId,
    file_name: input.fileName,
    storage_path: path,
    mime_type: "video/mp4",
    size_bytes: input.sizeBytes,
    kind: "video",
    duration_ms: input.candidate.durationMs,
    width: input.candidate.width,
    height: input.candidate.height,
    thumbnail_path: input.thumbBytes && thumbPath ? thumbPath : null,
    processing_status: "processing",
    processing_error: null,
  });
  if (inserted.error) {
    await removeStored([path, thumbPath, outputPath].filter(Boolean) as string[]);
    return { ok: false, message: "Couldn't save that video. Try again.", status: 500 };
  }

  const reservedJob = await db().rpc("reserve_video_conversion", {
    p_account_id: input.accountId,
    p_media_id: input.mediaId,
    p_month: month,
    p_reserved_millis: reserved,
    p_webhook_token_hash: hash,
    p_input_codec: input.candidate.videoCodec,
    p_input_duration_ms: input.candidate.durationMs,
    p_input_width: input.candidate.width,
    p_input_height: input.candidate.height,
    p_input_path: path,
    p_output_path: outputPath,
    p_provider: CONVERSION_PROVIDER,
  });
  if (reservedJob.error || !reservedJob.data) {
    const budget = isBudgetError(reservedJob.error);
    await abortFreshJob(input.accountId, input.mediaId, [path, thumbPath, outputPath]);
    if (budget) {
      return {
        ok: false,
        message: "This month's video conversion budget is fully reserved. Export the video as H.264 (Most Compatible), or try again next month.",
        status: 429,
        code: "conversion_budget",
      };
    }
    return {
      ok: false,
      message: "Couldn't start video conversion. Try again, or export the video as H.264 (Most Compatible).",
      status: 503,
      code: "conversion_unavailable",
    };
  }

  const jobId = String(reservedJob.data);
  const provider = deps.provider ?? getConversionProvider();
  if (!provider) {
    await releaseAndFail(jobId, "conversion_provider", 0);
    await abortFreshJob(input.accountId, input.mediaId, [path, thumbPath, outputPath]);
    return {
      ok: false,
      message: "Couldn't start video conversion. Try again, or export the video as H.264 (Most Compatible).",
      status: 503,
      code: "conversion_provider",
    };
  }

  try {
    const webhookUrl = conversionWebhookUrl(token, jobId);
    const inputUrl = await signedInputUrl(path);
    const submitted = await provider.submit({
      jobId,
      inputUrl,
      webhookUrl,
      outputPath,
      token,
    });
    const marked = await db().rpc("mark_video_conversion_submitted", {
      p_job_id: jobId,
      p_provider_job_id: submitted.providerJobId,
    });
    if (marked.error) throw new Error(marked.error.message);
  } catch (error) {
    console.error("video conversion submit failed", error instanceof Error ? error.message : "unknown");
    await releaseAndFail(jobId, "conversion_provider", 0);
    await abortFreshJob(input.accountId, input.mediaId, [path, thumbPath, outputPath]);
    return {
      ok: false,
      message: "Couldn't start video conversion. Try again, or export the video as H.264 (Most Compatible).",
      status: 503,
      code: "conversion_provider",
    };
  }

  return { ok: true, mediaId: input.mediaId, processingStatus: "processing" };
}

export type WebhookHandleResult = { ok: true; status: "ready" | "failed" | "ignored" } | { ok: false; http: number; message: string };

export async function handleConversionWebhook(
  body: unknown,
  token: string,
  deps: { provider?: ConversionProvider; fetchOutput?: (url: string) => Promise<Uint8Array> } = {},
): Promise<WebhookHandleResult> {
  if (!token || token.length < 16 || token.length > 200) return { ok: false, http: 401, message: "unauthorized" };
  const event = parseProviderEvent(body);
  if (!event) return { ok: false, http: 400, message: "bad event" };

  if (!isUuid(event.jobId)) return { ok: false, http: 404, message: "not found" };
  const found = await db()
    .from("video_conversion_jobs")
    .select("id, account_id, media_id, status, webhook_token_hash, reserved_millis, input_path, output_path, provider_job_id")
    .eq("id", event.jobId)
    .maybeSingle();
  if (found.error) return { ok: false, http: 503, message: "unavailable" };
  if (!found.data) return { ok: false, http: 404, message: "not found" };
  const job = found.data;
  if (!webhookTokenMatches(token, String(job.webhook_token_hash))) {
    return { ok: false, http: 401, message: "unauthorized" };
  }
  if (job.status === "ready" || job.status === "failed" || job.status === "released") {
    return { ok: true, status: "ignored" };
  }

  const accountId = String(job.account_id);
  const mediaId = String(job.media_id);
  const inputPath = String(job.input_path);
  const outputPath = String(job.output_path ?? convertedVideoPath(accountId, mediaId));
  if (!isJobStoragePath(accountId, mediaId, inputPath) || !isJobStoragePath(accountId, mediaId, outputPath)) {
    await finishJob(String(job.id), "failed", "conversion_failed", 0);
    return { ok: true, status: "failed" };
  }

  if (event.failed) {
    await cleanupJobFiles(accountId, mediaId, [inputPath, outputPath]);
    await finishJob(String(job.id), "failed", "conversion_failed", 0);
    await markMedia(accountId, mediaId, "failed", "conversion_failed");
    return { ok: true, status: "failed" };
  }

  try {
    const provider = deps.provider ?? getConversionProvider();
    const bytes = deps.fetchOutput
      ? await deps.fetchOutput(event.outputUrl ?? "")
      : await provider!.downloadOutput({ outputUrl: event.outputUrl, outputPath, accountId, mediaId });
    if (!bytes || bytes.byteLength < 8 || bytes.byteLength > MAX_VIDEO_BYTES) {
      throw new ValidationError("conversion_invalid_output");
    }
    const inspected = await inspectMp4(memorySource(bytes));
    if (!inspected.ok) throw new ValidationError("conversion_invalid_output");
    const limited = enforceVideoLimits(inspected, bytes.byteLength);
    if (limited) throw new ValidationError("conversion_invalid_output");

    const uploaded = await db().storage.from(BUCKET).upload(outputPath, bytes, {
      contentType: "video/mp4",
      cacheControl: "86400",
      upsert: true,
    });
    if (uploaded.error) throw new Error(uploaded.error.message);

    // Replace the original only after the output has passed inspectMp4.
    const replaced = await db().storage.from(BUCKET).copy(outputPath, inputPath);
    // Some storage backends expose move/copy differently; fall back to an upsert of the validated bytes.
    if (replaced.error) {
      const write = await db().storage.from(BUCKET).upload(inputPath, bytes, {
        contentType: "video/mp4",
        cacheControl: "86400",
        upsert: true,
      });
      if (write.error) throw new Error(write.error.message);
    }
    await removeIfOwned(accountId, mediaId, outputPath);

    const actual = actualMillisForOutput(inspected.durationMs, Number(job.reserved_millis));
    await finishJob(String(job.id), "ready", null, actual);
    await db()
      .from("media")
      .update({
        processing_status: "ready",
        processing_error: null,
        mime_type: "video/mp4",
        size_bytes: bytes.byteLength,
        duration_ms: inspected.durationMs,
        width: inspected.width,
        height: inspected.height,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mediaId)
      .eq("account_id", accountId);
    return { ok: true, status: "ready" };
  } catch (error) {
    const code = error instanceof ValidationError ? error.code : "conversion_failed";
    const charged = error instanceof ValidationError;
    const actual = charged ? Number(job.reserved_millis) : 0;
    await cleanupJobFiles(accountId, mediaId, [inputPath, outputPath]);
    await finishJob(String(job.id), "failed", code, actual);
    await markMedia(accountId, mediaId, "failed", code);
    return { ok: true, status: "failed" };
  }
}

class ValidationError extends Error {
  constructor(readonly code: ConversionErrorCode) {
    super(code);
  }
}

type ProviderEvent = { jobId: string; failed: boolean; outputUrl?: string };

function parseProviderEvent(body: unknown): ProviderEvent | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  // Our adapter also accepts a normalized { jobId, status, outputUrl }.
  if (typeof record.jobId === "string" && record.jobId) {
    const status = String(record.status ?? record.event ?? "completed");
    const failed = /fail|error/i.test(status);
    const outputUrl = typeof record.outputUrl === "string" ? record.outputUrl : undefined;
    return { jobId: record.jobId, failed, outputUrl };
  }
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : record;
  const job = data.job && typeof data.job === "object" ? data.job as Record<string, unknown> : data;
  const id = String(job.id ?? job.job_id ?? record.id ?? "");
  if (!id) return null;
  const params = (record.params ?? job.params ?? data.params) as Record<string, unknown> | undefined;
  const jobId = typeof params?.jobId === "string" ? params.jobId : typeof record.metadata === "object" && record.metadata && typeof (record.metadata as { jobId?: string }).jobId === "string"
    ? (record.metadata as { jobId: string }).jobId
    : "";
  // Coconut notifications include the Coconut job id; we look up by our job id in params, or map via provider_job_id later.
  const ourId = jobId || (typeof params?.pekko_job_id === "string" ? params.pekko_job_id : "");
  const event = String(record.event ?? data.event ?? record.type ?? "job.completed");
  const failed = event.includes("failed") || event.includes("error") || record.status === "job.failed";
  const outputs = record.outputs ?? data.outputs ?? job.outputs;
  let outputUrl: string | undefined;
  if (Array.isArray(outputs)) {
    const first = outputs.find((item) => item && typeof item === "object" && typeof (item as { url?: string }).url === "string") as { url?: string } | undefined;
    outputUrl = first?.url;
  } else if (outputs && typeof outputs === "object") {
    const values = Object.values(outputs as Record<string, unknown>);
    for (const value of values) {
      if (typeof value === "string" && /^https?:/i.test(value)) {
        outputUrl = value;
        break;
      }
      if (value && typeof value === "object" && typeof (value as { url?: string }).url === "string") {
        outputUrl = (value as { url: string }).url;
        break;
      }
    }
  }
  if (ourId) return { jobId: ourId, failed, outputUrl };
  return { jobId: id, failed, outputUrl };
}

export async function lookupJobByProviderId(providerJobId: string, token: string) {
  const found = await db()
    .from("video_conversion_jobs")
    .select("id, webhook_token_hash")
    .eq("provider_job_id", providerJobId)
    .maybeSingle();
  if (found.error || !found.data) return null;
  if (!webhookTokenMatches(token, String(found.data.webhook_token_hash))) return null;
  return String(found.data.id);
}

function conversionWebhookUrl(token: string, jobId: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_APP_URL is not set");
  const url = new URL(`${base}/api/webhooks/video-conversion`);
  url.searchParams.set("token", token);
  url.searchParams.set("pekko_job_id", jobId);
  return url.toString();
}

/** Pull the per-job token and ids out of a Coconut webhook URL and JSON body.
 *  Coconut `notification.params` are sent as query-string fields, not in the JSON.
 *  The official payload uses `job_id` / `data.id` for the Coconut id, not our UUID. */
export function idsFromConversionWebhook(url: URL, body: unknown): {
  token: string;
  jobId: string | null;
  providerJobId: string | null;
} {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const params = record.params && typeof record.params === "object" ? record.params as Record<string, unknown> : {};
  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const token = url.searchParams.get("token")
    || (typeof params.token === "string" ? params.token : "")
    || (typeof record.token === "string" ? record.token : "");
  const hints = [
    url.searchParams.get("pekko_job_id"),
    params.pekko_job_id,
    record.jobId,
    params.jobId,
  ];
  const jobId = hints.find((value) => isUuid(value)) ?? null;
  const providerRaw = record.job_id ?? record.id ?? data.id ?? "";
  const providerJobId = providerRaw == null || providerRaw === "" ? null : String(providerRaw);
  return { token, jobId, providerJobId };
}

async function signedInputUrl(path: string): Promise<string> {
  const signed = await db().storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) throw new Error("Couldn't sign the source video.");
  return signed.data.signedUrl;
}

async function finishJob(jobId: string, status: "ready" | "failed", error: string | null, actualMillis: number) {
  const done = await db().rpc("complete_video_conversion", {
    p_job_id: jobId,
    p_status: status,
    p_actual_millis: actualMillis,
    p_error: error,
  });
  if (done.error) console.error("complete_video_conversion failed", done.error.message);
}

async function releaseAndFail(jobId: string, error: ConversionErrorCode, actualMillis: number) {
  await finishJob(jobId, "failed", error, actualMillis);
}

async function markMedia(accountId: string, mediaId: string, status: "failed" | "ready", error: string | null) {
  await db()
    .from("media")
    .update({
      processing_status: status,
      processing_error: error,
      updated_at: new Date().toISOString(),
    })
    .eq("id", mediaId)
    .eq("account_id", accountId);
}

async function abortFreshJob(accountId: string, mediaId: string, paths: (string | null)[]) {
  await db().from("media").delete().eq("id", mediaId).eq("account_id", accountId);
  await cleanupJobFiles(accountId, mediaId, paths.filter((path): path is string => Boolean(path)));
}

async function cleanupJobFiles(accountId: string, mediaId: string, paths: string[]) {
  const owned = paths.filter((path) => isJobStoragePath(accountId, mediaId, path));
  if (owned.length) await removeStored(owned);
}

async function removeIfOwned(accountId: string, mediaId: string, path: string) {
  if (isJobStoragePath(accountId, mediaId, path)) await removeStored([path]);
}

function isBudgetError(error: { message?: string; code?: string } | null) {
  if (!error) return true;
  return /budget_exhausted|P0001|budget/i.test(`${error.code ?? ""} ${error.message ?? ""}`);
}

function alreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const record = error as { message?: unknown; statusCode?: unknown; code?: unknown };
  const code = String(record.statusCode ?? record.code ?? "");
  if (code === "409" || code === "Duplicate" || code === "ResourceAlreadyExists") return true;
  return typeof record.message === "string" && /already exists/i.test(record.message);
}

export { MAX_CONVERT_EDGE, MAX_VIDEO_DURATION_MS };
