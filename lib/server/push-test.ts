import { db } from "@/lib/server/supabase";
import { fail, json, enforceLimit } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { notificationLocale } from "@/lib/server/notification-locale";
import { pushSender, type PushMessage, type PushSender } from "@/lib/server/push";
import { PUSH_UNAVAILABLE } from "@/lib/server/devices";
import type { Admin } from "@/lib/server/auth";
import type { Locale } from "@/lib/i18n/locales";

export const PUSH_TEST_MAX_PER_HOUR = 5;
export const PUSH_TEST_LIMITED = "Too many test notifications. Try again later.";

/** Visible text of the test push, by account locale. Data is only {type:"test"}: no alert, no route key. */
export function testPushFor(locale: Locale): Omit<PushMessage, "token"> {
  if (locale === "es") {
    return { title: "Notificación de prueba de Pekko", body: "Las notificaciones de Pekko funcionan en este dispositivo.", data: { type: "test" } };
  }
  return { title: "Pekko test notification", body: "Pekko notifications are working on this device.", data: { type: "test" } };
}

/**
 * POST /api/push/test: sends one test push to the CALLER's own push_devices rows (user_id = caller).
 * No account or device picking, nothing written to alerts. Invalid tokens are pruned exactly like delivery.
 */
export async function sendTestPush(admin: Admin, body: Record<string, unknown>, senderOverride?: PushSender | null) {
  if (Object.keys(body).length) return fail("Send an empty JSON body {}.", 400);
  const limited = await enforceLimit(`push-test:${admin.userId}`, 3600, PUSH_TEST_MAX_PER_HOUR, PUSH_TEST_LIMITED);
  if (limited) return limited;
  const sender = senderOverride === undefined ? pushSender() : senderOverride;
  if (!sender) return fail(PUSH_UNAVAILABLE, 503);
  const r = await db().from("push_devices").select("id, token").eq("user_id", admin.userId);
  if (r.error) return isMissingSchema(r.error) ? fail(PUSH_UNAVAILABLE, 503) : fail("Couldn't send a test notification.", 500);
  const devices = (r.data ?? []) as { id: string; token: string }[];
  const msg = testPushFor(await notificationLocale(admin.accountId));
  let sent = 0, failed = 0;
  for (const d of devices) {
    const res = await sender.send({ ...msg, token: d.token });
    if (res.ok) { sent++; continue; }
    failed++;
    if (res.invalidToken) await db().from("push_devices").delete().eq("id", d.id).eq("token", d.token).eq("user_id", admin.userId);
    else await db().from("push_devices").update({ last_error: res.error.slice(0, 200) }).eq("id", d.id).eq("user_id", admin.userId);
  }
  return json({ devices: devices.length, sent, failed });
}
