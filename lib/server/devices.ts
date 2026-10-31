import { db } from "@/lib/server/supabase";
import { fail, json, enforceLimit } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import type { Admin } from "@/lib/server/auth";

export const PUSH_UNAVAILABLE = "Push notifications aren't set up on this server yet.";
export const MAX_DEVICES_PER_USER = 10;
const TOKEN_RE = /^[A-Za-z0-9:_\-.]{20,4096}$/;

export type DeviceRow = {
  id: string; token: string; platform: string; app_version: string | null;
  notify_offline: boolean; notify_recovery: boolean; created_at: string; last_seen_at: string;
};

/** Never echo full tokens back: last 6 characters are enough to tell devices apart. */
export const toDevice = (d: DeviceRow) => ({
  id: d.id, tokenSuffix: d.token.slice(-6), platform: d.platform, appVersion: d.app_version,
  notifyOffline: d.notify_offline, notifyRecovery: d.notify_recovery, registeredAt: d.created_at, lastSeenAt: d.last_seen_at,
});

const COLS = "id, token, platform, app_version, notify_offline, notify_recovery, created_at, last_seen_at";
const schemaFail = (e: { message: string; code?: string }) => isMissingSchema(e) ? fail(PUSH_UNAVAILABLE, 503) : fail("Couldn't save this device.", 500);

export function validToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

export async function listDevices(admin: Admin) {
  const r = await db().from("push_devices").select(COLS).eq("user_id", admin.userId).order("created_at");
  if (r.error) return schemaFail(r.error);
  return json({ devices: ((r.data ?? []) as DeviceRow[]).map(toDevice) });
}

/** POST /api/devices: idempotent upsert by token. A token registered by another login moves to this one. */
export async function registerDevice(admin: Admin, body: Record<string, unknown>) {
  if (!validToken(body.token)) return fail("token must be an FCM registration token.", 400);
  if (body.platform !== "android" && body.platform !== "ios") return fail("platform must be 'android' or 'ios'.", 400);
  if (body.appVersion !== undefined && body.appVersion !== null && (typeof body.appVersion !== "string" || body.appVersion.length > 40)) {
    return fail("appVersion must be a string of up to 40 characters.", 400);
  }
  for (const k of ["notifyOffline", "notifyRecovery"] as const) {
    if (k in body && typeof body[k] !== "boolean") return fail(`${k} must be true or false.`, 400);
  }
  const limited = await enforceLimit(`register-device:${admin.userId}`, 3600, 60, "Too many device registrations. Try again later.");
  if (limited) return limited;

  const row: Record<string, unknown> = {
    token: body.token, user_id: admin.userId, account_id: admin.accountId, platform: body.platform,
    app_version: (body.appVersion as string | undefined) ?? null, last_seen_at: new Date().toISOString(), last_error: null,
  };
  if ("notifyOffline" in body) row.notify_offline = body.notifyOffline;
  if ("notifyRecovery" in body) row.notify_recovery = body.notifyRecovery;
  const up = await db().from("push_devices").upsert(row, { onConflict: "token" }).select(COLS).single();
  if (up.error) return schemaFail(up.error);

  // Keep at most MAX_DEVICES_PER_USER: drop the least recently seen.
  const mine = await db().from("push_devices").select("id").eq("user_id", admin.userId).order("last_seen_at", { ascending: false });
  const extra = ((mine.data ?? []) as { id: string }[]).slice(MAX_DEVICES_PER_USER).map((d) => d.id);
  if (extra.length) await db().from("push_devices").delete().in("id", extra).eq("user_id", admin.userId);
  return json({ device: toDevice(up.data as DeviceRow) });
}

/** DELETE: only the caller's own row. Always 204 so a token can't be probed. */
export async function unregisterDevice(admin: Admin, token: unknown) {
  if (!validToken(token)) return fail("token must be an FCM registration token.", 400);
  const r = await db().from("push_devices").delete().eq("token", token).eq("user_id", admin.userId);
  if (r.error && isMissingSchema(r.error)) return fail(PUSH_UNAVAILABLE, 503);
  if (r.error) return fail("Couldn't remove this device.", 500);
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
