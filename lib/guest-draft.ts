/**
 * Guest menu drafts: a visitor's menu and its photos, kept in this browser until they create an account
 * (docs/GUEST_EDITOR_PLAN.md §3.2). Nothing here talks to the server.
 *
 * Storage: IndexedDB (database `pekko_guest`): one `draft` record and an `images` store of Blobs. IndexedDB holds
 * binary data without base64 overhead and has far larger quotas than localStorage on iOS Safari and Android Chrome.
 * When IndexedDB can't be opened (some private modes), everything falls back to memory for this tab and
 * `persistent` reports false so the editor can say so.
 *
 * The draft is never deleted by the editor. Only `clearGuestDraft`, called after the server confirms the menu is in
 * the account, removes it (Phase 2).
 */
import type { LayoutDocument } from "@/lib/layout-studio";

export const GUEST_ID_PREFIX = "guest:";
export const GUEST_MAX_IMAGES = 12;
export const GUEST_MAX_TOTAL_BYTES = 30 * 1024 * 1024;
/** Longest side after downscaling: enough for a 1920×1080 board's largest photo area with headroom. */
export const GUEST_MAX_EDGE = 2400;
/** Drafts untouched this long are discarded on the next visit. */
export const GUEST_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type GuestAction = "save" | "display" | "share" | "download";
export type GuestSource = "demo" | "cta" | "direct" | "resume";

export type GuestDraft = {
  v: 1;
  draftId: string;
  name: string;
  document: LayoutDocument;
  createdAt: number;
  updatedAt: number;
  /** How the visitor first arrived (for analytics). */
  from: GuestSource;
  /** Set once the visitor changed something (customization started is counted once per draft). */
  edited?: boolean;
  /** The account action a registration prompt was opened for, kept so it resumes after sign-in. */
  intent?: GuestAction | null;
  /** Phase 2: guest image id → uploaded media id, so a retried claim never uploads twice. */
  uploaded?: Record<string, string>;
};

export type GuestImage = { id: string; name: string; type: string; size: number; width: number; height: number; blob: Blob; createdAt: number };
export type GuestImageMeta = Omit<GuestImage, "blob">;

export function isGuestId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.startsWith(GUEST_ID_PREFIX);
}

export function newGuestId(): string {
  return GUEST_ID_PREFIX + randomId();
}

export function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Every guest image id a document points at (featured photo, logo, item photos). */
export function guestIdsIn(doc: LayoutDocument): string[] {
  const ids = new Set<string>();
  const add = (v: unknown) => { if (typeof v === "string" && isGuestId(v)) ids.add(v); };
  add(doc.imageMediaId);
  add(doc.logoMediaId);
  for (const s of doc.sections ?? []) for (const i of s.items ?? []) add((i as { imageMediaId?: unknown }).imageMediaId);
  return [...ids];
}

/** Replaces guest image ids with uploaded media ids (Phase 2 claim). Unknown ids are removed so nothing dangles. */
export function swapGuestIds(doc: LayoutDocument, map: Record<string, string>): LayoutDocument {
  const swap = (v: string | null | undefined) => (isGuestId(v) ? map[v] ?? null : v ?? null);
  return {
    ...doc,
    imageMediaId: swap(doc.imageMediaId),
    logoMediaId: swap(doc.logoMediaId),
    sections: doc.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => {
        const id = (i as { imageMediaId?: string | null }).imageMediaId;
        if (!isGuestId(id)) return i;
        const next = { ...i } as typeof i & { imageMediaId?: string | null };
        const to = map[id];
        if (to) next.imageMediaId = to; else delete next.imageMediaId;
        return next;
      }),
    })),
  };
}

/** Whether a new image fits the guest limits. Returns an error code or null. */
export function imageLimitError(existing: Pick<GuestImageMeta, "size">[], incomingBytes: number): "count" | "total" | null {
  if (existing.length >= GUEST_MAX_IMAGES) return "count";
  const used = existing.reduce((n, i) => n + i.size, 0);
  if (used + incomingBytes > GUEST_MAX_TOTAL_BYTES) return "total";
  return null;
}

/** The scale that brings a w×h image's longest side to `max` or below. */
export function downscaleFactor(w: number, h: number, max = GUEST_MAX_EDGE): number {
  const edge = Math.max(w, h);
  return edge > max ? max / edge : 1;
}

// ---------------------------------------------------------------- storage

const DB_NAME = "pekko_guest";
const DB_VERSION = 1;
const DRAFT_KEY = "current";

type Store = {
  persistent: boolean;
  getDraft(): Promise<GuestDraft | null>;
  putDraft(d: GuestDraft): Promise<void>;
  deleteDraft(): Promise<void>;
  getImage(id: string): Promise<GuestImage | null>;
  putImage(img: GuestImage): Promise<void>;
  deleteImage(id: string): Promise<void>;
  listImages(): Promise<GuestImage[]>;
  clearImages(): Promise<void>;
};

function memoryStore(): Store {
  let draft: GuestDraft | null = null;
  const images = new Map<string, GuestImage>();
  return {
    persistent: false,
    async getDraft() { return draft; },
    async putDraft(d) { draft = d; },
    async deleteDraft() { draft = null; },
    async getImage(id) { return images.get(id) ?? null; },
    async putImage(img) { images.set(img.id, img); },
    async deleteImage(id) { images.delete(id); },
    async listImages() { return [...images.values()]; },
    async clearImages() { images.clear(); },
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains("draft")) db.createObjectStore("draft");
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("blocked"));
  });
}

function idbStore(db: IDBDatabase): Store {
  const tx = (store: "draft" | "images", mode: IDBTransactionMode) => db.transaction(store, mode).objectStore(store);
  const done = (t: IDBTransaction) => new Promise<void>((resolve, reject) => { t.oncomplete = () => resolve(); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error ?? new Error("aborted")); });
  const write = async (store: "draft" | "images", fn: (s: IDBObjectStore) => void) => {
    const t = db.transaction(store, "readwrite");
    fn(t.objectStore(store));
    await done(t);
  };
  return {
    persistent: true,
    async getDraft() { return ((await req(tx("draft", "readonly").get(DRAFT_KEY))) as GuestDraft | undefined) ?? null; },
    putDraft: (d) => write("draft", (s) => s.put(d, DRAFT_KEY)),
    deleteDraft: () => write("draft", (s) => s.delete(DRAFT_KEY)),
    async getImage(id) { return ((await req(tx("images", "readonly").get(id))) as GuestImage | undefined) ?? null; },
    putImage: (img) => write("images", (s) => s.put(img)),
    deleteImage: (id) => write("images", (s) => s.delete(id)),
    async listImages() { return (await req(tx("images", "readonly").getAll())) as GuestImage[]; },
    clearImages: () => write("images", (s) => s.clear()),
  };
}

let storePromise: Promise<Store> | null = null;

/** Opens the store once per tab. Asks the browser to keep the data (reduces eviction on iOS Safari); harmless if refused. */
export function guestStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = openDb().then(idbStore).catch(() => memoryStore());
    void storePromise.then((s) => {
      if (s.persistent && typeof navigator !== "undefined") void navigator.storage?.persist?.().catch(() => false);
    });
  }
  return storePromise;
}

/** Test hook: use a fresh store. */
export function resetGuestStoreForTests(store?: Store): void {
  storePromise = store ? Promise.resolve(store) : null;
}
export { memoryStore as guestMemoryStoreForTests };

/** The saved draft, or null. A draft older than the TTL is discarded with its images. */
export async function loadGuestDraft(now = Date.now()): Promise<GuestDraft | null> {
  const s = await guestStore();
  try {
    const d = await s.getDraft();
    if (!d || d.v !== 1 || !d.document) return null;
    if (now - d.updatedAt > GUEST_DRAFT_TTL_MS) { await clearGuestDraft(); return null; }
    return d;
  } catch {
    return null;
  }
}

export async function saveGuestDraft(d: GuestDraft): Promise<boolean> {
  const s = await guestStore();
  try { await s.putDraft({ ...d, updatedAt: Date.now() }); return true; } catch { return false; }
}

/** Starts a new draft (replacing any previous one and its images). */
export async function startGuestDraft(document: LayoutDocument, name: string, from: GuestSource): Promise<GuestDraft> {
  const s = await guestStore();
  const now = Date.now();
  const draft: GuestDraft = { v: 1, draftId: randomId(), name, document, createdAt: now, updatedAt: now, from };
  try { await s.clearImages(); await s.putDraft(draft); } catch { /* memory fallback keeps it for this tab */ }
  return draft;
}

/** Removes the draft and its images. Only call once the server has confirmed the menu is in the account. */
export async function clearGuestDraft(): Promise<void> {
  const s = await guestStore();
  try { await s.deleteDraft(); await s.clearImages(); } catch { /* nothing left to do */ }
}

export async function listGuestImages(): Promise<GuestImage[]> {
  const s = await guestStore();
  try { return (await s.listImages()).sort((a, b) => b.createdAt - a.createdAt); } catch { return []; }
}

export async function getGuestImage(id: string): Promise<GuestImage | null> {
  const s = await guestStore();
  try { return await s.getImage(id); } catch { return null; }
}

export class GuestImageError extends Error {
  constructor(public code: "count" | "total" | "type" | "decode" | "storage") { super(code); }
}

/**
 * Stores a photo or logo for the draft: decodes it, downscales the longest side to GUEST_MAX_EDGE, keeps PNG for
 * PNGs (logos with transparency) and re-encodes everything else as JPEG. Returns the new guest id.
 * `prepare` lets callers convert HEIC first (lib/prepare-image.ts).
 */
export async function addGuestImage(file: File): Promise<GuestImageMeta> {
  const type = file.type === "image/png" ? "image/png" : file.type === "image/jpeg" || file.type === "image/jpg" ? "image/jpeg" : null;
  if (!type) throw new GuestImageError("type");
  const prepared = await shrink(file, type);
  const s = await guestStore();
  const existing = await listGuestImages();
  const limit = imageLimitError(existing, prepared.blob.size);
  if (limit) throw new GuestImageError(limit);
  const img: GuestImage = { id: newGuestId(), name: file.name.slice(0, 120) || "photo", type: prepared.blob.type || type, size: prepared.blob.size, width: prepared.width, height: prepared.height, blob: prepared.blob, createdAt: Date.now() };
  try { await s.putImage(img); } catch { throw new GuestImageError("storage"); }
  const { blob: _blob, ...meta } = img;
  void _blob;
  return meta;
}

async function shrink(file: File, type: "image/png" | "image/jpeg"): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new GuestImageError("decode");
  }
  const { width, height } = bitmap;
  const k = downscaleFactor(width, height);
  if (k === 1 && file.size <= 4 * 1024 * 1024) { bitmap.close(); return { blob: file, width, height }; }
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close(); return { blob: file, width, height }; }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, type === "image/jpeg" ? 0.88 : undefined));
  canvas.width = 0; canvas.height = 0; // free the backing store at once on iOS
  if (!blob) throw new GuestImageError("decode");
  return { blob, width: w, height: h };
}

/** Removes images no longer referenced by the draft (keeps storage small when a visitor swaps photos). */
export async function pruneGuestImages(doc: LayoutDocument, keepRecent = 4): Promise<void> {
  const s = await guestStore();
  const used = new Set(guestIdsIn(doc));
  const all = await listGuestImages();
  // Recently uploaded but unused photos stay available in "Your photos" for a little while.
  const unused = all.filter((i) => !used.has(i.id)).slice(keepRecent);
  for (const i of unused) { try { await s.deleteImage(i.id); } catch { /* ignore */ } }
}
