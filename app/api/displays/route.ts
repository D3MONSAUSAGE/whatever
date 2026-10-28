import { BUCKET, db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { ONLINE_MS } from "@/lib/server/limits";
import { fail, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;

  const { data: rows, error } = await db()
    .from("displays")
    .select("id, name, token_hash, last_seen_at, created_at, media:assigned_media_id (id, file_name, storage_path)")
    .eq("account_id", admin.accountId)
    .eq("status", "active")
    .order("created_at");
  if (error) return fail("Couldn't load displays.", 500);

  type MediaJoin = { id: string; file_name: string; storage_path: string };
  type Row = {
    id: string; name: string; token_hash: string | null; last_seen_at: string | null;
    media: MediaJoin | MediaJoin[] | null;
  };
  const list = (rows ?? []) as unknown as Row[];

  const mediaOf = (media: Row["media"]): MediaJoin | null =>
    Array.isArray(media) ? media[0] ?? null : media;
  const paths = [...new Set(list.map((d) => mediaOf(d.media)?.storage_path).filter(Boolean))] as string[];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
    data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  }

  const now = Date.now();
  return json(
    list.map((d) => {
      const media = mediaOf(d.media);
      return {
        id: d.id,
        name: d.name,
        connected: !!d.token_hash, // false until the TV collects its token
        online: !!d.last_seen_at && now - new Date(d.last_seen_at).getTime() < ONLINE_MS,
        lastSeenAt: d.last_seen_at,
        media: media
          ? { id: media.id, fileName: media.file_name, url: urls.get(media.storage_path) ?? null }
          : null,
      };
    }),
  );
}
