/** MP4 container inspection. Works in the browser and on the server. No dependencies. */

export const MAX_VIDEO_EDGE = 1920;
export const MAX_VIDEO_DURATION_MS = 180_000;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const MAX_THUMB_BYTES = 200_000;

const MAX_MOOV_BYTES = 8 * 1024 * 1024;
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);

export type Mp4Info = {
  durationMs: number;
  width: number;
  height: number;
  videoCodec: "avc1" | "avc3";
  audioCodec: "mp4a" | null;
  profile: number;
  level: number;
};

export type Mp4Failure = "type" | "codec" | "profile" | "duration" | "dimensions" | "metadata" | "size";

export type Mp4Result = { ok: true } & Mp4Info | { ok: false; reason: Mp4Failure };

export type ByteSource = {
  size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
};

export function memorySource(bytes: Uint8Array): ByteSource {
  return {
    size: bytes.length,
    async read(offset, length) {
      const start = Math.max(0, Math.min(bytes.length, offset));
      const end = Math.max(start, Math.min(bytes.length, offset + length));
      return bytes.subarray(start, end);
    },
  };
}

export function mp4ErrorMessage(reason: Mp4Failure): string {
  if (reason === "size") return "Videos must be 50 MB or smaller.";
  if (reason === "duration") return "Videos must be 3 minutes or shorter.";
  if (reason === "dimensions") return "Videos must be 1920×1920 or smaller.";
  if (reason === "profile") {
    return "Use H.264 Baseline, Main, or High profile at level 4.2 or below. High 10, 4:2:2, and 4:4:4 are not supported.";
  }
  if (reason === "codec") {
    return "This video isn't H.264 with AAC audio (or no audio). HEVC, VP9, and AV1 can't play on these TVs.";
  }
  if (reason === "metadata") return "This MP4's metadata is too large to check. Re-export a smaller file.";
  return "That file isn't an H.264 MP4. Export it as MP4 with H.264 video and AAC audio, or with no audio.";
}

export async function inspectMp4(source: ByteSource): Promise<Mp4Result> {
  if (!source.size || source.size < 8) return { ok: false, reason: "type" };
  let offset = 0;
  let sawFtyp = false;
  let moov: { offset: number; size: number } | null = null;
  let guard = 0;
  while (offset + 8 <= source.size && guard < 64) {
    guard += 1;
    const header = await source.read(offset, 16);
    if (header.length < 8) return { ok: false, reason: "type" };
    const parsed = boxSize(header, 0, source.size - offset);
    if (!parsed) return { ok: false, reason: "type" };
    const type = fourcc(header, 4);
    if (type === "ftyp") sawFtyp = true;
    if (type === "moov") moov = { offset, size: parsed.size };
    if (sawFtyp && moov) break;
    offset += parsed.size;
  }
  if (!sawFtyp || !moov) return { ok: false, reason: "type" };
  if (moov.size > MAX_MOOV_BYTES || moov.size < 8) return { ok: false, reason: "metadata" };
  const raw = await source.read(moov.offset, moov.size);
  if (raw.length < Math.min(moov.size, 8)) return { ok: false, reason: "type" };
  return parseMoov(raw);
}

/** Reject anything the TV browsers in the plan can't be counted on to decode. */
export function enforceVideoLimits(info: Mp4Info, sizeBytes: number): Mp4Failure | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "type";
  if (sizeBytes > MAX_VIDEO_BYTES) return "size";
  if (info.durationMs < 500 || info.durationMs > MAX_VIDEO_DURATION_MS) return "duration";
  if (info.width > MAX_VIDEO_EDGE || info.height > MAX_VIDEO_EDGE || info.width < 2 || info.height < 2) {
    return "dimensions";
  }
  return null;
}

function parseMoov(moov: Uint8Array): Mp4Result {
  const durationMs = readMvhd(findBox(moov, "mvhd", 8, moov.length));
  if (durationMs == null) return { ok: false, reason: "metadata" };

  const tracks: Track[] = [];
  eachChild(moov, 8, moov.length, (type, start, size) => {
    if (type !== "trak") return;
    const trak = moov.subarray(start, start + size);
    const track = readTrak(trak);
    if (track) tracks.push(track);
  });

  const video = tracks.filter((track) => track.handler === "vide");
  const audio = tracks.filter((track) => track.handler === "soun");
  if (!video.length) return { ok: false, reason: "codec" };
  if (video.some((track) => track.codec !== "avc1" && track.codec !== "avc3")) return { ok: false, reason: "codec" };
  if (audio.some((track) => track.codec !== "mp4a")) return { ok: false, reason: "codec" };
  if (video.some((track) => !allowedProfile(track.profile, track.level))) return { ok: false, reason: "profile" };

  const primary = video[0];
  if (!primary.width || !primary.height) return { ok: false, reason: "dimensions" };
  return {
    ok: true,
    durationMs,
    width: primary.width,
    height: primary.height,
    videoCodec: primary.codec as "avc1" | "avc3",
    audioCodec: audio.length ? "mp4a" : null,
    profile: primary.profile,
    level: primary.level,
  };
}

type Track = {
  handler: string;
  codec: string;
  width: number;
  height: number;
  profile: number;
  level: number;
};

function readTrak(trak: Uint8Array): Track | null {
  const hdlr = findBox(trak, "hdlr", 8, trak.length);
  if (!hdlr || hdlr.length < 20) return null;
  const handler = fourcc(hdlr, 16);
  if (handler !== "vide" && handler !== "soun") return { handler, codec: "", width: 0, height: 0, profile: 0, level: 0 };

  const stsd = findBox(trak, "stsd", 8, trak.length);
  const sample = stsd ? firstSample(stsd) : null;
  const tkhd = findBox(trak, "tkhd", 8, trak.length);
  const visual = sample ? visualSize(sample) : null;
  const headerSize = tkhd ? tkhdSize(tkhd) : null;
  const codec = sample ? fourcc(sample, 4) : "";
  const avc = sample && (codec === "avc1" || codec === "avc3") ? findBox(sample, "avcC", 86, sample.length) : null;
  return {
    handler,
    codec,
    width: visual?.width || headerSize?.width || 0,
    height: visual?.height || headerSize?.height || 0,
    profile: avc && avc.length >= 12 ? avc[9] : 0,
    level: avc && avc.length >= 12 ? avc[11] : 0,
  };
}

function firstSample(stsd: Uint8Array): Uint8Array | null {
  if (stsd.length < 24) return null;
  const size = boxSize(stsd, 16, stsd.length - 16);
  if (!size) return null;
  return stsd.subarray(16, 16 + size.size);
}

function visualSize(sample: Uint8Array): { width: number; height: number } | null {
  const type = fourcc(sample, 4);
  if (type !== "avc1" && type !== "avc3") return null;
  if (sample.length < 36) return null;
  const width = u16(sample, 32);
  const height = u16(sample, 34);
  if (!width || !height) return null;
  return { width, height };
}

function tkhdSize(tkhd: Uint8Array): { width: number; height: number } | null {
  const version = tkhd[8];
  const widthAt = version === 1 ? 96 : 84;
  if (tkhd.length < widthAt + 8) return null;
  const width = u32(tkhd, widthAt) >>> 16;
  const height = u32(tkhd, widthAt + 4) >>> 16;
  if (!width || !height) return null;
  return { width, height };
}

function readMvhd(mvhd: Uint8Array | null): number | null {
  if (!mvhd || mvhd.length < 32) return null;
  const version = mvhd[8];
  const timescale = version === 1 ? u32(mvhd, 28) : u32(mvhd, 20);
  const duration = version === 1 ? u64(mvhd, 32) : u32(mvhd, 24);
  if (!timescale || !duration) return null;
  const ms = Math.round((duration / timescale) * 1000);
  return ms > 0 ? ms : null;
}

function allowedProfile(profile: number, level: number) {
  // Baseline 66, Main 77, High 100. Level 4.2 (42) covers 1080p60; High 10 and above do not.
  if (profile !== 66 && profile !== 77 && profile !== 100) return false;
  return level >= 10 && level <= 42;
}

function findBox(buf: Uint8Array, wanted: string, start: number, end: number): Uint8Array | null {
  const found = findBoxRange(buf, wanted, start, end);
  if (!found) return null;
  return buf.subarray(found.start, found.start + found.size);
}

function findBoxRange(buf: Uint8Array, wanted: string, start: number, end: number): { start: number; size: number } | null {
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard < 256) {
    guard += 1;
    const parsed = boxSize(buf, offset, end - offset);
    if (!parsed) return null;
    const type = fourcc(buf, offset + 4);
    if (type === wanted) return { start: offset, size: parsed.size };
    if (CONTAINERS.has(type)) {
      const inner = findBoxRange(buf, wanted, offset + parsed.header, offset + parsed.size);
      if (inner) return inner;
    }
    if (type === "stsd") {
      const inner = findBoxRange(buf, wanted, offset + 16, offset + parsed.size);
      if (inner) return inner;
    }
    offset += parsed.size;
  }
  return null;
}

function eachChild(buf: Uint8Array, start: number, end: number, visit: (type: string, start: number, size: number) => void) {
  let offset = start;
  let guard = 0;
  while (offset + 8 <= end && guard < 256) {
    guard += 1;
    const parsed = boxSize(buf, offset, end - offset);
    if (!parsed) return;
    visit(fourcc(buf, offset + 4), offset, parsed.size);
    offset += parsed.size;
  }
}

function boxSize(buf: Uint8Array, offset: number, room: number): { size: number; header: number } | null {
  if (room < 8 || offset + 8 > buf.length) return null;
  const size32 = u32(buf, offset);
  if (size32 === 1) {
    if (room < 16 || offset + 16 > buf.length) return null;
    const size = u64(buf, offset + 8);
    if (size < 16 || size > room) return null;
    return { size, header: 16 };
  }
  const size = size32 === 0 ? room : size32;
  if (size < 8 || size > room) return null;
  return { size, header: 8 };
}

function fourcc(buf: Uint8Array, offset: number) {
  return String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
}

function u16(buf: Uint8Array, offset: number) {
  return (buf[offset] << 8) | buf[offset + 1];
}

function u32(buf: Uint8Array, offset: number) {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function u64(buf: Uint8Array, offset: number) {
  return u32(buf, offset) * 0x100000000 + u32(buf, offset + 4);
}
