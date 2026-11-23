import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as me } from "@/app/api/me/route";
import { POST as studioPost } from "@/app/api/layout-studio/route";
import { POST as assignBoard } from "@/app/api/layout-studio/assign/route";
import { POST as menusPost } from "@/app/api/menus/route";
import { PATCH as menuPatch } from "@/app/api/menus/[id]/route";
import { PATCH as displayPatch, GET as displayGet } from "@/app/api/displays/[id]/route";
import { GET as listDisplays } from "@/app/api/displays/route";
import { POST as claimPair } from "@/app/api/displays/pair/route";
import { POST as createPair } from "@/app/api/player/pair/route";
import { POST as switchPost } from "@/app/api/menu-templates/switch/route";
import { accountSaveBody } from "@/lib/layout-account";
import { parseLayout, playerComposition, sampleLayout, type LayoutDocument } from "@/lib/layout-studio";
import { parseMenuContent, sampleMenu } from "@/lib/menu-templates";
import { designById, switchDesign } from "@/lib/menu-designs";
import { buildCatalog, unbrandedSeed } from "@/lib/menu-catalog";
import { boardFit } from "@/lib/board-fit";
import { storeRenderedImage } from "@/lib/server/menus";
import {
  ORIENTATION_UNSUPPORTED_CODE,
  ORIENTATION_UNSUPPORTED_MESSAGE,
  clientSupportsOrientation,
  pngSize,
  resolveSavedOrientation,
} from "@/lib/board-orientation";
import { setTestDb } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { GET as playerState, POST as reportPlayer } from "@/app/api/player/state/route";
import { createFakeDb, type Store } from "./fake-db";

/**
 * Vertical (9:16) boards, PR A contract (docs/vertical/API_CONTRACT.md; Gother GO-with-notes):
 * orientation is preserved when a client omits it, older clients can't overwrite a vertical board (409
 * orientation_unsupported), rename/assign/create never need the capability, and catalog seeds stay landscape.
 */
const previousFlag = process.env.LAYOUT_STUDIO;
const A = "11111111-1111-4111-8111-111111111111";
const CAPS = { "X-Pekko-Client-Caps": "orientation" };
let store: Store;
let account = "";

function req(url: string, init: RequestInit & { caps?: boolean } = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", "Bearer token-a");
  if (init.body) headers.set("Content-Type", "application/json");
  if (init.caps) headers.set("X-Pekko-Client-Caps", "orientation");
  return new Request(`http://localhost${url}`, { ...init, headers });
}
const studio = (body: unknown, caps = false) => studioPost(req("/api/layout-studio", { method: "POST", body: JSON.stringify(body), caps }));
const patchMenu = (id: string, body: unknown, caps = false) =>
  menuPatch(req(`/api/menus/${id}`, { method: "PATCH", body: JSON.stringify(body), caps }), { params: Promise.resolve({ id }) });
const patchDisplay = (id: string, body: unknown) =>
  displayPatch(req(`/api/displays/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const menuRow = (id: string) => store.menus.find((m) => m.id === id)!;
const contentOf = (id: string) => menuRow(id).content as Record<string, unknown>;
const portraitDoc = (): LayoutDocument => ({ ...sampleLayout("menu-promo-67"), orientation: "portrait" });

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

async function createLayoutBoard(document: LayoutDocument, caps: boolean) {
  const res = await studio(accountSaveBody({ mode: "draft", menuId: null, name: "Tall board", document }), caps);
  expect(res.status).toBe(200);
  const body = await res.json() as { menuId?: string; id?: string; menu?: { id: string } };
  const id = body.menuId ?? body.menu?.id ?? body.id;
  expect(typeof id).toBe("string");
  return String(id);
}

describe("orientation contract helpers", () => {
  it("reads the capability only from X-Pekko-Client-Caps", () => {
    expect(clientSupportsOrientation(new Request("http://x", { headers: CAPS }))).toBe(true);
    expect(clientSupportsOrientation(new Request("http://x", { headers: { "X-Pekko-Client-Caps": "foo, Orientation" } }))).toBe(true);
    expect(clientSupportsOrientation(new Request("http://x"))).toBe(false);
    expect(clientSupportsOrientation(new Request("http://x", { headers: { "User-Agent": "orientation", "X-Pekko-Client": "orientation" } }))).toBe(false);
  });

  it("resolves saves: new boards, preserve on omit, block older clients, explicit reset", () => {
    expect(resolveSavedOrientation({ incoming: { orientation: "portrait" }, stored: null, capable: false })).toEqual({ ok: true, orientation: "landscape" });
    expect(resolveSavedOrientation({ incoming: { orientation: "portrait" }, stored: null, capable: true })).toEqual({ ok: true, orientation: "portrait" });
    expect(resolveSavedOrientation({ incoming: {}, stored: { orientation: "portrait" }, capable: true })).toEqual({ ok: true, orientation: "portrait" });
    expect(resolveSavedOrientation({ incoming: { orientation: "sideways" }, stored: { orientation: "portrait" }, capable: true })).toEqual({ ok: true, orientation: "portrait" });
    expect(resolveSavedOrientation({ incoming: { orientation: "landscape" }, stored: { orientation: "portrait" }, capable: true })).toEqual({ ok: true, orientation: "landscape" });
    expect(resolveSavedOrientation({ incoming: {}, stored: { orientation: "portrait" }, capable: false })).toEqual({ ok: false, blocked: true });
    expect(resolveSavedOrientation({ incoming: { orientation: "portrait" }, stored: {}, capable: false })).toEqual({ ok: true, orientation: "landscape" });
  });

  it("parsers keep the key when present, treat unknown values as omitted, and never add it to landscape documents", () => {
    const tall = parseLayout(portraitDoc());
    expect(tall.ok && tall.value.orientation).toBe("portrait");
    const odd = parseLayout({ ...sampleLayout("menu-promo-67"), orientation: "sideways" });
    expect(odd.ok).toBe(true);
    expect(odd.ok && "orientation" in odd.value).toBe(false);
    const wide = parseLayout({ ...sampleLayout("menu-promo-67"), orientation: "landscape" });
    expect(wide.ok && "orientation" in wide.value).toBe(false);
    const classic = parseMenuContent({ ...sampleMenu(), orientation: "portrait" });
    expect(classic.ok && classic.value.orientation).toBe("portrait");
    const classicOdd = parseMenuContent({ ...sampleMenu(), orientation: 7 });
    expect(classicOdd.ok && "orientation" in classicOdd.value).toBe(false);
  });

  it("reports the real canvas in BoardFit and the player composition", () => {
    expect(boardFit(sampleLayout("menu-promo-67"))).toMatchObject({ canvasWidth: 1920, canvasHeight: 1080 });
    expect(boardFit(portraitDoc())).toMatchObject({ canvasWidth: 1080, canvasHeight: 1920 });
    const video = "10000000-0000-4000-8000-000000000003";
    const withVideo = (doc: LayoutDocument) => playerComposition({ ...doc, videoMediaId: video }, "https://x/board.png", "https://x/v.mp4");
    expect(withVideo(sampleLayout("menu-promo-67"))).toMatchObject({ canvasWidth: 1920, canvasHeight: 1080 });
    expect(withVideo(portraitDoc())).toMatchObject({ canvasWidth: 1080, canvasHeight: 1920 });
  });

  it("switchDesign keeps a vertical board vertical", () => {
    const design = designById("cafe-favorites")!;
    expect(switchDesign(portraitDoc(), design).orientation).toBe("portrait");
    expect("orientation" in switchDesign(sampleLayout("menu-promo-67"), design)).toBe(false);
  });

  it("reads PNG sizes from the IHDR chunk", () => {
    const png = (w: number, h: number) => {
      const b = new Uint8Array(33);
      b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
      new DataView(b.buffer).setUint32(16, w);
      new DataView(b.buffer).setUint32(20, h);
      return b;
    };
    expect(pngSize(png(1080, 1920))).toEqual({ width: 1080, height: 1920 });
    expect(pngSize(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("catalog seeds", () => {
  it("stay landscape: no seed carries orientation", () => {
    const catalog = buildCatalog(null) as unknown as { entries?: { id: string }[]; templates?: { id: string }[]; layouts?: { id: string }[] };
    const ids = JSON.stringify(catalog).match(/"id":"[^"]+"/g)?.map((m) => m.slice(6, -1)) ?? [];
    let seeds = 0;
    for (const id of ids) {
      const seed = unbrandedSeed(id);
      if (!seed) continue;
      seeds++;
      const doc = seed.kind === "classic" ? seed.content : seed.document;
      expect((doc as { orientation?: unknown }).orientation).toBeUndefined();
    }
    expect(seeds).toBeGreaterThan(0);
    expect(JSON.stringify(catalog)).not.toContain("\"orientation\":\"portrait\"");
  });
});

describe("layout studio saves", () => {
  it("older clients create landscape boards, even when they send portrait", async () => {
    const id = await createLayoutBoard(portraitDoc(), false);
    expect(contentOf(id).orientation).toBeUndefined();
  });

  it("capable clients create vertical boards; omitting the key later keeps it", async () => {
    const id = await createLayoutBoard(portraitDoc(), true);
    expect(contentOf(id).orientation).toBe("portrait");
    const { orientation: _o, ...withoutKey } = portraitDoc();
    void _o;
    // The web editor now always sends the key (PR B); an API client that omits it must still keep the board vertical.
    const body = accountSaveBody({ mode: "draft", menuId: id, name: "Tall board", document: { ...withoutKey, title: "Renamed title" } }) as { document: Record<string, unknown> };
    delete body.document.orientation;
    expect(JSON.stringify(body)).not.toContain("orientation");
    const res = await studio(body, true);
    expect(res.status).toBe(200);
    expect(contentOf(id).orientation).toBe("portrait");
    expect(contentOf(id).title).toBe("Renamed title");
  });

  it("refuses draft and publish to a vertical board without the capability (409), and changes nothing", async () => {
    const id = await createLayoutBoard(portraitDoc(), true);
    const before = JSON.stringify(menuRow(id));
    for (const mode of ["draft", "publish"] as const) {
      const res = await studio(accountSaveBody({ mode, menuId: id, name: "Tall board", document: sampleLayout("menu-promo-67") }), false);
      expect(res.status).toBe(409);
      const body = await res.json() as { error: string; code: string };
      expect(body.code).toBe(ORIENTATION_UNSUPPORTED_CODE);
      expect(body.error).toBe(ORIENTATION_UNSUPPORTED_MESSAGE);
    }
    expect(JSON.stringify(menuRow(id))).toBe(before);
  });

  it("localizes the 409 in Spanish", async () => {
    const id = await createLayoutBoard(portraitDoc(), true);
    const res = await studioPost(req("/api/layout-studio", {
      method: "POST",
      headers: { "Accept-Language": "es" },
      body: JSON.stringify(accountSaveBody({ mode: "draft", menuId: id, name: "x", document: sampleLayout("menu-promo-67") })),
    }));
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string; code: string };
    expect(body.code).toBe(ORIENTATION_UNSUPPORTED_CODE);
    expect(body.error).toBe("Este menú es vertical. Edítelo en pekkotv.com, o actualice la aplicación para cambiarlo aquí.");
  });

  it("an explicit landscape from a capable client turns the board horizontal", async () => {
    const id = await createLayoutBoard(portraitDoc(), true);
    const res = await studio(accountSaveBody({ mode: "draft", menuId: id, name: "Tall board", document: { ...sampleLayout("menu-promo-67"), orientation: "landscape" } as unknown as LayoutDocument }), true);
    expect(res.status).toBe(200);
    expect(contentOf(id).orientation).toBeUndefined();
  });

  it("older clients still save landscape boards (200) and can assign vertical boards to screens", async () => {
    const wide = await createLayoutBoard(sampleLayout("menu-promo-67"), false);
    const res = await studio(accountSaveBody({ mode: "draft", menuId: wide, name: "Wide", document: sampleLayout("menu-promo-67") }), false);
    expect(res.status).toBe(200);
    const published = await studio(accountSaveBody({ mode: "publish", menuId: null, name: "Tall", document: portraitDoc() }), true);
    expect(published.status).toBe(200);
    const tall = String(store.menus.find((m) => m.name === "Tall")!.id);
    const display = "20000000-0000-4000-8000-000000000001";
    store.displays.push({ id: display, account_id: account, name: "TV", content_version: 1, assigned_playlist_id: null, status: "active" });
    const assigned = await assignBoard(req("/api/layout-studio/assign", { method: "POST", body: JSON.stringify({ menuId: tall, displayId: display }) }));
    expect(assigned.status).toBe(200);
    // Rename and screen changes through PATCH /api/menus/:id never need the capability.
    expect((await patchMenu(tall, { name: "Tall dinner", displayIds: [display] })).status).toBe(200);
    expect(contentOf(tall).orientation).toBe("portrait");
  });

  it("design switch (saves nothing) keeps portrait for any client", async () => {
    const res = await switchPost(req("/api/menu-templates/switch", { method: "POST", body: JSON.stringify({ document: portraitDoc(), to: "cafe-favorites" }) }));
    expect(res.status).toBe(200);
    const body = await res.json() as { document: LayoutDocument; fit: { canvasWidth: number; canvasHeight: number } };
    expect(body.document.orientation).toBe("portrait");
    expect(body.fit).toMatchObject({ canvasWidth: 1080, canvasHeight: 1920 });
  });
});

describe("classic boards", () => {
  async function classicBoard(caps: boolean, orientation?: "portrait") {
    const content = orientation ? { ...sampleMenu(), orientation } : sampleMenu();
    const res = await menusPost(req("/api/menus", { method: "POST", body: JSON.stringify({ name: "Lunch", template: "fresh", content }), caps }));
    expect(res.status).toBe(201);
    return String((await res.json() as { id: string }).id);
  }

  it("older clients create landscape (201), capable clients can create vertical", async () => {
    expect(contentOf(await classicBoard(false, "portrait")).orientation).toBeUndefined();
    expect(contentOf(await classicBoard(true, "portrait")).orientation).toBe("portrait");
  });

  it("refuses content and template changes from older clients but allows rename", async () => {
    const id = await classicBoard(true, "portrait");
    const content = await patchMenu(id, { content: sampleMenu() });
    expect(content.status).toBe(409);
    expect((await content.json() as { code: string }).code).toBe(ORIENTATION_UNSUPPORTED_CODE);
    const template = await patchMenu(id, { template: "classic" });
    expect(template.status).toBe(409);
    const rename = await patchMenu(id, { name: "Dinner" });
    expect(rename.status).toBe(200);
    expect(menuRow(id).name).toBe("Dinner");
    expect(contentOf(id).orientation).toBe("portrait");
  });

  it("capable clients keep portrait when they omit it, and reset with an explicit landscape", async () => {
    const id = await classicBoard(true, "portrait");
    expect((await patchMenu(id, { content: { ...sampleMenu(), title: "New" } }, true)).status).toBe(200);
    expect(contentOf(id).orientation).toBe("portrait");
    expect((await patchMenu(id, { content: { ...sampleMenu(), orientation: "landscape" } }, true)).status).toBe(200);
    expect(contentOf(id).orientation).toBeUndefined();
  });
});

describe("screens", () => {
  async function pairedDisplay(extra: Record<string, unknown> = {}) {
    const created = await createPair(new Request("http://localhost/api/player/pair", { method: "POST", body: "{}" }));
    const { code } = await created.json() as { code: string };
    const res = await claimPair(req("/api/displays/pair", { method: "POST", body: JSON.stringify({ code, name: "Front counter", ...extra }) }));
    return { status: res.status, body: await res.json() as { id: string } };
  }

  it("pair { code, name } stays valid; pair can say vertical; invalid values are refused", async () => {
    const plain = await pairedDisplay();
    expect(plain.status).toBe(200);
    expect(store.displays.find((d) => d.id === plain.body.id)!.orientation ?? "landscape").toBe("landscape");
    const tall = await pairedDisplay({ orientation: "portrait" });
    expect(tall.status).toBe(200);
    expect(store.displays.find((d) => d.id === tall.body.id)!.orientation).toBe("portrait");
    const bad = await pairedDisplay({ orientation: "upside-down" });
    expect(bad.status).toBe(400);
  });

  it("PATCH { orientation } alone is a partial update; invalid values are 400", async () => {
    const { body } = await pairedDisplay();
    const id = body.id;
    expect((await patchDisplay(id, { orientation: "portrait" })).status).toBe(200);
    const row = store.displays.find((d) => d.id === id)!;
    expect(row.orientation).toBe("portrait");
    expect(row.name).toBe("Front counter");
    expect((await patchDisplay(id, { name: "Patio" })).status).toBe(200);
    expect(row.orientation).toBe("portrait");
    expect((await patchDisplay(id, { orientation: "sideways" })).status).toBe(400);
    expect((await patchDisplay(id, { orientation: "landscape", name: "" })).status).toBe(400);
    expect(row.orientation).toBe("portrait");
    const list = await listDisplays(req("/api/displays"));
    const listed = (await list.json() as { id: string; orientation: string }[]).find((d) => d.id === id)!;
    expect(listed.orientation).toBe("portrait");
    const one = await displayGet(req(`/api/displays/${id}`), { params: Promise.resolve({ id }) });
    expect(one.status).toBe(200);
  });
});

describe("rendered board media", () => {
  it("records the real PNG size (1080x1920 for vertical boards)", async () => {
    const b = new Uint8Array(40);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, 1080);
    new DataView(b.buffer).setUint32(20, 1920);
    const id = await storeRenderedImage(account, "Tall (menu).png", b);
    expect(id).toBeTruthy();
    const row = store.media.find((m) => m.id === id)!;
    expect(row.width).toBe(1080);
    expect(row.height).toBe(1920);
  });
});

describe("player", () => {
  async function tokenScreen(orientation?: "portrait") {
    const token = "t".repeat(40) + Math.random().toString(36).slice(2);
    const id = crypto.randomUUID();
    store.displays.push({
      id, account_id: account, name: "TV", content_version: 0, assigned_playlist_id: null, assigned_media_id: null,
      status: "active", token_hash: sha256(token), ...(orientation ? { orientation } : {}),
    });
    return { id, token };
  }
  const state = (token: string) => playerState(new Request("http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } }));

  it("adds displayOrientation only for vertical screens, so landscape payloads are unchanged", async () => {
    const wide = await tokenScreen();
    expect(await (await state(wide.token)).json()).not.toHaveProperty("displayOrientation");
    const tall = await tokenScreen("portrait");
    expect(await (await state(tall.token)).json()).toMatchObject({ displayOrientation: "portrait" });
  });

  it("stores the reported viewport and rejects nonsense", async () => {
    const { id, token } = await tokenScreen();
    const post = (body: unknown) => reportPlayer(new Request("http://localhost/api/player/state", {
      method: "POST", headers: { "X-Display-Token": token, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    expect((await post({ viewport: { width: 1080, height: 1920 } })).status).toBe(200);
    const row = store.displays.find((d) => d.id === id)!;
    expect([row.player_viewport_width, row.player_viewport_height]).toEqual([1080, 1920]);
    expect((await post({ viewport: { width: "wide", height: 0 } })).status).toBe(400);
    const list = await listDisplays(req("/api/displays"));
    const listed = (await list.json() as { id: string; reportedViewport: { width: number; height: number } | null }[]).find((d) => d.id === id)!;
    expect(listed.reportedViewport).toMatchObject({ width: 1080, height: 1920 });
  });
});
