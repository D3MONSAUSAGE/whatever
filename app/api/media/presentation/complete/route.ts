import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import {
  PRESENTATION_UNAVAILABLE,
  convertPptx,
  normalizePptxFileName,
  presentationSchemaReady,
  presentationStoragePath,
  pptxErrorMessage,
  readStoredObject,
  removeStored,
  slideStoragePath,
  type PptxSlide,
} from "@/lib/server/pptx";
import { deckFormat, GROUPS_UNAVAILABLE, presentationGroupsReady } from "@/lib/server/presentation-groups";
import { completeGroupedUpload, deckErrorMessage, readCompleteOptions } from "@/lib/server/presentation-upload";
import { UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { normalizePlaybackMode, normalizePlaylistName } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Conversion can take tens of seconds for large decks; matches video complete. */
export const maxDuration = 300;

const PPTX_COMPLETE_MAX_PER_USER = 10;

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const body = await readJson(req);
  const mediaId = body.mediaId;
  if (!isUuid(mediaId)) return fail("Upload didn't arrive. Try again.", 400);
  const fileName = String(body.fileName ?? "presentation.pptx");
  const format = deckFormat(fileName) ?? deckFormat(normalizePptxFileName(fileName));

  const limited = await enforceLimit(
    `upload-pptx-complete:${admin.userId}`,
    UPLOAD_WINDOW_SECONDS,
    PPTX_COMPLETE_MAX_PER_USER,
    UPLOAD_RATE_MESSAGE,
  );
  if (limited) return limited;

  const groups = await presentationGroupsReady();
  if (groups) {
    if (!format) return fail(deckErrorMessage("type"), 415);
    const options = readCompleteOptions(body, format.ext === "pdf" ? fileName : normalizePptxFileName(fileName));
    return completeGroupedUpload({
      accountId: admin.accountId,
      mediaId,
      fileName: format.ext === "pdf" ? fileName.replace(/\.pdf$/i, "").slice(0, 180) + ".pdf" : normalizePptxFileName(fileName),
      createPlaylist: options.createPlaylist,
      expandSlides: options.expandSlides,
      playbackMode: options.playbackMode,
      playlistName: options.playlistName,
      replace: options.replace,
    });
  }

  if (format?.ext === "pdf") return fail(GROUPS_UNAVAILABLE, 503);
  if (!(await presentationSchemaReady())) return fail(PRESENTATION_UNAVAILABLE, 503);
  return completeLegacyPptx(admin.accountId, mediaId, body);
}

/** Pre-0019 behavior: one image per slide and an optional per-slide playlist. */
async function completeLegacyPptx(accountId: string, mediaId: string, body: Record<string, unknown>) {
  const path = presentationStoragePath(accountId, mediaId);
  const already = await ownPresentation(accountId, mediaId);
  if (already instanceof Response) return already;
  if (already) {
    const slides = await listSlides(accountId, mediaId);
    return json({
      id: mediaId,
      slideIds: slides.map((slide) => slide.id),
      slideCount: slides.length,
      playlistId: null,
      warnings: [] as string[],
    });
  }

  const bytes = await readStoredObject(path);
  if (!bytes) return fail("Upload didn't arrive. Try again.", 400);

  const converted = await convertPptx(bytes);
  if (!converted.ok) {
    await removeStored([path]);
    const status = converted.reason === "size" ? 413 : converted.reason === "macros" || converted.reason === "type" ? 415 : 400;
    return fail(pptxErrorMessage(converted.reason, converted.detail), status);
  }

  const fileName = normalizePptxFileName(body.fileName);
  const createPlaylist = body.createPlaylist !== false;
  const playbackMode = normalizePlaybackMode(body.playbackMode) ?? "manual";
  const playlistName = normalizePlaylistName(body.playlistName)
    ?? (fileName.replace(/\.pptx$/i, "").slice(0, 80) || "Presentation");

  const first = converted.slides[0];
  const source = await db().from("media").insert({
    id: mediaId,
    account_id: accountId,
    file_name: fileName,
    storage_path: path,
    mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    size_bytes: bytes.length,
    kind: "presentation",
    width: first?.width ?? null,
    height: first?.height ?? null,
  });
  if (source.error) {
    if (String(source.error.code) === "23505") {
      const won = await ownPresentation(accountId, mediaId);
      if (won instanceof Response) return won;
      if (won) {
        const slides = await listSlides(accountId, mediaId);
        return json({
          id: mediaId,
          slideIds: slides.map((slide) => slide.id),
          slideCount: slides.length,
          playlistId: null,
          warnings: converted.warnings,
        });
      }
    }
    await removeStored([path]);
    return fail("Couldn't save that presentation. Try again.", 500);
  }

  const slideIds: string[] = [];
  const slidePaths: string[] = [];
  try {
    for (const slide of converted.slides) {
      const saved = await storeSlide(accountId, mediaId, fileName, slide);
      slideIds.push(saved.id);
      slidePaths.push(saved.path);
    }
  } catch {
    await db().from("media").delete().eq("account_id", accountId).eq("source_media_id", mediaId);
    await db().from("media").delete().eq("account_id", accountId).eq("id", mediaId);
    await removeStored([path, ...slidePaths]);
    return fail(pptxErrorMessage("convert"), 500);
  }

  let playlistId: string | null = null;
  if (createPlaylist) {
    const created = await db().rpc("presentation_create_playlist", {
      p_account_id: accountId,
      p_source_media_id: mediaId,
      p_name: playlistName,
      p_playback_mode: playbackMode,
    });
    if (!created.error && created.data) playlistId = String(created.data);
  }

  return json({
    id: mediaId,
    slideIds,
    slideCount: slideIds.length,
    playlistId,
    warnings: converted.warnings,
  }, 201);
}

async function storeSlide(accountId: string, sourceMediaId: string, fileName: string, slide: PptxSlide) {
  const slideId = crypto.randomUUID();
  const slidePath = slideStoragePath(accountId, slideId);
  const up = await db().storage.from(BUCKET).upload(slidePath, slide.png, {
    contentType: "image/png",
    cacheControl: "3600",
    upsert: false,
  });
  if (up.error) throw new Error("slide-upload");
  const inserted = await db().from("media").insert({
    id: slideId,
    account_id: accountId,
    file_name: `${fileName.replace(/\.pptx$/i, "")} · slide ${slide.index + 1}.png`,
    storage_path: slidePath,
    mime_type: "image/png",
    size_bytes: slide.png.length,
    kind: "image",
    width: slide.width,
    height: slide.height,
    source_media_id: sourceMediaId,
    slide_index: slide.index,
  });
  if (inserted.error) {
    await removeStored([slidePath]);
    throw new Error("slide-row");
  }
  return { id: slideId, path: slidePath };
}

async function ownPresentation(accountId: string, mediaId: string): Promise<true | Response | null> {
  const existing = await db().from("media").select("id, kind").eq("id", mediaId).eq("account_id", accountId).maybeSingle();
  if (existing.error) return fail("Couldn't save that presentation. Try again.", 500);
  if (!existing.data) return null;
  if (existing.data.kind !== "presentation") return fail("Couldn't save that presentation. Try again.", 409);
  return true;
}

async function listSlides(accountId: string, sourceMediaId: string) {
  const { data } = await db()
    .from("media")
    .select("id, slide_index")
    .eq("account_id", accountId)
    .eq("source_media_id", sourceMediaId)
    .order("slide_index", { ascending: true });
  return (data ?? []).map((row) => ({ id: String(row.id), index: Number(row.slide_index) }));
}
