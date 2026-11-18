import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { GET as studioGet, POST as studioPost } from "@/app/api/layout-studio/route";
import { POST as assignBoard } from "@/app/api/layout-studio/assign/route";
import { POST as menusPost } from "@/app/api/menus/route";
import { PATCH as menuPatch } from "@/app/api/menus/[id]/route";
import { accountSaveBody, readAccountStudio } from "@/lib/layout-account";
import { parseLayout, sampleLayout, type LayoutDocument } from "@/lib/layout-studio";
import { designById, designDocument, switchDesign } from "@/lib/menu-designs";
import { classicSaveContent, fromClassic, switchToLayout, toClassic } from "@/lib/menu-designer";
import { withItemPhoto as withSectionPhoto } from "@/lib/menu-item-photos";
import { sampleMenu, type MenuContent } from "@/lib/menu-templates";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * The unified menu designer's real requests, signed in, through the real routes (fake Supabase):
 * create, save draft, reopen, add item photos, publish, add a screen; classic boards; another account kept out;
 * existing screens and schedules only change on publish of their own board.
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const PHOTO = "10000000-0000-4000-8000-0000000000a1";
const PHOTO2 = "10000000-0000-4000-8000-0000000000a2";
const THEIRS = "10000000-0000-4000-8000-0000000000b1";
let store: Store;

function req(url: string, token: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
async function accountOf(token: string, user: string) {
  expect((await me(req("/api/me", token))).status).toBe(200);
  return String(store.accounts.find((row) => row.owner_user_id === user)!.id);
}
const save = (token: string, mode: "draft" | "publish", menuId: string | null, name: string, document: LayoutDocument) =>
  studioPost(req("/api/layout-studio", token, { method: "POST", body: JSON.stringify(accountSaveBody({ mode, menuId, name, document })) }));
const withItemPhoto = (doc: LayoutDocument, si: number, ii: number, id: string): LayoutDocument => ({ ...doc, sections: withSectionPhoto(doc.sections, si, ii, id) });
const photoIds = (doc: { sections: { items: { imageMediaId?: string }[] }[] }) => doc.sections.flatMap((s) => s.items.map((i) => i.imageMediaId)).filter(Boolean);

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  process.env.LAYOUT_STUDIO = "1";
  fake.addUser("token-a", A, "cafe@example.com");
  fake.addUser("token-b", B, "other@example.com");
});
afterEach(() => {
  setTestDb(null);
  if (previousFlag === undefined) delete process.env.LAYOUT_STUDIO;
  else process.env.LAYOUT_STUDIO = previousFlag;
});

async function seed() {
  const account = await accountOf("token-a", A);
  const other = await accountOf("token-b", B);
  store.media.push(
    { id: PHOTO, account_id: account, file_name: "burrata.png", storage_path: `${account}/burrata.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
    { id: PHOTO2, account_id: account, file_name: "tacos.png", storage_path: `${account}/tacos.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
    { id: THEIRS, account_id: other, file_name: "theirs.png", storage_path: `${other}/theirs.png`, mime_type: "image/png", size_bytes: png.length, kind: "image" },
  );
  store.objects.set(`${account}/burrata.png`, new Uint8Array(png));
  store.objects.set(`${account}/tacos.png`, new Uint8Array(png));
  store.objects.set(`${other}/theirs.png`, new Uint8Array(png));
  // An existing board already on a screen and in a schedule, which none of these edits may touch.
  const otherBoardMedia = "10000000-0000-4000-8000-0000000000c1";
  store.media.push({ id: otherBoardMedia, account_id: account, file_name: "breakfast.png", storage_path: `${account}/breakfast.png`, mime_type: "image/png", size_bytes: 8, kind: "image" });
  store.playlists.push({ id: "10000000-0000-4000-8000-0000000000d1", account_id: account, name: "Breakfast", revision: 1, updated_at: new Date().toISOString() });
  store.playlist_items.push({ id: "10000000-0000-4000-8000-0000000000e1", playlist_id: "10000000-0000-4000-8000-0000000000d1", account_id: account, media_id: otherBoardMedia, kind: "published" });
  store.displays.push(
    { id: "10000000-0000-4000-8000-0000000000f1", account_id: account, name: "Counter", content_version: 4, assigned_playlist_id: "10000000-0000-4000-8000-0000000000d1", status: "active" },
    { id: "10000000-0000-4000-8000-0000000000f2", account_id: account, name: "Patio", content_version: 4, assigned_playlist_id: null, status: "active" },
  );
  return { account, other, otherBoardMedia };
}
const breakfastUntouched = (media: string) => {
  expect(store.playlist_items.find((row) => row.playlist_id === "10000000-0000-4000-8000-0000000000d1")?.media_id).toBe(media);
  expect(store.displays.find((row) => row.name === "Counter")?.content_version).toBe(4);
};

describe("unified designer, signed in: original layout boards", () => {
  it("create → draft → reopen → item photos → publish → add screen; foreign photos dropped; other boards untouched", async () => {
    const { otherBoardMedia } = await seed();
    let doc = withItemPhoto(withItemPhoto(sampleLayout("two-column"), 0, 0, PHOTO), 1, 0, THEIRS);
    const draft = await save("token-a", "draft", null, "Lunch", doc);
    expect(draft.status).toBe(200);
    const { menuId } = await draft.json() as { menuId: string };
    // Draft: stored, nothing on screens changed; another account's photo was dropped, the item kept its text.
    const stored = store.menus.find((row) => row.id === menuId)!;
    const parsed = parseLayout(stored.content);
    expect(parsed.ok && photoIds(parsed.value)).toEqual([PHOTO]);
    expect(parsed.ok && parsed.value.sections[1].items[0].name).toBe(doc.sections[1].items[0].name);
    breakfastUntouched(otherBoardMedia);
    // Reopen: the board and the photo library come back for the editor.
    const loaded = readAccountStudio(await (await studioGet(req("/api/layout-studio", "token-a"))).json());
    expect(loaded?.boards.some((b) => b.id === menuId)).toBe(true);
    expect(loaded?.library.some((f) => f.id === PHOTO)).toBe(true);
    expect(loaded?.library.some((f) => f.id === THEIRS)).toBe(false);
    // Edit: second photo, hide/show, Advanced options; then publish.
    doc = { ...withItemPhoto(parsed.ok ? parsed.value : doc, 1, 1, PHOTO2), font: "oswald", split: doc.split, typeScale: "counter" };
    const published = await save("token-a", "publish", menuId, "Lunch", doc);
    expect(published.status).toBe(200);
    const after = parseLayout(store.menus.find((row) => row.id === menuId)!.content);
    expect(after.ok && photoIds(after.value)).toEqual([PHOTO, PHOTO2]);
    expect(after.ok && after.value.font).toBe("oswald");
    const boardMedia = String(store.menus.find((row) => row.id === menuId)!.media_id);
    expect(store.media.some((row) => row.id === boardMedia && String(row.mime_type) === "image/png")).toBe(true);
    // Add a screen.
    const assigned = await assignBoard(req("/api/layout-studio/assign", "token-a", { method: "POST", body: JSON.stringify({ menuId, displayId: "10000000-0000-4000-8000-0000000000f2" }) }));
    expect(assigned.status).toBe(200);
    expect(store.displays.find((row) => row.name === "Patio")?.assigned_playlist_id).toBeTruthy();
    breakfastUntouched(otherBoardMedia);
  });

  it("switching an existing template board to an original layout and back keeps photos and saves through the same route", async () => {
    await seed();
    const template = withItemPhoto(designDocument(designById("modern-restaurant")!), 0, 0, PHOTO);
    const first = await save("token-a", "draft", null, "Dinner", template);
    const { menuId } = await first.json() as { menuId: string };
    const asLayout = switchToLayout(template, "split-50");
    expect((await save("token-a", "draft", menuId, "Dinner", asLayout)).status).toBe(200);
    const stored = parseLayout(store.menus.find((row) => row.id === menuId)!.content);
    expect(stored.ok && stored.value.design).toBeUndefined();
    expect(stored.ok && photoIds(stored.value)).toEqual([PHOTO]);
    const back = switchDesign(stored.ok ? stored.value : asLayout, designById("cafe-favorites")!);
    expect((await save("token-a", "publish", menuId, "Dinner", back)).status).toBe(200);
    const final = parseLayout(store.menus.find((row) => row.id === menuId)!.content);
    expect(final.ok && final.value.design).toBe("cafe-favorites");
    expect(final.ok && photoIds(final.value)).toEqual([PHOTO]);
  });

  it("another account can't save into this account's board", async () => {
    await seed();
    const first = await save("token-a", "draft", null, "Mine", sampleLayout("menu-banner"));
    const { menuId } = await first.json() as { menuId: string };
    const res = await save("token-b", "draft", menuId, "Taken", sampleLayout("menu-banner"));
    expect(res.status).toBe(404);
    expect(store.menus.find((row) => row.id === menuId)?.name).toBe("Mine");
  });
});

describe("unified designer, signed in: classic boards", () => {
  it("create with item photos, edit in the designer, then an Android edit keeps the photos", async () => {
    const { otherBoardMedia } = await seed();
    const working = fromClassic("fresh", sampleMenu());
    let doc = withItemPhoto(withItemPhoto(working.doc, 0, 0, PHOTO), 0, 1, THEIRS);
    let { template, content } = toClassic(doc, working.classic);
    const created = await menusPost(req("/api/menus", "token-a", { method: "POST", body: JSON.stringify({ name: "Tacos", template, content: classicSaveContent(content) }) }));
    expect(created.status).toBe(201);
    const { id } = await created.json() as { id: string };
    const row = () => store.menus.find((m) => m.id === id)!;
    expect(photoIds(row().content as MenuContent)).toEqual([PHOTO]);
    expect(row().media_id).toBeTruthy();
    breakfastUntouched(otherBoardMedia);

    // Reopen in the designer (lossless), add a second photo, hide photos, save.
    const reopened = fromClassic(row().template, row().content as MenuContent);
    doc = { ...withItemPhoto(reopened.doc, 1, 0, PHOTO2), photoStyle: "text" };
    ({ template, content } = toClassic(doc, reopened.classic));
    const edited = await menuPatch(req(`/api/menus/${id}`, "token-a", { method: "PATCH", body: JSON.stringify({ name: "Tacos", template, content: classicSaveContent(content) }) }), { params: Promise.resolve({ id }) });
    expect(edited.status).toBe(200);
    expect(photoIds(row().content as MenuContent)).toEqual([PHOTO, PHOTO2]);
    expect((row().content as MenuContent).itemPhotos).toBe(false);

    // The Android app sends classic content without item photo keys: the photos and the hide setting stay.
    const android = JSON.parse(JSON.stringify(sampleMenu())) as MenuContent;
    android.title = "Edited on Android";
    const fromPhone = await menuPatch(req(`/api/menus/${id}`, "token-a", { method: "PATCH", body: JSON.stringify({ content: android }) }), { params: Promise.resolve({ id }) });
    expect(fromPhone.status).toBe(200);
    expect((row().content as MenuContent).title).toBe("Edited on Android");
    expect(photoIds(row().content as MenuContent)).toEqual([PHOTO, PHOTO2]);
    expect((row().content as MenuContent).itemPhotos).toBe(false);
    breakfastUntouched(otherBoardMedia);
  });

  it("an older client still can't overwrite a layout board through the classic route", async () => {
    await seed();
    const first = await save("token-a", "draft", null, "Layout", withItemPhoto(sampleLayout("two-column"), 0, 0, PHOTO));
    const { menuId } = await first.json() as { menuId: string };
    const res = await menuPatch(req(`/api/menus/${menuId}`, "token-a", { method: "PATCH", body: JSON.stringify({ content: sampleMenu() }) }), { params: Promise.resolve({ id: menuId }) });
    expect(res.status).toBe(409);
    const kept = parseLayout(store.menus.find((row) => row.id === menuId)!.content);
    expect(kept.ok && photoIds(kept.value)).toEqual([PHOTO]);
  });
});
