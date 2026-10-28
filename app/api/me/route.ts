import { db } from "@/lib/server/supabase";
import { requireAdmin } from "@/lib/server/auth";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (admin instanceof Response) return admin;
  const { data } = await db().from("accounts").select("name").eq("id", admin.accountId).single();
  return json({ email: admin.email, accountName: data?.name ?? "" });
}
