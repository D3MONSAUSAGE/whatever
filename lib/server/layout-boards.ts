import { layoutStudioEnabled } from "@/lib/layout-studio";
import { applyLayoutSave, type LibraryFile } from "@/lib/layout-publish";
import { imageDataUri } from "@/lib/server/brand";
import { db } from "@/lib/server/supabase";
export async function saveLayoutForAccount(accountId: string, body: {
  menuId?: string | null;
  name?: string;
  mode: "draft" | "publish";
  document: unknown;
}) {
  if (!layoutStudioEnabled()) return { status: 404 as const, error: "Not found" };
  if (body.mode !== "draft" && body.mode !== "publish") return { status: 400 as const, error: "Choose draft or publish." };
  const doc = body.document && typeof body.document === "object" ? body.document as { imageMediaId?: string; videoMediaId?: string } : {};
  const ids = [doc.imageMediaId, doc.videoMediaId].filter((id): id is string => typeof id === "string" && id.length > 0);
  const found = ids.length
    ? await db().from("media").select("id, account_id, mime_type, kind").eq("account_id", accountId).in("id", ids)
    : { data: [], error: null };
  if (found.error) return { status: 500 as const, error: "Couldn't check your media library." };
  const files: LibraryFile[] = (found.data ?? []).map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    mime: String(row.mime_type),
    kind: row.kind === "video" ? "video" : row.kind === "image" ? "image" : "other",
  }));
  let previousMediaId: string | null = null;
  let playlistId: string | null = null;
  let menuId = body.menuId || null;
  if (menuId) {
    const row = await db().from("menus").select("id, media_id, playlist_id").eq("id", menuId).eq("account_id", accountId).maybeSingle();
    if (row.error) return { status: 500 as const, error: "Couldn't open that menu." };
    if (!row.data) return { status: 404 as const, error: "That menu isn't in this account." };
    previousMediaId = row.data.media_id ? String(row.data.media_id) : null;
    playlistId = row.data.playlist_id ? String(row.data.playlist_id) : null;
  }
  const saved = await applyLayoutSave({
    enabled: true,
    accountId,
    mode: body.mode,
    document: body.document,
    files,
    previousMediaId,
  }, {
    writeContent: async (document, template) => {
      const name = (body.name || document.title || "Menu").slice(0, 80);
      if (menuId) {
        const updated = await db().from("menus").update({
          name, template, content: document, updated_at: new Date().toISOString(),
        }).eq("id", menuId).eq("account_id", accountId);
        if (updated.error) throw new Error("Couldn't save the board.");
        return;
      }
      const inserted = await db().from("menus").insert({
        account_id: accountId, name, template, content: document, updated_at: new Date().toISOString(),
      }).select("id").single();
      if (inserted.error || !inserted.data) throw new Error("Couldn't save the board.");
      menuId = String(inserted.data.id);
    },
    render: async (document) => {
      const photo = document.imageMediaId ? await imageDataUri(accountId, document.imageMediaId) : null;
      const bytes = photo ? Buffer.from(photo.split(",")[1] || "", "base64") : null;
      const mime = photo?.startsWith("data:image/png") ? "image/png" as const : "image/jpeg" as const;
      const { renderLayoutPng } = await import("@/lib/server/layout-render");
      const png = renderLayoutPng(document, bytes && bytes.length ? { bytes, mime } : null);
      const { storeRenderedImage } = await import("@/lib/server/menus");
      const id = await storeRenderedImage(accountId, `${(document.title || "Menu").slice(0, 60)}.png`, png);
      if (!id) throw new Error("Couldn't store the board.");
      return id;
    },
    swap: async (previous, next) => {
      if (!menuId) throw new Error("Couldn't save the board.");
      if (previous) {
        const swapped = await db().rpc("menu_swap_media", { p_account_id: accountId, p_old_media_id: previous, p_new_media_id: next });
        if (swapped.error || !swapped.data) throw new Error("Couldn't update the screens.");
        await db().from("menus").update({ media_id: next }).eq("id", menuId).eq("account_id", accountId);
        return;
      }
      const created = await db().rpc("menu_create_playlist", { p_account_id: accountId, p_name: (body.name || "Menu").slice(0, 80), p_media_id: next });
      if (created.error || !created.data) throw new Error("Couldn't update the screens.");
      playlistId = String(created.data);
      await db().from("menus").update({ media_id: next, playlist_id: playlistId }).eq("id", menuId).eq("account_id", accountId);
    },
  });
  if (!saved.ok) return { status: 400 as const, error: saved.error };
  return { status: 200 as const, menuId, swapped: saved.swapped };
}
