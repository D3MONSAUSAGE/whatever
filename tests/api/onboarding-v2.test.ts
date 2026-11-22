import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { GET as onboardingGet, POST as onboardingPost } from "@/app/api/onboarding/route";
import { GET as activityGet } from "@/app/api/analytics/activity/route";
import { POST as createMenu } from "@/app/api/menus/route";
import { createFakeDb, type Store } from "./fake-db";
import { V2_STEP_IDS } from "@/lib/onboarding";
import { sampleMenu } from "@/lib/menu-templates";

// Route-level contract for menu-first onboarding (v2) and the unchanged v1 payload Android +17..+31 reads.
let store: Store;
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", A, "cafe@example.com");
  fake.addUser("token-b", B, "other@example.com");
});
afterAll(() => setTestDb(null));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonBody = any;
function req(path: string, token = "token-a", init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost${path}`, { ...init, headers });
}
async function get(path: string, token = "token-a", headers: Record<string, string> = {}) {
  const res = await onboardingGet(req(path, token, { headers }));
  return { status: res.status, body: (await res.json()) as JsonBody };
}
async function post(path: string, body: unknown, token = "token-a", headers: Record<string, string> = {}) {
  const res = await onboardingPost(req(path, token, { method: "POST", body: JSON.stringify(body), headers }));
  return { status: res.status, body: (await res.json()) as JsonBody };
}
const account = (owner = A) => store.accounts.find((a) => a.owner_user_id === owner)!;
const step = (body: JsonBody, id: string) => body.steps.find((s: { id: string }) => s.id === id);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** First GET creates the account; then give it the 0036 columns. */
async function fresh(owner = A, token = "token-a") {
  await get("/api/onboarding", token);
  const a = account(owner);
  a.onboarding_milestones = a.onboarding_milestones ?? {};
  a.onboarding_completed_at = a.onboarding_completed_at ?? null;
  a.first_menu_celebrated_at = a.first_menu_celebrated_at ?? null;
  return a;
}
function addMenu(content: unknown, extra: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  store.menus.push({ id, account_id: account().id, name: "Lunch", content, updated_at: new Date().toISOString(), created_at: new Date().toISOString(), ...extra });
  return id;
}
function addMedia(file_name: string, extra: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  store.media.push({ id, account_id: account().id, file_name, kind: "image", source_media_id: null, processing_status: null, created_at: new Date().toISOString(), ...extra });
  return id;
}
const ITEM_BOARD = { title: "Lunch", sections: [{ name: "Tacos", items: [{ name: "Al pastor", price: "3" }] }] };

describe("GET /api/onboarding (v1, unchanged for Android)", () => {
  it("keeps the eight original ids and fields", async () => {
    const { status, body } = await get("/api/onboarding");
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["completed", "dismissed", "finished", "firstLocationId", "nextStep", "show", "steps", "total"]);
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual(["account", "business", "location", "screen", "media", "playlist", "publish", "playing"]);
    expect(body).toMatchObject({ completed: 1, total: 8, nextStep: "business", show: true, finished: false, dismissed: false });
  });
  it("still works before 0036 is applied", async () => {
    store.missingColumns = new Set(["onboarding_milestones", "onboarding_completed_at", "first_menu_celebrated_at"]);
    const v1 = await get("/api/onboarding");
    expect(v1.status).toBe(200);
    expect(v1.body.total).toBe(8);
    const v2 = await get("/api/onboarding?v=2");
    expect(v2.status).toBe(200);
    expect(v2.body.showFirstSuccess).toBe(false);
  });
});

describe("GET /api/onboarding?v=2 (menu first)", () => {
  it("returns the v2 contract: 8 steps, 5 required, 3 optional, nothing forced", async () => {
    await fresh();
    const { body } = await get("/api/onboarding?v=2");
    expect(Object.keys(body).sort()).toEqual(["completed", "completedAt", "dismissed", "finished", "nextStep", "previewTarget", "requiredCompleted",
      "requiredTotal", "show", "showFirstSuccess", "steps", "total", "version"]);
    expect(body.version).toBe(2);
    expect(body.steps.map((s: { id: string }) => s.id)).toEqual([...V2_STEP_IDS]);
    expect(body.steps.filter((s: { required: boolean }) => s.required).map((s: { id: string }) => s.id)).toEqual(["first_menu", "preview_menu", "screen", "show_on_tv", "first_update"]);
    expect(body.steps.filter((s: { optional: boolean }) => s.optional).map((s: { id: string }) => s.id)).toEqual(["customize_menu", "playlists", "schedules"]);
    expect(body).toMatchObject({ requiredCompleted: 0, requiredTotal: 5, total: 8, nextStep: "first_menu", show: true, finished: false, showFirstSuccess: false, previewTarget: null });
  });

  it("credits a draft board with a named item, stamps it, and shows the success card once", async () => {
    await fresh();
    const id = addMenu(ITEM_BOARD);
    const first = await get("/api/onboarding?v=2");
    expect(step(first.body, "first_menu")).toMatchObject({ done: true, required: true });
    expect(step(first.body, "first_menu").doneAt).toMatch(/Z$/);
    expect(first.body.showFirstSuccess).toBe(true);
    expect(first.body.previewTarget).toEqual({ kind: "menu_board", menuId: id });
    expect(store.activity_events.filter((e) => e.kind === "onboarding.first_menu")).toEqual([
      expect.objectContaining({ detail: { source: "web", kind: "menu_board" } }),
    ]);
    const closed = await post("/api/onboarding?v=2", { dismissFirstSuccess: true });
    expect(closed.status).toBe(200);
    expect(closed.body.showFirstSuccess).toBe(false);
    const at = account().first_menu_celebrated_at;
    expect(at).toBeTruthy();
    await post("/api/onboarding?v=2", { dismissFirstSuccess: true });
    expect(account().first_menu_celebrated_at).toBe(at); // the first close is kept
    expect((await get("/api/onboarding?v=2")).body.showFirstSuccess).toBe(false);
  });

  it("does not credit a title-only board, a board still, a promo still, a slide, or an unfinished upload", async () => {
    await fresh();
    addMenu({ title: "Taqueria", sections: [{ name: "", items: [{ name: "  ", price: "" }] }] });
    addMedia("Taqueria (menu).png");
    addMedia("Sale (promo).png");
    addMedia("slide 1.png", { source_media_id: crypto.randomUUID() });
    addMedia("clip.mov", { kind: "video", processing_status: "processing" });
    addMedia("deck.pptx", { kind: "presentation", processing_status: "failed" });
    const { body } = await get("/api/onboarding?v=2");
    expect(step(body, "first_menu").done).toBe(false);
    expect(body.showFirstSuccess).toBe(false);
    expect(account().onboarding_milestones).toEqual({});
  });

  it("credits a finished upload (Path B) and records the kind", async () => {
    await fresh();
    const mediaId = addMedia("my-menu.jpg");
    const { body } = await get("/api/onboarding?v=2");
    expect(step(body, "first_menu").done).toBe(true);
    expect(body.previewTarget).toEqual({ kind: "upload", mediaId });
    expect(store.activity_events.find((e) => e.kind === "onboarding.first_menu")?.detail).toEqual({ source: "web", kind: "upload" });
  });

  it("never takes progress away when the content is deleted", async () => {
    await fresh();
    addMenu(ITEM_BOARD);
    await get("/api/onboarding?v=2");
    store.menus = [];
    const { body } = await get("/api/onboarding?v=2");
    expect(step(body, "first_menu").done).toBe(true);
  });

  it("lets a TV be connected first, without a menu", async () => {
    await fresh();
    store.displays.push({ id: crypto.randomUUID(), account_id: account().id, name: "Front", status: "active", content_version: 0, created_at: new Date().toISOString() });
    const { body } = await get("/api/onboarding?v=2");
    expect(step(body, "screen").done).toBe(true);
    expect(step(body, "first_menu").done).toBe(false);
    expect(body.nextStep).toBe("first_menu");
  });

  it("records only lightweight steps from the client", async () => {
    await fresh();
    const ok = await post("/api/onboarding?v=2", { recordStep: "preview_menu" });
    expect(ok.status).toBe(200);
    expect(step(ok.body, "preview_menu").done).toBe(true);
    for (const bad of ["first_menu", "screen", "show_on_tv", "first_update", "nope", 3]) {
      expect((await post("/api/onboarding?v=2", { recordStep: bad })).status, String(bad)).toBe(400);
    }
    expect((await post("/api/onboarding?v=2", { dismissFirstSuccess: false })).status).toBe(400);
    expect((await post("/api/onboarding?v=2", {})).status).toBe(400);
  });

  it("completes on the five required steps; optional steps never block it", async () => {
    const a = await fresh();
    a.onboarding_milestones = { first_menu: "2026-11-20T10:00:00.000Z", screen: "2026-11-20T10:00:00.000Z", show_on_tv: "2026-11-20T10:00:00.000Z", first_update: "2026-11-20T10:00:00.000Z" };
    a.first_menu_celebrated_at = "2026-11-20T10:00:00.000Z";
    const done = await post("/api/onboarding?v=2", { recordStep: "preview_menu" });
    expect(done.body).toMatchObject({ requiredCompleted: 5, finished: true, show: false });
    expect(done.body.completedAt).toBeTruthy();
    expect(step(done.body, "playlists").done).toBe(false);
    expect(step(done.body, "schedules").done).toBe(false);
    // Old app builds see the same answer.
    expect((await get("/api/onboarding")).body).toMatchObject({ finished: true, show: false });
  });

  it("keeps dismissed and already-finished accounts as they were", async () => {
    const a = await fresh();
    a.onboarding_dismissed_at = "2026-11-01T00:00:00.000Z";
    addMenu(ITEM_BOARD);
    const { body } = await get("/api/onboarding?v=2");
    expect(body).toMatchObject({ dismissed: true, show: false, showFirstSuccess: false });
    expect(account().onboarding_dismissed_at).toBe("2026-11-01T00:00:00.000Z");
    const resumed = await post("/api/onboarding?v=2", { dismissed: false });
    expect(resumed.body.show).toBe(true);

    const b = await fresh(B, "token-b");
    b.onboarding_completed_at = "2026-11-02T00:00:00.000Z";
    const finished = await get("/api/onboarding?v=2", "token-b");
    expect(finished.body).toMatchObject({ finished: true, show: false, completedAt: "2026-11-02T00:00:00.000Z" });
  });

  it("is per account", async () => {
    await fresh();
    await fresh(B, "token-b");
    addMenu(ITEM_BOARD);
    await get("/api/onboarding?v=2");
    const other = await get("/api/onboarding?v=2", "token-b");
    expect(step(other.body, "first_menu").done).toBe(false);
    expect(account(B).onboarding_milestones).toEqual({});
  });

  it("tags the source for the Android app", async () => {
    await fresh();
    await post("/api/onboarding?v=2", { recordStep: "customize_menu" }, "token-a", { "x-pekko-client": "android" });
    expect(store.activity_events.find((e) => e.kind === "onboarding.customize_menu")?.detail).toEqual({ source: "android" });
  });

  it("answers 503 for recordStep before 0036, without touching anything else", async () => {
    await fresh();
    store.missingColumns = new Set(["onboarding_milestones", "onboarding_completed_at", "first_menu_celebrated_at"]);
    expect((await post("/api/onboarding?v=2", { recordStep: "preview_menu" })).status).toBe(503);
    expect((await post("/api/onboarding?v=2", { dismissFirstSuccess: true })).status).toBe(503);
  });
});

describe("save hooks", () => {
  const save = (content: unknown) => createMenu(req("/api/menus", "token-a", { method: "POST", body: JSON.stringify({ name: "Lunch", template: "fresh", content }) }));
  it("a successful board save stamps first_menu after the response", async () => {
    await fresh();
    const res = await save(sampleMenu());
    expect(res.status).toBe(201);
    await tick();
    await tick();
    expect(account().onboarding_milestones).toHaveProperty("first_menu");
  });
  it("a board with no named items saves normally and earns nothing", async () => {
    await fresh();
    const res = await save({ ...sampleMenu(), sections: [{ name: "Drinks", items: [] }] });
    expect(res.status).toBe(201);
    await tick();
    expect(account().onboarding_milestones).toEqual({});
  });
  it("never fails a save when milestones can't be written", async () => {
    await fresh();
    store.missingColumns = new Set(["onboarding_milestones"]);
    const res = await save(sampleMenu());
    expect(res.status).toBe(201);
    await tick();
    expect(store.menus).toHaveLength(1);
  });
});

describe("customer activity feed", () => {
  it("does not show onboarding.* events", async () => {
    await fresh();
    await post("/api/onboarding?v=2", { recordStep: "preview_menu" });
    store.activity_events.push({ id: crypto.randomUUID(), account_id: account().id, at: new Date().toISOString(), kind: "screen.content_changed", subject_id: null, detail: {} });
    const res = await activityGet(req("/api/analytics/activity"));
    const body = (await res.json()) as JsonBody;
    expect(JSON.stringify(body)).toContain("screen.content_changed");
    expect(JSON.stringify(body)).not.toContain("onboarding.");
  });
});
