import { db } from "@/lib/server/supabase";
import { emailProvider, type EmailProvider } from "@/lib/server/email";
import { notificationLocale } from "@/lib/server/notification-locale";
import type { Locale } from "@/lib/i18n/locales";

export const ALERTS_UNAVAILABLE = "Alerts aren't set up on this server yet.";
export const THRESHOLD_MIN = 2;
export const THRESHOLD_MAX = 1440;
export const MAX_EMAIL_ATTEMPTS = 3;
/** Alerts older than this are never emailed (e.g. when email is switched on later). */
/** Alerts older than this are never delivered (marked skipped), so a backlog built while delivery
 * was off can't burst out later as outdated "offline" messages. */
export const DELIVERY_MAX_AGE_MS = 30 * 60_000;
/** @deprecated kept for imports; same as DELIVERY_MAX_AGE_MS. */
export const EMAIL_STALE_MS = DELIVERY_MAX_AGE_MS;

export type AlertRow = {
  id: string; display_id: string | null; display_name: string; kind: "screen.offline" | "screen.recovered";
  at: string; offline_since: string; offline_seconds: number | null; read_at: string | null; email_status: string;
};

export function toAlert(r: AlertRow) {
  return {
    id: r.id,
    kind: r.kind,
    screenId: r.display_id,
    screenName: r.display_name,
    at: r.at,
    offlineSince: r.offline_since,
    offlineSeconds: r.offline_seconds,
    read: r.read_at !== null,
    email: r.email_status,
  };
}

export function formatAt(iso: string, timeZone: string, locale: Locale = "en") {
  if (locale === "es") {
    // I18N-4: "11 nov, 6:05 p.m. PST" (es-US keeps the 12-hour clock and the zone label).
    try {
      return new Intl.DateTimeFormat("es-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
    } catch {
      return new Intl.DateTimeFormat("es-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
    }
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  }
}

function minutes(seconds: number) {
  const m = Math.max(1, Math.round(seconds / 60));
  return m < 120 ? `${m} min` : `${Math.round(m / 6) / 10} h`;
}

/** Spanish uses a decimal comma: "2,5 h". */
function minutesEs(seconds: number) {
  return minutes(seconds).replace(".", ",");
}

/** I18N-4: Spanish alert emails. Screen names stay exactly as typed. */
function emailForEs(a: Pick<AlertRow, "kind" | "display_name" | "offline_since" | "offline_seconds">, timeZone: string, appUrl: string) {
  const since = formatAt(a.offline_since, timeZone, "es");
  if (a.kind === "screen.offline") {
    return {
      subject: `Pekko: "${a.display_name}" está sin conexión`,
      text: `Su pantalla "${a.display_name}" dejó de reportarse alrededor del ${since}.\n\nRevise que la TV esté encendida y conectada a internet. Su contenido está guardado en la TV, así que es posible que todavía lo esté mostrando.\n\nVer sus pantallas: ${appUrl}/dashboard/displays\nCambiar la configuración de alertas: ${appUrl}/dashboard/settings`,
    };
  }
  return {
    subject: `Pekko: "${a.display_name}" volvió a estar en línea`,
    text: `Su pantalla "${a.display_name}" volvió a estar en línea después de unos ${minutesEs(a.offline_seconds ?? 0)} (sin conexión desde el ${since}).\n\nVer sus pantallas: ${appUrl}/dashboard/displays`,
  };
}

export function emailFor(a: Pick<AlertRow, "kind" | "display_name" | "offline_since" | "offline_seconds">, timeZone: string, appUrl: string, locale: Locale = "en") {
  if (locale === "es") return emailForEs(a, timeZone, appUrl);
  const since = formatAt(a.offline_since, timeZone);
  if (a.kind === "screen.offline") {
    return {
      subject: `Pekko: "${a.display_name}" is offline`,
      text: `Your screen "${a.display_name}" stopped checking in around ${since}.\n\nCheck that the TV is on and connected to the internet. Your content is saved on the TV, so it may still be showing it.\n\nSee your screens: ${appUrl}/dashboard/displays\nChange alert settings: ${appUrl}/dashboard/settings`,
    };
  }
  return {
    subject: `Pekko: "${a.display_name}" is back online`,
    text: `Your screen "${a.display_name}" is back online after about ${minutes(a.offline_seconds ?? 0)} (offline since ${since}).\n\nSee your screens: ${appUrl}/dashboard/displays`,
  };
}

type Pending = AlertRow & { account_id: string; email_attempts: number };
export type DeliveryResult = { provider: string | null; sent: number; failed: number; skipped: number; dryRun: boolean; error?: true; unavailable?: true };

/** Sends pending alert emails. Without a provider, pending alerts are marked skipped (never queued forever). */
/** While pending, the timestamp column is a claim lease: an in-flight send blocks other runs for this long. */
const CLAIM_LEASE_MS = 2 * 60 * 1000;

export async function deliverAlertEmails(opts: { dryRun: boolean; provider?: EmailProvider | null; now?: number; appUrl?: string }): Promise<DeliveryResult> {
  const provider = opts.provider === undefined ? emailProvider() : opts.provider;
  const now = opts.now ?? Date.now();
  const appUrl = opts.appUrl ?? (process.env.NEXT_PUBLIC_APP_URL || "https://pantalla-chi.vercel.app");
  const result: DeliveryResult = { provider: provider?.name ?? null, sent: 0, failed: 0, skipped: 0, dryRun: opts.dryRun };
  const q = await db().from("alerts")
    .select("id, account_id, display_id, display_name, kind, at, offline_since, offline_seconds, read_at, email_status, email_attempts")
    .eq("email_status", "pending").order("at", { ascending: true }).limit(50);
  if (q.error) return { ...result, error: true };
  const rows = (q.data ?? []) as Pending[];
  const owners = new Map<string, { email: string | null; tz: string; locale: Locale }>();

  for (const a of rows) {
    const stale = now - Date.parse(a.at) > EMAIL_STALE_MS;
    if (!provider || stale) {
      result.skipped++;
      if (!opts.dryRun) await db().from("alerts").update({ email_status: "skipped" }).eq("id", a.id).eq("email_status", "pending");
      continue;
    }
    if (opts.dryRun) { result.sent++; continue; }
    let owner = owners.get(a.account_id);
    if (!owner) {
      owner = await ownerOf(a.account_id);
      owners.set(a.account_id, owner);
    }
    if (!owner.email) {
      result.skipped++;
      await db().from("alerts").update({ email_status: "skipped" }).eq("id", a.id);
      continue;
    }
    // Claim the row first so a parallel run can't send it twice.
    const claim = await db().from("alerts").update({ email_attempts: a.email_attempts + 1, emailed_at: new Date(now).toISOString() })
      .eq("id", a.id).eq("email_status", "pending").eq("email_attempts", a.email_attempts)
      .or(`emailed_at.is.null,emailed_at.lt.${new Date(now - CLAIM_LEASE_MS).toISOString()}`).select("id");
    if (claim.error || !(claim.data ?? []).length) continue;
    const msg = emailFor(a, owner.tz, appUrl, owner.locale);
    const sent = await provider.send({ to: owner.email, ...msg });
    if (sent.ok) {
      result.sent++;
      await db().from("alerts").update({ email_status: "sent", emailed_at: new Date(now).toISOString() }).eq("id", a.id);
    } else {
      result.failed++;
      if (a.email_attempts + 1 >= MAX_EMAIL_ATTEMPTS) await db().from("alerts").update({ email_status: "failed" }).eq("id", a.id);
    }
  }
  return result;
}

async function ownerOf(accountId: string): Promise<{ email: string | null; tz: string; locale: Locale }> {
  const found = await ownerContact(accountId);
  // I18N-4: copy language only. Read separately so a missing locale column can't affect the recipient.
  return { ...found, locale: await notificationLocale(accountId) };
}

async function ownerContact(accountId: string): Promise<{ email: string | null; tz: string }> {
  const acct = await db().from("accounts").select("owner_user_id").eq("id", accountId).maybeSingle();
  const loc = await db().from("locations").select("timezone").eq("account_id", accountId).order("created_at", { ascending: true }).limit(1);
  const tz = ((loc.data ?? [])[0] as { timezone?: string } | undefined)?.timezone || "UTC";
  const uid = (acct.data as { owner_user_id?: string } | null)?.owner_user_id;
  if (!uid) return { email: null, tz };
  const u = await db().auth.admin.getUserById(uid);
  return { email: u.data.user?.email ?? null, tz };
}
