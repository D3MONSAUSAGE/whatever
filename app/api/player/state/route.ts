import { BUCKET, db } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";

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

// TV poll (every 10s) and heartbeat. `?v=` is the version the TV is showing;
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

  const version: number = row.content_version;
  const params = new URL(req.url).searchParams;
  const shown = params.get("v");
  const refresh = params.get("refresh") === "1";
  const versionMatches = shown !== null && shown !== "" && Number(shown) === version;

  if (row.storage_path) {
    if (versionMatches) return json({ version, unchanged: true });
    const { data: signed, error: signErr } = await db()
      .storage.from(BUCKET)
      .createSignedUrl(row.storage_path, URL_TTL_SECONDS);
    // Image missing or storage hiccup: TV keeps its last image and retries.
    if (signErr || !signed) return fail("unavailable", 503);
    return json({ version, mediaId: row.media_id, url: signed.signedUrl });
  }

  if (versionMatches && !refresh) return json({ version, unchanged: true });

  const playlist = await publishedPlaylist(tokenHash);
  if (playlist === "missing") {
    return json({ version, mediaId: null, url: null });
  }
  if (playlist === "error") return fail("unavailable", 503);
  if (!playlist) return json({ version, mediaId: null, url: null });

  return json({
    version,
    mediaId: playlist.items[0].mediaId,
    url: playlist.items[0].url,
    playlist,
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

async function publishedPlaylist(tokenHash: string): Promise<PlaylistPayload | null | "missing" | "error"> {
  const { data, error } = await db().rpc("player_playlist", { p_token_hash: tokenHash });
  if (error) return isMissingSchema(error) ? "missing" : "error";
  const rows = ([...(data ?? [])] as PlaylistRow[]).sort((a, b) => a.position - b.position);
  if (!rows.length) return null;

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
