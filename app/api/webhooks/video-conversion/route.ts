import { fail, json, readJson } from "@/lib/server/http";
import { handleConversionWebhook, hevcConversionEnabled, lookupJobByProviderId } from "@/lib/server/video-conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Provider notification for a conversion job. Auth is the per-job token (Coconut has no HMAC).
 * Idempotent: a replay of a finished job returns 200 and does nothing.
 */
export async function POST(req: Request) {
  if (!hevcConversionEnabled()) return fail("Not found.", 404);
  const url = new URL(req.url);
  const queryToken = url.searchParams.get("token") || "";
  const body = await readJson(req);
  const token = queryToken || tokenFromBody(body);
  const jobId = await resolveJobId(body, token);
  const normalized = jobId ? { ...asRecord(body), jobId, status: statusOf(body) } : body;
  const result = await handleConversionWebhook(normalized, token);
  if (!result.ok) return fail(result.message, result.http);
  return json({ ok: true, status: result.status });
}

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? body as Record<string, unknown> : {};
}

function tokenFromBody(body: unknown): string {
  const record = asRecord(body);
  const params = record.params && typeof record.params === "object" ? record.params as Record<string, unknown> : null;
  if (typeof params?.token === "string") return params.token;
  if (typeof record.token === "string") return record.token;
  return "";
}

function statusOf(body: unknown): string {
  const record = asRecord(body);
  const event = String(record.event ?? record.type ?? record.status ?? "completed");
  return /fail|error/i.test(event) ? "failed" : "completed";
}

async function resolveJobId(body: unknown, token: string): Promise<string | null> {
  const record = asRecord(body);
  const params = record.params && typeof record.params === "object" ? record.params as Record<string, unknown> : null;
  if (typeof params?.pekko_job_id === "string" && params.pekko_job_id) return params.pekko_job_id;
  if (typeof record.jobId === "string" && record.jobId) return record.jobId;
  const coconutId = record.id ?? (record.job && typeof record.job === "object" ? (record.job as { id?: unknown }).id : null);
  if (coconutId != null) return lookupJobByProviderId(String(coconutId), token);
  return null;
}
