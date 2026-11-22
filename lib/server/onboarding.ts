import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { stripControls } from "./validate";
import { expectedFor, isErr, isOnline, loadDisplays, playbackStatus, type DisplayRow } from "./analytics";
import {
  buildV2State, hasSecondContentChange, isUsableUpload, menuHasUsableContent, menuIsCustomized,
  type Milestones, type OnboardingV2State, type PreviewTarget, type V2StepId,
} from "@/lib/onboarding";

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

/**
 * Step 8 ("Check it's playing") as a milestone, not a live reading.
 *
 * It used to be done only while a screen was online at the moment the tracker loaded (heartbeat in the last
 * 90 seconds). Turning the TVs off, or checking from a phone away from the store, put the account back to 7/8
 * and showed the tracker again. The TV's own confirmation is stored per screen (displays.confirmed_at, written
 * by report_playing only after the player painted real content), so once a TV has confirmed content that is
 * still published, the step stays done on every device.
 */
export function playingStep(input: {
  livePlaying: boolean;
  liveConfirmed: boolean;
  publish: boolean;
  screens: Pick<DisplayRow, "confirmed_at" | "confirmed_version">[];
}): { playing: boolean; confirmed: boolean } {
  const everConfirmed = input.publish && input.screens.some((d) => !!d.confirmed_at && d.confirmed_version != null);
  return {
    playing: input.livePlaying || everConfirmed,
    confirmed: input.liveConfirmed || everConfirmed,
  };
}

type MilestoneRow = { onboarding_milestones: Milestones | null; onboarding_completed_at: string | null; first_menu_celebrated_at: string | null };

/** Live facts and the stored milestone row for one account. v1 and v2 are both built from this. */
type Collected = {
  v1: OnboardingState;
  legacyFinished: boolean;
  confirmed: boolean;
  /** null when migration 0036 isn't applied: v2 is then derived from live data only and nothing is stamped. */
  row: MilestoneRow | null;
  live: Partial<Record<V2StepId, boolean>>;
  previewTarget: PreviewTarget | null;
  firstContentKind: "menu_board" | "upload" | null;
};

/** Progress is derived from the account's real data every time; only "dismissed" and "business confirmed" are stored. */
export async function onboardingState(accountId: string, email: string, source: OnboardingSource = "web"): Promise<OnboardingState | "error"> {
  const c = await collect(accountId, email, source);
  return c === "error" ? c : c.v1;
}

/** v2 (menu first). Same live data, plus durable milestones on the account. */
export async function onboardingStateV2(accountId: string, email: string, source: OnboardingSource = "web"): Promise<OnboardingV2State | "error"> {
  const c = await collect(accountId, email, source);
  if (c === "error") return c;
  return buildV2State({
    milestones: c.row ? (c.row.onboarding_milestones ?? {}) : null,
    live: c.live,
    confirmed: c.confirmed,
    dismissed: c.v1.dismissed,
    completedAt: c.row?.onboarding_completed_at ?? null,
    legacyFinished: c.legacyFinished,
    celebratedAt: c.row?.first_menu_celebrated_at ?? null,
    previewTarget: c.previewTarget,
  });
}

export type OnboardingSource = "web" | "android";

async function collect(accountId: string, email: string, source: OnboardingSource): Promise<Collected | "error"> {
  let account = await db().from("accounts").select("name, created_at, onboarding_dismissed_at, business_confirmed_at").eq("id", accountId).single();
  let flags = true;
  if (account.error && isMissingSchema(account.error)) {
    flags = false;
    account = (await db().from("accounts").select("name, created_at").eq("id", accountId).single()) as typeof account;
  }
  if (account.error || !account.data) return "error";
  const a = account.data as { name: string; created_at: string; onboarding_dismissed_at?: string | null; business_confirmed_at?: string | null };

  const [locations, media, items, published, schedules, milestoneRow] = await Promise.all([
    db().from("locations").select("id, name, timezone").eq("account_id", accountId).order("created_at").limit(50),
    db().from("media").select("id", { count: "exact", head: true }).eq("account_id", accountId),
    db().from("playlist_items").select("playlist_id").eq("account_id", accountId).limit(1),
    db().from("playlists").select("id").eq("account_id", accountId).not("published_at", "is", null).limit(1000),
    db().from("schedules").select("id", { count: "exact", head: true }).eq("account_id", accountId).eq("enabled", true),
    db().from("accounts").select("onboarding_milestones, onboarding_completed_at, first_menu_celebrated_at").eq("id", accountId).single(),
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

  // Playing: an online screen with content now, or a TV that has already confirmed painting the account's content.
  let livePlaying = false, liveConfirmed = false;
  for (const d of screens.filter((x) => isOnline(x.last_seen_at)).slice(0, 10)) {
    const e = await expectedFor(d);
    if (isErr(e) || e.source === "none") continue;
    livePlaying = true;
    if (playbackStatus(d, e) === "confirmed") { liveConfirmed = true; break; }
  }
  const { playing, confirmed } = playingStep({ livePlaying, liveConfirmed, publish, screens });

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
  const legacyFinished = completed === steps.length || existingCustomer;
  const dismissed = flags && !!a.onboarding_dismissed_at;

  // ---- v2 milestones (0036). Missing columns: live-only, nothing stamped.
  let row: MilestoneRow | null = null;
  if (!milestoneRow.error && milestoneRow.data) {
    const r = milestoneRow.data as MilestoneRow;
    row = { onboarding_milestones: r.onboarding_milestones ?? {}, onboarding_completed_at: r.onboarding_completed_at ?? null, first_menu_celebrated_at: r.first_menu_celebrated_at ?? null };
  } else if (milestoneRow.error && !isMissingSchema(milestoneRow.error)) {
    return "error";
  }
  const m = row?.onboarding_milestones ?? {};
  const v2 = await v2Facts(accountId, m, { screen, publish, scheduleCount }).catch(() => null);
  const live: Partial<Record<V2StepId, boolean>> = v2?.live ?? { screen, show_on_tv: publish, schedules: scheduleCount > 0 };

  if (row) {
    const fresh = (Object.keys(live) as V2StepId[]).filter((id) => live[id] && !m[id]);
    if (fresh.length) {
      const marked = await markMilestones(accountId, fresh, source, fresh.includes("first_menu") ? v2?.firstContentKind ?? null : null);
      if (marked) row = { ...row, onboarding_milestones: marked.milestones, onboarding_completed_at: marked.completedAt ?? row.onboarding_completed_at };
    }
    // Finished under the eight original steps stays finished in v2 too (never restarts).
    if (legacyFinished && !row.onboarding_completed_at) {
      const at = new Date().toISOString();
      const done = await db().from("accounts").update({ onboarding_completed_at: at }).eq("id", accountId).is("onboarding_completed_at", null);
      if (!done.error) row = { ...row, onboarding_completed_at: at };
    }
  }

  const v1Finished = legacyFinished || !!row?.onboarding_completed_at;
  return {
    v1: {
      steps,
      completed,
      total: steps.length,
      nextStep: steps.find((s) => !s.done)?.id ?? null,
      dismissed,
      finished: v1Finished,
      show: !dismissed && !v1Finished,
      firstLocationId: locs[0]?.id ?? null,
    },
    legacyFinished,
    confirmed,
    row,
    live,
    previewTarget: v2?.previewTarget ?? null,
    firstContentKind: v2?.firstContentKind ?? null,
  };
}

/**
 * Live checks for the v2 steps. A step that is already stamped is not queried again, so once an account has
 * its milestones the only extra read per load is the newest board (for "Preview menu").
 */
async function v2Facts(accountId: string, m: Milestones, base: { screen: boolean; publish: boolean; scheduleCount: number }) {
  const live: Partial<Record<V2StepId, boolean>> = { screen: base.screen, show_on_tv: base.publish, schedules: base.scheduleCount > 0 };
  const needMenus = !m.first_menu || !m.customize_menu || !m.playlists;
  const [menus, latestMenu] = await Promise.all([
    needMenus
      ? db().from("menus").select("id, content, playlist_id, updated_at").eq("account_id", accountId).order("updated_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: null, error: null }),
    db().from("menus").select("id").eq("account_id", accountId).order("updated_at", { ascending: false }).limit(1),
  ]);
  const menuRows = (menus.data ?? []) as { id: string; content: unknown; playlist_id: string | null }[];
  const usableMenu = menuRows.find((r) => menuHasUsableContent(r.content)) ?? null;
  let upload: { id: string } | null = null;
  const newestMenu = ((latestMenu.data ?? []) as { id: string }[])[0] ?? null;
  if (!m.first_menu || !usableMenu && !newestMenu) {
    const uploads = await db().from("media").select("id, file_name, source_media_id, processing_status, created_at")
      .eq("account_id", accountId).is("source_media_id", null).order("created_at", { ascending: false }).limit(500);
    upload = ((uploads.data ?? []) as { id: string; file_name: string; source_media_id: string | null; processing_status: string | null }[]).find(isUsableUpload) ?? null;
  }
  let firstContentKind: "menu_board" | "upload" | null = null;
  if (!m.first_menu) {
    live.first_menu = !!usableMenu || !!upload;
    firstContentKind = usableMenu ? "menu_board" : upload ? "upload" : null;
  }
  if (!m.customize_menu) live.customize_menu = menuRows.some((r) => menuIsCustomized(r.content));
  if (!m.playlists) {
    // A playlist the owner made: not the one-slide playlist every menu board gets automatically.
    const boardPlaylists = new Set(menuRows.map((r) => r.playlist_id).filter(Boolean));
    const owned = await db().from("playlist_items").select("playlist_id").eq("account_id", accountId).limit(1000);
    live.playlists = ((owned.data ?? []) as { playlist_id: string }[]).some((r) => !boardPlaylists.has(r.playlist_id));
  }
  if (!m.first_update && (base.publish || m.show_on_tv)) {
    // The same screen changed content twice: the first publish, then an update sent from the dashboard or app.
    const changes = await db().from("activity_events").select("subject_id").eq("account_id", accountId).eq("kind", "screen.content_changed")
      .order("at", { ascending: true }).limit(1000);
    live.first_update = !changes.error && hasSecondContentChange(((changes.data ?? []) as { subject_id: string | null }[]).map((r) => r.subject_id));
  }
  const target = newestMenu ?? (usableMenu ? { id: usableMenu.id } : null);
  const previewTarget: PreviewTarget | null = target ? { kind: "menu_board", menuId: target.id } : upload ? { kind: "upload", mediaId: upload.id } : null;
  return { live, previewTarget, firstContentKind };
}

/**
 * Stamps milestones once (0036 onboarding_mark). Idempotent: an existing timestamp is never moved or removed,
 * so later edits or deletes can't take progress away. Returns null when the function isn't available.
 */
export async function markMilestones(accountId: string, steps: V2StepId[], source: OnboardingSource, kind: "menu_board" | "upload" | null = null) {
  if (!steps.length) return null;
  const r = await db().rpc("onboarding_mark", { p_account: accountId, p_steps: steps, p_source: source, p_kind: kind });
  if (r.error || !r.data) return null;
  const d = r.data as { milestones?: Milestones; completed_at?: string | null };
  return { milestones: d.milestones ?? {}, completedAt: d.completed_at ?? null };
}
