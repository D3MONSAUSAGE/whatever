import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { setTestDb } from "@/lib/server/supabase";
import { POST as startVideoUpload } from "@/app/api/media/upload/route";
import { POST as completeVideoUpload, maxDuration } from "@/app/api/media/upload/complete/route";
import { createFakeDb, type Store } from "./fake-db";
import { jpeg } from "../helpers/bytes";

function fixture(name: string) {
  return new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
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

async function call(handler: (req: Request) => Promise<Response>, url: string, init?: RequestInit) {
  const res = await handler(new Request(url, init));
  const body = await res.json().catch(() => null);
  return { status: res.status, body: body as { id?: string; error?: string; mediaId?: string; path?: string } };
}

async function stage(name: string, bytes: Uint8Array, thumb?: Uint8Array) {
  const started = await call(startVideoUpload, "http://localhost/api/media/upload", auth({
    fileName: name,
    sizeBytes: bytes.length,
  }));
  expect(started.status).toBe(201);
  const mediaId = started.body.mediaId as string;
  const path = started.body.path as string;
  const thumbPath = `${path.slice(0, -4)}-thumb.jpg`;
  store.objects.set(path, bytes);
  if (thumb) store.objects.set(thumbPath, thumb);
  return { mediaId, path, thumbPath };
}

function completeBody(mediaId: string, fileName: string) {
  return auth({
    mediaId,
    fileName,
    durationMs: 1000,
    width: 160,
    height: 120,
    thumbnailBase64: Buffer.from(jpeg(8, 8)).toString("base64"),
  });
}

function rows(mediaId: string) {
  return store.media.filter((row) => row.id === mediaId);
}

describe("POST /api/media/upload/complete", () => {
  it("allows 300 seconds, the Hobby plan maximum, so a 50 MB object can be re-downloaded", () => {
    expect(maxDuration).toBe(300);
  });

  it("returns the existing row when complete is called twice", async () => {
    const staged = await stage("loop.mp4", fixture("h264-aac.mp4"));
    const first = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", completeBody(staged.mediaId, "loop.mp4"));
    const second = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", completeBody(staged.mediaId, "loop.mp4"));

    expect(first.status).toBe(201);
    expect(first.body).toEqual({ id: staged.mediaId });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ id: staged.mediaId });
    expect(rows(staged.mediaId)).toHaveLength(1);
    expect(store.objects.has(staged.path)).toBe(true);
    expect(store.objects.has(staged.thumbPath)).toBe(true);
  });

  it("inserts the row when the thumbnail was already stored", async () => {
    const thumb = jpeg(8, 8);
    const staged = await stage("loop.mp4", fixture("h264-aac.mp4"), thumb);
    const before = store.objects.get(staged.thumbPath);
    const done = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", completeBody(staged.mediaId, "loop.mp4"));

    expect(done.status).toBe(201);
    expect(done.body).toEqual({ id: staged.mediaId });
    expect(rows(staged.mediaId)).toHaveLength(1);
    expect(rows(staged.mediaId)[0]).toMatchObject({ kind: "video", storage_path: staged.path, thumbnail_path: staged.thumbPath });
    expect(store.objects.has(staged.path)).toBe(true);
    expect(Buffer.from(store.objects.get(staged.thumbPath) ?? [])).toEqual(Buffer.from(before ?? []));
  });

  it("keeps one row and both objects when two completes run together", async () => {
    const staged = await stage("loop.mp4", fixture("h264-aac.mp4"));
    const body = completeBody(staged.mediaId, "loop.mp4");
    const [left, right] = await Promise.all([
      call(completeVideoUpload, "http://localhost/api/media/upload/complete", body),
      call(completeVideoUpload, "http://localhost/api/media/upload/complete", body),
    ]);

    expect([left.status, right.status].sort()).toEqual([200, 201]);
    expect(left.body).toEqual({ id: staged.mediaId });
    expect(right.body).toEqual({ id: staged.mediaId });
    expect(rows(staged.mediaId)).toHaveLength(1);
    expect(store.objects.has(staged.path)).toBe(true);
    expect(store.objects.has(staged.thumbPath)).toBe(true);
  });

  it("still rejects an invalid object and deletes it", async () => {
    const staged = await stage("hevc.mp4", fixture("hevc.mp4"));
    const rejected = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", completeBody(staged.mediaId, "hevc.mp4"));

    expect(rejected.status).toBe(415);
    expect(rejected.body.error).toMatch(/H\.264/);
    expect(rows(staged.mediaId)).toHaveLength(0);
    expect(store.objects.has(staged.path)).toBe(false);
  });

  it("still rejects an invalid object when a thumbnail was already stored", async () => {
    const staged = await stage("hevc.mp4", fixture("hevc.mp4"), jpeg(8, 8));
    const rejected = await call(completeVideoUpload, "http://localhost/api/media/upload/complete", completeBody(staged.mediaId, "hevc.mp4"));

    expect(rejected.status).toBe(415);
    expect(rejected.body.error).toMatch(/H\.264/);
    expect(rows(staged.mediaId)).toHaveLength(0);
    expect(store.objects.has(staged.path)).toBe(false);
    expect(store.objects.has(staged.thumbPath)).toBe(false);
  });
});
