import { BUCKET, db } from "./supabase";

/**
 * M14 helpers. Lists without the new query params keep their exact old shape and return
 * every row (PostgREST caps a single response at ~1000 rows, so we read in pages).
 */
const CHUNK = 1000;

type PageResult<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>, max = 200_000): Promise<PageResult<T>> {
  const out: T[] = [];
  for (let from = 0; from < max; from += CHUNK) {
    const res = await page(from, from + CHUNK - 1);
    if (res.error) return { data: null, error: res.error };
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < CHUNK) break;
  }
  return { data: out, error: null };
}

/** Run an `.in()` lookup over many ids without overlong URLs. */
export async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<PageResult<T>>, size = 200): Promise<PageResult<T>> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const res = await run(ids.slice(i, i + size));
    if (res.error) return { data: null, error: res.error };
    out.push(...(res.data ?? []));
  }
  return { data: out, error: null };
}

export async function signAll(paths: string[], seconds = 3600) {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 500) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(unique.slice(i, i + 500), seconds);
    data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  return urls;
}

export type ListQuery = { limit: number; offset: number; q: string; kind: string; unused: boolean; sort: string };
const OPT_IN = ["limit", "offset", "q", "kind", "unused", "sort"];
export const MAX_PAGE = 200;
export const DEFAULT_PAGE = 50;

/** Null when the caller used none of the new params: respond exactly as before. */
export function parseListQuery(req: Request): ListQuery | null {
  const p = new URL(req.url).searchParams;
  if (!OPT_IN.some((k) => p.has(k))) return null;
  const int = (v: string | null, d: number) => {
    const n = Number.parseInt(v ?? "", 10);
    return Number.isFinite(n) ? n : d;
  };
  return {
    limit: Math.min(MAX_PAGE, Math.max(1, int(p.get("limit"), DEFAULT_PAGE))),
    offset: Math.max(0, int(p.get("offset"), 0)),
    q: (p.get("q") ?? "").trim().toLowerCase().slice(0, 100),
    kind: (p.get("kind") ?? "").trim().toLowerCase(),
    unused: p.get("unused") === "1" || p.get("unused") === "true",
    sort: (p.get("sort") ?? "").trim().toLowerCase(),
  };
}

export function pageOf<T>(all: T[], q: ListQuery) {
  const items = all.slice(q.offset, q.offset + q.limit);
  const next = q.offset + items.length;
  return { items, total: all.length, offset: q.offset, limit: q.limit, nextOffset: next < all.length ? next : null };
}

export const matches = (text: string, q: string) => !q || text.toLowerCase().includes(q);
