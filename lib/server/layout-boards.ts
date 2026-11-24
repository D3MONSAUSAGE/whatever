import { isReadyMediaStatus } from "@/lib/media-ready";
import { layoutStudioEnabled, parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { applyLayoutSave, extraImageIds, type LibraryFile } from "@/lib/layout-publish";
import { imageBytes } from "@/lib/server/brand";
import { UNREADY_MEDIA_MESSAGE } from "@/lib/server/media-ready-guard";
import { BUCKET, db } from "@/lib/server/supabase";
import { ORIENTATION_UNSUPPORTED_CODE, ORIENTATION_UNSUPPORTED_MESSAGE, resolveSavedOrientation } from "@/lib/board-orientation";
function libraryKind(kind: unknown, mime: string): "image" | "video" | null {
  if (kind === "video") return "video";
  if (kind === "presentation") return null;
  if (mime === "image/jpeg" || mime === "image/png" || mime === "image/webp") return "image";
  return null;
}

/**
 * Library file name for a board's rendered still. Uses the board's own name so several boards
 * no longer all show up as "<Business name> (menu).png" (QA B1-10); the on-board title is the fallback.
 */
export function boardRenderFileName(boardName: string | null | undefined, title: string | null | undefined): string {
  const base = (boardName ?? "").trim() || (title ?? "").trim() || "Menu";
  return `${base.slice(0, 50)} (menu).png`;
}

/** Boards and library for the signed-in account. Flag off never reaches the database. */
export async function loadLayoutStudio(accountId: string) {
  if (!layoutStudioEnabled()) return { status: 404 as const, error: "Not found" };
  const menus = await db().from("menus").select("id, name, content, media_id, playlist_id, updated_at").eq("account_id", accountId);
  if (menus.error) return { status: 500 as const, error: "Couldn't load boards." };
  const media = await db().from("media").select("id, file_name, mime_type, kind, storage_path, size_bytes, thumbnail_path, processing_status").eq("account_id", accountId);
  if (media.error) return { status: 500 as const, error: "Couldn't load your media library." };
  const rows = (media.data ?? []).flatMap((row) => {
    const mime = String(row.mime_type ?? "");
    const kind = libraryKind(row.kind, mime);
    if (!kind) return [];
    if (kind === "video" && !isReadyMediaStatus(row.processing_status == null ? null : String(row.processing_status))) return [];
    const size = Number(row.size_bytes);
    const thumb = String(row.thumbnail_path ?? "");
    return [{ id: String(row.id), name: String(row.file_name ?? "File"), kind, mime, path: String(row.storage_path ?? ""), thumb, sizeBytes: Number.isFinite(size) && size > 0 ? size : null }];
  });
  const paths = rows.flatMap((row) => [row.path, row.thumb]).filter((path) => path.startsWith(`${accountId}/`));
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
      updatedAt: menu.updated_at ? String(menu.updated_at) : null,
    });
  }
  return {
    status: 200 as const,
    boards,
    legacy,
    library: rows.map((row) => ({ id: row.id, name: row.name, kind: row.kind, mime: row.mime, url: urls.get(row.path) ?? null, sizeBytes: row.sizeBytes, thumbnailUrl: row.thumb ? urls.get(row.thumb) ?? null : null })),
  };
}

type BoardImageBytes = { bytes: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" };

/**
 * Every image a board draws, loaded for the server renderer: main photo, template logo and item photos. imageBytes
 * only returns this account's own JPEG/PNG/WebP files, so another account's id (or a deleted file) is simply not
 * drawn. Shared by publish (saveLayoutForAccount) and the editor preview (POST /api/layout-studio/preview).
 */
export async function loadBoardArt(accountId: string, document: LayoutDocument): Promise<{ photo: BoardImageBytes | null; logo: BoardImageBytes | null; itemImages: Record<string, BoardImageBytes> }> {
  const { prepareBoardPhoto } = await import("@/lib/server/layout-render");
  const raw = document.imageMediaId ? await imageBytes(accountId, document.imageMediaId) : null;
  const photo = raw && raw.bytes.length ? await prepareBoardPhoto(raw.bytes, raw.mime) : null;
  // Template boards may carry a logo.
  const logoRaw = document.design && document.logoMediaId ? await imageBytes(accountId, document.logoMediaId) : null;
  const logo = logoRaw && logoRaw.bytes.length ? await prepareBoardPhoto(logoRaw.bytes, logoRaw.mime) : null;
  // Every board type can carry item photos (templates and original layouts), each reduced for the board.
  const itemImages: Record<string, BoardImageBytes> = {};
  const ids = [...new Set(document.sections.flatMap((section) => section.items.map((item) => item.imageMediaId)).filter((id): id is string => Boolean(id)))];
  await Promise.all(ids.map(async (id) => {
    const item = await imageBytes(accountId, id);
    if (item && item.bytes.length) itemImages[id] = await prepareBoardPhoto(item.bytes, item.mime, 900);
  }));
  return { photo, logo, itemImages };
}

/** t421u: pixel size of the board's featured photo as the PNG draws it (owner photo or stock photo), for the fit echo. */
export async function featuredPhotoSize(accountId: string, document: LayoutDocument): Promise<{ w: number; h: number } | null> {
  const { prepareBoardPhoto, stockPhotoDataUri } = await import("@/lib/server/layout-render");
  const { imageDims, dataUriDims } = await import("@/lib/image-dims");
  if (document.imageMediaId) {
    const raw = await imageBytes(accountId, document.imageMediaId);
    if (!raw || !raw.bytes.length) return null;
    const prepared = await prepareBoardPhoto(raw.bytes, raw.mime);
    return prepared && prepared.bytes.length ? imageDims(prepared.bytes) : null;
  }
  return document.design && document.stockPhoto ? dataUriDims(stockPhotoDataUri(document.stockPhoto)) : null;
}

export async function saveLayoutForAccount(accountId: string, body: {
  menuId?: string | null;
  name?: string;
  mode: "draft" | "publish";
  document: unknown;
  /** The client sent `X-Pekko-Client-Caps: orientation` (lib/board-orientation.ts). Absent = older client. */
  orientationCapable?: boolean;
}) {
  if (!layoutStudioEnabled()) return { status: 404 as const, error: "Not found" };
  if (body.mode !== "draft" && body.mode !== "publish") return { status: 400 as const, error: "Choose draft or publish." };
  const doc = body.document && typeof body.document === "object" ? body.document as { imageMediaId?: string; videoMediaId?: string } : {};
  // Every file the board draws is checked against this account: main photo, video, item photos and logo.
  const parsedForIds = parseLayout(body.document);
  const extra = parsedForIds.ok ? extraImageIds(parsedForIds.value) : [];
  const ids = [...new Set([doc.imageMediaId, doc.videoMediaId, ...extra].filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 60);
  const found = ids.length
    ? await db().from("media").select("id, account_id, mime_type, kind, processing_status").eq("account_id", accountId).in("id", ids)
    : { data: [], error: null };
  if (found.error) return { status: 500 as const, error: "Couldn't check your media library." };
  if ((found.data ?? []).some((row) => !isReadyMediaStatus(row.processing_status == null ? null : String(row.processing_status)))) {
    return { status: 409 as const, error: UNREADY_MEDIA_MESSAGE };
  }
  const files: LibraryFile[] = (found.data ?? []).map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    mime: String(row.mime_type),
    kind: row.kind === "video" ? "video" : row.kind === "image" ? "image" : "other",
  }));
  let previousMediaId: string | null = null;
  let playlistId: string | null = null;
  let menuId = body.menuId || null;
  let storedContent: unknown = null;
  if (menuId) {
    const row = await db().from("menus").select("id, media_id, playlist_id, content").eq("id", menuId).eq("account_id", accountId).maybeSingle();
    if (row.error) return { status: 500 as const, error: "Couldn't open that menu." };
    if (!row.data) return { status: 404 as const, error: "That menu isn't in this account." };
    previousMediaId = row.data.media_id ? String(row.data.media_id) : null;
    playlistId = row.data.playlist_id ? String(row.data.playlist_id) : null;
    storedContent = row.data.content ?? null;
  }
  // Vertical boards (t413u): an older client may not save content to a portrait board, and a client that omits
  // `orientation` keeps the stored one, so nothing can silently turn a vertical board horizontal.
  const orientation = resolveSavedOrientation({ incoming: body.document, stored: menuId ? storedContent ?? {} : null, capable: Boolean(body.orientationCapable) });
  if (!orientation.ok) return { status: 409 as const, error: ORIENTATION_UNSUPPORTED_MESSAGE, code: ORIENTATION_UNSUPPORTED_CODE };
  const document = body.document && typeof body.document === "object" && !Array.isArray(body.document)
    ? { ...(body.document as Record<string, unknown>), orientation: orientation.orientation }
    : body.document;
  const saved = await applyLayoutSave({
    enabled: true,
    accountId,
    mode: body.mode,
    document,
    files,
    previousMediaId,
  }, {
    writeContent: async (document, template) => {
      const name = (body.name || document.title || "Menu").slice(0, 80);
      if (menuId) {
        const updated = await db().from("menus").update({
          name, template, content: document, updated_at: new Date().toISOString(),
        }).eq("id", menuId).eq("account_id", accountId);
        if (updated.error) {
          console.error("layout-studio update failed", updated.error.message);
          throw new Error("Couldn't save the board.");
        }
        return;
      }
      const inserted = await db().from("menus").insert({
        account_id: accountId, name, template, content: document, updated_at: new Date().toISOString(),
      }).select("id").single();
      if (inserted.error || !inserted.data) {
        console.error("layout-studio insert failed", inserted.error?.message ?? "no row");
        throw new Error("Couldn't save the board.");
      }
      menuId = String(inserted.data.id);
    },
    render: async (document) => {
      const { renderLayoutPng } = await import("@/lib/server/layout-render");
      const { photo: fitted, logo, itemImages } = await loadBoardArt(accountId, document);
      const png = renderLayoutPng(document, fitted, { logo, itemImages });
      const { storeRenderedImage } = await import("@/lib/server/menus");
      const id = await storeRenderedImage(accountId, boardRenderFileName(body.name, document.title), png);
      if (!id) throw new Error("Couldn't store the board.");
      return id;
    },
    preview: async (mediaId) => {
      if (!menuId) return;
      const saved = await db().from("menus").update({ media_id: mediaId }).eq("id", menuId).eq("account_id", accountId);
      if (saved.error) console.error("layout draft preview failed", saved.error.message);
    },
    swap: async (previous, next) => {
      if (!menuId) throw new Error("Couldn't save the board.");
      // A draft still writes menus.media_id for the preview still. That id is not on a
      // playlist, so swapping it updates nothing and leaves the screen empty.
      if (!playlistId) {
        const created = await db().rpc("menu_create_playlist", { p_account_id: accountId, p_name: (body.name || "Menu").slice(0, 80), p_media_id: next });
        if (created.error || !created.data) throw new Error("Couldn't update the screens.");
        playlistId = String(created.data);
        const linked = await db().from("menus").update({ media_id: next, playlist_id: playlistId }).eq("id", menuId).eq("account_id", accountId);
        if (linked.error) throw new Error("Couldn't update the screens.");
        return;
      }
      const from = await boardItemMedia(accountId, playlistId, previous);
      if (!from) throw new Error("Couldn't update the screens.");
      const swapped = await db().rpc("menu_swap_media", { p_account_id: accountId, p_old_media_id: from, p_new_media_id: next });
      if (swapped.error || !swapped.data) throw new Error("Couldn't update the screens.");
      await db().from("menus").update({ media_id: next }).eq("id", menuId).eq("account_id", accountId);
    },
  });
  if (!saved.ok) return { status: 400 as const, error: saved.error };
  return { status: 200 as const, menuId, swapped: saved.swapped };
}

/**
 * The media id of the board's own image on its playlist, the one a publish must swap.
 *
 * The playlist can also hold attached promotions (promo_add_to_playlist appends them after the board). The lookup
 * used to take any one row with no order, which Postgres may return in any order (rows rewritten by an earlier swap
 * move to the end of the table), so a publish could swap a promotion's image instead of the board's. Now:
 * published rows only, promotion images excluded, the board's stored media id when it is on the playlist, else the
 * lowest position (ties by row id); with no such row, the stored media id as before. Null when there is neither.
 */
export async function boardItemMedia(accountId: string, playlistId: string, previous: string | null): Promise<string | null> {
  const [items, promos] = await Promise.all([
    db().from("playlist_items").select("id, media_id, position").eq("playlist_id", playlistId).eq("account_id", accountId).eq("kind", "published"),
    db().from("promos").select("media_id").eq("account_id", accountId),
  ]);
  if (items.error) return null;
  const promoMedia = new Set(promos.error ? [] : (promos.data ?? []).map((row) => String(row.media_id ?? "")).filter(Boolean));
  const rows = ((items.data ?? []) as { id: unknown; media_id: unknown; position: unknown }[])
    .map((row) => ({ id: String(row.id), mediaId: String(row.media_id ?? ""), position: Number(row.position ?? 0) }))
    .filter((row) => row.mediaId && !promoMedia.has(row.mediaId))
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  if (previous && rows.some((row) => row.mediaId === previous)) return previous;
  return rows[0]?.mediaId ?? previous ?? null;
}
