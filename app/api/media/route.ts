import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { checkImage } from "@/lib/server/images";
import { MAX_UPLOAD_BYTES } from "@/lib/server/limits";
import { normalizeFileName, uploadSizeError } from "@/lib/server/validate";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asBlob(value: FormDataEntryValue | null): Blob | null {
  if (!value || typeof value === "string") return null;
  if (typeof value.arrayBuffer !== "function" || typeof value.size !== "number") return null;
  return value;
}

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const { data: rows, error } = await db()
    .from("media")
    .select("id, file_name, storage_path, size_bytes, created_at")
    .eq("account_id", admin.accountId)
    .order("created_at", { ascending: false });
  if (error) return fail("Couldn't load images.", 500);

  const urls = new Map<string, string>();
  if (rows?.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600);
    data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }
  return json(
    (rows ?? []).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      sizeBytes: r.size_bytes,
      createdAt: r.created_at,
      url: urls.get(r.storage_path) ?? null,
    })),
  );
}

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
