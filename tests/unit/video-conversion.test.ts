import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  conversionDecision,
  inspectMp4,
  memorySource,
  probeMp4,
} from "@/lib/mp4";
import { isReadyMediaStatus } from "@/lib/media-ready";
import { setTestDb } from "@/lib/server/supabase";
import { createFakeDb } from "../api/fake-db";
import {
  actualMillisForOutput,
  budgetMonthStart,
  canAcceptReservation,
  CONVERSION_CAP_MILLIS,
  convertedVideoPath,
  handleConversionWebhook,
  hevcConversionEnabled,
  idsFromConversionWebhook,
  isJobStoragePath,
  lookupJobByProviderId,
  newWebhookToken,
  originalVideoPath,
  reserveMillisForDuration,
  startVideoConversion,
  webhookTokenMatches,
} from "@/lib/server/video-conversion";
import { getMockJob, resetMockProvider, setMockOutput } from "@/lib/server/conversion-provider";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));
const webhookToken = (url: string) => new URL(url).searchParams.get("token") ?? "";

describe("HEVC conversion flag and budget math", () => {
  it("stays off unless HEVC_CONVERSION_ENABLED is exactly 1", () => {
    expect(hevcConversionEnabled({})).toBe(false);
    expect(hevcConversionEnabled({ HEVC_CONVERSION_ENABLED: "true" })).toBe(false);
    expect(hevcConversionEnabled({ HEVC_CONVERSION_ENABLED: "1 " })).toBe(false);
    expect(hevcConversionEnabled({ NEXT_PUBLIC_HEVC_CONVERSION_ENABLED: "1" })).toBe(false);
    expect(hevcConversionEnabled({ HEVC_CONVERSION_ENABLED: "1" })).toBe(true);
  });

  it("reserves worst-case HD minutes, including pending jobs, and refuses at $15", () => {
    expect(reserveMillisForDuration(1_000)).toBe(15);
    expect(reserveMillisForDuration(60_000)).toBe(15);
    expect(reserveMillisForDuration(60_001)).toBe(30);
    expect(reserveMillisForDuration(180_000)).toBe(45);
    expect(reserveMillisForDuration(10 * 60_000)).toBe(45);
    expect(CONVERSION_CAP_MILLIS).toBe(15_000);
    expect(canAcceptReservation(14_955, 0, 45)).toBe(true);
    expect(canAcceptReservation(14_956, 0, 45)).toBe(false);
    expect(canAcceptReservation(0, 14_955, 45)).toBe(true);
    expect(canAcceptReservation(10_000, 4_956, 45)).toBe(false);
    expect(canAcceptReservation(0, 0, 0)).toBe(false);
    expect(actualMillisForOutput(1_000, 45)).toBe(15);
    expect(actualMillisForOutput(180_000, 45)).toBe(45);
  });

  it("uses the America/Los_Angeles calendar month", () => {
    expect(budgetMonthStart(new Date("2026-11-21T10:00:00-08:00"))).toBe("2026-11-01");
    expect(budgetMonthStart(new Date("2026-12-01T00:30:00-08:00"))).toBe("2026-12-01");
    // 11:30 PM PT on Nov 30 is already Dec 1 in UTC.
    expect(budgetMonthStart(new Date("2026-12-01T07:30:00Z"))).toBe("2026-11-01");
  });
});

describe("convertible vs rejected video", () => {
  it("does not mark a compatible H.264/AAC file as convertible", async () => {
    const bytes = fixture("h264-aac.mp4");
    const inspected = await inspectMp4(memorySource(bytes));
    expect(inspected.ok).toBe(true);
    const probe = await probeMp4(memorySource(bytes));
    const decision = conversionDecision(probe, bytes.byteLength);
    expect(decision.convertible).toBe(false);
  });

  it("marks HEVC MOV and MP4 as convertible within limits", async () => {
    for (const name of ["hevc-aac.mov", "hevc.mp4"] as const) {
      const bytes = fixture(name);
      const inspected = await inspectMp4(memorySource(bytes));
      expect(inspected.ok).toBe(false);
      if (!inspected.ok) expect(inspected.reason).toBe("codec");
      const probe = await probeMp4(memorySource(bytes));
      expect(probe.ok).toBe(true);
      const decision = conversionDecision(probe, bytes.byteLength);
      expect(decision.convertible, name).toBe(true);
      if (decision.convertible) expect(["hvc1", "hev1", "dvh1", "dvhe"]).toContain(decision.videoCodec);
    }
  });

  it("does not convert VP9 or oversize / over-long files", async () => {
    const vp9 = fixture("vp9-renamed.mp4");
    const probe = await probeMp4(memorySource(vp9));
    expect(conversionDecision(probe, vp9.byteLength).convertible).toBe(false);
    const hevc = fixture("hevc.mp4");
    const hevcProbe = await probeMp4(memorySource(hevc));
    expect(conversionDecision(hevcProbe, 500 * 1024 * 1024 + 1).convertible).toBe(false);
  });
});

describe("publish and path guards", () => {
  it("treats null and ready as playable, and processing or failed as not", () => {
    expect(isReadyMediaStatus(null)).toBe(true);
    expect(isReadyMediaStatus(undefined)).toBe(true);
    expect(isReadyMediaStatus("ready")).toBe(true);
    expect(isReadyMediaStatus("processing")).toBe(false);
    expect(isReadyMediaStatus("pending")).toBe(false);
    expect(isReadyMediaStatus("failed")).toBe(false);
  });

  it("only allows the job's tenant-scoped objects to be deleted", () => {
    const account = "11111111-1111-4111-8111-111111111111";
    const media = "22222222-2222-4222-8222-222222222222";
    expect(isJobStoragePath(account, media, originalVideoPath(account, media))).toBe(true);
    expect(isJobStoragePath(account, media, convertedVideoPath(account, media))).toBe(true);
    expect(isJobStoragePath(account, media, `${account}/${media}-thumb.jpg`)).toBe(true);
    expect(isJobStoragePath(account, media, `${account}/other.mp4`)).toBe(false);
    expect(isJobStoragePath(account, media, `other/${media}.mp4`)).toBe(false);
    expect(isJobStoragePath(account, media, `${account}/../secret`)).toBe(false);
  });
});

describe("conversion pipeline with a mocked provider", () => {
  const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const mediaId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const original = originalVideoPath(accountId, mediaId);
  const converted = convertedVideoPath(accountId, mediaId);
  const otherPath = `${accountId}/keep-me.mp4`;
  let fake: ReturnType<typeof createFakeDb>;

  beforeEach(() => {
    fake = createFakeDb();
    setTestDb(fake.client);
    resetMockProvider();
    process.env.HEVC_CONVERSION_ENABLED = "1";
    process.env.HEVC_CONVERSION_PROVIDER = "mock";
    process.env.NEXT_PUBLIC_APP_URL = "https://pekkotv.com";
    fake.store.objects.set(original, fixture("hevc.mp4"));
    fake.store.objects.set(otherPath, new Uint8Array([1, 2, 3, 4]));
  });

  afterEach(() => {
    setTestDb(null);
    resetMockProvider();
    delete process.env.HEVC_CONVERSION_ENABLED;
    delete process.env.HEVC_CONVERSION_PROVIDER;
  });

  async function start() {
    const bytes = fixture("hevc.mp4");
    const probe = await probeMp4(memorySource(bytes));
    const decision = conversionDecision(probe, bytes.byteLength);
    if (!decision.convertible) throw new Error("expected convertible fixture");
    return startVideoConversion({
      accountId,
      mediaId,
      fileName: "clip.mov",
      sizeBytes: bytes.byteLength,
      candidate: decision,
      thumbnailPath: `${accountId}/${mediaId}-thumb.jpg`,
      thumbBytes: null,
    });
  }

  it("does not start a provider job when the flag is off", async () => {
    delete process.env.HEVC_CONVERSION_ENABLED;
    const result = await start();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
    expect(fake.store.video_conversion_jobs).toHaveLength(0);
  });

  it("reserves budget, submits, validates output, replaces the original, and cleans the temp file", async () => {
    const started = await start();
    expect(started).toEqual({ ok: true, mediaId, processingStatus: "processing" });
    const job = fake.store.video_conversion_jobs[0];
    expect(job.status).toBe("submitted");
    expect(job.reserved_millis).toBe(15);
    expect(fake.store.video_conversion_months[0].reserved_millis).toBe(15);
    const media = fake.store.media.find((row) => row.id === mediaId);
    expect(media?.processing_status).toBe("processing");

    const mock = getMockJob(String(job.id));
    expect(mock).toBeTruthy();
    setMockOutput(String(job.id), fixture("h264-aac.mp4"));
    const token = webhookToken(mock!.request.webhookUrl);
    const first = await handleConversionWebhook(
      { jobId: String(job.id), status: "completed", outputUrl: "https://cdn.example/converted.mp4" },
      token,
      { fetchOutput: async () => fixture("h264-aac.mp4") },
    );
    expect(first).toEqual({ ok: true, status: "ready" });
    expect(fake.store.media[0].processing_status).toBe("ready");
    expect(fake.store.video_conversion_jobs[0].status).toBe("ready");
    expect(fake.store.video_conversion_months[0].reserved_millis).toBe(0);
    expect(fake.store.video_conversion_months[0].spent_millis).toBe(15);
    expect(fake.store.objects.has(converted)).toBe(false);
    expect(fake.store.objects.has(original)).toBe(true);
    expect(fake.store.objects.has(otherPath)).toBe(true);

    const replay = await handleConversionWebhook(
      { jobId: String(job.id), status: "completed", outputUrl: "https://cdn.example/converted.mp4" },
      token,
      { fetchOutput: async () => fixture("h264-aac.mp4") },
    );
    expect(replay).toEqual({ ok: true, status: "ignored" });
    expect(fake.store.video_conversion_months[0].spent_millis).toBe(15);
  });

  it("rejects a replay with the wrong token and does not charge twice", async () => {
    const started = await start();
    expect(started.ok).toBe(true);
    const job = fake.store.video_conversion_jobs[0];
    const result = await handleConversionWebhook({ jobId: String(job.id), status: "completed" }, "deadbeef");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.http).toBe(401);
  });

  it("fails closed when the converted file does not pass inspectMp4, charges the reserve, and deletes artifacts", async () => {
    const started = await start();
    expect(started.ok).toBe(true);
    const job = fake.store.video_conversion_jobs[0];
    const mock = getMockJob(String(job.id))!;
    const token = webhookToken(mock.request.webhookUrl);
    const result = await handleConversionWebhook(
      { jobId: String(job.id), status: "completed", outputUrl: "https://cdn.example/bad.mp4" },
      token,
      { fetchOutput: async () => fixture("hevc.mp4") },
    );
    expect(result).toEqual({ ok: true, status: "failed" });
    expect(fake.store.media[0].processing_status).toBe("failed");
    expect(fake.store.media[0].processing_error).toBe("conversion_invalid_output");
    expect(fake.store.video_conversion_jobs[0].status).toBe("failed");
    expect(fake.store.video_conversion_months[0].spent_millis).toBe(15);
    expect(fake.store.objects.has(original)).toBe(false);
    expect(fake.store.objects.has(converted)).toBe(false);
    expect(fake.store.objects.has(otherPath)).toBe(true);
  });

  it("releases the reserve without spend when the provider reports failure", async () => {
    const started = await start();
    expect(started.ok).toBe(true);
    const job = fake.store.video_conversion_jobs[0];
    const token = webhookToken(getMockJob(String(job.id))!.request.webhookUrl);
    const result = await handleConversionWebhook({ jobId: String(job.id), status: "failed" }, token);
    expect(result).toEqual({ ok: true, status: "failed" });
    expect(fake.store.video_conversion_months[0].reserved_millis).toBe(0);
    expect(fake.store.video_conversion_months[0].spent_millis).toBe(0);
    expect(fake.store.video_conversion_months[0].failure_count).toBe(1);
    expect(fake.store.objects.has(original)).toBe(false);
    expect(fake.store.objects.has(otherPath)).toBe(true);
  });

  it("parses official Coconut notification params from the query string and job_id", () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const url = new URL(`https://pekkotv.com/api/webhooks/video-conversion?token=abc&pekko_job_id=${jobId}`);
    const ids = idsFromConversionWebhook(url, {
      job_id: "ZtSfnBHOZeuAXj",
      event: "job.completed",
      data: {
        type: "job",
        status: "job.completed",
        id: "ZtSfnBHOZeuAXj",
        outputs: [{ key: "mp4", url: "http://cdn.coconut.co/converted.mp4", status: "video.encoded" }],
      },
    });
    expect(ids).toEqual({ token: "abc", jobId, providerJobId: "ZtSfnBHOZeuAXj" });
  });

  it("accepts the official Coconut job.completed payload by looking up the provider job id", async () => {
    const started = await start();
    expect(started.ok).toBe(true);
    const job = fake.store.video_conversion_jobs[0];
    const mock = getMockJob(String(job.id))!;
    const hookUrl = new URL(mock.request.webhookUrl);
    expect(hookUrl.searchParams.get("pekko_job_id")).toBe(String(job.id));
    const token = webhookToken(mock.request.webhookUrl);
    const coconutBody = {
      job_id: job.provider_job_id,
      event: "job.completed",
      data: {
        type: "job",
        status: "job.completed",
        id: job.provider_job_id,
        outputs: [{ key: "mp4", url: "http://cdn.coconut.co/converted.mp4", status: "video.encoded" }],
      },
    };
    const ids = idsFromConversionWebhook(hookUrl, coconutBody);
    expect(ids.jobId).toBe(String(job.id));
    const lookedUp = await lookupJobByProviderId(String(job.provider_job_id), token);
    expect(lookedUp).toBe(String(job.id));
    const seen: string[] = [];
    const result = await handleConversionWebhook(
      { ...coconutBody, jobId: ids.jobId, status: "completed" },
      token,
      { fetchOutput: async (url) => { seen.push(url); return fixture("h264-aac.mp4"); } },
    );
    expect(seen).toEqual(["http://cdn.coconut.co/converted.mp4"]);
    expect(result).toEqual({ ok: true, status: "ready" });
    expect(fake.store.media[0].processing_status).toBe("ready");
  });

  it("returns 404 instead of 503 when a Coconut job id is passed as our job id", async () => {
    const result = await handleConversionWebhook(
      { jobId: "ZtSfnBHOZeuAXj", status: "completed", outputUrl: "https://cdn.example/converted.mp4" },
      "a".repeat(32),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.http).toBe(404);
  });

  it("refuses a new job when reserved plus spent would exceed the $15 cap", async () => {
    fake.store.video_conversion_months.push({
      month: budgetMonthStart(),
      cap_millis: 15_000,
      reserved_millis: 14_990,
      spent_millis: 0,
      job_count: 10,
      failure_count: 0,
    });
    const result = await start();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(429);
      expect(result.code).toBe("conversion_budget");
    }
    expect(fake.store.media.find((row) => row.id === mediaId)).toBeUndefined();
    expect(fake.store.objects.has(original)).toBe(false);
    expect(fake.store.objects.has(otherPath)).toBe(true);
    expect(fake.store.video_conversion_months[0].reserved_millis).toBe(14_990);
  });
});

describe("webhook token", () => {
  it("accepts only the exact token for a hash", () => {
    const { token, hash } = newWebhookToken();
    expect(webhookTokenMatches(token, hash)).toBe(true);
    expect(webhookTokenMatches(token.slice(1) + "a", hash)).toBe(false);
    expect(webhookTokenMatches("", hash)).toBe(false);
  });
});
