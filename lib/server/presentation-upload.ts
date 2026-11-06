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
  groupProcessingFresh,
  groupSourcePath,
  presentationGroupsReady,
  type DeckFormat,
} from "./presentation-groups";

export type GroupCompleteInput = {
  accountId: string;
  mediaId: string;
  fileName: string;
  createPlaylist: boolean;
  expandSlides: boolean;
  playbackMode: "auto" | "manual";
  playlistName: string | null;
  replace: boolean;
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
  width?: number | null;
  height?: number | null;
};

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

  if (!input.replace && existing && settled(existing)) {
    const slides = await listCommitted(input.accountId, input.mediaId, Number(existing.group_revision ?? 0));
    const expected = existing.slide_count == null ? slides.length : Number(existing.slide_count);
    if (slides.length > 0 && slides.length === expected) {
      return json(readyBody(input.mediaId, slides, existing, null));
    }
  }

  if (input.replace && !existing) return fail("Presentation not found.", 404);
  if (input.replace && existing && existing.kind !== "presentation") return fail("Presentation not found.", 404);

  if (existing?.processing_status === "processing" && groupProcessingFresh(existing.updated_at)) {
    return json({
      id: input.mediaId,
      processingStatus: "processing",
      processingDone: Number(existing.processing_done ?? 0),
      slideCount: Number(existing.slide_count ?? 0),
    }, 202);
  }

  const revision = Number(existing?.group_revision ?? 0);
  const stagingRevision = revision + 1;
  const sourcePath = input.replace
    ? groupSourcePath(input.accountId, input.mediaId, format.ext, stagingRevision)
    : (existing?.storage_path || groupSourcePath(input.accountId, input.mediaId, format.ext));

  const bytes = await readStoredObject(sourcePath);
  if (!bytes) return fail("Upload didn't arrive. Try again.", 400);

  if (!existing) {
    const inserted = await db().from("media").insert({
      id: input.mediaId,
      account_id: input.accountId,
      file_name: input.fileName,
      storage_path: sourcePath,
      mime_type: format.mime,
      size_bytes: bytes.length,
      kind: "presentation",
      processing_status: "processing",
      processing_done: 0,
      slide_count: 0,
      group_revision: 0,
      group_duration_ms: GROUP_DEFAULT_DURATION_MS,
      updated_at: new Date().toISOString(),
    });
    if (inserted.error) {
      if (String(inserted.error.code) === "23505") {
        const won = await loadOwn(input.accountId, input.mediaId);
        if (won instanceof Response) return won;
        if (won?.processing_status === "processing" && groupProcessingFresh(won.updated_at)) {
          return json({
            id: input.mediaId,
            processingStatus: "processing",
            processingDone: Number(won.processing_done ?? 0),
            slideCount: Number(won.slide_count ?? 0),
          }, 202);
        }
        if (won && settled(won)) {
          const slides = await listCommitted(input.accountId, input.mediaId, Number(won.group_revision ?? 0));
          return json(readyBody(input.mediaId, slides, won, null));
        }
      }
      return fail("Couldn't save that presentation. Try again.", 500);
    }
  } else {
    const claimed = await db().from("media").update({
      processing_status: "processing",
      processing_error: null,
      processing_done: 0,
      updated_at: new Date().toISOString(),
    }).eq("id", input.mediaId).eq("account_id", input.accountId);
    if (claimed.error) return fail("Couldn't save that presentation. Try again.", 500);
  }

  await deleteStaging(input.accountId, input.mediaId, stagingRevision);

  const converted = format.ext === "pdf"
    ? await convertPdf(bytes, async (done, total) => {
      await db().from("media").update({
        processing_status: "processing",
        processing_done: done,
        slide_count: total,
        updated_at: new Date().toISOString(),
      }).eq("id", input.mediaId).eq("account_id", input.accountId);
    })
    : await convertPptx(bytes);

  if (!converted.ok) {
    await deleteStaging(input.accountId, input.mediaId, stagingRevision);
    const message = deckErrorMessage(converted.reason, converted.detail, format).slice(0, 200);
    const keepCurrent = revision > 0;
    await db().from("media").update({
      processing_status: keepCurrent ? "ready" : "failed",
      processing_error: message,
      updated_at: new Date().toISOString(),
    }).eq("id", input.mediaId).eq("account_id", input.accountId);
    if (!keepCurrent) await removeStored([sourcePath]);
    const status = converted.reason === "size" ? 413 : converted.reason === "macros" || converted.reason === "type" ? 415 : 400;
    return fail(message, status);
  }

  await db().from("media").update({
    slide_count: converted.slides.length,
    processing_done: 0,
    updated_at: new Date().toISOString(),
  }).eq("id", input.mediaId).eq("account_id", input.accountId);

  const storedPaths: string[] = [];
  try {
    for (const slide of converted.slides) {
      const saved = await storeSlide(input.accountId, input.mediaId, input.fileName, slide, stagingRevision);
      storedPaths.push(saved.path);
      await db().from("media").update({
        processing_done: slide.index + 1,
        slide_count: converted.slides.length,
        updated_at: new Date().toISOString(),
      }).eq("id", input.mediaId).eq("account_id", input.accountId);
    }
  } catch {
    await deleteStaging(input.accountId, input.mediaId, stagingRevision);
    await removeStored(storedPaths);
    const keepCurrent = revision > 0;
    await db().from("media").update({
      processing_status: keepCurrent ? "ready" : "failed",
      processing_error: "Couldn't save that presentation. Try again.",
      updated_at: new Date().toISOString(),
    }).eq("id", input.mediaId).eq("account_id", input.accountId);
    return fail("Couldn't save that presentation. Try again.", 500);
  }

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
  });
  if (committed.error || committed.data == null) {
    await deleteStaging(input.accountId, input.mediaId, stagingRevision);
    await removeStored(storedPaths);
    return fail("Couldn't save that presentation. Try again.", 500);
  }

  if (input.replace && existing?.storage_path && existing.storage_path !== sourcePath) {
    await removeStored([String(existing.storage_path)]);
  }
  await deleteOtherRevisions(input.accountId, input.mediaId, Number(committed.data));

  const slides = await listCommitted(input.accountId, input.mediaId, Number(committed.data));
  let playlistId: string | null = null;
  if (!input.replace && input.createPlaylist) {
    const stem = input.fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "").slice(0, 80);
    const name = input.playlistName ?? (stem || "Presentation");
    playlistId = input.expandSlides
      ? await expandLegacyPlaylist(input.accountId, input.mediaId, name, input.playbackMode)
      : await createGroupPlaylist(input.accountId, input.mediaId, name, input.playbackMode, GROUP_DEFAULT_DURATION_MS);
  }

  const row = await loadOwn(input.accountId, input.mediaId);
  const parent = row instanceof Response || !row ? null : row;
  return json({
    ...readyBody(input.mediaId, slides, parent, playlistId),
    warnings: converted.warnings,
    asGroup: playlistId ? !input.expandSlides : undefined,
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
) {
  return {
    id: mediaId,
    slideIds: slides.map((slide) => slide.id),
    slideCount: slides.length,
    playlistId,
    warnings: [] as string[],
    processingStatus: "ready" as const,
    defaultDurationMs: Number(row?.group_duration_ms ?? GROUP_DEFAULT_DURATION_MS),
  };
}

async function loadOwn(accountId: string, mediaId: string): Promise<MediaRow | null | Response> {
  const existing = await db()
    .from("media")
    .select("id, kind, file_name, storage_path, processing_status, processing_error, processing_done, slide_count, group_revision, group_duration_ms, updated_at, width, height")
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
  slideRevision: number,
) {
  const slideId = crypto.randomUUID();
  const slidePath = slideStoragePath(accountId, slideId);
  const up = await db().storage.from(BUCKET).upload(slidePath, slide.png, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: false,
  });
  if (up.error) throw new Error("slide-upload");
  const stem = fileName.replace(/\.pptx$/i, "").replace(/\.pdf$/i, "");
  const inserted = await db().from("media").insert({
    id: slideId,
    account_id: accountId,
    file_name: `${stem} · slide ${slide.index + 1}.png`.slice(0, 200),
    storage_path: slidePath,
    mime_type: "image/png",
    size_bytes: slide.png.length,
    kind: "image",
    width: slide.width,
    height: slide.height,
    source_media_id: sourceMediaId,
    slide_index: slide.index,
    slide_revision: slideRevision,
  });
  if (inserted.error) {
    await removeStored([slidePath]);
    throw new Error("slide-row");
  }
  return { id: slideId, path: slidePath };
}

async function deleteStaging(accountId: string, sourceId: string, revision: number) {
  const { data } = await db()
    .from("media")
    .select("id, storage_path")
    .eq("account_id", accountId)
    .eq("source_media_id", sourceId)
    .eq("slide_revision", revision);
  const rows = data ?? [];
  if (!rows.length) return;
  const ids = rows.map((row) => String(row.id));
  const used = await db().from("playlist_items").select("media_id").eq("account_id", accountId).in("media_id", ids);
  const blocked = new Set((used.data ?? []).map((row) => String(row.media_id)));
  const drop = rows.filter((row) => !blocked.has(String(row.id)));
  if (!drop.length) return;
  await db().from("media").delete().eq("account_id", accountId).in("id", drop.map((row) => String(row.id)));
  await removeStored(drop.map((row) => String(row.storage_path)));
}

/** Drop unreferenced slides from older revisions after a successful replace. */
async function deleteOtherRevisions(accountId: string, sourceId: string, current: number) {
  const { data } = await db()
    .from("media")
    .select("id, storage_path, slide_revision")
    .eq("account_id", accountId)
    .eq("source_media_id", sourceId);
  const stale = (data ?? []).filter((row) => row.slide_revision != null && Number(row.slide_revision) !== current);
  if (!stale.length) return;
  const ids = stale.map((row) => String(row.id));
  const used = await db().from("playlist_items").select("media_id").eq("account_id", accountId).in("media_id", ids);
  const blocked = new Set((used.data ?? []).map((row) => String(row.media_id)));
  const drop = stale.filter((row) => !blocked.has(String(row.id)));
  if (!drop.length) return;
  await db().from("media").delete().eq("account_id", accountId).in("id", drop.map((row) => String(row.id)));
  await removeStored(drop.map((row) => String(row.storage_path)));
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
  return {
    format,
    createPlaylist: body.createPlaylist !== false && body.replace !== true,
    expandSlides: body.expandSlides === true,
    playbackMode: normalizePlaybackMode(body.playbackMode) ?? "auto",
    playlistName: normalizePlaylistName(body.playlistName) ?? (stem.slice(0, 80) || "Presentation"),
    replace: body.replace === true,
  };
}
