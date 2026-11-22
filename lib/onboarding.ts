/**
 * Onboarding v2 (t409u, menu first). Shared by the server, the web checklist and tests; no server imports.
 *
 * v1 (`GET /api/onboarding`, no query) keeps its eight ids for Android +17..+31. v2 (`?v=2`) uses the ids
 * below. Five are required for completion; three are optional discovery and never block it.
 */
export const V2_STEP_IDS = [
  "first_menu", "preview_menu", "customize_menu", "screen", "show_on_tv", "first_update", "playlists", "schedules",
] as const;
export type V2StepId = (typeof V2_STEP_IDS)[number];

export const V2_REQUIRED: readonly V2StepId[] = ["first_menu", "preview_menu", "screen", "show_on_tv", "first_update"];
export const V2_OPTIONAL: readonly V2StepId[] = ["customize_menu", "playlists", "schedules"];
/** Steps a client may record with POST { recordStep }. The rest are earned from real data only. */
export const RECORDABLE_STEPS = ["preview_menu", "customize_menu", "playlists", "schedules"] as const;
export type RecordableStep = (typeof RECORDABLE_STEPS)[number];

export const isV2StepId = (v: unknown): v is V2StepId => typeof v === "string" && (V2_STEP_IDS as readonly string[]).includes(v);
export const isRecordableStep = (v: unknown): v is RecordableStep => typeof v === "string" && (RECORDABLE_STEPS as readonly string[]).includes(v);

export type Milestones = Partial<Record<V2StepId, string>>;

/** What "Preview menu" opens: the newest saved board, else the newest upload. */
export type PreviewTarget = { kind: "menu_board"; menuId: string } | { kind: "upload"; mediaId: string };

export type OnboardingV2Step = {
  id: V2StepId;
  done: boolean;
  required: boolean;
  optional: boolean;
  /** When the milestone was first earned (ISO), or null when not earned or not recorded yet. */
  doneAt: string | null;
  /** show_on_tv only: a TV reported painting the content. */
  confirmed?: boolean;
};

export type OnboardingV2State = {
  version: 2;
  steps: OnboardingV2Step[];
  completed: number;
  total: number;
  requiredCompleted: number;
  requiredTotal: number;
  /** First required step not done yet. Advisory only; steps are never forced in order. */
  nextStep: V2StepId | null;
  dismissed: boolean;
  finished: boolean;
  completedAt: string | null;
  show: boolean;
  /** "Your first menu is ready!" Shown once; POST { dismissFirstSuccess: true } hides it everywhere. */
  showFirstSuccess: boolean;
  previewTarget: PreviewTarget | null;
};

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/**
 * A saved board counts as a first menu when it has at least one named item, or a featured photo or video.
 * Uses what the existing parsers already store (classic and Layout Studio share sections[].items[].name).
 * A title-only or empty scratch board does not count; saving it still works exactly as before.
 */
export function menuHasUsableContent(content: unknown): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const c = content as Record<string, unknown>;
  if (filled(c.imageMediaId) || filled(c.videoMediaId) || filled(c.photoMediaId)) return true;
  if (!Array.isArray(c.sections)) return false;
  return c.sections.some((s) => !!s && typeof s === "object" && Array.isArray((s as { items?: unknown }).items)
    && ((s as { items: unknown[] }).items).some((i) => !!i && typeof i === "object" && filled((i as { name?: unknown }).name)));
}

/** Board stills and promo stills are written to media by the server, not uploaded by the owner. */
export function isRenderedFileName(name: unknown): boolean {
  return typeof name === "string" && / \((menu|promo)\)\.png$/.test(name);
}

/** A finished, top-level upload by the owner: not a board/promo still, not a slide, not converting or failed. */
export function isUsableUpload(row: { file_name?: unknown; source_media_id?: unknown; processing_status?: unknown }): boolean {
  if (row.source_media_id) return false;
  if (isRenderedFileName(row.file_name)) return false;
  return row.processing_status == null || row.processing_status === "ready";
}

/** The owner changed the look of a board: guided customization, or their own colours. */
export function menuIsCustomized(content: unknown): boolean {
  if (!content || typeof content !== "object" || Array.isArray(content)) return false;
  const c = content as Record<string, unknown>;
  if (c.custom && typeof c.custom === "object" && Object.keys(c.custom as object).some((k) => k !== "v")) return true;
  return ["primaryColor", "accentColor", "textColor", "backgroundColor"].some((k) => filled(c[k]));
}

/** True when two content changes were recorded for the same screen: the first publish, then an update. */
export function hasSecondContentChange(subjectIds: (string | null | undefined)[]): boolean {
  const seen = new Set<string>();
  for (const id of subjectIds) {
    if (!id) continue;
    if (seen.has(id)) return true;
    seen.add(id);
  }
  return false;
}

/** Pure v2 assembly from milestones and live facts. */
export function buildV2State(input: {
  milestones: Milestones | null;
  live: Partial<Record<V2StepId, boolean>>;
  confirmed: boolean;
  dismissed: boolean;
  completedAt: string | null;
  /** v1 rule (8/8 or pre-launch customer). Used when the milestone columns aren't there yet. */
  legacyFinished: boolean;
  celebratedAt: string | null;
  previewTarget: PreviewTarget | null;
}): OnboardingV2State {
  const m = input.milestones;
  const tracked = m !== null;
  const steps: OnboardingV2Step[] = V2_STEP_IDS.map((id) => {
    const at = m?.[id] ?? null;
    let done = !!at || !!input.live[id];
    // Without the milestone columns preview can't be recorded; don't leave anyone stuck on it.
    if (!tracked && id === "preview_menu") done = done || !!input.live.first_menu;
    const step: OnboardingV2Step = { id, done, required: V2_REQUIRED.includes(id), optional: V2_OPTIONAL.includes(id), doneAt: at };
    if (id === "show_on_tv") step.confirmed = done && input.confirmed;
    return step;
  });
  const required = steps.filter((s) => s.required);
  const requiredCompleted = required.filter((s) => s.done).length;
  const finished = !!input.completedAt || input.legacyFinished || requiredCompleted === required.length;
  const firstMenuDone = steps[0].done;
  return {
    version: 2,
    steps,
    completed: steps.filter((s) => s.done).length,
    total: steps.length,
    requiredCompleted,
    requiredTotal: required.length,
    nextStep: required.find((s) => !s.done)?.id ?? null,
    dismissed: input.dismissed,
    finished,
    completedAt: input.completedAt,
    show: !input.dismissed && !finished,
    showFirstSuccess: tracked && firstMenuDone && !input.celebratedAt && !input.dismissed,
    previewTarget: input.previewTarget,
  };
}
