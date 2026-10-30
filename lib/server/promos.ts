import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { normalizePlaylistName } from "./validate";
import { artFor, checkArtMedia } from "./brand";
import { renderPromoPng } from "./promo-render";
import { dropMenuImage, signedUrls, storeRenderedImage } from "./menus";
import { isPromoTemplate, parsePromoContent, parsePromoDates, type PromoContent, type PromoTemplate } from "@/lib/promo-templates";

export const PROMOS_UNAVAILABLE = "Promo slides aren't available yet. Try again after the next update.";
export const MAX_PROMOS = 100;
export const PROMO_SLIDE_MS = 10_000;
/** Below day parts (10) so breakfast/lunch/dinner windows still win. */
export const PROMO_PRIORITY = 5;
export const PROMO_COLUMNS = "id, name, template, content, media_id, playlist_id, starts_on, ends_on, menu_id, placement, combo_playlist_id, created_at, updated_at";

export type PromoRow = {
  id: string; name: string; template: string; content: unknown; media_id: string | null; playlist_id: string | null;
  starts_on: string | null; ends_on: string | null; menu_id: string | null; placement: "none" | "added" | "scheduled";
  combo_playlist_id: string | null; created_at: string; updated_at: string;
};
export type PromoInput = { name: string; template: PromoTemplate; content: PromoContent; startsOn: string | null; endsOn: string | null };

export { isMissingSchema };

export function parsePromoBody(body: Record<string, unknown>, partial = false):
  { ok: true; value: Partial<PromoInput> } | { ok: false; error: string } {
  const value: Partial<PromoInput> = {};
  if (!partial || body.name !== undefined) {
    const name = normalizePlaylistName(body.name);
    if (!name) return { ok: false, error: "Give the promo a name." };
    value.name = name;
  }
  if (!partial || body.template !== undefined) {
    if (!isPromoTemplate(body.template)) return { ok: false, error: "Choose a template." };
    value.template = body.template;
  }
  if (!partial || body.content !== undefined) {
    const c = parsePromoContent(body.content);
    if (!c.ok) return c;
    value.content = c.value;
  }
  if (!partial || body.startsOn !== undefined || body.endsOn !== undefined) {
    const d = parsePromoDates(body.startsOn, body.endsOn);
    if (!d.ok) return d;
    if (!partial || body.startsOn !== undefined) value.startsOn = d.startsOn;
    if (!partial || body.endsOn !== undefined) value.endsOn = d.endsOn;
  }
  return { ok: true, value };
}

export async function checkPromoPhoto(accountId: string, content: PromoContent | undefined) {
  if (!content?.photoMediaId) return null;
  return checkArtMedia(accountId, content.photoMediaId, "photo");
}

export async function storePromoImage(accountId: string, name: string, template: PromoTemplate, content: PromoContent) {
  const bytes = renderPromoPng(template, content, await artFor(accountId, content));
  return storeRenderedImage(accountId, `${name.slice(0, 70)} (promo).png`, bytes);
}

export function stored(row: PromoRow): { template: PromoTemplate; content: PromoContent } | null {
  const c = parsePromoContent(row.content);
  return c.ok ? { template: isPromoTemplate(row.template) ? row.template : "happy", content: c.value } : null;
}

/** Re-render with changes and swap the new image in everywhere the old one plays. */
export async function rerenderPromo(accountId: string, row: PromoRow, patch: { name?: string; template?: PromoTemplate; content?: PromoContent }) {
  const s = stored(row);
  const name = patch.name ?? row.name;
  const template = patch.template ?? s?.template ?? "happy";
  const content = patch.content ?? s?.content;
  if (!content) return { status: 400, error: "Add a headline." } as const;
  const mediaId = await storePromoImage(accountId, name, template, content);
  if (!mediaId) return { status: 500, error: "Couldn't create the promo image. Try again." } as const;
  if (row.media_id) {
    const swap = await db().rpc("menu_swap_media", { p_account_id: accountId, p_old_media_id: row.media_id, p_new_media_id: mediaId });
    if (swap.error || !swap.data) {
      await dropMenuImage(accountId, mediaId);
      return { status: 500, error: "Couldn't update the promo." } as const;
    }
  }
  const updated = await db().from("promos").update({ name, template, content, media_id: mediaId, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("account_id", accountId);
  if (updated.error) return { status: 500, error: "Couldn't update the promo." } as const;
  await dropMenuImage(accountId, row.media_id);
  return { ok: true, mediaId } as const;
}

/** Take the promo off its menu: remove the slide, or drop the dated "menu + promo" playlist and its schedules. */
export async function detachPromo(accountId: string, row: PromoRow) {
  if (row.placement === "added" && row.menu_id && row.media_id) {
    const menu = await db().from("menus").select("playlist_id").eq("id", row.menu_id).eq("account_id", accountId).maybeSingle();
    if (menu.data?.playlist_id) {
      const r = await db().rpc("promo_remove_from_playlist", { p_account_id: accountId, p_playlist_id: menu.data.playlist_id, p_media_id: row.media_id });
      if (r.error) return false;
    }
  }
  if (row.placement === "scheduled" && row.combo_playlist_id) {
    // Screens fall back to their menu once the dated rules are gone. If someone assigned the
    // "menu + promo" playlist to a screen by hand, keep the playlist so that screen never goes blank.
    const rules = await db().from("schedules").delete().eq("playlist_id", row.combo_playlist_id).eq("account_id", accountId);
    if (rules.error) return false;
    const used = await db().from("displays").select("id").eq("assigned_playlist_id", row.combo_playlist_id).eq("account_id", accountId);
    if (!used.error && !(used.data ?? []).length) {
      await db().from("playlists").delete().eq("id", row.combo_playlist_id).eq("account_id", accountId);
    }
  }
  const up = await db().from("promos").update({ placement: "none", menu_id: null, combo_playlist_id: null, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("account_id", accountId);
  return !up.error;
}

export async function promoView(rows: PromoRow[]) {
  const ids = rows.map((r) => r.media_id).filter((x): x is string => Boolean(x));
  const media = ids.length ? (await db().from("media").select("id, storage_path").in("id", ids)).data ?? [] : [];
  const urls = await signedUrls(media.map((m) => String(m.storage_path)));
  const byId = new Map(media.map((m) => [String(m.id), urls.get(String(m.storage_path)) ?? null]));
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r) => {
    const s = stored(r);
    return {
      id: r.id, name: r.name, template: s?.template ?? "happy", content: s?.content ?? null,
      mediaId: r.media_id, playlistId: r.playlist_id, imageUrl: r.media_id ? byId.get(r.media_id) ?? null : null,
      startsOn: r.starts_on, endsOn: r.ends_on, menuId: r.menu_id, placement: r.placement,
      expired: Boolean(r.ends_on && r.ends_on < today), createdAt: r.created_at, updatedAt: r.updated_at,
    };
  });
}

const MAX_SCHEDULES = 200;

/**
 * One tap "add to menu". No dates: the slide joins the menu's playlist. With dates: a
 * "menu + promo" playlist plays on the screens showing that menu, only between those dates,
 * using ordinary schedule rules. Returns the screens affected.
 */
export async function attachPromo(accountId: string, row: PromoRow, menuId: string) {
  if (!row.media_id) return { status: 400, error: "Save the promo first." } as const;
  const menu = await db().from("menus").select("id, name, playlist_id").eq("id", menuId).eq("account_id", accountId).maybeSingle();
  if (menu.error) return { status: 500, error: "Couldn't load the menu." } as const;
  if (!menu.data?.playlist_id) return { status: 404, error: "Menu not found." } as const;
  const menuPlaylist = String(menu.data.playlist_id);
  if (row.placement !== "none") {
    if (!(await detachPromo(accountId, row))) return { status: 500, error: "Couldn't move the promo." } as const;
  }
  const screens = await db().from("displays").select("id").eq("account_id", accountId).eq("assigned_playlist_id", menuPlaylist);
  if (screens.error) return { status: 500, error: "Couldn't load your screens." } as const;
  const displayIds = (screens.data ?? []).map((d) => String(d.id));
  const now = new Date().toISOString();

  if (!row.starts_on && !row.ends_on) {
    const add = await db().rpc("promo_add_to_playlist", { p_account_id: accountId, p_playlist_id: menuPlaylist, p_media_id: row.media_id, p_duration_ms: PROMO_SLIDE_MS });
    if (add.error || !add.data) return { status: 500, error: "Couldn't add the promo to the menu." } as const;
    await db().from("promos").update({ placement: "added", menu_id: menuId, updated_at: now }).eq("id", row.id).eq("account_id", accountId);
    return { ok: true, mode: "added", screens: displayIds.length } as const;
  }

  if (!displayIds.length) return { status: 400, error: "Show this menu on a screen first, then add the promo." } as const;
  const count = await db().from("schedules").select("id").eq("account_id", accountId);
  if (count.error) return { status: 500, error: "Couldn't add the promo." } as const;
  if ((count.data ?? []).length + displayIds.length > MAX_SCHEDULES) return { status: 400, error: "This account already has 200 schedules." } as const;
  const combo = await db().rpc("promo_create_combo", {
    p_account_id: accountId, p_name: `${String(menu.data.name).slice(0, 40)} + ${row.name.slice(0, 36)}`,
    p_base_playlist_id: menuPlaylist, p_media_id: row.media_id, p_duration_ms: PROMO_SLIDE_MS,
  });
  if (combo.error || !combo.data) return { status: 500, error: "Couldn't add the promo." } as const;
  const comboId = String(combo.data);
  const rules = await db().from("schedules").insert(displayIds.map((displayId) => ({
    account_id: accountId, name: `Promo: ${row.name}`.slice(0, 80), playlist_id: comboId, display_id: displayId, group_id: null,
    weekdays: [1, 2, 3, 4, 5, 6, 7], start_minute: 0, end_minute: 1440, starts_on: row.starts_on, ends_on: row.ends_on,
    priority: PROMO_PRIORITY, enabled: true, updated_at: now,
  })));
  if (rules.error) {
    await db().from("playlists").delete().eq("id", comboId).eq("account_id", accountId);
    return { status: 500, error: "Couldn't schedule the promo." } as const;
  }
  await db().from("promos").update({ placement: "scheduled", menu_id: menuId, combo_playlist_id: comboId, updated_at: now }).eq("id", row.id).eq("account_id", accountId);
  return { ok: true, mode: "scheduled", screens: displayIds.length } as const;
}

/** Keep the dated rules in step when the promo's dates change. */
export async function syncPromoDates(accountId: string, row: PromoRow, startsOn: string | null, endsOn: string | null) {
  if (row.placement !== "scheduled" || !row.combo_playlist_id) return true;
  const up = await db().from("schedules").update({ starts_on: startsOn, ends_on: endsOn, updated_at: new Date().toISOString() })
    .eq("playlist_id", row.combo_playlist_id).eq("account_id", accountId);
  return !up.error;
}
