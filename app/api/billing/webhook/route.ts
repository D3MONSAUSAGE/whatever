import { applyEvent, stripe, webhookEventAllowed, webhookSecret } from "@/lib/server/stripe";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook: signature verified with STRIPE_WEBHOOK_SECRET (Stripe also rejects
// timestamps older than 5 minutes), then de-duplicated through stripe_events.
export async function POST(req: Request) {
  const s = stripe();
  const secret = webhookSecret();
  if (!s || !secret) return json({ error: "disabled" }, 503);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "signature" }, 400);
  const raw = await req.text();
  let ev;
  try { ev = s.webhooks.constructEvent(raw, sig, secret); } catch { return json({ error: "signature" }, 400); }
  if (!webhookEventAllowed(ev.livemode)) return json({ error: ev.livemode ? "live events refused" : "test events refused" }, 400);
  try {
    const applied = await applyEvent(ev);
    return json({ received: true, duplicate: !applied });
  } catch {
    return json({ error: "retry" }, 500); // Stripe retries; the event stays unprocessed
  }
}
