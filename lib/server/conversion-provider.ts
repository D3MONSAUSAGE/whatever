/**
 * Conversion provider adapter. Coconut is the default when the feature flag is on and a key is present.
 * Tests may set HEVC_CONVERSION_PROVIDER=mock. Production must not set that.
 */

export type SubmitRequest = {
  jobId: string;
  inputUrl: string;
  webhookUrl: string;
  outputPath: string;
  token: string;
};

export type SubmitResult = { providerJobId: string };

export type DownloadRequest = {
  outputUrl?: string;
  outputPath: string;
  accountId: string;
  mediaId: string;
};

export type ConversionProvider = {
  name: "coconut" | "mock";
  submit(request: SubmitRequest): Promise<SubmitResult>;
  downloadOutput(request: DownloadRequest): Promise<Uint8Array>;
};

/** Official HD output format: H.264 High 4.2, 1080p, 30 fps, yuv420p, HDR→SDR when the API version supports it. */
export const COCONUT_OUTPUT_FORMAT =
  "mp4:1080p_h264_30fps::quality=4,vprofile=high,level=42,pix_fmt=yuv420p,force_sdr";

export function getConversionProvider(env: Record<string, string | undefined> = process.env): ConversionProvider | null {
  if (env.HEVC_CONVERSION_ENABLED !== "1") return null;
  if (env.HEVC_CONVERSION_PROVIDER === "mock") return mockProvider;
  const apiKey = env.COCONUT_API_KEY;
  if (!apiKey) return null;
  return coconutProvider(apiKey);
}

export function coconutProvider(apiKey: string): ConversionProvider {
  return {
    name: "coconut",
    async submit(request) {
      const body = {
        input: { url: request.inputUrl },
        storage: { service: "coconut" },
        notification: {
          type: "http",
          url: request.webhookUrl,
          metadata: true,
          params: { pekko_job_id: request.jobId, token: request.token },
        },
        outputs: {
          [COCONUT_OUTPUT_FORMAT]: { path: "/converted.mp4" },
        },
      };
      const auth = Buffer.from(`${apiKey}:`).toString("base64");
      const res = await fetch("https://api.coconut.co/v2/jobs", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Coconut-Version": "2026-001",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Coconut rejected the job (${res.status}).`);
      }
      const json = await res.json() as { id?: string | number };
      if (json.id == null) throw new Error("Coconut did not return a job id.");
      return { providerJobId: String(json.id) };
    },
    async downloadOutput(request) {
      if (!request.outputUrl || !/^https:\/\//i.test(request.outputUrl)) {
        throw new Error("Conversion output URL is missing.");
      }
      return fetchOutputBytes(request.outputUrl);
    },
  };
}

const MAX_OUTPUT_BYTES = 500 * 1024 * 1024;

export async function fetchOutputBytes(url: string, doFetch: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await doFetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`Couldn't download the converted video (${res.status}).`);
  const length = Number(res.headers.get("content-length") || 0);
  if (length > MAX_OUTPUT_BYTES) throw new Error("Converted video is larger than 500 MB.");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_OUTPUT_BYTES) throw new Error("Converted video is larger than 500 MB.");
  return new Uint8Array(buffer);
}

type MockJob = { request: SubmitRequest; providerJobId: string; output?: Uint8Array; fail?: boolean };
const mockJobs = new Map<string, MockJob>();
let mockCounter = 0;

export const mockProvider: ConversionProvider = {
  name: "mock",
  async submit(request) {
    mockCounter += 1;
    const providerJobId = `mock-${mockCounter}`;
    mockJobs.set(request.jobId, { request, providerJobId });
    return { providerJobId };
  },
  async downloadOutput(request) {
    const job = [...mockJobs.values()].find((item) => item.request.outputPath === request.outputPath)
      ?? [...mockJobs.values()].find((item) => item.request.jobId);
    if (!job?.output) {
      if (request.outputUrl === "mock://fail") throw new Error("mock output missing");
      throw new Error("mock output missing");
    }
    return job.output;
  },
};

export function resetMockProvider() {
  mockJobs.clear();
  mockCounter = 0;
}

export function setMockOutput(jobId: string, bytes: Uint8Array) {
  const job = mockJobs.get(jobId);
  if (!job) throw new Error("Unknown mock job");
  job.output = bytes;
}

export function getMockJob(jobId: string) {
  return mockJobs.get(jobId) ?? null;
}
