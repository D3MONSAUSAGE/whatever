import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { POST as studioPost } from "@/app/api/layout-studio/route";
import { accountSaveBody } from "@/lib/layout-account";
import { sampleLayout, type LayoutDocument } from "@/lib/layout-studio";
import { boardItemMedia } from "@/lib/server/layout-boards";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Gother P1: publishing a web menu board swaps "the board's image" on its playlist. The lookup took any one
 * playlist_items row with no order and no kind filter. With a promotion attached to the board (an extra item on the
 * same playlist), Postgres may return the promotion's row first (rows rewritten by an earlier swap move to the end
 * of the table), and menu_swap_media then replaced the promotion's image everywhere it plays.
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const A = "11111111-1111-4111-8111-111111111111";
const PROMO_MEDIA = "60000000-0000-4000-8000-000000000001";
const COMBO = "60000000-0000-4000-8000-0000000000c0";
let store: Store;
let account = "";

function req(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer token-a");
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const publish = (menuId: string | null, document: LayoutDocument) =>
  studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "publish", menuId, name: "Dinner", document })) }));

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", A, "cafe@example.com");
  expect((await me(req("/api/me"))).status).toBe(200);
  account = String(store.accounts.find((row) => row.owner_user_id === A)!.id);
});
afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

/** Publish a board, then attach a promotion to its playlist and to a second playlist, listed before the board rows. */
async function boardWithPromo() {
  const first = await publish(null, sampleLayout("two-column"));
  expect(first.status).toBe(200);
  const { menuId } = await first.json() as { menuId: string };
  const board = store.menus.find((m) => m.id === menuId)!;
  const playlistId = String(board.playlist_id);
  const boardMedia = String(board.media_id);
  store.media.push({ id: PROMO_MEDIA, account_id: account, file_name: "Happy hour (promo).png", storage_path: `${account}/promo.png`, mime_type: "image/png", size_bytes: 8, kind: "image" });
  store.promos.push({ id: crypto.randomUUID(), account_id: account, name: "Happy hour", template: "happy", content: {}, media_id: PROMO_MEDIA, menu_id: menuId, placement: "added" });
  store.playlists.push({ id: COMBO, account_id: account, name: "Bar loop", revision: 1, updated_at: new Date().toISOString() });
  // Physical order the database may return: the promotion's rows first.
  store.playlist_items.unshift(
    { id: "70000000-0000-4000-8000-000000000001", playlist_id: playlistId, account_id: account, media_id: PROMO_MEDIA, kind: "published", position: 1 },
    { id: "70000000-0000-4000-8000-000000000002", playlist_id: playlistId, account_id: account, media_id: PROMO_MEDIA, kind: "draft", position: 1 },
    { id: "70000000-0000-4000-8000-000000000003", playlist_id: COMBO, account_id: account, media_id: PROMO_MEDIA, kind: "published", position: 0 },
  );
  return { menuId, playlistId, boardMedia };
}
const mediaOn = (playlistId: string, kind = "published") => store.playlist_items
  .filter((row) => row.playlist_id === playlistId && row.kind === kind)
  .sort((a, b) => Number(a.position) - Number(b.position))
  .map((row) => String(row.media_id));

describe("publishing a web board with a promotion attached", () => {
  it("replaces the board's own image, never the promotion's", async () => {
    const { menuId, playlistId, boardMedia } = await boardWithPromo();
    const doc = { ...sampleLayout("two-column"), title: "Dinner (new prices)" };
    const again = await publish(menuId, doc);
    expect(again.status).toBe(200);
    const newMedia = String(store.menus.find((m) => m.id === menuId)!.media_id);
    expect(newMedia).not.toBe(boardMedia);
    expect(mediaOn(playlistId)).toEqual([newMedia, PROMO_MEDIA]);
    // The promotion still plays everywhere else it was.
    expect(mediaOn(COMBO)).toEqual([PROMO_MEDIA]);
  });

  it("keeps working after a draft (the board's stored media id is then a preview still, not on the playlist)", async () => {
    const { menuId, playlistId } = await boardWithPromo();
    const draft = await studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(accountSaveBody({ mode: "draft", menuId, name: "Dinner", document: { ...sampleLayout("two-column"), title: "Draft" } })) }));
    expect(draft.status).toBe(200);
    const again = await publish(menuId, { ...sampleLayout("two-column"), title: "Published" });
    expect(again.status).toBe(200);
    const newMedia = String(store.menus.find((m) => m.id === menuId)!.media_id);
    expect(mediaOn(playlistId)).toEqual([newMedia, PROMO_MEDIA]);
    expect(mediaOn(COMBO)).toEqual([PROMO_MEDIA]);
  });
});

describe("boardItemMedia", () => {
  it("ignores promotion and draft rows, prefers the stored id, then the lowest position", async () => {
    const { playlistId, boardMedia } = await boardWithPromo();
    expect(await boardItemMedia(account, playlistId, boardMedia)).toBe(boardMedia);
    expect(await boardItemMedia(account, playlistId, "80000000-0000-4000-8000-000000000009")).toBe(boardMedia);
    expect(await boardItemMedia(account, playlistId, null)).toBe(boardMedia);
    // A playlist with only promotion rows falls back to the stored id, as before.
    expect(await boardItemMedia(account, COMBO, "stored")).toBe("stored");
  });
});
