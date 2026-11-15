import { HOOK_SECRET_ENV, MAX_PAYLOAD_BYTES, handleSendEmailHook, parseHookPayload, verifyHookSignature } from "@/lib/server/auth-email/hook";
import { liveHookDeps } from "@/lib/server/auth-email/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Supabase needs application/json on every response, errors included. */
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const error = (status: number, message: string) => reply(status, { error: { http_code: status, message } });

/** I18N-5 Supabase Auth Send Email Hook. Inert until the hook is enabled in the Supabase dashboard. */
export async function POST(req: Request) {
  const secret = process.env[HOOK_SECRET_ENV];
  if (!secret) return error(500, "Pekko's email hook isn't configured. Nothing was sent.");
  const payload = await req.text();
  if (payload.length > MAX_PAYLOAD_BYTES) return error(400, "Payload too large.");
  const verified = verifyHookSignature(req, payload, secret);
  if (!verified.ok) return error(401, "Invalid signature.");
  const parsed = parseHookPayload(payload);
  if (!parsed) return error(400, "Malformed payload. Nothing was sent.");
  const deps = liveHookDeps();
  if (!deps) return error(500, "Email sending isn't configured. Nothing was sent.");
  const result = await handleSendEmailHook(parsed, req.headers.get("webhook-id") ?? "", deps);
  return reply(result.status, result.body);
}
