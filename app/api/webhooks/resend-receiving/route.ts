import { json } from "@/lib/server/http";
import {
  handleReceivedEvent,
  parseReceivedEvent,
  resendInboundDeps,
  verifyRequestSignature,
  WEBHOOK_SECRET_ENV,
} from "@/lib/server/inbound-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resend email.received: verify signature, forward support@ mail to the monitored inbox. */
export async function POST(req: Request) {
  const secret = process.env[WEBHOOK_SECRET_ENV];
  if (!secret || !process.env.RESEND_API_KEY) return json({ error: "disabled" }, 503);
  const payload = await req.text();
  const verified = verifyRequestSignature(req, payload, secret);
  if (!verified.ok) return json({ error: "signature" }, 400);
  const event = parseReceivedEvent(payload);
  const deps = resendInboundDeps();
  if (!deps) return json({ error: "disabled" }, 503);
  const result = await handleReceivedEvent(event, deps);
  if (!result.ok) return json({ received: true, retry: true }, 500);
  return json({ received: true, action: result.action });
}
