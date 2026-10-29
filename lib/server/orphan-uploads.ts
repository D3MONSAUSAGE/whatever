import { BUCKET, db } from "./supabase";
import { ORPHAN_MIN_AGE_MS } from "./limits";
import { isMissingSchema } from "./schema";

const PAGE = 100;
const MAX_LIST_PAGES = 100;
const MAX_MEDIA_ROWS = 500_000;

type Listed = {
  name?: string | null;
  id?: string | null;
  created_at?: string | null;
};

export type OrphanCleanupResult =
  | {
      ok: true;
      dryRun: boolean;
      scanned: number;
      deleted: string[];
      wouldDelete: string[];
      truncated: boolean;
    }
  | { ok: false };

/**
 * Removes objects in the media bucket that have no media row and are older than 24h.
 * A path stored on any media row (`storage_path` or `thumbnail_path`) is never deleted.
 * A listing or media-read failure deletes nothing. Unparseable or missing `created_at` is kept.
 */
export async function cleanupOrphanUploads(options: { dryRun: boolean }): Promise<OrphanCleanupResult> {
  const referenced = await loadReferencedPaths();
  if (referenced === "error") return { ok: false };
  const listed = await listStoredObjects();
  if (listed === "error") return { ok: false };

  const now = Date.now();
  const candidates = listed.files.filter((file) => {
    if (!deletablePath(file.path)) return false;
    if (referenced.has(file.path)) return false;
    return olderThan(file.createdAt, now);
  });

  const wouldDelete: string[] = [];
  const deleted: string[] = [];
  for (const file of candidates) {
    // The preload can be stale. Look the path up again and skip on any doubt.
    if (referenced.has(file.path)) continue;
    const owned = await referencedNow(file.path);
    if (owned !== false) continue;
    wouldDelete.push(file.path);
    if (options.dryRun) {
      console.info(`orphan-uploads dry-run: would delete ${file.path}`);
      continue;
    }
    const removed = await db().storage.from(BUCKET).remove([file.path]);
    if (removed.error) return { ok: false };
    console.info(`orphan-uploads: deleted ${file.path}`);
    deleted.push(file.path);
  }
  wouldDelete.sort();
  deleted.sort();
  return {
    ok: true,
    dryRun: options.dryRun,
    scanned: listed.files.length,
    deleted,
    wouldDelete,
    truncated: listed.truncated,
  };
}

function olderThan(createdAt: string | null, now: number) {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created > ORPHAN_MIN_AGE_MS;
}

function deletablePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return true;
}

async function loadReferencedPaths(): Promise<Set<string> | "error"> {
  const rich = await loadPathPages("storage_path, thumbnail_path");
  if (rich === "missing") {
    const plain = await loadPathPages("storage_path");
    if (plain === "missing" || plain === "error") return "error";
    return plain;
  }
  return rich;
}

async function loadPathPages(columns: string): Promise<Set<string> | "error" | "missing"> {
  const set = new Set<string>();
  const page = 1000;
  for (let from = 0; from < MAX_MEDIA_ROWS; from += page) {
    const result = await db().from("media").select(columns).order("id").range(from, from + page - 1);
    if (result.error) return isMissingSchema(result.error) ? "missing" : "error";
    const rows = (result.data ?? []) as { storage_path?: unknown; thumbnail_path?: unknown }[];
    for (const row of rows) {
      addPath(set, row.storage_path);
      addPath(set, row.thumbnail_path);
    }
    if (rows.length < page) return set;
  }
  // A partial set would make a live object look orphaned. Refuse to delete.
  return "error";
}

function addPath(set: Set<string>, value: unknown) {
  if (typeof value === "string" && value.length > 0) set.add(value);
}

async function referencedNow(path: string): Promise<boolean | "error"> {
  const storage = await db().from("media").select("id").eq("storage_path", path).limit(1);
  if (storage.error) return "error";
  if ((storage.data ?? []).length > 0) return true;
  const thumb = await db().from("media").select("id").eq("thumbnail_path", path).limit(1);
  if (thumb.error) return isMissingSchema(thumb.error) ? false : "error";
  return (thumb.data ?? []).length > 0;
}

async function listStoredObjects(): Promise<{ files: { path: string; createdAt: string | null }[]; truncated: boolean } | "error"> {
  const files: { path: string; createdAt: string | null }[] = [];
  let truncated = false;
  const walk = async (prefix: string, depth: number): Promise<boolean> => {
    if (depth > 6) {
      truncated = true;
      return true;
    }
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const listed = await db().storage.from(BUCKET).list(prefix, {
        limit: PAGE,
        offset: page * PAGE,
        sortBy: { column: "name", order: "asc" },
      });
      if (listed.error) return false;
      const entries = (listed.data ?? []) as Listed[];
      for (const entry of entries) {
        const name = entry.name ?? "";
        if (!safeSegment(name)) continue;
        const path = prefix ? `${prefix}/${name}` : name;
        if (!deletablePath(path)) continue;
        if (entry.id == null) {
          const ok = await walk(path, depth + 1);
          if (!ok) return false;
        } else {
          files.push({ path, createdAt: entry.created_at ?? null });
        }
      }
      if (entries.length < PAGE) return true;
    }
    truncated = true;
    return true;
  };
  const ok = await walk("", 0);
  if (!ok) return "error";
  return { files, truncated };
}

function safeSegment(name: string) {
  return name.length > 0
    && name !== "."
    && name !== ".."
    && name !== ".emptyFolderPlaceholder"
    && !name.includes("/")
    && !name.includes("\\");
}
