import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { GET as studioGet, POST as studioPost } from "@/app/api/layout-studio/route";
import { POST as switchPost } from "@/app/api/menu-templates/switch/route";
import { accountSaveBody, readAccountStudio } from "@/lib/layout-account";
import { parseLayout, type LayoutDocument } from "@/lib/layout-studio";
import { MENU_DESIGNS, designById, designDocument } from "@/lib/menu-designs";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Every non-food template through the real routes, signed in (fake Supabase): create a draft, reopen it, edit it
 * (title, a cleared price, colour style), publish it horizontal and vertical, and switch it from a food board.
 * A board already on a screen is never touched.
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const A = "11111111-1111-4111-8111-111111111111";
// The 16 non-food templates on the shared compositions; the premium service templates (own compositions)
// run the same flows in tests/api/unified-editor-flows.test.ts.
const PREMIUM = ["showcaseLeft", "editorial", "spotlight", "timetable"];
const NON_FOOD = MENU_DESIGNS.filter((d) => ["salon", "retail", "fitness", "office", "pets"].includes(d.business) && !PREMIUM.includes(d.composition));
let store: Store;

function req(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Pekko-Client-Caps", "orientation");
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const save = (mode: "draft" | "publish", menuId: string | null, name: string, document: LayoutDocument) =>
  studioPost(req("/api/layout-studio", "token-a", { method: "POST", body: JSON.stringify(accountSaveBody({ mode, menuId, name, document })) }));
const storedDoc = (menuId: string) => {
  const parsed = parseLayout(store.menus.find((row) => row.id === menuId)!.content);
  expect(parsed.ok).toBe(true);
  return (parsed as { ok: true; value: LayoutDocument }).value;
};

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", A, "salon@example.com");
  expect((await me(req("/api/me", "token-a"))).status).toBe(200);
  const account = String(store.accounts.find((row) => row.owner_user_id === A)!.id);
  // An existing restaurant board on a screen: none of the new-template work may touch it.
  store.media.push({ id: "10000000-0000-4000-8000-0000000000c1", account_id: account, file_name: "breakfast.png", storage_path: `${account}/breakfast.png`, mime_type: "image/png", size_bytes: 8, kind: "image" });
  store.playlists.push({ id: "10000000-0000-4000-8000-0000000000d1", account_id: account, name: "Breakfast", revision: 1, updated_at: new Date().toISOString() });
  store.playlist_items.push({ id: "10000000-0000-4000-8000-0000000000e1", playlist_id: "10000000-0000-4000-8000-0000000000d1", account_id: account, media_id: "10000000-0000-4000-8000-0000000000c1", kind: "published" });
  store.displays.push({ id: "10000000-0000-4000-8000-0000000000f1", account_id: account, name: "Counter", content_version: 4, assigned_playlist_id: "10000000-0000-4000-8000-0000000000d1", status: "active" });
});
afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

describe("non-food templates through the real save routes", () => {
  it("has the 16 templates", () => expect(NON_FOOD).toHaveLength(16));

  for (const design of NON_FOOD) {
    it(`${design.id}: draft → reopen → edit → publish (16:9 and 9:16)`, async () => {
      const seed = designDocument(design);
      const draft = await save("draft", null, seed.title, seed);
      expect(draft.status).toBe(200);
      const { menuId } = await draft.json() as { menuId: string };
      expect(storedDoc(menuId).design).toBe(design.id);
      expect(storedDoc(menuId).sections).toEqual(seed.sections);

      const loaded = readAccountStudio(await (await studioGet(req("/api/layout-studio", "token-a"))).json());
      const board = loaded?.boards.find((b) => b.id === menuId);
      expect(board).toBeTruthy();

      // Owner edits: business name, an empty price, another colour style.
      const edited: LayoutDocument = structuredClone(storedDoc(menuId));
      edited.title = "Studio 9";
      edited.sections[0].items[0].price = "";
      edited.variant = design.variants[1].id;
      const published = await save("publish", menuId, "Studio 9", edited);
      expect(published.status).toBe(200);
      const after = storedDoc(menuId);
      expect([after.title, after.variant, after.sections[0].items[0].price]).toEqual(["Studio 9", design.variants[1].id, ""]);
      const media = store.media.find((row) => row.id === store.menus.find((m) => m.id === menuId)!.media_id);
      expect(String(media?.mime_type)).toBe("image/png");

      const tall = await save("publish", menuId, "Studio 9", { ...after, orientation: "portrait" });
      expect(tall.status).toBe(200);
      expect(storedDoc(menuId).orientation).toBe("portrait");

      // The restaurant board on the Counter screen is untouched.
      expect(store.playlist_items.find((row) => row.playlist_id === "10000000-0000-4000-8000-0000000000d1")?.media_id).toBe("10000000-0000-4000-8000-0000000000c1");
      expect(store.displays.find((row) => row.name === "Counter")?.content_version).toBe(4);
    }, 30_000);
  }

  it("the app's switch route moves a food board onto every non-food template and back, keeping the content", async () => {
    const food = designDocument(designById("modern-restaurant")!);
    for (const design of NON_FOOD) {
      const res = await switchPost(req("/api/menu-templates/switch", "token-a", { method: "POST", body: JSON.stringify({ document: food, to: design.id, variant: design.variants[2].id }) }));
      expect(res.status, design.id).toBe(200);
      const { document, fit } = await res.json() as { document: LayoutDocument; fit: { canPublish: boolean } };
      expect([document.design, document.variant]).toEqual([design.id, design.variants[2].id]);
      expect(document.sections).toEqual(food.sections);
      expect(typeof fit.canPublish).toBe("boolean");
    }
  });
});
