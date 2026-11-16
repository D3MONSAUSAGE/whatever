import { db } from "@/lib/server/supabase";

/**
 * The signed-in user id when the request comes from an allowlisted developer (public.developer_users),
 * else null. Creates no account itself and never says why access was refused. The route answers its 404
 * outside withLocalizedErrors, so a refused caller never reaches requireAdmin/ensure_account either.
 * DEV_ANALYTICS_DISABLED=1 turns the dashboard off for everyone.
 */
export async function developerFromRequest(req: Request, env: Record<string, string | undefined> = process.env): Promise<string | null> {
  if (env.DEV_ANALYTICS_DISABLED === "1") return null;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  try {
    const { data, error } = await db().auth.getUser(token);
    const userId = data?.user?.id;
    if (error || !userId) return null;
    const check = await db().rpc("is_developer", { p_user: userId });
    if (check.error || check.data !== true) return null;
    return userId;
  } catch {
    return null;
  }
}
