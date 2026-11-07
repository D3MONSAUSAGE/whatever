import { billingEnforced, displayEntitled, SUSPENDED_PAYLOAD } from "@/lib/server/entitlements";
import { BUCKET, db } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { readPlaybackSchedule } from "@/lib/server/playback";
import { isMissingSchema } from "@/lib/server/schema";
import { playerPollMs } from "@/lib/server/limits";
import { expandPresentationRows } from "@/lib/server/presentation-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const URL_TTL_SECONDS = 3600;

const MANUAL_POLL_MS = 1500;

async function pendingCommands(tokenHash: string): Promise<{ seq: number; command: "next" | "prev" }[]> {
  const { data, error } = await db().rpc("player_pending_commands", { p_token_hash: tokenHash });
  if (error || !data) return [];
  return (data as { seq: number; command: string }[])
    .filter((row) => row.command === "next" || row.command === "prev")
    .map((row) => ({ seq: Number(row.seq), command: row.command as "next" | "prev" }));
}

function pollFor(mode: "auto" | "manual" | null, commands: { seq: number }[]): number {
  if (mode === "manual" || commands.length) return MANUAL_POLL_MS;
  return playerPollMs();
}

async function playbackModeHint(displayId: string): Promise<"auto" | "manual" | null> {
  const { data } = await db()
    .from("display_playback")
    .select("playback_mode")
    .eq("display_id", displayId)
    .maybeSingle();
  if (data?.playback_mode === "manual") return "manual";
  if (data?.playback_mode === "auto") return "auto";
  return null;
}

type PlaylistItem = {
  mediaId: string;
  url: string;
  durationMs: number;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  /** Set only on slides expanded from a presentation group. Older players ignore these. */
  groupId?: string;
  groupName?: string;
  groupIndex?: number;
  groupCount?: number;
};
type PlaylistPayload = { id: string; transition: "none" | "fade"; playbackMode: "auto" | "manual"; items: PlaylistItem[] };
type PlaylistRow = {
  playlist_id: string;
  transition: string | null;
  playback_mode?: string | null;
  position: number;
  media_id: string;
  storage_path: string;
  duration_ms: number;
  kind?: string | null;
  width?: number | null;
  height?: number | null;
};

// TV poll (every pollMs; 10 s on older players) and heartbeat. `?v=` is the version the TV is showing;
// a signed URL is only issued when it differs. A single assigned image keeps
// the original JSON. A playlist adds a `playlist` object.
export async function GET(req: Request) {
  const token = req.headers.get("x-display-token") || "";
  if (token.length < 20 || token.length > 200) return fail("unauthorized", 401);

  const tokenHash = sha256(token);
  const { data, error } = await db().rpc("player_state", { p_token_hash: tokenHash });
  if (error) return fail("unavailable", 503);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return fail("unauthorized", 401);
  // Billing gate (BILLING_ENFORCE=1). 402 keeps the token, so the screen resumes on its own
  // once the plan is active again; it never unpairs or deletes anything.
  if (billingEnforced() && !(await displayEntitled(String(row.display_id)))) {
    return json({ ...SUSPENDED_PAYLOAD, pollMs: 60_000 }, 402);
  }

  const schedule = await readPlaybackSchedule(String(row.display_id), Number(row.content_version));
  if (schedule.kind === "error") return fail("unavailable", 503);
  const version = schedule.kind === "on" ? schedule.version : Number(row.content_version);
  const commands = await pendingCommands(tokenHash);
  const modeHint = await playbackModeHint(String(row.display_id));
  const extra: { pollMs: number; nextTransitionAt?: string; commands: { seq: number; command: "next" | "prev" }[] } = {
    pollMs: pollFor(modeHint, commands),
    commands,
  };
  if (schedule.kind === "on" && schedule.nextTransitionAt) extra.nextTransitionAt = schedule.nextTransitionAt;
  const overrideId = schedule.kind === "on" ? schedule.overridePlaylistId : null;

  const params = new URL(req.url).searchParams;
  const shown = params.get("v");
  const refresh = params.get("refresh") === "1";
  const versionMatches = shown !== null && shown !== "" && Number(shown) === version;

  // An active schedule plays that playlist's published slides, even when the
  // screen's everyday assignment is a single image. No active rule keeps the
  // original JSON, including the content version.
  if (overrideId) {
    if (versionMatches && !refresh) return json({ version, unchanged: true, ...extra });
    const playlist = await publishedPlaylistById(overrideId, schedule.kind === "on" ? schedule.accountId : "");
    if (playlist === "error") return fail("unavailable", 503);
    if (!playlist) return json({ version, mediaId: null, url: null, ...extra });
    extra.pollMs = pollFor(playlist.playbackMode, commands);
    return json({
      version,
      mediaId: playlist.items[0].mediaId,
      url: playlist.items[0].url,
      playlist,
      ...extra,
    });
  }

  if (row.storage_path) {
    if (versionMatches) return json({ version, unchanged: true, ...extra });
    const { data: signed, error: signErr } = await db()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, URL_TTL_SECONDS);
    // Image missing or storage hiccup: TV keeps its last image and retries.
    if (signErr || !signed) return fail("unavailable", 503);
    return json({ version, mediaId: row.media_id, url: signed.signedUrl, ...extra });
  }

  if (versionMatches && !refresh) return json({ version, unchanged: true, ...extra });

  const playlist = await publishedPlaylist(tokenHash);
  if (playlist === "missing") {
    return json({ version, mediaId: null, url: null, ...extra });
  }
  if (playlist === "error") return fail("unavailable", 503);
  if (!playlist) return json({ version, mediaId: null, url: null, ...extra });

  extra.pollMs = pollFor(playlist.playbackMode, commands);
  return json({
    version,
    mediaId: playlist.items[0].mediaId,
    url: playlist.items[0].url,
    playlist,
    ...extra,
  });
}

// The player reports a clip it could not decode. Before 0003 this is a no-op.
export async function POST(req: Request) {
  const token = req.headers.get("x-display-token") || "";
  if (token.length < 20 || token.length > 200) return fail("unauthorized", 401);
  const body = await readJson(req);
  // M8 proof of play: { playing: { version } } is sent once after the TV paints new content.
  if (body.playing && typeof body.playing === "object") {
    const version = Number((body.playing as { version?: unknown }).version);
    if (!Number.isSafeInteger(version) || version < 0) return fail("bad version", 400);
    const played = await db().rpc("report_playing", { p_token_hash: sha256(token), p_version: version });
    if (played.error) {
      if (isMissingSchema(played.error)) return json({ ok: true });
      return fail("unavailable", 503);
    }
    if (!played.data) return fail("unauthorized", 401);
    return json({ ok: true });
  }
  // Remote-control heartbeat: current slide index + last applied command seq.
  if (body.playback && typeof body.playback === "object") {
    const pb = body.playback as Record<string, unknown>;
    const index = Number(pb.index);
    const count = Number(pb.count);
    const version = Number(pb.version);
    const lastAppliedSeq = Number(pb.lastAppliedSeq ?? 0);
    const mode = pb.playbackMode === "manual" ? "manual" : "auto";
    const playlistId = typeof pb.playlistId === "string" && pb.playlistId ? pb.playlistId : null;
    if (!Number.isSafeInteger(index) || index < 0) return fail("bad index", 400);
    if (!Number.isSafeInteger(count) || count < 0) return fail("bad count", 400);
    if (!Number.isSafeInteger(version) || version < 0) return fail("bad version", 400);
    if (!Number.isSafeInteger(lastAppliedSeq) || lastAppliedSeq < 0) return fail("bad seq", 400);
    const reported = await db().rpc("player_report_playback", {
      p_token_hash: sha256(token),
      p_playlist_id: playlistId,
      p_playback_mode: mode,
      p_item_index: index,
      p_item_count: count,
      p_content_version: version,
      p_last_applied_seq: lastAppliedSeq,
    });
    if (reported.error) {
      if (isMissingSchema(reported.error)) return json({ ok: true });
      return fail("unavailable", 503);
    }
    if (!reported.data) return fail("unauthorized", 401);
    return json({ ok: true });
  }
  const message = body.error == null ? "" : String(body.error).slice(0, 180);
  const { data, error } = await db().rpc("report_player_error", {
    p_token_hash: sha256(token),
    p_error: message,
  });
  if (error) {
    if (isMissingSchema(error)) return json({ ok: true });
    return fail("unavailable", 503);
  }
  if (!data) return fail("unauthorized", 401);
  return json({ ok: true });
}

async function publishedPlaylistById(playlistId: string, accountId: string): Promise<PlaylistPayload | null | "error"> {
  const playlist = await db()
    .from("playlists")
    .select("id, published_transition, published_playback_mode")
    .eq("id", playlistId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (playlist.error) return "error";
  if (!playlist.data) return null;
  const items = await db()
    .from("playlist_items")
    .select("position, media_id, duration_ms")
    .eq("playlist_id", playlistId)
    .eq("account_id", accountId)
    .eq("kind", "published")
    .order("position");
  if (items.error) return "error";
  if (!items.data?.length) return null;
  const mediaIds = [...new Set(items.data.map((item) => String(item.media_id)))];
  const media = await db()
    .from("media")
    .select("id, storage_path, kind, width, height")
    .eq("account_id", accountId)
    .in("id", mediaIds);
  if (media.error || !media.data) return "error";
  const byId = new Map(media.data.map((item) => [String(item.id), item]));
  const rows: PlaylistRow[] = [];
  for (const item of items.data) {
    const file = byId.get(String(item.media_id));
    if (!file?.storage_path) return "error";
    rows.push({
      playlist_id: playlistId,
      transition: playlist.data.published_transition,
      playback_mode: playlist.data.published_playback_mode == null ? null : String(playlist.data.published_playback_mode),
      position: Number(item.position),
      media_id: String(item.media_id),
      storage_path: String(file.storage_path),
      duration_ms: Number(item.duration_ms),
      kind: file.kind == null ? null : String(file.kind),
      width: typeof file.width === "number" ? file.width : null,
      height: typeof file.height === "number" ? file.height : null,
    });
  }
  return signPlaylist(rows);
}

async function publishedPlaylist(tokenHash: string): Promise<PlaylistPayload | null | "missing" | "error"> {
  const { data, error } = await db().rpc("player_playlist", { p_token_hash: tokenHash });
  if (error) return isMissingSchema(error) ? "missing" : "error";
  const rows = ([...(data ?? [])] as PlaylistRow[]).sort((a, b) => a.position - b.position);
  if (!rows.length) return null;
  return signPlaylist(rows);
}

async function signPlaylist(rows: PlaylistRow[]): Promise<PlaylistPayload | null | "error"> {
  const expanded = await expandPresentationRows(rows.map((item) => ({
    playlistId: item.playlist_id,
    transition: item.transition,
    playbackMode: item.playback_mode ?? null,
    position: item.position,
    mediaId: item.media_id,
    storagePath: item.storage_path,
    durationMs: item.duration_ms,
    kind: item.kind ?? null,
    width: typeof item.width === "number" ? item.width : null,
    height: typeof item.height === "number" ? item.height : null,
  })));
  if (expanded === "error") return "error";
  if (!expanded.length) return null;

  const paths = [...new Set(expanded.map((item) => item.storagePath).filter(Boolean))];
  const { data: signed, error: signErr } = await db().storage.from(BUCKET).createSignedUrls(paths, URL_TTL_SECONDS);
  if (signErr || !signed) return "error";
  const urls = new Map<string, string>();
  signed.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));

  const items: PlaylistItem[] = [];
  for (const item of expanded) {
    const url = urls.get(item.storagePath);
    if (!url || typeof item.durationMs !== "number") {
      if (item.groupId) continue;
      return "error";
    }
    const entry: PlaylistItem = {
      mediaId: item.mediaId,
      url,
      durationMs: item.durationMs,
      kind: item.kind === "video" ? "video" : "image",
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
    };
    if (item.groupId) {
      entry.groupId = item.groupId;
      entry.groupName = item.groupName;
      entry.groupIndex = item.groupIndex;
      entry.groupCount = item.groupCount;
    }
    items.push(entry);
  }
  if (!items.length) return null;
  // Recount a group after a missing slide was dropped so manual/remote indexes stay aligned.
  const byGroup = new Map<string, PlaylistItem[]>();
  for (const item of items) {
    if (!item.groupId) continue;
    const list = byGroup.get(item.groupId) ?? [];
    list.push(item);
    byGroup.set(item.groupId, list);
  }
  for (const list of byGroup.values()) {
    list.forEach((item, index) => {
      item.groupIndex = index;
      item.groupCount = list.length;
    });
  }
  return {
    id: expanded[0].playlistId,
    transition: expanded[0].transition === "fade" ? "fade" : "none",
    playbackMode: expanded[0].playbackMode === "manual" ? "manual" : "auto",
    items,
  };
}
