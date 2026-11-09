import { layoutStudioEnabled, parseLayout, playerComposition, type PlayerComposition } from "@/lib/layout-studio";
import { BUCKET, db } from "@/lib/server/supabase";

const URL_TTL_SECONDS = 3600;

type Item = {
  mediaId: string;
  url: string;
  kind: string;
  composition?: PlayerComposition;
};

/**
 * Adds composition only when LAYOUT_STUDIO is exactly "1" and the board has one
 * same-account video. Any failure leaves the item as the complete PNG.
 * Slide counters on the playlist item are left untouched.
 */
export async function attachLayoutCompositions(items: Item[]): Promise<void> {
  if (!layoutStudioEnabled()) return;
  const images = items.filter((item) => item.kind === "image");
  if (!images.length) return;
  try {
    const menus = await db()
      .from("menus")
      .select("media_id, account_id, content")
      .in("media_id", images.map((item) => item.mediaId));
    if (menus.error || !menus.data?.length) return;
    const wanted: { item: Item; accountId: string; videoId: string; content: unknown }[] = [];
    for (const menu of menus.data) {
      const item = images.find((row) => row.mediaId === String(menu.media_id));
      if (!item) continue;
      const parsed = parseLayout(menu.content);
      if (!parsed.ok || !parsed.value.videoMediaId) continue;
      wanted.push({ item, accountId: String(menu.account_id), videoId: parsed.value.videoMediaId, content: parsed.value });
    }
    if (!wanted.length) return;
    const media = await db()
      .from("media")
      .select("id, account_id, storage_path, kind")
      .in("id", wanted.map((row) => row.videoId));
    if (media.error || !media.data) return;
    const files = new Map(media.data.map((file) => [String(file.id), file]));
    const paths = wanted.map((row) => {
      const file = files.get(row.videoId);
      if (!file || String(file.account_id) !== row.accountId || file.kind !== "video" || !file.storage_path) return "";
      return String(file.storage_path);
    }).filter(Boolean);
    if (!paths.length) return;
    const signed = await db().storage.from(BUCKET).createSignedUrls(paths, URL_TTL_SECONDS);
    if (signed.error || !signed.data) return;
    const urls = new Map<string, string>();
    signed.data.forEach((row) => row.path && row.signedUrl && urls.set(row.path, row.signedUrl));
    for (const row of wanted) {
      const file = files.get(row.videoId);
      const url = file?.storage_path ? urls.get(String(file.storage_path)) : undefined;
      if (!url) continue;
      const parsed = parseLayout(row.content);
      if (!parsed.ok) continue;
      const composition = playerComposition(parsed.value, row.item.url, url);
      if (composition) row.item.composition = composition;
    }
  } catch {
    // The PNG is already a whole board. Playback continues without a video zone.
  }
}
