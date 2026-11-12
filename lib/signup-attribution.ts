/** First-touch signup attribution. Shared by the public-page capture and the server. */

export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "referrer",
] as const;

export type AttributionKey = (typeof ATTRIBUTION_KEYS)[number];
export type Attribution = Partial<Record<AttributionKey, string>>;

export const MAX_VALUE_LENGTH = 200;
export const MAX_STORED_CHARS = 1600;
export const STORAGE_KEY = "pekko_ft_attribution";
export const COOKIE_NAME = "pekko_ft";
export const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
/** Only stamp accounts created this recently, so a later ad click is not written to an old org. */
export const NEW_ACCOUNT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function stripControls(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code !== 127) out += value[i];
  }
  return out;
}

function sanitizeValue(raw: unknown, key: AttributionKey): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = stripControls(raw).trim().slice(0, MAX_VALUE_LENGTH);
  if (!value) return undefined;
  if (key === "referrer") {
    const lower = value.toLowerCase();
    if (!lower.startsWith("https://") && !lower.startsWith("http://")) return undefined;
  }
  return value;
}

/** Whitelist keys, max lengths, control characters stripped. Empty input becomes null. */
export function sanitizeAttribution(input: unknown): Attribution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const out: Attribution = {};
  for (const key of ATTRIBUTION_KEYS) {
    const value = sanitizeValue(record[key], key);
    if (value) out[key] = value;
  }
  if (Object.keys(out).length === 0) return null;
  const encoded = JSON.stringify(out);
  if (encoded.length > MAX_STORED_CHARS) return null;
  return out;
}

export type StoredAttribution = { values: Attribution; capturedAt: number };

export function parseStored(raw: string | null | undefined, now = Date.now()): Attribution | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { values?: unknown; capturedAt?: unknown };
    if (typeof data?.capturedAt !== "number") return null;
    if (now - data.capturedAt > MAX_AGE_SECONDS * 1000 || now < data.capturedAt) return null;
    return sanitizeAttribution(data.values);
  } catch {
    return null;
  }
}

export function serializeStored(values: Attribution, capturedAt = Date.now()): string {
  return JSON.stringify({ values, capturedAt } satisfies StoredAttribution);
}

/**
 * First-touch only: a later landing never overwrites a still-valid store.
 * Returns the values to persist, or null when there is nothing to save.
 */
export function captureFirstTouch(
  search: string,
  referrer: string,
  existing: Attribution | null,
): Attribution | null {
  if (existing) return existing;
  const query = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const raw: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) raw[key] = value;
  }
  if (referrer) raw.referrer = referrer;
  return sanitizeAttribution(raw);
}

/** True when this account is still in the window where first-touch may be written. */
export function isNewAccount(createdAt: string | null | undefined, now = Date.now()): boolean {
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  if (!Number.isFinite(at)) return false;
  return now - at >= 0 && now - at <= NEW_ACCOUNT_WINDOW_MS;
}
