import { isUuid } from "./crypto";
import { isMissingSchema } from "./schema";
import { db } from "./supabase";

/** Per-slide bounds for a presentation group. Image and video slides stay 1–600s. */
export const GROUP_MIN_DURATION_MS = 3000;
export const GROUP_MAX_DURATION_MS = 3_600_000;
export const GROUP_DEFAULT_DURATION_MS = 10_000;
/** A processing row older than this can be taken over by a retry. */
export const GROUP_STALE_MS = 2 * 60 * 1000;

export const PDF_MIME = "application/pdf";

export const GROUPS_UNAVAILABLE =
  "Presentation groups aren't available yet. Apply migration 0019_presentation_groups.sql, then reload.";

export type DeckFormat = { ext: "pptx" | "pdf"; mime: string };

export function deckFormat(fileName: string): DeckFormat | null {
  const name = fileName.trim().toLowerCase();
  if (name.endsWith(".pptm") || name.endsWith(".ppt")) return null;
  if (name.endsWith(".pptx")) {
    return { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" };
  }
  if (name.endsWith(".pdf")) return { ext: "pdf", mime: PDF_MIME };
  return null;
}

/** Canonical object for a new upload, or a generation-specific object while replacing. */
export function groupSourcePath(accountId: string, mediaId: string, ext: "pptx" | "pdf", generation?: number) {
  if (generation == null) return `${accountId}/${mediaId}.${ext}`;
  return `${accountId}/${mediaId}-r${generation}.${ext}`;
}

export function effectiveSlideDuration(
  slideOverride: number | null | undefined,
  playlistDuration: number | null | undefined,
  groupDefault: number | null | undefined,
) {
  const raw = slideOverride ?? playlistDuration ?? groupDefault ?? GROUP_DEFAULT_DURATION_MS;
  if (!Number.isFinite(raw)) return GROUP_DEFAULT_DURATION_MS;
  const ms = Math.round(raw);
  if (ms < GROUP_MIN_DURATION_MS) return GROUP_MIN_DURATION_MS;
  if (ms > GROUP_MAX_DURATION_MS) return GROUP_MAX_DURATION_MS;
  return ms;
}

export function parseGroupDurationMs(input: unknown): number | null | "invalid" {
  if (input === null) return null;
  if (typeof input !== "number" || !Number.isInteger(input)) return "invalid";
  if (input < GROUP_MIN_DURATION_MS || input > GROUP_MAX_DURATION_MS) return "invalid";
  return input;
}

export function groupProcessingFresh(updatedAt: unknown, now = Date.now()) {
  const ms = Date.parse(String(updatedAt ?? ""));
  if (!Number.isFinite(ms)) return false;
  return now - ms < GROUP_STALE_MS;
}

/** True once 0019 columns exist. False is not cached, so a just-applied migration works without a restart. */
export async function presentationGroupsReady() {
  const probe = await db().from("media").select("processing_status, group_revision").limit(1);
  if (!probe.error) return true;
  return !isMissingSchema(probe.error);
}

export type ExpandableRow = {
  playlistId: string;
  transition: string | null;
  playbackMode: string | null;
  position: number;
  mediaId: string;
  storagePath: string;
  durationMs: number;
  kind: string | null;
  width: number | null;
  height: number | null;
};

export type ExpandedRow = ExpandableRow & {
  groupId?: string;
  groupName?: string;
  groupIndex?: number;
  groupCount?: number;
};

type ParentRow = {
  id: string;
  file_name?: string | null;
  group_revision?: number | null;
  group_duration_ms?: number | null;
  processing_status?: string | null;
  account_id?: string | null;
};

type SlideRow = {
  id: string;
  source_media_id?: string | null;
  storage_path?: string | null;
  slide_index?: number | null;
  slide_revision?: number | null;
  slide_duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  account_id?: string | null;
};

function accountFromPath(storagePath: string) {
  const id = storagePath.split("/")[0] ?? "";
  return isUuid(id) ? id : null;
}

/**
 * Replace each presentation playlist row with its committed slides, in order.
 * A row that is not a presentation is returned unchanged.
 * Slides that are still processing on a brand-new group are omitted.
 * A replace in progress keeps the previously committed revision.
 */
export async function expandPresentationRows(rows: ExpandableRow[]): Promise<ExpandedRow[] | "error"> {
  const parents = rows.filter((row) => row.kind === "presentation");
  if (!parents.length) return rows;

  const ids = [...new Set(parents.map((row) => row.mediaId))];
  const parentQuery = await db()
    .from("media")
    .select("id, file_name, group_revision, group_duration_ms, processing_status, account_id")
    .in("id", ids);
  if (parentQuery.error) {
    if (isMissingSchema(parentQuery.error)) {
      return rows.filter((row) => row.kind !== "presentation");
    }
    return "error";
  }
  const parentById = new Map<string, ParentRow>((parentQuery.data ?? []).map((row) => [String(row.id), row as ParentRow]));

  const slideQuery = await db()
    .from("media")
    .select("id, source_media_id, storage_path, slide_index, slide_revision, slide_duration_ms, width, height, account_id")
    .in("source_media_id", ids);
  if (slideQuery.error) {
    if (isMissingSchema(slideQuery.error)) {
      return rows.filter((row) => row.kind !== "presentation");
    }
    return "error";
  }

  const slidesByParent = new Map<string, SlideRow[]>();
  for (const slide of (slideQuery.data ?? []) as SlideRow[]) {
    const parentId = String(slide.source_media_id ?? "");
    const list = slidesByParent.get(parentId) ?? [];
    list.push(slide);
    slidesByParent.set(parentId, list);
  }

  const expanded: ExpandedRow[] = [];
  for (const row of rows) {
    if (row.kind !== "presentation") {
      expanded.push(row);
      continue;
    }
    const parent = parentById.get(row.mediaId);
    const accountId = accountFromPath(row.storagePath) ?? (parent?.account_id ? String(parent.account_id) : null);
    if (!parent || !accountId || (parent.account_id && String(parent.account_id) !== accountId)) continue;
    const revision = Number(parent.group_revision ?? 0);
    const status = parent.processing_status ?? null;
    if (revision <= 0 && status && status !== "ready") continue;
    const slides = (slidesByParent.get(row.mediaId) ?? [])
      .filter((slide) => {
        if (slide.account_id && String(slide.account_id) !== accountId) return false;
        if (!slide.storage_path || slide.slide_index == null) return false;
        if (revision <= 0) return slide.slide_revision == null;
        return Number(slide.slide_revision) === revision;
      })
      .sort((a, b) => Number(a.slide_index) - Number(b.slide_index) || String(a.id).localeCompare(String(b.id)));
    const count = slides.length;
    slides.forEach((slide, index) => {
      expanded.push({
        playlistId: row.playlistId,
        transition: row.transition,
        playbackMode: row.playbackMode,
        position: row.position + index / 1000,
        mediaId: String(slide.id),
        storagePath: String(slide.storage_path),
        durationMs: effectiveSlideDuration(slide.slide_duration_ms, row.durationMs, parent.group_duration_ms),
        kind: "image",
        width: typeof slide.width === "number" ? slide.width : null,
        height: typeof slide.height === "number" ? slide.height : null,
        groupId: row.mediaId,
        groupName: String(parent.file_name ?? "Presentation"),
        groupIndex: index,
        groupCount: count,
      });
    });
  }
  return expanded;
}
