import { db } from "@/lib/server/supabase";
import type { HookDeps } from "./hook";

/** Live dependencies: accounts.locale through the service client, and the Resend HTTP API. */
export function liveHookDeps(env: Record<string, string | undefined> = process.env): HookDeps | null {
  const key = env.RESEND_API_KEY;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !supabaseUrl) return null;
  return {
    supabaseUrl,
    async readAccountLocale(userId) {
      const { data, error } = await db().from("accounts").select("locale").eq("owner_user_id", userId).maybeSingle();
      if (error) throw new Error("locale read failed");
      return (data as { locale?: unknown } | null)?.locale ?? null;
    },
    async send(msg) {
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "Idempotency-Key": msg.idempotencyKey },
          body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html }),
        });
        return { ok: r.ok, status: r.status };
      } catch {
        return { ok: false };
      }
    },
  };
}
