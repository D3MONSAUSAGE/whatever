import { db } from "./supabase";
import { fail } from "./http";
import { stripControls } from "./validate";

export type Admin = { userId: string; email: string; accountId: string };

/** Verifies the Supabase access token and resolves (or creates) the admin's account. */
export async function requireAdmin(req: Request): Promise<Admin | Response> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return fail("Sign in to continue.", 401);

  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return fail("Sign in to continue.", 401);

  const email = data.user.email ?? "";
  const name = stripControls(email.split("@")[0] || "My business").trim().slice(0, 80) || "My business";
  const { data: accountId, error: accErr } = await db().rpc("ensure_account", {
    p_user_id: data.user.id,
    p_name: name,
  });
  if (accErr || !accountId) return fail("Couldn't load your account. Try again.", 500);

  return { userId: data.user.id, email, accountId: accountId as string };
}
