import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { isUuid } from "@/lib/server/crypto";
import { fail, json, readJson } from "@/lib/server/http";
import { GROUPS_UNAVAILABLE, parseGroupDurationMs, presentationGroupsReady } from "@/lib/server/presentation-groups";
import { playlistsUsingMedia } from "@/lib/server/media-usage";
import { normalizeFileName } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await presentationGroupsReady())) return fail(GROUPS_UNAVAILABLE, 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Presentation not found.", 404);
  const detail = await loadDetail(admin.accountId, id);
  if (detail instanceof Response) return detail;
  return json(detail);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  if (!(await presentationGroupsReady())) return fail(GROUPS_UNAVAILABLE, 503);
  const { id } = await ctx.params;
  if (!isUuid(id)) return fail("Presentation not found.", 404);
  const parent = await db()
    .from("media")
    .select("id, kind, file_name, group_revision")
    .eq("id", id)
    .eq("account_id", admin.accountId)
    .maybeSingle();
  if (parent.error) return fail("Couldn't update that presentation.", 500);
  if (!parent.data || parent.data.kind !== "presentation") return fail("Presentation not found.", 404);

  const body = await readJson(req);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = normalizeFileName(body.name);
    if (!name) return fail("Give the presentation a name.", 400);
    patch.file_name = name.slice(0, 200);
  }
  if (body.defaultDurationMs !== undefined) {
    const duration = parseGroupDurationMs(body.defaultDurationMs);
    if (duration === "invalid" || duration === null) {
      return fail("Default duration must be between 3 and 3600 seconds.", 400);
    }
    patch.group_duration_ms = duration;
  }
  if (Object.keys(patch).length > 1) {
    const saved = await db().from("media").update(patch).eq("id", id).eq("account_id", admin.accountId);
    if (saved.error) return fail("Couldn't update that presentation.", 500);
  }

  if (Array.isArray(body.slides)) {
    const revision = Number(parent.data.group_revision ?? 0);
    for (const entry of body.slides) {
      if (!entry || typeof entry !== "object") return fail("Check the slide times and try again.", 400);
      const slideId = (entry as { id?: unknown }).id;
      if (!isUuid(slideId)) return fail("Check the slide times and try again.", 400);
      const duration = parseGroupDurationMs((entry as { durationMs?: unknown }).durationMs);
      if (duration === "invalid") return fail("Each slide must be between 3 and 3600 seconds, or cleared to use the default.", 400);
      const slide = await db()
        .from("media")
        .select("id, slide_revision")
        .eq("id", slideId)
        .eq("account_id", admin.accountId)
        .eq("source_media_id", id)
        .maybeSingle();
      if (slide.error || !slide.data) return fail("That slide is no longer in this presentation.", 404);
      if (revision > 0 && Number(slide.data.slide_revision) !== revision) {
        return fail("That slide is no longer in this presentation.", 404);
      }
      const updated = await db()
        .from("media")
        .update({ slide_duration_ms: duration, updated_at: new Date().toISOString() })
        .eq("id", slideId)
        .eq("account_id", admin.accountId);
      if (updated.error) return fail("Couldn't update that presentation.", 500);
    }
  }

  const detail = await loadDetail(admin.accountId, id);
  if (detail instanceof Response) return detail;
  return json(detail);
}

async function loadDetail(accountId: string, id: string) {
  const parent = await db()
    .from("media")
    .select("id, kind, file_name, storage_path, mime_type, size_bytes, created_at, updated_at, width, height, processing_status, processing_error, processing_done, slide_count, group_duration_ms, group_revision")
    .eq("id", id)
    .eq("account_id", accountId)
    .maybeSingle();
  if (parent.error) return fail("Couldn't load that presentation.", 500);
  if (!parent.data || parent.data.kind !== "presentation") return fail("Presentation not found.", 404);
  const row = parent.data as Record<string, unknown>;

  const revision = Number(row.group_revision ?? 0);
  const slidesQuery = await db()
    .from("media")
    .select("id, file_name, storage_path, slide_index, slide_revision, slide_duration_ms, width, height")
    .eq("account_id", accountId)
    .eq("source_media_id", id)
    .order("slide_index", { ascending: true });
  if (slidesQuery.error) return fail("Couldn't load that presentation.", 500);
  const slides = (slidesQuery.data ?? []).filter((slide) => {
    if (revision <= 0) return slide.slide_revision == null;
    return Number(slide.slide_revision) === revision;
  });
  const paths = slides.map((slide) => String(slide.storage_path)).filter(Boolean);
  const urls = new Map<string, string>();
  if (paths.length) {
    const signed = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    signed.data?.forEach((item) => item.path && item.signedUrl && urls.set(item.path, item.signedUrl));
  }
  const cover = slides[0];
  const usedIds = [id, ...slides.map((slide) => String(slide.id))];
  const used = new Map<string, { id: string; name: string }>();
  for (const mediaId of usedIds) {
    const lists = await playlistsUsingMedia(accountId, mediaId);
    if (lists === null) return fail("Couldn't load that presentation.", 500);
    for (const list of lists) used.set(list.id, list);
  }

  return {
    id,
    fileName: String(row.file_name ?? "Presentation"),
    originalFileName: String(row.file_name ?? "Presentation"),
    mimeType: String(row.mime_type ?? ""),
    sizeBytes: Number(row.size_bytes ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    processingStatus: row.processing_status ?? (slides.length ? "ready" : "pending"),
    processingError: row.processing_error ?? null,
    processingDone: Number(row.processing_done ?? slides.length),
    slideCount: Number(row.slide_count ?? slides.length),
    defaultDurationMs: Number(row.group_duration_ms ?? 10000),
    coverUrl: cover ? urls.get(String(cover.storage_path)) ?? null : null,
    usedIn: [...used.values()].sort((a, b) => a.name.localeCompare(b.name)),
    slides: slides.map((slide) => ({
      id: String(slide.id),
      fileName: String(slide.file_name ?? "Slide"),
      index: Number(slide.slide_index ?? 0),
      url: urls.get(String(slide.storage_path)) ?? null,
      width: slide.width ?? null,
      height: slide.height ?? null,
      durationMs: slide.slide_duration_ms ?? null,
    })),
  };
}
