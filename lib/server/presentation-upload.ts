import { createCanvas, loadImage } from "@napi-rs/canvas";
import { BUCKET, db } from "./supabase";
import { readStoredObject, removeStored } from "./video";
import { convertPdf } from "./pdf";
import {
  convertPptx,
  pptxErrorMessage,
  slideStoragePath,
  type PptxFailure,
  type PptxSlide,
} from "./pptx";
import { normalizePlaybackMode, normalizePlaylistName } from "./validate";
import { fail, json } from "./http";
import {
  GROUP_DEFAULT_DURATION_MS,
  GROUPS_UNAVAILABLE,
  deckFormat,
  groupSourcePath,
  presentationGroupsReady,
  type DeckFormat,
} from "./presentation-groups";

export type GroupCompleteInput = {
  accountId: string;
  mediaId: string;
  fileName: string;
  /** Explicit opt-in from the website. Absent means the pre-group playlist. */
  asGroup: boolean;
  createPlaylist: boolean;
  playbackMode: "auto" | "manual";
  playlistName: string | null;
};

type MediaRow = {
  id: string;
  kind?: string | null;
  file_name?: string | null;
  storage_path?: string | null;
  processing_status?: string | null;
  processing_error?: string | null;
  processing_done?: number | null;
  slide_count?: number | null;
  group_revision?: number | null;
  group_duration_ms?: number | null;
  updated_at?: string | null;
  processing_token?: string | null;
  width?: number | null;
  height?: number | null;
};

type ClaimResult = { outcome?: string; token?: string; revision?: number; generation?: number };

class LostClaim extends Error {
  constructor() {
    super("lost-claim");
  }
}

export const HEARTBEAT_MS = 20_000;

export function deckErrorMessage(reason: PptxFailure, detail?: string, format?: DeckFormat | null) {
  if (format?.ext === "pdf" || (!format && detail)) {
    if (reason === "type") return "Upload a .pptx PowerPoint file or a PDF. Older .ppt files aren't supported.";
    if (reason === "size") return "Presentation files must be 50 MB or smaller.";
    if (reason === "empty") return "That file is empty.";
    if (reason === "corrupt" && detail) return detail.startsWith("That PDF") ? detail : "That PDF looks damaged. Export it again and try uploading it.";
    if (reason === "no_slides") return "That PDF has no pages we could read.";
    if (reason === "too_many_slides") return pptxErrorMessage(reason);
    if (reason === "convert") return detail ? `Couldn't convert that PDF. ${detail}` : "Couldn't convert that PDF. Try exporting it again.";
  }
  if (reason === "type") return "Upload a .pptx PowerPoint file or a PDF. Older .ppt files aren't supported.";
  if (reason === "size") return "Presentation files must be 50 MB or smaller.";
  return pptxErrorMessage(reason, detail);
}

export async function completeGroupedUpload(input: GroupCompleteInput): Promise<Response> {
  if (!(await presentationGroupsReady())) return fail(GROUPS_UNAVAILABLE, 503);
  const format = deckFormat(input.fileName);
  if (!format) return fail(deckErrorMessage("type"), 415);

  const existing = await loadOwn(input.accountId, input.mediaId);
  if (existing instanceof Response) return existing;

  if (existing && settled(existing)) {
    const slides = await listCommitted(input.accountId, input.mediaId, Number(existing.group_revision ?? 0));
    const expected = existing.slide_count == null ? slides.length : Number(existing.slide_count);
    if (slides.length > 0 && slides.length === expected) {
      return json(readyBody(input.mediaId, slides, existing, null, input.asGroup));
    }
  }

  const sourcePath = existing?.storage_path || groupSourcePath(input.accountId, input.mediaId, format.ext);
  const bytes = await readStoredObject(sourcePath);
  if (!bytes) return fail("Upload didn't arrive. Try again.", 400);

  let token: string;
  let revision: number;
  let generation: number;
  if (!existing) {
    token = crypto.randomUUID();
    revision = 0;
    generation = 1;
    const inserted = await db().from("media").insert({
      id: input.mediaId,
      account_id: input.accountId,
      file_name: input.fileName,
      storage_path: sourcePath,
      mime_type: format.mime,
      size_bytes: bytes.length,
      kind: "presentation",
      processing_status: "processing",
      processing_token: token,
      processing_generation: generation,
      processing_done: 0,
      slide_count: 0,
      group_revision: 0,
      group_duration_ms: GROUP_DEFAULT_DURATION_MS,
      updated_at: new Date().toISOString(),
    });
    if (inserted.error) {
      if (String(inserted.error.code) !== "23505") return fail("Couldn't save that presentation. Try again.", 500);
      const claimed = await claim(input.accountId, input.mediaId, 0);
      if (claimed instanceof Response) return claimed;
      token = claimed.token;
      revision = claimed.revision;
      generation = claimed.generation;
    }
  } else {
    const claimed = await claim(input.accountId, input.mediaId, Number(existing.group_revision ?? 0));
    if (claimed instanceof Response) return claimed;
    token = claimed.token;
    revision = claimed.revision;
    generation = claimed.generation;
  }

  const beat = startClaimHeartbeat(input.accountId, input.mediaId, token);
  let committedRevision = revision;
  let warnings: string[] = [];
  try {
    await discardOwned(input.accountId, input.mediaId, token);
    if (beat.lost()) throw new LostClaim();

    const converted = format.ext === "pdf"
      ? await convertPdf(bytes, async (done, total) => {
        await touch(input.accountId, input.mediaId, token, { processing_done: done, slide_count: total });
        if (beat.lost()) throw new LostClaim();
      })
      : await convertPptx(bytes);

    if (beat.lost()) throw new LostClaim();
    if (!converted.ok) {
      await failOwned(input.accountId, input.mediaId, token, revision, deckErrorMessage(converted.reason, converted.detail, format));
      const status = converted.reason === "size" ? 413 : converted.reason === "macros" || converted.reason === "type" ? 415 : 400;
      return fail(deckErrorMessage(converted.reason, converted.detail, format), status);
    }

    await touch(input.accountId, input.mediaId, token, { slide_count: converted.slides.length, processing_done: 0 });

    try {
      for (const slide of converted.slides) {
        if (beat.lost()) throw new LostClaim();
        await storeSlide(input.accountId, input.mediaId, input.fileName, slide, generation, token);
        await touch(input.accountId, input.mediaId, token, {
          processing_done: slide.index + 1,
          slide_count: converted.slides.length,
        });
      }
    } catch (err) {
      await failOwned(input.accountId, input.mediaId, token, revision, "Couldn't save that presentation. Try again.");
      return fail("Couldn't save that presentation. Try again.", err instanceof LostClaim ? 409 : 500);
    }

    if (beat.lost()) throw new LostClaim();
    beat.stop();
    const first = converted.slides[0];
    const committed = await db().rpc("presentation_commit_group", {
      p_account_id: input.accountId,
      p_media_id: input.mediaId,
      p_expected_revision: revision,
      p_slide_count: converted.slides.length,
      p_width: first?.width ?? null,
      p_height: first?.height ?? null,
      p_size_bytes: bytes.length,
      p_file_name: input.fileName,
      p_mime_type: format.mime,
      p_storage_path: sourcePath,
      p_generation: generation,
      p_token: token,
    });
    if (committed.error || committed.data == null) {
      await discardOwned(input.accountId, input.mediaId, token);
      return fail("Couldn't save that presentation. Try again.", 409);
    }

    committedRevision = Number(committed.data);
    warnings = converted.warnings;
  } catch (err) {
    if (!(err instanceof LostClaim)) throw err;
    await failOwned(input.accountId, input.mediaId, token, revision, "Couldn't save that presentation. Try again.");
    return fail("Couldn't save that presentation. Try again.", 409);
  } finally {
    beat.stop();
  }

  const slides = await listCommitted(input.accountId, input.mediaId, committedRevision);
  let playlistId: string | null = null;
  if (input.createPlaylist) {
    const stem = input.fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "").slice(0, 80);
    const name = input.playlistName ?? (stem || "Presentation");
    playlistId = input.asGroup
      ? await createGroupPlaylist(input.accountId, input.mediaId, name, input.playbackMode, GROUP_DEFAULT_DURATION_MS)
      : await expandLegacyPlaylist(input.accountId, input.mediaId, name, input.playbackMode);
  }

  const row = await loadOwn(input.accountId, input.mediaId);
  const parent = row instanceof Response || !row ? null : row;
  return json({
    ...readyBody(input.mediaId, slides, parent, playlistId, input.asGroup),
    warnings,
  }, 201);
}

/** A finished group, including a pre-0019 deck whose slides were already saved. */
function settled(row: MediaRow) {
  if (row.kind !== "presentation") return false;
  const status = row.processing_status ?? null;
  if (status === "failed" || status === "processing" || status === "pending") return false;
  return status === "ready" || status == null;
}

function readyBody(
  mediaId: string,
  slides: { id: string; index: number }[],
  row: MediaRow | null,
  playlistId: string | null,
  asGroup: boolean,
) {
  return {
    id: mediaId,
    slideIds: slides.map((slide) => slide.id),
    slideCount: slides.length,
    playlistId,
    warnings: [] as string[],
    processingStatus: "ready" as const,
    defaultDurationMs: Number(row?.group_duration_ms ?? GROUP_DEFAULT_DURATION_MS),
    asGroup,
  };
}

async function claim(accountId: string, mediaId: string, expectedRevision: number): Promise<{ token: string; revision: number; generation: number } | Response> {
  const claimed = await db().rpc("presentation_claim_group", {
    p_account_id: accountId,
    p_media_id: mediaId,
    p_expected_revision: expectedRevision,
  });
  if (claimed.error) return fail("Couldn't save that presentation. Try again.", 500);
  const result = (claimed.data ?? {}) as ClaimResult;
  if (result.outcome === "busy") {
    const row = await loadOwn(accountId, mediaId);
    const current = row instanceof Response || !row ? null : row;
    return json({
      id: mediaId,
      processingStatus: "processing",
      processingDone: Number(current?.processing_done ?? 0),
      slideCount: Number(current?.slide_count ?? 0),
    }, 202);
  }
  if (result.outcome !== "claimed" || !result.token) {
    return fail("Couldn't save that presentation. Try again.", result.outcome === "conflict" ? 409 : 500);
  }
  return {
    token: String(result.token),
    revision: Number(result.revision ?? expectedRevision),
    generation: Number(result.generation),
  };
}

/**
 * Renews the claim on a timer. The PostgREST builder does nothing until
 * something calls `.then()`, so each tick must consume the request.
 * `lost()` becomes true when the database says this token no longer owns the row.
 */
export function startClaimHeartbeat(accountId: string, mediaId: string, token: string) {
  let stopped = false;
  let claimLost = false;
  const timer = setInterval(() => {
    if (stopped || claimLost) return;
    const request = db().rpc("presentation_claim_heartbeat", {
      p_account_id: accountId,
      p_media_id: mediaId,
      p_token: token,
    });
    void request.then((result) => {
      if (stopped) return;
      const row = result as { data?: boolean | null; error?: { message?: string } | null };
      if (row.error) {
        console.error("presentation claim heartbeat failed", { mediaId, error: row.error.message ?? "request failed" });
        return;
      }
      if (row.data === false) {
        claimLost = true;
        clearInterval(timer);
        console.error("presentation claim was lost", { mediaId });
      }
    }, (err: unknown) => {
      if (stopped) return;
      console.error("presentation claim heartbeat failed", {
        mediaId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }, HEARTBEAT_MS);
  return {
    lost: () => claimLost,
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}

async function discardOwned(accountId: string, mediaId: string, token: string) {
  const removed = await db().rpc("presentation_discard_staging", {
    p_account_id: accountId,
    p_media_id: mediaId,
    p_token: token,
  });
  const paths = Array.isArray(removed.data) ? removed.data.map(String) : [];
  const owned = paths.filter((path) => path.startsWith(`${accountId}/`));
  if (owned.length) await removeStored(owned);
}

async function touch(accountId: string, mediaId: string, token: string, patch: Record<string, unknown>) {
  await db().from("media").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", mediaId)
    .eq("account_id", accountId)
    .eq("processing_token", token);
}

async function failOwned(
  accountId: string,
  mediaId: string,
  token: string,
  revision: number,
  message: string,
) {
  await discardOwned(accountId, mediaId, token);
  const keepSlides = revision > 0;
  // The source object stays so a retry can read it. The update is fenced by
  // the token: a stolen claim changes zero rows and does not mark the new
  // owner's row failed.
  await db().from("media").update({
    processing_status: keepSlides ? "ready" : "failed",
    processing_error: message.slice(0, 200),
    processing_token: null,
    updated_at: new Date().toISOString(),
  }).eq("id", mediaId).eq("account_id", accountId).eq("processing_token", token).select("id");
}

async function loadOwn(accountId: string, mediaId: string): Promise<MediaRow | null | Response> {
  const existing = await db()
    .from("media")
    .select("id, kind, file_name, storage_path, processing_status, processing_error, processing_done, processing_token, slide_count, group_revision, group_duration_ms, updated_at, width, height")
    .eq("id", mediaId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (existing.error) return fail("Couldn't save that presentation. Try again.", 500);
  if (!existing.data) return null;
  if (existing.data.kind !== "presentation") return fail("Couldn't save that presentation. Try again.", 409);
  return existing.data as MediaRow;
}

async function listCommitted(accountId: string, sourceId: string, revision: number) {
  const { data } = await db()
    .from("media")
    .select("id, slide_index, slide_revision")
    .eq("account_id", accountId)
    .eq("source_media_id", sourceId)
    .order("slide_index", { ascending: true });
  return (data ?? [])
    .filter((row) => revision <= 0 ? row.slide_revision == null : Number(row.slide_revision) === revision)
    .map((row) => ({ id: String(row.id), index: Number(row.slide_index) }));
}

async function storeSlide(
  accountId: string,
  sourceMediaId: string,
  fileName: string,
  slide: PptxSlide,
  generation: number,
  token: string,
) {
  const slideId = crypto.randomUUID();
  const slidePath = slideStoragePath(accountId, slideId);
  const thumbPath = slidePath.replace(/\.png$/i, ".thumb.jpg");
  const up = await db().storage.from(BUCKET).upload(slidePath, slide.png, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (up.error) throw new Error("slide-upload");
  let savedThumb: string | null = null;
  try {
    const thumb = await slideThumbnail(slide.png);
    const thumbUp = await db().storage.from(BUCKET).upload(thumbPath, thumb, {
      contentType: "image/jpeg",
      cacheControl: "31536000",
      upsert: false,
    });
    if (!thumbUp.error) savedThumb = thumbPath;
  } catch {
    savedThumb = null;
  }
  const stem = fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "");
  const inserted = await db().rpc("presentation_insert_slide", {
    p_account_id: accountId,
    p_source_id: sourceMediaId,
    p_slide_id: slideId,
    p_file_name: `${stem} · slide ${slide.index + 1}.png`.slice(0, 200),
    p_storage_path: slidePath,
    p_size_bytes: slide.png.length,
    p_width: slide.width,
    p_height: slide.height,
    p_slide_index: slide.index,
    p_generation: generation,
    p_token: token,
  });
  if (inserted.error || !inserted.data) {
    await removeStored(savedThumb ? [slidePath, savedThumb] : [slidePath]);
    throw new LostClaim();
  }
  if (savedThumb) {
    await db().from("media").update({ thumbnail_path: savedThumb }).eq("id", slideId).eq("account_id", accountId);
  }
  return { id: slideId, path: slidePath };
}

/** Small JPEG for the library and the strip. The TV still receives the full PNG. */
async function slideThumbnail(png: Uint8Array) {
  const image = await loadImage(Buffer.from(png));
  const scale = Math.min(1, 320 / Math.max(image.width, image.height, 1));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toBuffer("image/jpeg", 70);
}

async function expandLegacyPlaylist(accountId: string, mediaId: string, name: string, mode: "auto" | "manual") {
  const created = await db().rpc("presentation_create_playlist", {
    p_account_id: accountId,
    p_source_media_id: mediaId,
    p_name: name,
    p_playback_mode: mode,
  });
  if (created.error || !created.data) return null;
  return String(created.data);
}

export async function createGroupPlaylist(
  accountId: string,
  mediaId: string,
  name: string,
  mode: "auto" | "manual",
  durationMs: number,
) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const playlist = await db().from("playlists").insert({
    id,
    account_id: accountId,
    name: name.slice(0, 80),
    default_duration_ms: GROUP_DEFAULT_DURATION_MS,
    transition: "none",
    playback_mode: mode,
    created_at: now,
    updated_at: now,
  });
  if (playlist.error) return null;
  const item = await db().from("playlist_items").insert({
    playlist_id: id,
    account_id: accountId,
    media_id: mediaId,
    kind: "draft",
    position: 0,
    duration_ms: durationMs,
  });
  if (item.error) {
    await db().from("playlists").delete().eq("id", id).eq("account_id", accountId);
    return null;
  }
  return id;
}

export function readCompleteOptions(body: Record<string, unknown>, fileName: string) {
  const format = deckFormat(fileName);
  const stem = fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "");
  const asGroup = body.asGroup === true;
  return {
    format,
    asGroup,
    // No flag: same playlist as before this feature (published, one item per slide).
    createPlaylist: asGroup ? body.createPlaylist === true : body.createPlaylist !== false,
    playbackMode: normalizePlaybackMode(body.playbackMode) ?? (asGroup ? "auto" : "manual"),
    playlistName: normalizePlaylistName(body.playlistName) ?? (stem.slice(0, 80) || "Presentation"),
  };
}
