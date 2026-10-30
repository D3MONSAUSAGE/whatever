import { BUCKET, db } from "@/lib/server/supabase";
import { fetchAll, inChunks, matches, pageOf, parseListQuery, signAll } from "@/lib/server/paging";
import { requireAdmin } from "@/lib/server/auth";
import { checkImage } from "@/lib/server/images";
import { MAX_UPLOAD_BYTES, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE, UPLOAD_WINDOW_SECONDS } from "@/lib/server/limits";
import { isMissingSchema } from "@/lib/server/schema";
import { usageByMedia } from "@/lib/server/media-usage";
import { normalizeFileName, uploadSizeError } from "@/lib/server/validate";
import { enforceLimit, fail, json } from "@/lib/server/http";

const MEDIA_COLUMNS = "id, file_name, storage_path, size_bytes, created_at";
const MEDIA_COLUMNS_VIDEO = `${MEDIA_COLUMNS}, kind, duration_ms, width, height, thumbnail_path`;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBlob(value: FormDataEntryValue | null): Blob | null {
  if (!value || typeof value === "string") return null;
  if (typeof value.arrayBuffer !== "function" || typeof value.size !== "number") return null;
  return value;
}

async function loadMediaRows(accountId: string, columns: string, plainColumns: string, ids?: string[]) {
  const run = (cols: string) => ids
    ? inChunks<MediaRow>(ids, (chunk) => db().from("media").select(cols).eq("account_id", accountId).in("id", chunk) as unknown as PromiseLike<{ data: MediaRow[] | null; error: { code?: string; message?: string } | null }>)
    : fetchAll<MediaRow>((from, to) => db().from("media").select(cols).eq("account_id", accountId)
      .order("created_at", { ascending: false }).order("id").range(from, to) as unknown as PromiseLike<{ data: MediaRow[] | null; error: { code?: string; message?: string } | null }>);
  const rich = await run(columns);
  if (rich.error && isMissingSchema(rich.error)) return run(plainColumns);
  return rich;
}

const isMenuFile = (name: string) => name.endsWith("(menu).png");
const isPromoFile = (name: string) => name.endsWith("(promo).png");

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const query = parseListQuery(req);

  const usage = await usageByMedia(admin.accountId);
  let rows: MediaRow[];
  let page: ReturnType<typeof pageOf<MediaRow>> | null = null;
  if (!query) {
    const all = await loadMediaRows(admin.accountId, MEDIA_COLUMNS_VIDEO, MEDIA_COLUMNS);
    if (all.error) return fail("Couldn't load images.", 500);
    rows = all.data ?? [];
  } else {
    // M14 opt-in: filter and sort over light rows, then load and sign only the requested page.
    const light = await loadMediaRows(admin.accountId, "id, file_name, size_bytes, created_at, kind, duration_ms", "id, file_name, size_bytes, created_at");
    if (light.error) return fail("Couldn't load images.", 500);
    let list = (light.data ?? []).filter((r) => matches(r.file_name, query.q));
    const k = query.kind;
    if (k === "image") list = list.filter((r) => r.kind !== "video");
    else if (k === "video") list = list.filter((r) => r.kind === "video");
    else if (k === "menu") list = list.filter((r) => isMenuFile(r.file_name));
    else if (k === "promo") list = list.filter((r) => isPromoFile(r.file_name));
    else if (k === "upload") list = list.filter((r) => !isMenuFile(r.file_name) && !isPromoFile(r.file_name));
    if (query.unused) list = list.filter((r) => !(usage?.get(r.id)?.length));
    if (query.sort === "oldest") list.reverse();
    else if (query.sort === "name") list.sort((x, y) => x.file_name.localeCompare(y.file_name, undefined, { sensitivity: "base" }));
    else if (query.sort === "size") list.sort((x, y) => y.size_bytes - x.size_bytes);
    else if (query.sort === "duration") list.sort((x, y) => (y.duration_ms ?? -1) - (x.duration_ms ?? -1));
    page = pageOf(list, query);
    const full = page.items.length ? await loadMediaRows(admin.accountId, MEDIA_COLUMNS_VIDEO, MEDIA_COLUMNS, page.items.map((r) => r.id)) : { data: [], error: null };
    if (full.error) return fail("Couldn't load images.", 500);
    const byId = new Map((full.data ?? []).map((r) => [r.id, r]));
    rows = page.items.map((r) => byId.get(r.id)).filter((r): r is MediaRow => Boolean(r));
  }

  const urls = await signAll(rows.flatMap((row) => [row.storage_path, row.thumbnail_path].filter(Boolean)) as string[]);
  const items = rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
    url: urls.get(r.storage_path) ?? null,
    kind: r.kind === "video" ? "video" : "image",
    durationMs: r.duration_ms ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    thumbnailUrl: r.thumbnail_path ? urls.get(r.thumbnail_path) ?? null : null,
    usedIn: usage?.get(r.id) ?? [],
  }));
  if (!page) return json(items);
  return json({ items, total: page.total, offset: page.offset, limit: page.limit, nextOffset: page.nextOffset });
}

type MediaRow = {
  id: string;
  file_name: string;
  storage_path: string;
  size_bytes: number;
  created_at: string;
  kind?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_path?: string | null;
};

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload a JPG, PNG, or WebP image.", 400);
  }
  const file = asBlob(form.get("file"));
  if (!file) return fail("Upload a JPG, PNG, or WebP image.", 400);
  const sizeError = uploadSizeError(file.size);
  if (sizeError) return fail(sizeError, file.size > MAX_UPLOAD_BYTES ? 413 : 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = checkImage(bytes);
  if (!type.ok) {
    return fail(
      type.reason === "dimensions"
        ? "That image is too large. Use 7680×4320 or smaller."
        : "That file isn't a JPG, PNG, or WebP image.",
      415,
    );
  }

  const limited = await enforceLimit(`upload-image:${admin.userId}`, UPLOAD_WINDOW_SECONDS, UPLOAD_MAX_PER_USER, UPLOAD_RATE_MESSAGE);
  if (limited) return limited;

  const fileName = normalizeFileName(form.get("name"));
  const id = crypto.randomUUID();
  const path = `${admin.accountId}/${id}.${type.ext}`;

  const { error: upErr } = await db()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: type.mime, cacheControl: "3600", upsert: false });
  if (upErr) return fail("Upload failed. Try again.", 500);

  const { error: rowErr } = await db().from("media").insert({
    id,
    account_id: admin.accountId,
    file_name: fileName,
    storage_path: path,
    mime_type: type.mime,
    size_bytes: bytes.length,
  });
  if (rowErr) {
    await db().storage.from(BUCKET).remove([path]);
    return fail("Upload failed. Try again.", 500);
  }
  return json({ id }, 201);
}
