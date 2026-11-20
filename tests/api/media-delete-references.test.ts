import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { DELETE as deleteMedia } from "@/app/api/media/[id]/route";
import { sampleLayout } from "@/lib/layout-studio";
import { sampleMenu } from "@/lib/menu-templates";
import { apiMessageEs } from "@/lib/i18n/api-messages";
import { contentReferences, inUseMessage } from "@/lib/server/media-references";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Gother P0: DELETE /api/media/:id only refused files in playlists. Menu item photos, the classic side photo, a layout
 * board's image / video / logo, promo photos and the Brand Kit logo have no blocking foreign key (JSON, or ON DELETE
 * SET NULL), so deleting the file silently broke them. The route now refuses with 409 media_in_use.
 */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let store: Store;
let account = "";
let other = "";
const file = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function req(url: string, token = "token-a", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const del = (id: string, token = "token-a") => deleteMedia(req(`/api/media/${id}`, token, { method: "DELETE" }), { params: Promise.resolve({ id }) });
const exists = (id: string) => store.media.some((m) => m.id === id);
const addFile = (id: string, owner = account, mime = "image/png") => {
  store.media.push({ id, account_id: owner, file_name: `${id.slice(-4)}.png`, storage_path: `${owner}/${id}.png`, mime_type: mime, size_bytes: 10, kind: mime.startsWith("video") ? "video" : "image" });
  store.objects.set(`${owner}/${id}.png`, new Uint8Array([1]));
};
const addMenu = (name: string, content: unknown, owner = account) => store.menus.push({ id: crypto.randomUUID(), account_id: owner, name, template: "fresh", content, media_id: null, playlist_id: null, updated_at: new Date().toISOString() });

beforeEach(async () => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", A, "cafe@example.com");
  fake.addUser("token-b", B, "other@example.com");
  expect((await me(req("/api/me"))).status).toBe(200);
  expect((await me(req("/api/me", "token-b"))).status).toBe(200);
  account = String(store.accounts.find((row) => row.owner_user_id === A)!.id);
  other = String(store.accounts.find((row) => row.owner_user_id === B)!.id);
});
afterEach(() => setTestDb(null));

async function refused(id: string, text: RegExp) {
  const res = await del(id);
  expect(res.status).toBe(409);
  const body = await res.json() as { error: string; code: string };
  expect(body.code).toBe("media_in_use");
  expect(body.error).toMatch(text);
  expect(exists(id)).toBe(true);
}

describe("DELETE /api/media/:id refuses files still used outside playlists", () => {
  it("a classic board's item photo and side photo", async () => {
    addFile(file(1)); addFile(file(2));
    const menu = sampleMenu();
    menu.sections[0].items[0].imageMediaId = file(1);
    addMenu("Lunch", { ...menu, photoMediaId: file(2) });
    await refused(file(1), /used by “Lunch”/);
    await refused(file(2), /used by “Lunch”/);
    expect(store.menus[0].content).toMatchObject({ photoMediaId: file(2) });
  });

  it("a layout or template board's image, video, logo and item photos", async () => {
    for (const n of [3, 4, 5, 6]) addFile(file(n), account, n === 4 ? "video/mp4" : "image/png");
    const doc = sampleLayout("two-column");
    doc.sections[1].items[0] = { ...doc.sections[1].items[0], imageMediaId: file(6) };
    addMenu("Dinner", { ...doc, imageMediaId: file(3), videoMediaId: file(4), design: "modern-restaurant", logoMediaId: file(5) });
    for (const n of [3, 4, 5, 6]) await refused(file(n), /“Dinner”/);
  });

  it("the Brand Kit logo (its foreign key would have silently cleared it)", async () => {
    addFile(file(7));
    store.brand_kits.push({ account_id: account, primary_color: "#0066ff", accent_color: "#ffd34d", logo_media_id: file(7) });
    await refused(file(7), /Brand Kit logo/);
    expect(store.brand_kits[0].logo_media_id).toBe(file(7));
  });

  it("a promotion's photo, and several users at once", async () => {
    addFile(file(8));
    store.promos.push({ id: crypto.randomUUID(), account_id: account, name: "Happy hour", template: "happy", content: { photoMediaId: file(8) }, media_id: null });
    const menu = sampleMenu();
    menu.sections[1].items[0].imageMediaId = file(8);
    addMenu("Bar menu", menu);
    store.brand_kits.push({ account_id: account, logo_media_id: file(8) });
    await refused(file(8), /Brand Kit logo and is used by “Bar menu”, “Happy hour”/);
  });

  it("still deletes a file nothing uses, and another account's board doesn't block it", async () => {
    addFile(file(9));
    const theirs = sampleMenu();
    theirs.sections[0].items[0].imageMediaId = file(9);
    addMenu("Their menu", theirs, other);
    const res = await del(file(9));
    expect(res.status).toBe(200);
    expect(exists(file(9))).toBe(false);
  });

  it("keeps the playlist refusal first, with its own message", async () => {
    addFile(file(10));
    store.playlists.push({ id: "50000000-0000-4000-8000-000000000001", account_id: account, name: "Loop", revision: 1, updated_at: new Date().toISOString() });
    store.playlist_items.push({ id: crypto.randomUUID(), playlist_id: "50000000-0000-4000-8000-000000000001", account_id: account, media_id: file(10), kind: "published", position: 0 });
    const res = await del(file(10));
    expect(res.status).toBe(409);
    expect((await res.json() as { error: string }).error).toMatch(/in a playlist \(Loop\)/);
  });
});

describe("reference helpers", () => {
  it("finds an id under any *MediaId key at any depth, case-insensitively, and nothing else", () => {
    const id = file(11);
    expect(contentReferences({ sections: [{ items: [{ name: "x", imageMediaId: id.toUpperCase() }] }] }, id)).toBe(true);
    expect(contentReferences({ logoMediaId: id }, id)).toBe(true);
    expect(contentReferences({ title: id, note: `see ${id}` }, id)).toBe(false);
    expect(contentReferences(null, id)).toBe(false);
  });

  it("refusal messages have Spanish", () => {
    const one = inUseMessage({ menus: ["Lunch"], promos: [], brandLogo: false })!;
    const logo = inUseMessage({ menus: [], promos: [], brandLogo: true })!;
    const both = inUseMessage({ menus: ["Lunch"], promos: ["Happy hour"], brandLogo: true })!;
    expect(apiMessageEs(one)).toBe("Este archivo se usa en “Lunch”. Quítelo de ahí y luego elimínelo.");
    expect(apiMessageEs(logo)).toContain("Kit de marca");
    expect(apiMessageEs(both)).toContain("“Happy hour”, “Lunch”");
    expect(inUseMessage({ menus: [], promos: [], brandLogo: false })).toBeNull();
  });
});
