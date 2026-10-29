import { BUCKET, db } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { readPlaybackSchedule } from "@/lib/server/playback";
import { isMissingSchema } from "@/lib/server/schema";
import { playerPollMs } from "@/lib/server/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const URL_TTL_SECONDS = 3600;

type PlaylistItem = {
  mediaId: string;
  url: string;
  durationMs: number;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
};
type PlaylistPayload = { id: string; transition: "none" | "fade"; items: PlaylistItem[] };
type PlaylistRow = {
  playlist_id: string;
  transition: string | null;
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

  const schedule = await readPlaybackSchedule(String(row.display_id), Number(row.content_version));
  if (schedule.kind === "error") return fail("unavailable", 503);
  const version = schedule.kind === "on" ? schedule.version : Number(row.content_version);
  const extra: { pollMs: number; nextTransitionAt?: string } = { pollMs: playerPollMs() };
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
    .select("id, published_transition")
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

  const paths = [...new Set(rows.map((item) => item.storage_path).filter(Boolean))];
  const { data: signed, error: signErr } = await db().storage.from(BUCKET).createSignedUrls(paths, URL_TTL_SECONDS);
  if (signErr || !signed) return "error";
  const urls = new Map<string, string>();
  signed.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));

  const items: PlaylistItem[] = [];
  for (const item of rows) {
    const url = urls.get(item.storage_path);
    if (!url || typeof item.duration_ms !== "number") return "error";
    items.push({
      mediaId: item.media_id,
      url,
      durationMs: item.duration_ms,
      kind: item.kind === "video" ? "video" : "image",
      width: typeof item.width === "number" ? item.width : null,
      height: typeof item.height === "number" ? item.height : null,
    });
  }
  return {
    id: rows[0].playlist_id,
    transition: rows[0].transition === "fade" ? "fade" : "none",
    items,
  };
}
