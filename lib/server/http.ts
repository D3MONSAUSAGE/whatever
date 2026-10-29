import { db } from "./supabase";

export function json(data: unknown, status = 200, headers?: Record<string, string>) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export const fail = (message: string, status: number) => json({ error: message }, status);

export function clientIp(req: Request) {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/** Postgres-backed fixed-window limit (in-memory limits don't survive serverless). */
export async function allow(key: string, windowSeconds: number, max: number) {
  const { data, error } = await db().rpc("rate_limit_hit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) throw error;
  return data === true;
}

/** 429 with Retry-After when the fixed window is full. Null when the call is allowed. */
export async function enforceLimit(key: string, windowSeconds: number, max: number, message: string) {
  if (await allow(key, windowSeconds, max)) return null;
  return json({ error: message }, 429, { "Retry-After": String(await retryAfterSeconds(key, windowSeconds)) });
}

async function retryAfterSeconds(key: string, windowSeconds: number) {
  const row = await db().from("rate_limits").select("window_start").eq("key", key).maybeSingle();
  const start = row.data?.window_start ? Date.parse(String(row.data.window_start)) : NaN;
  if (row.error || Number.isNaN(start)) return windowSeconds;
  const remain = Math.ceil((start + windowSeconds * 1000 - Date.now()) / 1000);
  return Math.min(windowSeconds, Math.max(1, remain));
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
