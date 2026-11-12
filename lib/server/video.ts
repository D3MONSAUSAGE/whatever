import { BUCKET, db } from "./supabase";
import { isMissingSchema } from "./schema";
import type { ByteSource } from "../mp4";

/** True when 0003_video.sql has been applied. A missing kind column means it has not. */
export async function videoSchemaReady() {
  const probe = await db().from("media").select("kind").limit(1);
  if (!probe.error) return true;
  return !isMissingSchema(probe.error);
}

export async function readStoredObject(path: string): Promise<Uint8Array | null> {
  const { data, error } = await db().storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Byte length of a stored object, without downloading it. */
export async function storedObjectSize(path: string): Promise<number | null> {
  const bucket = db().storage.from(BUCKET) as StorageRanges;
  if (typeof bucket.objectSize === "function") return bucket.objectSize(path);
  const slash = path.lastIndexOf("/");
  const prefix = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const listed = await db().storage.from(BUCKET).list(prefix, { limit: 100, search: name });
  if (listed.error || !listed.data) return null;
  const file = listed.data.find((row) => row.name === name && row.metadata && typeof (row.metadata as { size?: unknown }).size === "number");
  if (!file) return null;
  const size = Number((file.metadata as { size: number }).size);
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** Ranged reader for inspectMp4. Only the moov atom (at most 8 MB) is fetched, not the whole file. */
export function storedObjectSource(path: string, size: number): ByteSource {
  return {
    size,
    async read(offset, length) {
      const bytes = await readStoredRange(path, offset, length);
      return bytes ?? new Uint8Array();
    },
  };
}

export async function readStoredRange(path: string, offset: number, length: number): Promise<Uint8Array | null> {
  if (!Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) return new Uint8Array();
  const start = Math.max(0, Math.floor(offset));
  const bucket = db().storage.from(BUCKET) as StorageRanges;
  if (typeof bucket.downloadRange === "function") return bucket.downloadRange(path, start, Math.floor(length));
  return fetchStoredRange(path, start, Math.floor(length));
}

async function fetchStoredRange(path: string, offset: number, length: number): Promise<Uint8Array | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const url = `${base.replace(/\/$/, "")}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const end = offset + length - 1;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: `bytes=${offset}-${end}`,
    },
    cache: "no-store",
  });
  if (!res.ok && res.status !== 206) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function removeStored(paths: string[]) {
  const list = paths.filter((path) => path.length > 0);
  if (!list.length) return;
  await db().storage.from(BUCKET).remove(list);
}

type StorageRanges = {
  objectSize?: (path: string) => Promise<number | null>;
  downloadRange?: (path: string, offset: number, length: number) => Promise<Uint8Array | null>;
};
