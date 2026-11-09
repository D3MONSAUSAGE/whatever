import { layoutStudioEnabled, parseLayout } from "@/lib/layout-studio";
import { applyLayoutSave, type LibraryFile } from "@/lib/layout-publish";
import { imageBytes } from "@/lib/server/brand";
import { BUCKET, db } from "@/lib/server/supabase";
function libraryKind(kind: unknown, mime: string): "image" | "video" | null {
  if (kind === "video") return "video";
  if (kind === "presentation") return null;
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return "image";
  return null;
}

/** Boards and library for the signed-in account. Flag off never reaches the database. */
export async function loadLayoutStudio(accountId: string) {
  if (!layoutStudioEnabled()) return { status: 404 as const, error: "Not found" };
  const menus = await db().from("menus").select("id, name, content, media_id, playlist_id").eq("account_id", accountId);
  if (menus.error) return { status: 500 as const, error: "Couldn't load boards." };
  const media = await db().from("media").select("id, file_name, mime_type, kind, storage_path").eq("account_id", accountId);
  if (media.error) return { status: 500 as const, error: "Couldn't load your media library." };
  const rows = (media.data ?? []).flatMap((row) => {
    const mime = String(row.mime_type ?? "");
    const kind = libraryKind(row.kind, mime);
    if (!kind) return [];
    return [{ id: String(row.id), name: String(row.file_name ?? "File"), kind, mime, path: String(row.storage_path ?? "") }];
  });
  const paths = rows.map((row) => row.path).filter((path) => path.startsWith(`${accountId}/`));
  const signed = paths.length ? await db().storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [], error: null };
  const urls = new Map<string, string>();
  for (const row of signed.data ?? []) {
    if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
  }
  const boards = [];
  const legacy = [];
  for (const menu of menus.data ?? []) {
    const parsed = parseLayout(menu.content);
    if (!parsed.ok) {
      legacy.push({ id: String(menu.id), name: String(menu.name) });
      continue;
    }
    boards.push({
      id: String(menu.id),
      name: String(menu.name),
      document: parsed.value,
      mediaId: menu.media_id ? String(menu.media_id) : null,
      playlistId: menu.playlist_id ? String(menu.playlist_id) : null,
    });
  }
  return {
    status: 200 as const,
    boards,
    legacy,
    library: rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, mime: row.mime, url: urls.get(row.path) ?? null })),
  };
}

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
      const raw = document.imageMediaId ? await imageBytes(accountId, document.imageMediaId) : null;
      const { prepareBoardPhoto, renderLayoutPng } = await import("@/lib/server/layout-render");
      const fitted = raw && raw.bytes.length ? await prepareBoardPhoto(raw.bytes, raw.mime) : null;
      const png = renderLayoutPng(document, fitted);
      const { storeRenderedImage } = await import("@/lib/server/menus");
      const id = await storeRenderedImage(accountId, `${(document.title || "Menu").slice(0, 50)} (menu).png`, png);
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
