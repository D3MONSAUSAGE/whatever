import { createSign } from "node:crypto";
import { db } from "@/lib/server/supabase";
import { EMAIL_STALE_MS, MAX_EMAIL_ATTEMPTS, type AlertRow } from "@/lib/server/alerts";

/** One push message to one device token. */
export type PushMessage = {
  token: string;
  title: string;
  body: string;
  data: { type: "screen_offline" | "screen_online"; alertId: string; screenId: string };
};
/** `invalidToken`: FCM said the token is gone (UNREGISTERED / 404 / bad token); the device row is deleted. */
export type PushResult = { ok: true } | { ok: false; invalidToken?: boolean; error: string };
export type PushSender = { name: string; send(message: PushMessage): Promise<PushResult> };

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

/** Parses FCM_SERVICE_ACCOUNT (the Firebase service-account JSON, raw or base64). Null when unset or invalid. */
export function serviceAccountFromEnv(raw = process.env.FCM_SERVICE_ACCOUNT): ServiceAccount | null {
  if (!raw) return null;
  for (const text of [raw, Buffer.from(raw, "base64").toString("utf8")]) {
    try {
      const v = JSON.parse(text) as Partial<ServiceAccount>;
      if (v.project_id && v.client_email && v.private_key) return v as ServiceAccount;
    } catch { /* try the next form */ }
  }
  return null;
}

/** FCM HTTP v1 sender. Null (push off) until FCM_SERVICE_ACCOUNT is set. */
export function pushSender(): PushSender | null {
  const sa = serviceAccountFromEnv();
  return sa ? fcmSender(sa) : null;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

export function fcmSender(sa: ServiceAccount, fetchImpl: typeof fetch = fetch): PushSender {
  let cached: { token: string; exp: number } | null = null;
  async function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cached && cached.exp - 60 > now) return cached.token;
    const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(JSON.stringify({
      iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${head}.${claims}`);
    const jwt = `${head}.${claims}.${b64url(signer.sign(sa.private_key))}`;
    const r = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    if (!r.ok) throw new Error(`oauth ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    cached = { token: j.access_token, exp: now + (j.expires_in || 3600) };
    return cached.token;
  }
  return {
    name: "fcm",
    async send(m) {
      let bearer: string;
      try { bearer = await accessToken(); } catch (e) { return { ok: false, error: (e as Error).message }; }
      const r = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: m.token,
            notification: { title: m.title, body: m.body },
            data: m.data,
            android: { priority: "high", notification: { channel_id: "screen_alerts", tag: m.data.screenId } },
            apns: { headers: { "apns-priority": "10", "apns-collapse-id": m.data.screenId.slice(0, 64) } },
          },
        }),
      });
      if (r.ok) return { ok: true };
      const text = await r.text().catch(() => "");
      const invalid = r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)
        || (r.status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text));
      return { ok: false, invalidToken: invalid, error: `fcm ${r.status}` };
    },
  };
}

export function pushFor(a: Pick<AlertRow, "id" | "kind" | "display_id" | "display_name">): Omit<PushMessage, "token"> {
  const offline = a.kind === "screen.offline";
  return {
    title: offline ? `"${a.display_name}" is offline` : `"${a.display_name}" is back online`,
    body: offline ? "It stopped checking in. Check that the TV is on and connected." : "Your screen is checking in again.",
    data: { type: offline ? "screen_offline" : "screen_online", alertId: a.id, screenId: a.display_id ?? "" },
  };
}

type Pending = AlertRow & { account_id: string; push_attempts: number };
type Device = { id: string; token: string; notify_offline: boolean; notify_recovery: boolean };
export type PushDelivery = {
  provider: string | null; sent: number; failed: number; skipped: number; devices: number; pruned: number;
  stalePurged: number; dryRun: boolean; error?: true;
};

/**
 * Sends pending alert pushes. Same dedupe as email: one alert row is claimed once (push_attempts
 * compare-and-set), so overlapping runs can't push it twice. Devices are read by the alert's own
 * account_id only. Without a sender, pending alerts are marked skipped.
 */
/** While pending, the timestamp column is a claim lease: an in-flight send blocks other runs for this long. */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

export async function deliverAlertPushes(opts: { dryRun: boolean; sender?: PushSender | null; now?: number; staleDays?: number }): Promise<PushDelivery> {
  const sender = opts.sender === undefined ? pushSender() : opts.sender;
  const now = opts.now ?? Date.now();
  const out: PushDelivery = { provider: sender?.name ?? null, sent: 0, failed: 0, skipped: 0, devices: 0, pruned: 0, stalePurged: 0, dryRun: opts.dryRun };

  const purge = await db().rpc("push_devices_purge", { p_days: opts.staleDays ?? 60, p_dry_run: opts.dryRun });
  if (!purge.error) out.stalePurged = Number((purge.data as { devices?: number } | null)?.devices ?? 0);

  const q = await db().from("alerts")
    .select("id, account_id, display_id, display_name, kind, at, offline_since, offline_seconds, read_at, email_status, push_attempts")
    .eq("push_status", "pending").order("at", { ascending: true }).limit(50);
  if (q.error) return { ...out, error: true };
  const accounts = new Map<string, { enabled: boolean; devices: Device[] }>();

  for (const a of (q.data ?? []) as Pending[]) {
    const stale = now - Date.parse(a.at) > EMAIL_STALE_MS;
    let acct = accounts.get(a.account_id);
    if (!acct && sender && !stale) {
      const [ac, dv] = await Promise.all([
        db().from("accounts").select("alerts_enabled, alert_push_enabled").eq("id", a.account_id).maybeSingle(),
        db().from("push_devices").select("id, token, notify_offline, notify_recovery").eq("account_id", a.account_id),
      ]);
      const flags = ac.data as { alerts_enabled?: boolean; alert_push_enabled?: boolean } | null;
      acct = { enabled: Boolean(flags?.alerts_enabled && flags?.alert_push_enabled), devices: (dv.data ?? []) as Device[] };
      accounts.set(a.account_id, acct);
    }
    const targets = (acct?.enabled ? acct.devices : []).filter((d) => (a.kind === "screen.offline" ? d.notify_offline : d.notify_recovery));
    if (!sender || stale || !targets.length) {
      out.skipped++;
      if (!opts.dryRun) await db().from("alerts").update({ push_status: "skipped" }).eq("id", a.id).eq("push_status", "pending");
      continue;
    }
    if (opts.dryRun) { out.sent++; out.devices += targets.length; continue; }
    const claim = await db().from("alerts").update({ push_attempts: a.push_attempts + 1, pushed_at: new Date(now).toISOString() })
      .eq("id", a.id).eq("push_status", "pending").eq("push_attempts", a.push_attempts)
      .or(`pushed_at.is.null,pushed_at.lt.${new Date(now - CLAIM_LEASE_MS).toISOString()}`).select("id");
    if (claim.error || !(claim.data ?? []).length) continue;

    const msg = pushFor(a);
    let delivered = 0;
    for (const d of targets) {
      const r = await sender.send({ ...msg, token: d.token });
      if (r.ok) { delivered++; continue; }
      if (r.invalidToken) {
        out.pruned++;
        await db().from("push_devices").delete().eq("id", d.id).eq("token", d.token);
        acct!.devices = acct!.devices.filter((x) => x.id !== d.id);
      } else {
        await db().from("push_devices").update({ last_error: r.error.slice(0, 200) }).eq("id", d.id);
      }
    }
    out.devices += delivered;
    if (delivered > 0) {
      out.sent++;
      await db().from("alerts").update({ push_status: "sent", pushed_at: new Date(now).toISOString() }).eq("id", a.id);
    } else {
      out.failed++;
      const gone = acct!.devices.length === 0;
      if (gone) await db().from("alerts").update({ push_status: "skipped" }).eq("id", a.id);
      else if (a.push_attempts + 1 >= MAX_EMAIL_ATTEMPTS) await db().from("alerts").update({ push_status: "failed" }).eq("id", a.id);
    }
  }
  return out;
}
