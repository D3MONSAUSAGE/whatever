import { db } from "@/lib/server/supabase";
import { ONLINE_MS } from "@/lib/server/limits";
import { isMissingSchema } from "@/lib/server/schema";

export type RemoteScreen = {
  id: string;
  name: string;
  connected: boolean;
  online: boolean;
  lastSeenAt: string | null;
  contentVersion: number;
  /** Monotonic-ish staleness marker: ISO updated_at of display_playback, else display last_seen/created. */
  stateVersion: string;
  updatedAt: string;
  playlist: {
    id: string;
    name: string;
    playbackMode: "auto" | "manual";
    itemCount: number;
  } | null;
  playback: {
    playlistId: string | null;
    playbackMode: "auto" | "manual";
    index: number;
    count: number;
    /** 1-based slide for UI ("2 of 8"); null when unknown/empty. */
    slide: number | null;
    updatedAt: string;
    lastAppliedSeq: number;
    lastIssuedSeq: number;
  } | null;
  /** Convenience mirrors of playback for clients that want flat fields. */
  mode: "auto" | "manual" | null;
  index: number | null;
  total: number | null;
  controllable: boolean;
};

type DisplayRow = {
  id: string;
  name: string;
  token_hash: string | null;
  last_seen_at: string | null;
  assigned_playlist_id: string | null;
  content_version: number;
  created_at?: string | null;
  account_id?: string;
};

export async function loadRemoteScreens(accountId: string): Promise<
  { ok: true; screens: RemoteScreen[] } | { ok: false; missingSchema?: boolean }
> {
  const displays = await db()
    .from("displays")
    .select("id, name, token_hash, last_seen_at, assigned_playlist_id, content_version, created_at")
    .eq("account_id", accountId)
    .eq("status", "active")
    .order("created_at")
    .order("id");
  if (displays.error) {
    if (isMissingSchema(displays.error)) return { ok: false, missingSchema: true };
    return { ok: false };
  }
  return { ok: true, screens: await serializeScreens(accountId, (displays.data ?? []) as DisplayRow[]) };
}

export async function loadRemoteScreen(
  accountId: string,
  displayId: string,
): Promise<
  | { ok: true; screen: RemoteScreen }
  | { ok: false; kind: "missing_schema" | "not_found" | "error" }
> {
  const display = await db()
    .from("displays")
    .select("id, name, token_hash, last_seen_at, assigned_playlist_id, content_version, created_at")
    .eq("account_id", accountId)
    .eq("status", "active")
    .eq("id", displayId)
    .maybeSingle();
  if (display.error) {
    if (isMissingSchema(display.error)) return { ok: false, kind: "missing_schema" };
    return { ok: false, kind: "error" };
  }
  if (!display.data) return { ok: false, kind: "not_found" };
  const screens = await serializeScreens(accountId, [display.data as DisplayRow]);
  return { ok: true, screen: screens[0] };
}

/** Distinguish own-missing vs other-org for command endpoints. */
export async function displayAccess(
  accountId: string,
  displayId: string,
): Promise<"own" | "foreign" | "missing" | "error"> {
  const own = await db()
    .from("displays")
    .select("id")
    .eq("id", displayId)
    .eq("account_id", accountId)
    .eq("status", "active")
    .maybeSingle();
  if (own.error) return "error";
  if (own.data) return "own";
  const any = await db()
    .from("displays")
    .select("id")
    .eq("id", displayId)
    .eq("status", "active")
    .maybeSingle();
  if (any.error) return "error";
  if (any.data) return "foreign";
  return "missing";
}

async function serializeScreens(accountId: string, list: DisplayRow[]): Promise<RemoteScreen[]> {
  const playlistIds = [...new Set(list.map((d) => d.assigned_playlist_id).filter(Boolean))] as string[];
  const playlistById = new Map<string, { id: string; name: string; playbackMode: "auto" | "manual"; itemCount: number }>();
  if (playlistIds.length) {
    const playlists = await db()
      .from("playlists")
      .select("id, name, published_playback_mode, playback_mode")
      .eq("account_id", accountId)
      .in("id", playlistIds);
    if (!playlists.error) {
      const counts = await db()
        .from("playlist_items")
        .select("playlist_id")
        .eq("account_id", accountId)
        .eq("kind", "published")
        .in("playlist_id", playlistIds);
      const countMap = new Map<string, number>();
      if (!counts.error) {
        for (const row of counts.data ?? []) {
          const id = String(row.playlist_id);
          countMap.set(id, (countMap.get(id) ?? 0) + 1);
        }
      }
      for (const pl of playlists.data ?? []) {
        const mode = pl.published_playback_mode === "manual" || pl.playback_mode === "manual" ? "manual" : "auto";
        playlistById.set(String(pl.id), {
          id: String(pl.id),
          name: String(pl.name),
          playbackMode: mode,
          itemCount: countMap.get(String(pl.id)) ?? 0,
        });
      }
    }
  }

  const playback = await db()
    .from("display_playback")
    .select("display_id, playlist_id, playback_mode, item_index, item_count, updated_at, last_applied_seq, last_issued_seq")
    .eq("account_id", accountId);
  const playbackById = new Map(
    !playback.error ? (playback.data ?? []).map((row) => [String(row.display_id), row]) : [],
  );

  const now = Date.now();
  return list.map((d) => {
    const pl = d.assigned_playlist_id ? playlistById.get(String(d.assigned_playlist_id)) ?? null : null;
    const pb = playbackById.get(String(d.id));
    const online = !!d.last_seen_at && now - new Date(String(d.last_seen_at)).getTime() < ONLINE_MS;
    const updatedAt = pb?.updated_at
      ? String(pb.updated_at)
      : d.last_seen_at
        ? String(d.last_seen_at)
        : String(d.created_at ?? new Date(0).toISOString());
    const mode = (pb?.playback_mode === "manual" || pl?.playbackMode === "manual") ? "manual"
      : (pb || pl) ? "auto" : null;
    const index = pb ? Number(pb.item_index) : null;
    const total = pb ? Number(pb.item_count) : pl ? pl.itemCount : null;
    return {
      id: d.id,
      name: d.name,
      connected: !!d.token_hash,
      online,
      lastSeenAt: d.last_seen_at ? String(d.last_seen_at) : null,
      contentVersion: Number(d.content_version),
      stateVersion: updatedAt,
      updatedAt,
      playlist: pl,
      playback: pb
        ? {
            playlistId: pb.playlist_id ? String(pb.playlist_id) : null,
            playbackMode: pb.playback_mode === "manual" ? "manual" : "auto",
            index: Number(pb.item_index),
            count: Number(pb.item_count),
            slide: Number(pb.item_count) > 0 ? Number(pb.item_index) + 1 : null,
            updatedAt: String(pb.updated_at),
            lastAppliedSeq: Number(pb.last_applied_seq),
            lastIssuedSeq: Number(pb.last_issued_seq),
          }
        : null,
      mode,
      index,
      total,
      controllable: !!(pl && pl.itemCount > 0 && d.token_hash),
    };
  });
}
