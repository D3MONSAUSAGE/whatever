/**
 * Vertical (9:16) menu boards: the shared orientation contract (t411u/t413u). Client-safe (no server imports).
 *
 * - A board's orientation lives in its content: `LayoutDocument.orientation` / `MenuContent.orientation`.
 *   Only "portrait" is ever stored; absent (every board made before this) means landscape, so existing boards and
 *   their renders are unchanged.
 * - A screen's orientation is `displays.orientation` ('landscape' default). It only drives warnings and setup
 *   guidance. It never rotates a TV and never changes what a screen plays.
 * - Clients that can edit portrait boards say so with the request header `X-Pekko-Client-Caps: orientation`
 *   (comma-separated capability list). Content saves to a portrait board from a client without it are refused
 *   with 409 `orientation_unsupported`, so an older app can never silently turn a vertical board horizontal.
 *   Rename and screen assignment never need the capability.
 */
export type BoardOrientation = "landscape" | "portrait";

export const BOARD_ORIENTATIONS: readonly BoardOrientation[] = ["landscape", "portrait"] as const;

export const LANDSCAPE_CANVAS = { width: 1920, height: 1080 } as const;
export const PORTRAIT_CANVAS = { width: 1080, height: 1920 } as const;

export const CLIENT_CAPS_HEADER = "x-pekko-client-caps";
export const ORIENTATION_CAP = "orientation";
export const ORIENTATION_UNSUPPORTED_CODE = "orientation_unsupported";
export const ORIENTATION_UNSUPPORTED_MESSAGE = "This menu board is vertical. Edit it at pekkotv.com, or update the app to change it here.";

export function isBoardOrientation(value: unknown): value is BoardOrientation {
  return value === "landscape" || value === "portrait";
}

/** Stored or sent value → orientation. Anything that isn't exactly "portrait" is landscape. */
export function orientationOf(value: { orientation?: unknown } | null | undefined): BoardOrientation {
  return value && value.orientation === "portrait" ? "portrait" : "landscape";
}

/** Raw content (any shape) → orientation, without parsing the rest. */
export function storedOrientation(content: unknown): BoardOrientation {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "landscape";
  return orientationOf(content as { orientation?: unknown });
}

export function boardCanvas(orientation: BoardOrientation | null | undefined): { width: number; height: number } {
  return orientation === "portrait" ? { ...PORTRAIT_CANVAS } : { ...LANDSCAPE_CANVAS };
}

/** Field to spread into a parsed document: only portrait is stored, so landscape documents keep their exact shape. */
export function orientationField(orientation: BoardOrientation): { orientation?: "portrait" } {
  return orientation === "portrait" ? { orientation: "portrait" } : {};
}

/** True when the request says the client can edit portrait boards. */
export function clientSupportsOrientation(req: Request | { headers: Headers }): boolean {
  const raw = req.headers.get(CLIENT_CAPS_HEADER) ?? "";
  return raw.split(",").some((cap) => cap.trim().toLowerCase() === ORIENTATION_CAP);
}

/**
 * The orientation a content save must store (contract: docs/vertical/API_CONTRACT.md):
 *  - new board: a capable client's choice, else landscape;
 *  - existing board, capable client: what it sent, or the stored value when it omitted the key;
 *  - existing board, older client: the stored value; on a portrait board the write is refused (409).
 */
export function resolveSavedOrientation(input: {
  incoming: unknown;
  /** Stored content of the board being written, or null for a new board. */
  stored: unknown | null;
  capable: boolean;
}): { ok: true; orientation: BoardOrientation } | { ok: false; blocked: true } {
  const raw = input.incoming && typeof input.incoming === "object" && !Array.isArray(input.incoming) ? (input.incoming as Record<string, unknown>) : {};
  // Unknown values count as omitted (never a 400).
  const sent = isBoardOrientation(raw.orientation) ? raw.orientation : null;
  // New boards: only a capable client can create a vertical one; everything else is landscape (catalog seeds are landscape).
  if (input.stored == null) return { ok: true, orientation: input.capable && sent ? sent : "landscape" };
  const storedValue = storedOrientation(input.stored);
  // Existing vertical board, client can't edit vertical boards: refuse the content write (rename/assign never get here).
  if (storedValue === "portrait" && !input.capable) return { ok: false, blocked: true };
  // Capable client: what it sent is a real change (an explicit "landscape" resets); omitted keeps the stored value.
  if (input.capable && sent) return { ok: true, orientation: sent };
  return { ok: true, orientation: storedValue };
}

/** Orientation of an image from its pixel size (null when unknown). Square counts as landscape. */
export function mediaOrientation(width: number | null | undefined, height: number | null | undefined): BoardOrientation | null {
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) return null;
  return height > width ? "portrait" : "landscape";
}

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return null;
  // IHDR is always the first chunk: length(4) "IHDR"(4) width(4) height(4).
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null;
  const read = (o: number) => ((bytes[o] << 24) >>> 0) + (bytes[o + 1] << 16) + (bytes[o + 2] << 8) + bytes[o + 3];
  const width = read(16);
  const height = read(20);
  return width > 0 && height > 0 ? { width, height } : null;
}
