import { BUCKET, db } from "./supabase";
import { isMissingSchema } from "./schema";
import { isUuid } from "./crypto";
import { normalizePlaylistName } from "./validate";
import { renderMenuPng } from "./menu-render";
import { artFor, checkArtMedia } from "./brand";
import { isMenuTemplate, parseMenuContent, type MenuContent, type MenuTemplate } from "@/lib/menu-templates";

export const MENUS_UNAVAILABLE = "Menu boards aren't available yet. Try again after the next update.";
export const MAX_MENUS = 100;

export type MenuRow = {
  id: string; name: string; template: string; content: unknown;
  media_id: string | null; playlist_id: string | null; created_at: string; updated_at: string;
};

export type MenuInput = { name: string; template: MenuTemplate; content: MenuContent; displayIds: string[] };

export function parseMenuBody(body: Record<string, unknown>, partial = false):
  { ok: true; value: Partial<MenuInput> } | { ok: false; error: string } {
  const value: Partial<MenuInput> = {};
  if (!partial || body.name !== undefined) {
    const name = normalizePlaylistName(body.name);
    if (!name) return { ok: false, error: "Give the menu a name." };
    value.name = name;
  }
  if (!partial || body.template !== undefined) {
    if (!isMenuTemplate(body.template)) return { ok: false, error: "Choose a template." };
    value.template = body.template;
  }
  if (!partial || body.content !== undefined) {
    const content = parseMenuContent(body.content);
    if (!content.ok) return content;
    value.content = content.value;
  }
  if (body.displayIds !== undefined) {
    const ids = body.displayIds;
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== "string" || !isUuid(id))) {
      return { ok: false, error: "Choose screens from this account." };
    }
    value.displayIds = ids as string[];
  }
  return { ok: true, value };
}

/** Render and store the image as a normal media row. Returns the media id. */
export async function storeMenuImage(accountId: string, name: string, template: MenuTemplate, content: MenuContent) {
  const bytes = renderMenuPng(template, content, await artFor(accountId, content));
  const id = crypto.randomUUID();
  const path = `${accountId}/${id}.png`;
  const up = await db().storage.from(BUCKET).upload(path, bytes, { contentType: "image/png", cacheControl: "3600", upsert: false });
  if (up.error) return null;
  const fileName = `${name.slice(0, 70)} (menu).png`;
  const row = await db().from("media").insert({
    id, account_id: accountId, file_name: fileName, storage_path: path, mime_type: "image/png", size_bytes: bytes.length,
  });
  if (row.error) {
    await db().storage.from(BUCKET).remove([path]);
    return null;
  }
  // Newer schemas record kind and size; ignore if those columns are absent.
  await db().from("media").update({ kind: "image", width: 1920, height: 1080 }).eq("id", id).eq("account_id", accountId).then(() => null, () => null);
  return id;
}

/** Remove an old menu image if nothing else uses it any more. Never throws. */
export async function dropMenuImage(accountId: string, mediaId: string | null) {
  if (!mediaId) return;
  try {
    const { data: path, error } = await db().rpc("delete_media", { p_account_id: accountId, p_media_id: mediaId });
    if (!error && typeof path === "string" && path.startsWith(`${accountId}/`)) await db().storage.from(BUCKET).remove([path]);
  } catch {
    /* still in use or already gone: keep it */
  }
}

export async function signedUrls(paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data } = await db().storage.from(BUCKET).createSignedUrls(paths, 3600);
  data?.forEach((s) => s.path && s.signedUrl && urls.set(s.path, s.signedUrl));
  return urls;
}

export async function menuView(accountId: string, rows: MenuRow[]) {
  const mediaIds = rows.map((r) => r.media_id).filter((v): v is string => Boolean(v));
  const paths = new Map<string, string>();
  if (mediaIds.length) {
    const media = await db().from("media").select("id, storage_path").eq("account_id", accountId).in("id", mediaIds);
    for (const m of media.data ?? []) paths.set(String(m.id), String(m.storage_path));
  }
  const urls = await signedUrls([...paths.values()]);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    template: r.template,
    content: r.content,
    mediaId: r.media_id,
    playlistId: r.playlist_id,
    imageUrl: r.media_id && paths.has(r.media_id) ? urls.get(paths.get(r.media_id)!) ?? null : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export { isMissingSchema };

/** Validate the optional photo before rendering. */
export async function checkMenuPhoto(accountId: string, content: MenuContent | undefined) {
  if (!content?.photoMediaId) return null;
  return checkArtMedia(accountId, content.photoMediaId, "photo");
}

/**
 * Re-render a menu with optional changes, swap the new image in everywhere the old one
 * plays, and remove the old image. Shared by PATCH /api/menus/{id} and brand "apply to all".
 */
export async function rerenderMenu(accountId: string, row: MenuRow, patch: { name?: string; template?: MenuTemplate; content?: MenuContent }) {
  const name = patch.name ?? row.name;
  const template: MenuTemplate = patch.template ?? (isMenuTemplate(row.template) ? row.template : "classic");
  const stored = parseMenuContent(row.content);
  const content = patch.content ?? (stored.ok ? stored.value : null);
  if (!content) return { status: 400, error: "Add your menu items." } as const;
  const mediaId = await storeMenuImage(accountId, name, template, content);
  if (!mediaId) return { status: 500, error: "Couldn't create the menu image. Try again." } as const;
  let playlistId = row.playlist_id;
  if (row.media_id) {
    const swap = await db().rpc("menu_swap_media", { p_account_id: accountId, p_old_media_id: row.media_id, p_new_media_id: mediaId });
    if (swap.error || !swap.data) {
      await dropMenuImage(accountId, mediaId);
      return { status: 500, error: "Couldn't update the menu." } as const;
    }
  }
  if (!playlistId) {
    const created = await db().rpc("menu_create_playlist", { p_account_id: accountId, p_name: name, p_media_id: mediaId });
    if (!created.error && created.data) playlistId = String(created.data);
  }
  const updated = await db().from("menus").update({
    name, template, content, media_id: mediaId, playlist_id: playlistId, updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("account_id", accountId);
  if (updated.error) return { status: 500, error: "Couldn't update the menu." } as const;
  await dropMenuImage(accountId, row.media_id);
  return { ok: true, mediaId, playlistId } as const;
}
