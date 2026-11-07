import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { POST as startPresentation } from "@/app/api/media/presentation/route";
import { POST as completePresentation, maxDuration } from "@/app/api/media/presentation/complete/route";
import { POST as createPlaylist } from "@/app/api/media/presentation/[id]/playlist/route";
import { createFakeDb, type Store } from "./fake-db";

function fixture(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/pptx/${name}`, import.meta.url)));
}

let store: Store;

beforeEach(() => {
  const fake = createFakeDb();
  store = fake.store;
  setTestDb(fake.client);
  fake.addUser("token-a", "11111111-1111-4111-8111-111111111111", "cafe@example.com");
});

function auth(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { Authorization: "Bearer token-a", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function call(handler: (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>, url: string, init?: RequestInit, id?: string) {
  const res = id
    ? await handler(new Request(url, init), { params: Promise.resolve({ id }) })
    : await handler(new Request(url, init));
  const body = await res.json().catch(() => null);
  await new Promise((resolve) => setImmediate(resolve));
  return { status: res.status, body: body as Record<string, unknown> };
}

describe("PowerPoint upload API", () => {
  it("allows 300 seconds for conversion", () => {
    expect(maxDuration).toBe(300);
  });

  it("rejects oversized init", async () => {
    const res = await call(startPresentation, "http://localhost/api/media/presentation", auth({
      fileName: "big.pptx",
      sizeBytes: 60 * 1024 * 1024,
    }));
    expect(res.status).toBe(413);
  });

  it("without asGroup, finish still publishes a per-slide manual playlist", async () => {
    const bytes = fixture("pekko-demo-16x9.pptx");
    const started = await call(startPresentation, "http://localhost/api/media/presentation", auth({
      fileName: "demo.pptx",
      sizeBytes: bytes.length,
    }));
    expect(started.status).toBe(201);
    const mediaId = String(started.body.mediaId);
    const path = String(started.body.path);
    store.objects.set(path, bytes);

    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth({
      mediaId,
      fileName: "demo.pptx",
      createPlaylist: true,
      playbackMode: "manual",
    }));
    expect(done.status).toBe(201);
    expect(done.body.slideCount).toBe(4);
    expect(done.body.asGroup).toBe(false);
    expect(Array.isArray(done.body.slideIds)).toBe(true);
    expect((done.body.slideIds as string[]).length).toBe(4);
    expect(done.body.playlistId).toBeTruthy();

    const source = store.media.find((row) => row.id === mediaId);
    expect(source).toMatchObject({ kind: "presentation", processing_status: "ready", slide_count: 4 });
    const slides = store.media
      .filter((row) => row.source_media_id === mediaId)
      .sort((a, b) => Number(a.slide_index) - Number(b.slide_index));
    expect(slides.map((s) => s.slide_index)).toEqual([0, 1, 2, 3]);
    expect(slides.every((s) => s.kind === "image")).toBe(true);

    const playlist = store.playlists.find((row) => row.id === done.body.playlistId);
    expect(playlist).toMatchObject({ playback_mode: "manual", published_playback_mode: "manual" });
    const items = store.playlist_items
      .filter((row) => row.playlist_id === playlist?.id && row.kind === "published")
      .sort((a, b) => Number(a.position) - Number(b.position));
    expect(items.map((item) => item.media_id)).toEqual(slides.map((slide) => slide.id));
    expect(store.playlist_items.some((row) => row.media_id === mediaId)).toBe(false);
  }, 120_000);

  it("creates a playlist later from an existing presentation", async () => {
    const bytes = fixture("pekko-demo-4x3.pptx");
    const started = await call(startPresentation, "http://localhost/api/media/presentation", auth({
      fileName: "square.pptx",
      sizeBytes: bytes.length,
    }));
    const mediaId = String(started.body.mediaId);
    store.objects.set(String(started.body.path), bytes);
    const done = await call(completePresentation, "http://localhost/api/media/presentation/complete", auth({
      mediaId,
      fileName: "square.pptx",
      createPlaylist: false,
    }));
    expect(done.status).toBe(201);
    expect(done.body.playlistId).toBeNull();

    const created = await call(
      createPlaylist as (req: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>,
      `http://localhost/api/media/presentation/${mediaId}/playlist`,
      auth({ name: "From deck", playbackMode: "manual" }),
      mediaId,
    );
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
  }, 120_000);
});
