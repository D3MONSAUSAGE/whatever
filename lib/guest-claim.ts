/** Request body of POST /api/guest/claim. Client-safe (shared with the claim page and tests). */
import { isGuestId } from "@/lib/guest-draft";

export const GUEST_CLAIM_MAX_BYTES = 256 * 1024;

export type GuestClaimBody = { draftId: string; name: string; document: Record<string, unknown> };

export function guestClaimBody(raw: unknown): { ok: true; value: GuestClaimBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Missing menu." };
  const b = raw as Record<string, unknown>;
  const draftId = typeof b.draftId === "string" ? b.draftId : "";
  if (!/^[A-Za-z0-9-]{8,64}$/.test(draftId)) return { ok: false, error: "Missing menu." };
  if (!b.document || typeof b.document !== "object" || Array.isArray(b.document)) return { ok: false, error: "Missing menu." };
  const doc = b.document as Record<string, unknown>;
  if (JSON.stringify(doc).length > GUEST_CLAIM_MAX_BYTES) return { ok: false, error: "This menu is too large to save." };
  // Photos must have been uploaded to the account first; a guest id left in the menu means that didn't happen.
  if (JSON.stringify(doc).includes('"guest:')) return { ok: false, error: "Some photos haven't finished uploading. Try again." };
  const name = typeof b.name === "string" ? b.name.slice(0, 80) : "";
  return { ok: true, value: { draftId, name, document: doc } };
}

export { isGuestId };
