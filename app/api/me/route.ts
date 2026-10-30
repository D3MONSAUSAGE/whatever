import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { fail, json, readJson } from "@/lib/server/http";
import { isMissingSchema } from "@/lib/server/schema";
import { stripControls } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { data } = await db().from("accounts").select("name").eq("id", admin.accountId).single();
  return json({ email: admin.email, accountName: data?.name ?? "" });
}

// Rename the business. Also marks the onboarding "business" step done (when 0005 is applied).
export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const body = await readJson(req);
  if (typeof body.accountName !== "string") return fail("Enter your business name.", 400);
  const name = stripControls(body.accountName).trim();
  if (!name) return fail("Enter your business name.", 400);
  if (name.length > 80) return fail("Keep the business name under 80 characters.", 400);
  const updated = await db().from("accounts").update({ name }).eq("id", admin.accountId);
  if (updated.error) return fail("Couldn't save the business name. Try again.", 500);
  const flag = await db().from("accounts").update({ business_confirmed_at: new Date().toISOString() }).eq("id", admin.accountId);
  if (flag.error && !isMissingSchema(flag.error)) return fail("Couldn't save the business name. Try again.", 500);
  return json({ email: admin.email, accountName: name });
}
