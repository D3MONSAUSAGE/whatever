/** Browser-local Layout Studio drafts. Scoped like pekko-slide-src: userId:orgId. */

import { boardAfterReload, freshBoard, type AccountStudio } from "@/lib/layout-account";
import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";

export const LEGACY_DRAFT_KEY = "layout-studio-draft-v1";
export const LEGACY_PUBLISHED_KEY = "layout-studio-published-v1";

export type StudioScope = { userId: string; orgId: string };

export type StudioSnapshot = {
  userId: string;
  orgId: string;
  boardId?: string | null;
  doc: LayoutDocument;
  imageHref: string | null;
  videoOn: boolean;
  svg?: string;
  videoBox?: { x: number; y: number; w: number; h: number } | null;
};

/** A scope id must be a real non-empty string. Empty, null, and the literal "undefined" are refused. */
export function isUsableScopeId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value !== "undefined" && value !== "null";
}

export function isStudioScope(value: unknown): value is StudioScope {
  if (!value || typeof value !== "object") return false;
  const row = value as { userId?: unknown; orgId?: unknown };
  return isUsableScopeId(row.userId) && isUsableScopeId(row.orgId);
}

export class InvalidStudioScopeError extends Error {
  constructor(message = "Layout Studio drafts require a user and an organization.") {
    super(message);
    this.name = "InvalidStudioScopeError";
  }
}

function assertStudioScope(scope: { userId?: unknown; orgId?: unknown } | null | undefined): asserts scope is StudioScope {
  if (!isStudioScope(scope)) {
    throw new InvalidStudioScopeError();
  }
}

export function sameStudioScope(a: StudioScope | null | undefined, b: StudioScope | null | undefined): boolean {
  return Boolean(a && b && a.userId === b.userId && a.orgId === b.orgId);
}

export function draftStorageKey(scope: StudioScope): string {
  assertStudioScope(scope);
  return `${LEGACY_DRAFT_KEY}:${scope.userId}:${scope.orgId}`;
}

export function publishedStorageKey(scope: StudioScope): string {
  assertStudioScope(scope);
  return `${LEGACY_PUBLISHED_KEY}:${scope.userId}:${scope.orgId}`;
}

export function isStudioStorageKey(key: string): boolean {
  return key === LEGACY_DRAFT_KEY
    || key === LEGACY_PUBLISHED_KEY
    || key.startsWith(`${LEGACY_DRAFT_KEY}:`)
    || key.startsWith(`${LEGACY_PUBLISHED_KEY}:`);
}

function readJson(storage: Pick<Storage, "getItem">, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function snapshotFrom(value: unknown, scope: StudioScope): StudioSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.userId !== scope.userId || row.orgId !== scope.orgId) return null;
  const parsed = parseLayout(row.doc);
  if (!parsed.ok) return null;
  return {
    userId: scope.userId,
    orgId: scope.orgId,
    boardId: typeof row.boardId === "string" ? row.boardId : null,
    doc: parsed.value,
    imageHref: typeof row.imageHref === "string" ? row.imageHref : null,
    videoOn: row.videoOn === true,
    svg: typeof row.svg === "string" ? row.svg : undefined,
    videoBox: row.videoBox && typeof row.videoBox === "object" ? row.videoBox as StudioSnapshot["videoBox"] : undefined,
  };
}

/** Restore a scoped snapshot. Mismatched org/user and unscoped legacy keys are ignored, never displayed, and not deleted. */
export function readStudioDraft(storage: Pick<Storage, "getItem">, scope: StudioScope | null): StudioSnapshot | null {
  if (!isStudioScope(scope)) return null;
  return snapshotFrom(readJson(storage, draftStorageKey(scope)), scope);
}

export function readStudioPublished(storage: Pick<Storage, "getItem">, scope: StudioScope | null): StudioSnapshot | null {
  if (!isStudioScope(scope)) return null;
  return snapshotFrom(readJson(storage, publishedStorageKey(scope)), scope);
}

export function writeStudioDraft(
  storage: Pick<Storage, "setItem">,
  scope: StudioScope,
  snapshot: Omit<StudioSnapshot, "userId" | "orgId">,
): void {
  assertStudioScope(scope);
  storage.setItem(draftStorageKey(scope), JSON.stringify({ ...snapshot, userId: scope.userId, orgId: scope.orgId }));
}

export function writeStudioPublished(
  storage: Pick<Storage, "setItem">,
  scope: StudioScope,
  snapshot: Omit<StudioSnapshot, "userId" | "orgId">,
): void {
  assertStudioScope(scope);
  storage.setItem(publishedStorageKey(scope), JSON.stringify({ ...snapshot, userId: scope.userId, orgId: scope.orgId }));
}

/**
 * Account mode never reads browser drafts, including the unscoped legacy keys.
 * Isolated preview only restores a snapshot whose stored userId and orgId match the current scope.
 */
export function loadBrowserStudioState(options: {
  accountMode: boolean;
  scope: StudioScope | null;
  storage: Pick<Storage, "getItem">;
}): { draft: StudioSnapshot | null; published: StudioSnapshot | null; ignoredLegacy: boolean } {
  const ignoredLegacy = Boolean(options.storage.getItem(LEGACY_DRAFT_KEY) || options.storage.getItem(LEGACY_PUBLISHED_KEY));
  if (options.accountMode) return { draft: null, published: null, ignoredLegacy };
  return {
    draft: readStudioDraft(options.storage, options.scope),
    published: readStudioPublished(options.storage, options.scope),
    ignoredLegacy,
  };
}

function collectStudioKeys(storage: Pick<Storage, "length" | "key">): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && isStudioStorageKey(key)) keys.push(key);
  }
  return keys;
}

/** Drop every Layout Studio draft and published snapshot, including unscoped legacy keys. Call only on sign-out or user change. */
export function clearLayoutStudioDraftsOnSignOut(storage?: Pick<Storage, "length" | "key" | "removeItem"> | null): void {
  const store = storage ?? (typeof localStorage === "undefined" ? null : localStorage);
  if (!store) return;
  try {
    for (const key of collectStudioKeys(store)) store.removeItem(key);
  } catch {
    /* private mode */
  }
}

/** SIGNED_OUT and a different user clear drafts. TOKEN_REFRESHED and a first SIGNED_IN do not. */
export function shouldClearStudioDraftsOnAuthEvent(event: string, previousUserId: string | null, nextUserId: string | null): boolean {
  if (event === "SIGNED_OUT") return true;
  if (previousUserId && previousUserId !== nextUserId) return true;
  return false;
}

/**
 * Same user, different org: show the new org's scoped draft, or a fresh board.
 * Never display the previous org's document. Do not delete the new (current) org's keys.
 */
export function editorStateAfterScopeChange(storage: Pick<Storage, "getItem">, next: StudioScope | null): {
  draft: StudioSnapshot | null;
  published: StudioSnapshot | null;
  resetToFresh: boolean;
} {
  if (!next) return { draft: null, published: null, resetToFresh: true };
  const draft = readStudioDraft(storage, next);
  const published = readStudioPublished(storage, next);
  return { draft, published, resetToFresh: !draft };
}

/**
 * When the signed-in preview has no board for this account, start a fresh one.
 * Never keep a previous org's document on screen.
 */
export function signedInPreviewLoad(studio: AccountStudio, menuId: string | null): {
  kind: "board" | "fresh";
  board: ReturnType<typeof boardAfterReload>;
  fresh?: ReturnType<typeof freshBoard>;
} {
  const board = boardAfterReload(studio, menuId);
  if (board) return { kind: "board", board };
  return { kind: "fresh", board: null, fresh: freshBoard(studio.boards.length) };
}

export type SaveAccountGuard = { allow: true } | { allow: false; resetToFresh: boolean; message: string };

/**
 * The account-mode load often runs before resolveStudioScope finishes, so origin is still null.
 * If the document came from this account, tag origin with the resolved scope instead of refusing a legitimate save.
 */
export function originAfterScopeResolves(
  fromCurrentAccount: boolean,
  origin: StudioScope | null,
  scope: StudioScope | null,
): StudioScope | null {
  if (!fromCurrentAccount || !isStudioScope(scope)) return origin;
  if (!origin || sameStudioScope(origin, scope)) return scope;
  return origin;
}

/** A still-resolving scope must not be treated as a mismatch, and must not reset the editor. */
export function saveShouldWaitForScope(fromCurrentAccount: boolean, origin: StudioScope | null, scope: StudioScope | null): boolean {
  return fromCurrentAccount && !isStudioScope(scope) && !isStudioScope(origin);
}

/**
 * Refuse to POST a document that did not originate on the current user and org.
 * A mismatch resets the editor to a fresh board so a stale org-A draft cannot become an org-B menu.
 */
export function saveAccountGuard(origin: StudioScope | null, current: StudioScope | null): SaveAccountGuard {
  if (!isStudioScope(current)) {
    return { allow: false, resetToFresh: false, message: "Couldn't confirm this board belongs to the signed-in account. It was not saved." };
  }
  if (!isStudioScope(origin)) {
    return { allow: false, resetToFresh: false, message: "Couldn't confirm this board belongs to the signed-in account. It was not saved." };
  }
  if (!sameStudioScope(origin, current)) {
    return {
      allow: false,
      resetToFresh: true,
      message: "That draft belonged to another account. It was not saved. A new board is open instead.",
    };
  }
  return { allow: true };
}

/** Pull org id from an existing entitlements payload (account_id is already returned). No API change. */
export function orgIdFromEntitlements(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const id = (body as { account_id?: unknown }).account_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function orgIdFromUser(user: { app_metadata?: unknown; user_metadata?: unknown } | null | undefined): string | null {
  if (!user) return null;
  for (const bag of [user.app_metadata, user.user_metadata]) {
    if (!bag || typeof bag !== "object") continue;
    const row = bag as Record<string, unknown>;
    for (const key of ["account_id", "accountId", "org_id", "orgId"]) {
      if (typeof row[key] === "string" && row[key]) return row[key] as string;
    }
  }
  return null;
}

export async function resolveStudioScope(
  session: { access_token?: string; user?: { id?: string; app_metadata?: unknown; user_metadata?: unknown } } | null,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioScope | null> {
  const userId = session?.user?.id;
  const token = session?.access_token;
  if (!userId || !token) return null;
  const fromUser = orgIdFromUser(session.user);
  if (fromUser) return { userId, orgId: fromUser };
  try {
    const res = await fetchImpl("/api/entitlements", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const orgId = orgIdFromEntitlements(await res.json().catch(() => null));
    return orgId ? { userId, orgId } : null;
  } catch {
    return null;
  }
}
