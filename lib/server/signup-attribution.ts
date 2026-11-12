import { db } from "./supabase";
import { isMissingSchema } from "./schema";
import { isNewAccount, sanitizeAttribution } from "@/lib/signup-attribution";

export type StampResult = "stamped" | "kept" | "empty" | "unavailable";

/**
 * First-touch write on a newly created account. Never overwrites, never
 * stamps an older org, and is a no-op when the additive columns are missing.
 */
export async function stampSignupAttribution(accountId: string, raw: unknown): Promise<StampResult> {
  const values = sanitizeAttribution(raw);
  if (!values) return "empty";

  const current = await db()
    .from("accounts")
    .select("signup_attribution, created_at")
    .eq("id", accountId)
    .maybeSingle();
  if (current.error) return isMissingSchema(current.error) ? "unavailable" : "empty";
  if (current.data?.signup_attribution) return "kept";
  if (!isNewAccount(current.data?.created_at as string | undefined)) return "kept";

  const at = new Date().toISOString();
  const updated = await db()
    .from("accounts")
    .update({ signup_attribution: values, signup_attribution_at: at })
    .eq("id", accountId)
    .is("signup_attribution", null);
  if (updated.error) return isMissingSchema(updated.error) ? "unavailable" : "empty";
  return "stamped";
}
