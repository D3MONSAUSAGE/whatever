import { BUCKET, db } from "./supabase";
import { isMissingSchema } from "./schema";

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

export async function removeStored(paths: string[]) {
  const list = paths.filter((path) => path.length > 0);
  if (!list.length) return;
  await db().storage.from(BUCKET).remove(list);
}
