import { enforceLimit, fail, json, readJson } from "@/lib/server/http";
import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { layoutStudioEnabled } from "@/lib/layout-studio";
import { saveLayoutForAccount } from "@/lib/server/layout-boards";
import { withLocalizedErrors } from "@/lib/server/locale";
import { noteMenuSaved } from "@/lib/server/onboarding-hooks";
import { guestEditorEnabled } from "@/lib/guest-editor-flag";
import { db } from "@/lib/server/supabase";
import { isMissingSchema } from "@/lib/server/schema";
import { GUEST_CLAIM_MAX_BYTES, guestClaimBody } from "@/lib/guest-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_S = 15 * 60;
const MAX_PER_USER = 20;

/**
 * Saves a menu built before sign-up (docs/GUEST_EDITOR_PLAN.md §3.5) into the signed-in account as a DRAFT board.
 * Same checks as any save: signed in, plan allows edits, layout valid, every photo id owned by this account (the
 * browser uploads the guest photos through POST /api/media first). Idempotent per (account, draftId): a retry, a
 * reload or a second tab gets the same board back. Nothing is published and no screen changes.
 */
export const POST = withLocalizedErrors(async function POST(req: Request) {
  if (!guestEditorEnabled() || !layoutStudioEnabled()) return fail("Not found", 404);
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const limited = await enforceLimit(`guest-claim:${admin.userId}`, WINDOW_S, MAX_PER_USER, "Too many attempts. Wait 15 minutes, then try again.");
  if (limited) return limited;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;

  if (Number(req.headers.get("content-length") ?? 0) > GUEST_CLAIM_MAX_BYTES) return fail("This menu is too large to save.", 413);
  const body = guestClaimBody(await readJson(req));
  if (!body.ok) return fail(body.error, 400);
  const { draftId, name, document } = body.value;

  // Reserve the draft id first, so two tabs can't both create a board.
  const claims = db().from("guest_claims");
  const reserved = await claims.insert({ account_id: admin.accountId, draft_id: draftId });
  if (reserved.error) {
    if (isMissingSchema(reserved.error)) return fail("Not found", 404);
    if (reserved.error.code !== "23505") return fail("Couldn't save your menu. Try again.", 500);
    const existing = await claims.select("menu_id").eq("account_id", admin.accountId).eq("draft_id", draftId).maybeSingle();
    if (existing.error) return fail("Couldn't save your menu. Try again.", 500);
    const menuId = existing.data?.menu_id ? String(existing.data.menu_id) : null;
    // Another request is saving this draft right now: the browser retries in a moment.
    if (!menuId) return json({ pending: true }, 409);
    return json({ menuId, existing: true });
  }

  try {
    const saved = await saveLayoutForAccount(admin.accountId, { menuId: null, name, mode: "draft", document, orientationCapable: true });
    if ("error" in saved && saved.status !== 200) {
      await claims.delete().eq("account_id", admin.accountId).eq("draft_id", draftId);
      return fail(saved.error, saved.status, "code" in saved ? saved.code : undefined);
    }
    const menuId = String(saved.menuId);
    await claims.update({ menu_id: menuId }).eq("account_id", admin.accountId).eq("draft_id", draftId);
    noteMenuSaved(req, admin.accountId, document);
    return json({ menuId, existing: false });
  } catch (err) {
    await claims.delete().eq("account_id", admin.accountId).eq("draft_id", draftId);
    console.error("guest claim failed", err instanceof Error ? err.message : "unknown");
    return fail("Couldn't save your menu. Try again.", 500);
  }
});
