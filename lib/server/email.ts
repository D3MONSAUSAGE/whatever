/**
 * Pluggable email. Inactive unless a provider is configured by env:
 *   EMAIL_PROVIDER=resend, RESEND_API_KEY=..., ALERT_EMAIL_FROM="Pekko <alerts@yourdomain>"
 * Nothing here signs up for or pays for anything.
 */
export type EmailMessage = { to: string; subject: string; text: string };
export type EmailProvider = { name: string; send(msg: EmailMessage): Promise<{ ok: boolean; error?: string }> };

export function emailProvider(env: Record<string, string | undefined> = process.env): EmailProvider | null {
  const kind = (env.EMAIL_PROVIDER || "").toLowerCase();
  const from = env.ALERT_EMAIL_FROM || "";
  if (kind === "resend" && env.RESEND_API_KEY && from) {
    const key = env.RESEND_API_KEY;
    return {
      name: "resend",
      async send(msg) {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text }),
          });
          return r.ok ? { ok: true } : { ok: false, error: `resend ${r.status}` };
        } catch {
          return { ok: false, error: "resend unreachable" };
        }
      },
    };
  }
  return null;
}
