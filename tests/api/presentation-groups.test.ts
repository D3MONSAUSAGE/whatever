import { readFileSync } from "node:fs";
import { unzipSync, zipSync } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { sha256 } from "@/lib/server/crypto";
import { POST as startPresentation } from "@/app/api/media/presentation/route";
import { POST as completePresentation } from "@/app/api/media/presentation/complete/route";
import { GET as readPresentation, PATCH as updatePresentation } from "@/app/api/media/presentation/[id]/route";
import { POST as presentationPlaylist } from "@/app/api/media/presentation/[id]/playlist/route";
import { GET as listMedia } from "@/app/api/media/route";
import { DELETE as deleteMedia } from "@/app/api/media/[id]/route";
import { POST as createPlaylist } from "@/app/api/playlists/route";
import { GET as readPlaylist, PATCH as savePlaylist } from "@/app/api/playlists/[id]/route";
import { POST as publishPlaylist } from "@/app/api/playlists/[id]/publish/route";
import { GET as playerState } from "@/app/api/player/state/route";
import { createFakeDb, type Store } from "./fake-db";

function pptx(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/pptx/${name}`, import.meta.url)));
}

function oneSlidePptx() {
  const files = unzipSync(pptx("pekko-demo-4x3.pptx"));
  const presentation = new TextDecoder().decode(files["ppt/presentation.xml"]);
  files["ppt/presentation.xml"] = new TextEncoder().encode(presentation.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, '<p:sldIdLst><p:sldId id="256" r:id="rId7"/></p:sldIdLst>'));
  const rels = new TextDecoder().decode(files["ppt/_rels/presentation.xml.rels"]);
  files["ppt/_rels/presentation.xml.rels"] = new TextEncoder().encode(rels.replace(/<Relationship Id="rId8"[\s\S]*?\/>/, "").replace(/<Relationship Id="rId9"[\s\S]*?\/>/, ""));
  delete files["ppt/slides/slide2.xml"];
  delete files["ppt/slides/slide3.xml"];
  delete files["ppt/slides/_rels/slide2.xml.rels"];
  delete files["ppt/slides/_rels/slide3.xml.rels"];
  return zipSync(files);
}

function largePptx() {
  const files = unzipSync(pptx("pekko-demo-16x9.pptx"));
  files["ppt/media/padding.bin"] = new Uint8Array(1_500_000);
  return zipSync(files);
}

function pdf(pages: number) {
  const kids = Array.from({ length: pages }, (_, index) => `${3 + index} 0 R`).join(" ");
  const objects = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    `2 0 obj<</Type/Pages/Count ${pages}/Kids[${kids}]>>endobj`,
  ];
  for (let index = 0; index < pages; index++) {
    const width = index % 2 === 0 ? 612 : 792;
    const height = index % 2 === 0 ? 792 : 612;
    objects.push(`${3 + index} 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${width} ${height}]>>endobj`);
  }
  return new Uint8Array(Buffer.from(`%PDF-1.4\n${objects.join("\n")}\ntrailer<</Size ${objects.length + 1}/Root 1 0 R>>\n%%EOF`));
}

let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
  fake.addUser("token-b", "22222222-2222-4222-8222-222222222222", "other@example.com");
});

function auth(token: string, body?: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

async function call(handler: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, url: string, init?: RequestInit, id?: string) {
  const res = await handler(new Request(url, init), { params: Promise.resolve({ id: id ?? "00000000-0000-4000-8000-000000000000" }) });
  const body = await res.json().catch(() => null);
  // Conversion is synchronous CPU. Yield so the worker can answer Vitest before the next deck.
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, body: body as Record<string, unknown> };
}

async function stage(name: string, bytes: Uint8Array, token = "token-a") {
  const started = await call(startPresentation, "http://localhost/api/media/presentation", auth(token, { fileName: name, sizeBytes: bytes.length }));
  expect(started.status).toBe(201);
  store.objects.set(String(started.body.path), bytes);
  return { mediaId: String(started.body.mediaId), path: String(started.body.path) };
}

describe("presentation groups", () => {
  it("keeps a small, a large, and a single-slide PowerPoint as one ordered group", async () => {
    const small = await stage("small.pptx", pptx("pekko-demo-4x3.pptx"));
    const smallDone = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: small.mediaId, fileName: "small.pptx", createPlaylist: false,
    }));
    expect(smallDone.status).toBe(201);
    expect(Number(smallDone.body.slideCount)).toBeGreaterThan(1);

    const again = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: small.mediaId, fileName: "small.pptx", createPlaylist: false,
    }));
    expect(again.status).toBe(200);
    expect(again.body.slideIds).toEqual(smallDone.body.slideIds);

    const single = await stage("one.pptx", oneSlidePptx());
    const singleDone = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: single.mediaId, fileName: "one.pptx", createPlaylist: false,
    }));
    expect(singleDone.status).toBe(201);
    expect(singleDone.body.slideCount).toBe(1);

    const big = await stage("big.pptx", largePptx());
    const bigDone = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: big.mediaId, fileName: "big.pptx", createPlaylist: false,
    }));
    expect(bigDone.status).toBe(201);
    expect(bigDone.body.slideCount).toBe(4);
    const slides = store.media.filter((row) => row.source_media_id === big.mediaId).sort((a, b) => Number(a.slide_index) - Number(b.slide_index));
    expect(slides.map((row) => row.slide_index)).toEqual(slides.map((_, index) => index));
    expect(store.playlist_items.filter((row) => row.media_id === big.mediaId)).toHaveLength(0);
  }, 120_000);

  it("renders a multipage PDF and a single-page PDF as groups", async () => {
    const multi = await stage("menu.pdf", pdf(2));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: multi.mediaId, fileName: "menu.pdf", createPlaylist: false,
    }));
    expect(done.status).toBe(201);
    expect(done.body.slideCount).toBe(2);
    const slides = store.media.filter((row) => row.source_media_id === multi.mediaId).sort((a, b) => Number(a.slide_index) - Number(b.slide_index));
    expect(Number(slides[0].height)).toBeGreaterThan(Number(slides[0].width));
    expect(Number(slides[1].width)).toBeGreaterThan(Number(slides[1].height));

    const single = await stage("card.pdf", pdf(1));
    const one = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: single.mediaId, fileName: "card.pdf", createPlaylist: false,
    }));
    expect(one.status).toBe(201);
    expect(one.body.slideCount).toBe(1);
  }, 60_000);

  it("recovers a stale conversion and rejects a corrupt file without playlist items", async () => {
    const bytes = pptx("pekko-demo-16x9.pptx");
    const started = await stage("stuck.pptx", bytes);
    const accountId = String(store.accounts[0].id);
    store.media.push({
      id: started.mediaId,
      account_id: accountId,
      kind: "presentation",
      file_name: "stuck.pptx",
      storage_path: started.path,
      mime_type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size_bytes: bytes.length,
      processing_status: "processing",
      processing_done: 1,
      slide_count: 1,
      group_revision: 0,
      group_duration_ms: 10000,
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
    const partialId = crypto.randomUUID();
    store.media.push({
      id: partialId,
      account_id: accountId,
      kind: "image",
      file_name: "partial.png",
      storage_path: `${accountId}/${partialId}.png`,
      mime_type: "image/png",
      size_bytes: 10,
      source_media_id: started.mediaId,
      slide_index: 0,
      slide_revision: 1,
      created_at: new Date().toISOString(),
    });
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: started.mediaId, fileName: "stuck.pptx", createPlaylist: false,
    }));
    expect(done.status).toBe(201);
    const parent = store.media.find((row) => row.id === started.mediaId);
    const partial = store.media.find((row) => row.id === partialId);
    expect(partial?.slide_revision).not.toBe(parent?.group_revision);
    expect((done.body.slideIds as string[])).not.toContain(partialId);
    expect(store.playlist_items).toHaveLength(0);

    const bad = await stage("bad.pptx", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]));
    const failed = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: bad.mediaId, fileName: "bad.pptx", createPlaylist: true,
    }));
    expect(failed.status).toBeGreaterThanOrEqual(400);
    expect(failed.status).toBeLessThan(500);
    expect(store.playlist_items.filter((row) => row.media_id === bad.mediaId)).toHaveLength(0);
    expect(store.media.find((row) => row.id === bad.mediaId)?.processing_status).toBe("failed");
  }, 120_000);

  it("renames, saves durations, and lists the group once with its cover", async () => {
    const staged = await stage("deck.pptx", pptx("pekko-with-image.pptx"));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "Quarterly.pptx", createPlaylist: false,
    }));
    expect(done.status).toBe(201);
    const renamed = await call(updatePresentation, `http://localhost/api/media/presentation/${staged.mediaId}`, auth("token-a", {
      name: "Quarterly review",
      defaultDurationMs: 15000,
      slides: [{ id: (done.body.slideIds as string[])[0], durationMs: 5000 }],
    }, "PATCH"), staged.mediaId);
    expect(renamed.status).toBe(200);
    expect(renamed.body.fileName).toBe("Quarterly review");
    expect(renamed.body.defaultDurationMs).toBe(15000);
    expect((renamed.body.slides as { durationMs: number | null }[])[0].durationMs).toBe(5000);
    expect((renamed.body.slides as { index: number }[]).map((slide) => slide.index)).toEqual(
      (renamed.body.slides as { index: number }[]).map((slide) => slide.index).sort((a, b) => a - b),
    );
    expect(renamed.body.coverUrl).toEqual(expect.stringContaining("signed.test"));

    const library = await call(listMedia, "http://localhost/api/media?limit=50&grouped=1", auth("token-a", undefined, "GET"));
    const items = library.body.items as { id: string; kind: string; slideCount: number; sourceMediaId?: string | null }[];
    expect(items.filter((item) => item.kind === "presentation")).toHaveLength(1);
    expect(items.some((item) => item.sourceMediaId)).toBe(false);
    expect(items[0].slideCount).toBe(done.body.slideCount);

    const other = await call(readPresentation, `http://localhost/api/media/presentation/${staged.mediaId}`, auth("token-b", undefined, "GET"), staged.mediaId);
    expect(other.status).toBe(404);
  }, 120_000);

  it("adds, reorders, mixes, and reloads a playlist with the group as one item", async () => {
    const staged = await stage("mix.pptx", pptx("pekko-demo-16x9.pptx"));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "mix.pptx", createPlaylist: false,
    }));
    const accountId = String(store.accounts[0].id);
    const imageId = crypto.randomUUID();
    const imagePath = `${accountId}/${imageId}.png`;
    store.objects.set(imagePath, new Uint8Array([137, 80, 78, 71]));
    store.media.push({
      id: imageId, account_id: accountId, kind: "image", file_name: "poster.png", storage_path: imagePath,
      mime_type: "image/png", size_bytes: 4, created_at: new Date().toISOString(),
    });
    const created = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", { name: "Lobby" }));
    expect(created.status).toBe(201);
    const playlistId = String(created.body.id);
    const slideId = (done.body.slideIds as string[])[1];
    const saved = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      name: "Lobby",
      transition: "none",
      playbackMode: "auto",
      defaultDurationMs: 10000,
      items: [
        { mediaId: imageId, durationMs: 4000 },
        { mediaId: staged.mediaId, durationMs: 12000 },
        { mediaId: slideId, durationMs: 6000 },
      ],
    }, "PATCH"), playlistId);
    expect(saved.status).toBe(200);
    const reordered = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      name: "Lobby",
      transition: "fade",
      playbackMode: "auto",
      defaultDurationMs: 10000,
      items: [
        { mediaId: staged.mediaId, durationMs: 12000 },
        { mediaId: slideId, durationMs: null },
        { mediaId: imageId, durationMs: 4000 },
      ],
    }, "PATCH"), playlistId);
    expect(reordered.status).toBe(200);
    const loaded = await call(readPlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", undefined, "GET"), playlistId);
    const items = loaded.body.items as { mediaId: string; kind: string; slideCount?: number; slides?: { durationMs: number | null }[] }[];
    expect(items.map((item) => item.mediaId)).toEqual([staged.mediaId, slideId, imageId]);
    expect(items[0].kind).toBe("presentation");
    expect(items[0].slideCount).toBe(done.body.slideCount);
    expect(items[1].kind).toBe("image");
    expect(items[2].kind).toBe("image");

    const removed = await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      name: "Lobby",
      transition: "fade",
      playbackMode: "auto",
      defaultDurationMs: 10000,
      items: [{ mediaId: staged.mediaId, durationMs: 9000 }],
    }, "PATCH"), playlistId);
    expect(removed.status).toBe(200);
    const after = await call(readPlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", undefined, "GET"), playlistId);
    expect((after.body.items as { mediaId: string }[]).map((item) => item.mediaId)).toEqual([staged.mediaId]);
  }, 120_000);

  it("expands a group in player state, skips a missing slide, and leaves old playlists alone", async () => {
    const staged = await stage("play.pptx", pptx("pekko-demo-16x9.pptx"));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "play.pptx", createPlaylist: false,
    }));
    const slideIds = done.body.slideIds as string[];
    await call(updatePresentation, `http://localhost/api/media/presentation/${staged.mediaId}`, auth("token-a", {
      defaultDurationMs: 15000,
      slides: [{ id: slideIds[0], durationMs: 4000 }],
    }, "PATCH"), staged.mediaId);
    const accountId = String(store.accounts[0].id);
    const imageId = crypto.randomUUID();
    const imagePath = `${accountId}/${imageId}.png`;
    store.objects.set(imagePath, new Uint8Array([137, 80, 78, 71]));
    store.media.push({
      id: imageId, account_id: accountId, kind: "image", file_name: "after.png", storage_path: imagePath,
      mime_type: "image/png", size_bytes: 4, created_at: new Date().toISOString(),
    });
    const created = await call(createPlaylist, "http://localhost/api/playlists", auth("token-a", { name: "Screen" }));
    const playlistId = String(created.body.id);
    await call(savePlaylist, `http://localhost/api/playlists/${playlistId}`, auth("token-a", {
      name: "Screen", transition: "none", playbackMode: "auto", defaultDurationMs: 10000,
      items: [{ mediaId: staged.mediaId, durationMs: 8000 }, { mediaId: imageId, durationMs: 5000 }],
    }, "PATCH"), playlistId);
    const displayId = crypto.randomUUID();
    const token = "grouped-player-token-0123456789abcdef";
    store.displays.push({
      id: displayId, account_id: accountId, name: "Bar", status: "active", token_hash: sha256(token),
      assigned_media_id: null, assigned_playlist_id: null, content_version: 0, created_at: new Date().toISOString(),
    });
    const published = await call(publishPlaylist, `http://localhost/api/playlists/${playlistId}/publish`, auth("token-a", {
      displayIds: [displayId],
    }), playlistId);
    expect(published.status).toBe(200);

    const missing = store.media.find((row) => row.id === slideIds[1]);
    store.objects.delete(String(missing?.storage_path));
    const playing = await call(playerState, "http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } });
    expect(playing.status).toBe(200);
    const playlist = playing.body.playlist as { items: { mediaId: string; durationMs: number; groupId?: string; groupIndex?: number; groupCount?: number; width: number; height: number }[] };
    const items = playlist.items;
    expect(items.map((item) => item.mediaId)).toEqual([...slideIds.filter((id) => id !== slideIds[1]), imageId]);
    expect(items[0].durationMs).toBe(4000);
    expect(items[1].durationMs).toBe(8000);
    expect(items.at(-1)?.groupId).toBeUndefined();
    expect(items[0].groupId).toBe(staged.mediaId);
    expect(items[0].groupCount).toBe(slideIds.length - 1);
    expect(items.filter((item) => item.groupId).every((item) => item.width > 0 && item.height > 0)).toBe(true);
    const version = playing.body.version;
    const again = await call(playerState, `http://localhost/api/player/state?v=${version}`, { headers: { "X-Display-Token": token } });
    expect(again.body.unchanged).toBe(true);

    if (missing?.storage_path) store.objects.set(String(missing.storage_path), new Uint8Array([137, 80, 78, 71]));
    const legacyId = crypto.randomUUID();
    store.playlists.push({
      id: legacyId, account_id: accountId, name: "Old slides", default_duration_ms: 10000, transition: "none",
      playback_mode: "auto", published_playback_mode: "auto", published_transition: "none", revision: 1,
      published_at: new Date().toISOString(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    slideIds.forEach((mediaId, position) => {
      store.playlist_items.push({
        id: crypto.randomUUID(), playlist_id: legacyId, account_id: accountId, media_id: mediaId,
        kind: "published", position, duration_ms: 7000, created_at: new Date().toISOString(),
      });
    });
    const display = store.displays.find((row) => row.id === displayId);
    if (display) {
      display.assigned_playlist_id = legacyId;
      display.content_version = Number(display.content_version) + 1;
    }
    const legacy = await call(playerState, "http://localhost/api/player/state?v=", { headers: { "X-Display-Token": token } });
    const legacyItems = (legacy.body.playlist as { items: { mediaId: string; groupId?: string; durationMs: number }[] }).items;
    expect(legacyItems.map((item) => item.mediaId)).toEqual(slideIds.filter((id) => store.objects.has(String(store.media.find((row) => row.id === id)?.storage_path))));
    expect(legacyItems.every((item) => item.groupId == null)).toBe(true);
    expect(legacyItems[0].durationMs).toBe(7000);
  }, 120_000);

  it("deletes a presentation that playlists reference without leaving broken items", async () => {
    const staged = await stage("gone.pptx", pptx("pekko-demo-4x3.pptx"));
    await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "gone.pptx", createPlaylist: true, playbackMode: "auto",
    }));
    const blocked = await call(deleteMedia, `http://localhost/api/media/${staged.mediaId}`, auth("token-a", undefined, "DELETE"), staged.mediaId);
    expect(blocked.status).toBe(409);
    const removed = await call(deleteMedia, `http://localhost/api/media/${staged.mediaId}?detach=1`, auth("token-a", undefined, "DELETE"), staged.mediaId);
    expect(removed.status).toBe(200);
    expect(store.media.some((row) => row.id === staged.mediaId || row.source_media_id === staged.mediaId)).toBe(false);
    expect(store.playlist_items.some((row) => row.media_id === staged.mediaId)).toBe(false);
  }, 120_000);

  it("asGroup creates one draft item and leaves committed slides in place", async () => {
    const staged = await stage("group.pptx", pptx("pekko-demo-4x3.pptx"));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "group.pptx", asGroup: true, createPlaylist: true,
    }));
    expect(done.status).toBe(201);
    expect(done.body.asGroup).toBe(true);
    const playlist = store.playlists.find((row) => row.id === done.body.playlistId);
    expect(playlist?.published_at ?? null).toBeNull();
    const items = store.playlist_items.filter((row) => row.playlist_id === playlist?.id);
    expect(items.map((item) => item.media_id)).toEqual([staged.mediaId]);
    expect(store.media.filter((row) => row.source_media_id === staged.mediaId).length).toBe(done.body.slideCount);
  }, 120_000);

  it("still creates a per-slide playlist when the caller does not opt into a group", async () => {
    const staged = await stage("legacy.pptx", pptx("pekko-demo-4x3.pptx"));
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth("token-a", {
      mediaId: staged.mediaId, fileName: "legacy.pptx", createPlaylist: false,
    }));
    const created = await call(presentationPlaylist, `http://localhost/api/media/presentation/${staged.mediaId}/playlist`, auth("token-a", {
      name: "Expanded", playbackMode: "manual",
    }), staged.mediaId);
    expect(created.status).toBe(201);
    expect(created.body.asGroup).toBe(false);
    const slides = (done.body.slideIds as string[]);
    const items = store.playlist_items.filter((row) => row.playlist_id === created.body.id && row.kind === "published");
    expect(items.map((item) => item.media_id).sort()).toEqual([...slides].sort());
  }, 120_000);
});
