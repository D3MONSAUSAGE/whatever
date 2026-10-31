import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { ALERTS_UNAVAILABLE, THRESHOLD_MAX, THRESHOLD_MIN } from "@/lib/server/alerts";
import { emailProvider } from "@/lib/server/email";
import { pushSender } from "@/lib/server/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(accountId: string, email: string) {
  let r = await db().from("accounts").select("alerts_enabled, alert_threshold_minutes, alert_email_enabled, alert_push_enabled").eq("id", accountId).single();
  // Before migration 0011 there is no push column: answer without it.
  if (r.error && isMissingSchema(r.error)) r = await db().from("accounts").select("alerts_enabled, alert_threshold_minutes, alert_email_enabled").eq("id", accountId).single();
  if (r.error) return { error: r.error };
  const a = r.data as { alerts_enabled: boolean; alert_threshold_minutes: number; alert_email_enabled: boolean; alert_push_enabled?: boolean };
  return {
    prefs: {
      enabled: a.alerts_enabled,
      thresholdMinutes: a.alert_threshold_minutes,
      email: { enabled: a.alert_email_enabled, available: emailProvider() !== null, address: email },
      push: { enabled: a.alert_push_enabled ?? false, available: pushSender() !== null && a.alert_push_enabled !== undefined },
      limits: { minMinutes: THRESHOLD_MIN, maxMinutes: THRESHOLD_MAX },
    },
  };
}

function schemaFail(error: { message: string; code?: string }) {
  const missing = isMissingSchema(error);
  return fail(missing ? ALERTS_UNAVAILABLE : "Couldn't load alert settings.", missing ? 503 : 500);
}

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const r = await load(admin.accountId, admin.email);
  if ("error" in r && r.error) return schemaFail(r.error);
  return json(r.prefs);
}

// { enabled?: boolean, thresholdMinutes?: 2..1440, emailEnabled?: boolean, pushEnabled?: boolean }
export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  const patch: Record<string, boolean | number> = {};
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") return fail("enabled must be true or false.", 400);
    patch.alerts_enabled = body.enabled;
  }
  if ("thresholdMinutes" in body) {
    const n = body.thresholdMinutes;
    if (typeof n !== "number" || !Number.isInteger(n) || n < THRESHOLD_MIN || n > THRESHOLD_MAX) {
      return fail(`thresholdMinutes must be a whole number from ${THRESHOLD_MIN} to ${THRESHOLD_MAX}.`, 400);
    }
    patch.alert_threshold_minutes = n;
  }
  if ("emailEnabled" in body) {
    if (typeof body.emailEnabled !== "boolean") return fail("emailEnabled must be true or false.", 400);
    patch.alert_email_enabled = body.emailEnabled;
  }
  if ("pushEnabled" in body) {
    if (typeof body.pushEnabled !== "boolean") return fail("pushEnabled must be true or false.", 400);
    patch.alert_push_enabled = body.pushEnabled;
  }
  if (!Object.keys(patch).length) return fail("Nothing to update.", 400);
  const u = await db().from("accounts").update(patch).eq("id", admin.accountId);
  if (u.error) return schemaFail(u.error);
  const r = await load(admin.accountId, admin.email);
  if ("error" in r && r.error) return schemaFail(r.error);
  return json(r.prefs);
}
