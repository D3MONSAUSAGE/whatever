import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { stripControls } from "./validate";
import { expectedFor, isErr, isOnline, loadDisplays, playbackStatus } from "./analytics";

/** Accounts created before this (M8 release) with screens and content are treated as set up. */
export const ONBOARDING_SHIPPED_AT = Date.parse("2026-10-30T12:00:00Z");

export const STEP_IDS = ["account", "business", "location", "screen", "media", "playlist", "publish", "playing"] as const;
export type StepId = (typeof STEP_IDS)[number];
export type OnboardingState = {
  steps: { id: StepId; done: boolean; confirmed?: boolean }[];
  completed: number;
  total: number;
  nextStep: StepId | null;
  dismissed: boolean;
  finished: boolean;
  show: boolean;
  firstLocationId: string | null;
};

/** The name ensure_account gives a new account (same rule as lib/server/auth.ts). */
export function defaultAccountName(email: string) {
  return stripControls(email.split("@")[0] || "My business").trim().slice(0, 80) || "My business";
}

/** Progress is derived from the account's real data every time; only "dismissed" and "business confirmed" are stored. */
export async function onboardingState(accountId: string, email: string): Promise<OnboardingState | "error"> {
  let account = await db().from("accounts").select("name, created_at, onboarding_dismissed_at, business_confirmed_at").eq("id", accountId).single();
  let flags = true;
  if (account.error && isMissingSchema(account.error)) {
    flags = false;
    account = (await db().from("accounts").select("name, created_at").eq("id", accountId).single()) as typeof account;
  }
  if (account.error || !account.data) return "error";
  const a = account.data as { name: string; created_at: string; onboarding_dismissed_at?: string | null; business_confirmed_at?: string | null };

  const [locations, media, items, published, schedules] = await Promise.all([
    db().from("locations").select("id, name, timezone").eq("account_id", accountId).order("created_at").limit(50),
    db().from("media").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db().from("playlist_items").select("playlist_id").eq("account_id", accountId).limit(1),
    db().from("playlists").select("id").eq("account_id", accountId).not("published_at", "is", null).limit(1000),
    db().from("schedules").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("enabled", true),
  ]);
  if (locations.error || media.error || items.error || published.error) return "error";
  const displays = await loadDisplays(accountId);
  if (isErr(displays)) {
    if (!displays.missing) return "error";
  }
  const screens = isErr(displays) ? [] : displays;

  const locs = (locations.data ?? []) as { id: string; name: string; timezone: string | null }[];
  const publishedIds = new Set(((published.data ?? []) as { id: string }[]).map((p) => p.id));
  const scheduleCount = schedules.error ? 0 : schedules.count ?? 0;

  const business = !!a.business_confirmed_at || a.name !== defaultAccountName(email);
  const location = locs.length > 1 || locs.some((l) => l.name !== "Main location" || (l.timezone && l.timezone !== "UTC"))
    || screens.some((d) => d.location_id);
  const screen = screens.length > 0;
  const hasMedia = (media.count ?? 0) > 0;
  const playlist = (items.data ?? []).length > 0;
  const publish = screens.some((d) => d.assigned_media_id || (d.assigned_playlist_id && publishedIds.has(d.assigned_playlist_id)))
    || (screen && scheduleCount > 0);

  // Playing: an online screen with content. Confirmed when the TV itself reported the expected content.
  let playing = false, confirmed = false;
  for (const d of screens.filter((x) => isOnline(x.last_seen_at)).slice(0, 10)) {
    const e = await expectedFor(d);
    if (isErr(e) || e.source === "none") continue;
    playing = true;
    if (playbackStatus(d, e) === "confirmed") { confirmed = true; break; }
  }

  const steps: OnboardingState["steps"] = [
    { id: "account", done: true },
    { id: "business", done: business },
    { id: "location", done: location },
    { id: "screen", done: screen },
    { id: "media", done: hasMedia },
    { id: "playlist", done: playlist },
    { id: "publish", done: publish },
    { id: "playing", done: playing, confirmed },
  ];
  const completed = steps.filter((s) => s.done).length;
  // Accounts that were already running screens before onboarding shipped never see the tracker.
  const existingCustomer = screen && hasMedia && publish && new Date(a.created_at).getTime() < ONBOARDING_SHIPPED_AT;
  const finished = completed === steps.length || existingCustomer;
  const dismissed = flags && !!a.onboarding_dismissed_at;
  return {
    steps,
    completed,
    total: steps.length,
    nextStep: steps.find((s) => !s.done)?.id ?? null,
    dismissed,
    finished,
    show: !dismissed && !finished,
    firstLocationId: locs[0]?.id ?? null,
  };
}
