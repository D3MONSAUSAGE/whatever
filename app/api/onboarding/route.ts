import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { rejectSubscriptionWrite } from "@/lib/server/subscription-write";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { markMilestones, onboardingState, onboardingStateV2 } from "@/lib/server/onboarding";
import { onboardingSource } from "@/lib/server/onboarding-hooks";
import { isRecordableStep } from "@/lib/onboarding";
import { maybeSendWelcome } from "@/lib/server/welcome-email";
import { after } from "next/server";
import { withLocalizedErrors } from "@/lib/server/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** `?v=2` is the menu-first checklist. Without it the response is the original eight steps (Android +17..+31). */
const wantsV2 = (req: Request) => new URL(req.url).searchParams.get("v") === "2";

async function stateFor(req: Request, accountId: string, email: string) {
  const source = onboardingSource(req);
  return wantsV2(req) ? onboardingStateV2(accountId, email, source) : onboardingState(accountId, email, source);
}

// Shared setup progress for the website and the mobile app. Derived from real data.
export const GET = withLocalizedErrors(async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const state = await stateFor(req, admin.accountId, admin.email);
  if (state === "error") return fail("Couldn't load your setup progress.", 500);
  // E4: one-time welcome email for new owners (off unless WELCOME_EMAIL=on). Runs after the response.
  const welcome = () => maybeSendWelcome(admin).then(() => undefined);
  try { after(welcome); } catch { void welcome(); }
  return json(state);
});

// { dismissed: boolean } hides or shows the tracker; { confirmBusiness: true } completes the business step.
// v2 additions: { dismissFirstSuccess: true } hides "Your first menu is ready!" on every device;
// { recordStep: "preview_menu" | "customize_menu" | "playlists" | "schedules" } records a step the client saw.
export const POST = withLocalizedErrors(async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const writeBlocked = await rejectSubscriptionWrite(admin.accountId, req);
  if (writeBlocked) return writeBlocked;
  const body = await readJson(req);
  const patch: { onboarding_dismissed_at?: string | null; business_confirmed_at?: string } = {};
  if ("dismissed" in body) {
    if (typeof body.dismissed !== "boolean") return fail("dismissed must be true or false.", 400);
    patch.onboarding_dismissed_at = body.dismissed ? new Date().toISOString() : null;
  }
  if ("confirmBusiness" in body) {
    if (body.confirmBusiness !== true) return fail("confirmBusiness must be true.", 400);
    patch.business_confirmed_at = new Date().toISOString();
  }
  const celebrate = "dismissFirstSuccess" in body;
  if (celebrate && body.dismissFirstSuccess !== true) return fail("dismissFirstSuccess must be true.", 400);
  const record = "recordStep" in body;
  if (record && !isRecordableStep(body.recordStep)) {
    return fail("recordStep must be preview_menu, customize_menu, playlists or schedules.", 400);
  }
  if (!Object.keys(patch).length && !celebrate && !record) return fail("Nothing to update.", 400);

  const unavailable = () => fail("Setup progress isn't available yet.", 503);
  if (Object.keys(patch).length) {
    const r = await db().from("accounts").update(patch).eq("id", admin.accountId);
    if (r.error) return isMissingSchema(r.error) ? unavailable() : fail("Couldn't save. Try again.", 500);
  }
  if (celebrate) {
    // Only the first dismissal is kept, so a second device doesn't move the time.
    const r = await db().from("accounts").update({ first_menu_celebrated_at: new Date().toISOString() })
      .eq("id", admin.accountId).is("first_menu_celebrated_at", null);
    if (r.error) return isMissingSchema(r.error) ? unavailable() : fail("Couldn't save. Try again.", 500);
  }
  if (record && isRecordableStep(body.recordStep)) {
    const marked = await markMilestones(admin.accountId, [body.recordStep], onboardingSource(req)).catch(() => null);
    if (!marked) return unavailable();
  }
  const state = await stateFor(req, admin.accountId, admin.email);
  if (state === "error") return fail("Couldn't load your setup progress.", 500);
  return json(state);
});
