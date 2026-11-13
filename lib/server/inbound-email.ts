/**
 * Forward mail received at support@pekkotv.com to the monitored support inbox.
 * Uses the existing Resend send API. Does not change billing or alert sending.
 * Never log the webhook secret, API key, or message bodies.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SUPPORT_RECEIVE_ADDRESS = "support@pekkotv.com";
export const SUPPORT_FORWARD_TO = "vivalopez06-wh5rwz@mail.grokbot.com";
export const SUPPORT_FORWARD_FROM = "Pekko Support <support@pekkotv.com>";
export const FORWARD_HEADER = "X-Pekko-Support-Forward";
export const WEBHOOK_SECRET_ENV = "RESEND_INBOUND_WEBHOOK_SECRET";
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_BODY_CHARS = 100_000;

/** Addresses we never treat as an original customer sender (loop / self-mail). */
export const LOOP_ADDRESSES = [
  SUPPORT_RECEIVE_ADDRESS,
  SUPPORT_FORWARD_TO,
  "billing@pekkotv.com",
] as const;

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  reply_to?: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers?: Record<string, string>;
  message_id?: string | null;
};

export type ReceivedAttachment = {
  id: string;
  filename: string | null;
  content_type?: string | null;
  size?: number | null;
  download_url?: string | null;
};

export type ForwardAttachment = { filename: string; content: string; content_type?: string };

export type ForwardMessage = {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  text: string;
  headers: Record<string, string>;
  attachments: ForwardAttachment[];
  idempotencyKey: string;
};

export type InboundDeps = {
  getReceived: (id: string) => Promise<ReceivedEmail | null>;
  listAttachments: (id: string) => Promise<ReceivedAttachment[]>;
  downloadAttachment: (url: string) => Promise<{ content: Buffer; contentType: string } | null>;
  send: (msg: ForwardMessage) => Promise<{ ok: boolean; id?: string | null; error?: string }>;
  now?: () => number;
  log?: (line: string) => void;
};

export type InboundResult =
  | { ok: true; action: "ignored" | "skipped" | "forwarded"; reason: string; emailId?: string }
  | { ok: false; action: "error"; reason: string; emailId?: string };

export function parseMailbox(input: string): { local: string; domain: string; plus: string } | null {
  const m = input.match(/<([^>]+)>/);
  const raw = (m ? m[1] : input).trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at <= 0 || at === raw.length - 1) return null;
  const localFull = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const plus = localFull.split("+")[0] ?? localFull;
  if (!plus || !domain) return null;
  return { local: localFull, domain, plus };
}

export function sameMailbox(a: string, b: string): boolean {
  const aa = parseMailbox(a), bb = parseMailbox(b);
  return Boolean(aa && bb && aa.domain === bb.domain && aa.plus === bb.plus);
}

export function anyMailbox(list: string[] | undefined, target: string): boolean {
  return (list ?? []).some((item) => sameMailbox(item, target));
}

export function isLoopSender(from: string): boolean {
  return LOOP_ADDRESSES.some((addr) => sameMailbox(from, addr));
}

function header(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return "";
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want) return v;
  }
  return "";
}

export function isAutoreply(headers: Record<string, string> | undefined): boolean {
  const auto = header(headers, "auto-submitted").toLowerCase();
  if (auto && auto !== "no") return true;
  const prec = header(headers, "precedence").toLowerCase();
  if (prec === "auto" || prec === "junk" || prec === "bulk" || prec === "list") return true;
  if (header(headers, "x-auto-response-suppress")) return true;
  if (header(headers, "x-autoreply") || header(headers, "x-autorespond")) return true;
  return false;
}

export function alreadyForwarded(headers: Record<string, string> | undefined): boolean {
  return Boolean(header(headers, FORWARD_HEADER));
}

/** Svix/Resend webhook signature. `secret` is the whsec_ value; never log it. */
export function verifyResendSignature(input: {
  payload: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const id = input.id?.trim() ?? "";
  const ts = input.timestamp?.trim() ?? "";
  const sigHeader = input.signature?.trim() ?? "";
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing" };
  if (!/^\d+$/.test(ts)) return { ok: false, reason: "timestamp" };
  const tsNum = Number(ts);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const tol = input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  if (Math.abs(now - tsNum) > tol) return { ok: false, reason: "timestamp" };
  const rawSecret = input.secret.startsWith("whsec_") ? input.secret.slice(6) : input.secret;
  let key: Buffer;
  try { key = Buffer.from(rawSecret, "base64"); } catch { return { ok: false, reason: "secret" }; }
  if (!key.length) return { ok: false, reason: "secret" };
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${input.payload}`).digest("base64");
  const expectedBuf = Buffer.from(expected);
  let match = false;
  for (const part of sigHeader.split(/\s+/)) {
    const comma = part.indexOf(",");
    const ver = comma === -1 ? "" : part.slice(0, comma);
    const sig = comma === -1 ? part : part.slice(comma + 1);
    if (ver && ver !== "v1") continue;
    const got = Buffer.from(sig);
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) match = true;
  }
  return match ? { ok: true } : { ok: false, reason: "signature" };
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(text: string, max = MAX_BODY_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}

export function buildForwardText(email: ReceivedEmail, omitted: string[]): string {
  const raw = (email.text && email.text.trim()) || (email.html ? htmlToText(email.html) : "");
  const { text: body, truncated } = clip(raw);
  const lines = [
    "This message was received at support@pekkotv.com and forwarded to the monitored support inbox.",
    "",
    `From: ${email.from}`,
    `To: ${(email.to ?? []).join(", ")}`,
  ];
  if (email.cc?.length) lines.push(`Cc: ${email.cc.join(", ")}`);
  lines.push(`Subject: ${email.subject ?? ""}`, "", "-----", "", body || "(no text body)");
  if (truncated) lines.push("", "[Message body truncated.]");
  if (omitted.length) lines.push("", `[${omitted.length} attachment(s) omitted: ${omitted.join(", ")}]`);
  return lines.join("\n");
}

export function shouldForward(email: ReceivedEmail): { forward: true } | { forward: false; reason: string } {
  const recipients = [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])];
  if (!anyMailbox(recipients, SUPPORT_RECEIVE_ADDRESS)) return { forward: false, reason: "recipient" };
  if (isLoopSender(email.from)) return { forward: false, reason: "loop" };
  if ((email.reply_to ?? []).some(isLoopSender)) return { forward: false, reason: "loop" };
  if (alreadyForwarded(email.headers)) return { forward: false, reason: "loop" };
  if (isAutoreply(email.headers)) return { forward: false, reason: "autoreply" };
  return { forward: true };
}

function replyTo(email: ReceivedEmail): string {
  const first = (email.reply_to ?? []).map((s) => s.trim()).find(Boolean);
  if (first && !isLoopSender(first)) return first;
  return email.from;
}

export async function handleReceivedEvent(
  event: { type?: string; data?: { email_id?: string } },
  deps: InboundDeps,
): Promise<InboundResult> {
  const log = deps.log ?? ((line: string) => console.info(line));
  if (event.type !== "email.received") {
    log("support-forward ignored: not email.received");
    return { ok: true, action: "ignored", reason: "type" };
  }
  const emailId = event.data?.email_id;
  if (!emailId) {
    log("support-forward error: missing email_id");
    return { ok: false, action: "error", reason: "missing-id" };
  }
  const email = await deps.getReceived(emailId);
  if (!email) {
    log(`support-forward error email_id=${emailId} reason=fetch`);
    return { ok: false, action: "error", reason: "fetch", emailId };
  }
  const decision = shouldForward(email);
  if (!decision.forward) {
    log(`support-forward skipped email_id=${emailId} reason=${decision.reason}`);
    return { ok: true, action: "skipped", reason: decision.reason, emailId };
  }

  const listed = await deps.listAttachments(emailId).catch(() => [] as ReceivedAttachment[]);
  const attachments: ForwardAttachment[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const att of listed) {
    const name = att.filename || att.id || "attachment";
    const size = att.size ?? 0;
    if (!att.download_url || (size && used + size > MAX_ATTACHMENT_BYTES) || used >= MAX_ATTACHMENT_BYTES) {
      omitted.push(name);
      continue;
    }
    const file = await deps.downloadAttachment(att.download_url).catch(() => null);
    if (!file) { omitted.push(name); continue; }
    if (used + file.content.length > MAX_ATTACHMENT_BYTES) { omitted.push(name); continue; }
    used += file.content.length;
    attachments.push({
      filename: name,
      content: file.content.toString("base64"),
      content_type: file.contentType || att.content_type || undefined,
    });
  }

  const subject = email.subject?.trim() || "(no subject)";
  const msg: ForwardMessage = {
    from: SUPPORT_FORWARD_FROM,
    to: SUPPORT_FORWARD_TO,
    reply_to: replyTo(email),
    subject: `[support@pekkotv.com] ${subject}`,
    text: buildForwardText(email, omitted),
    headers: { [FORWARD_HEADER]: "1" },
    attachments,
    idempotencyKey: `support-forward/${emailId}`,
  };
  const sent = await deps.send(msg);
  if (!sent.ok) {
    log(`support-forward error email_id=${emailId} reason=send`);
    return { ok: false, action: "error", reason: "send", emailId };
  }
  log(`support-forward forwarded email_id=${emailId}`);
  return { ok: true, action: "forwarded", reason: "sent", emailId };
}

function svixHeader(req: Request, name: string): string | null {
  return req.headers.get(`svix-${name}`) ?? req.headers.get(`webhook-${name}`);
}

export function verifyRequestSignature(req: Request, payload: string, secret: string, now?: number) {
  return verifyResendSignature({
    payload,
    id: svixHeader(req, "id"),
    timestamp: svixHeader(req, "timestamp"),
    signature: svixHeader(req, "signature"),
    secret,
    now,
  });
}

export function parseReceivedEvent(payload: string): { type?: string; data?: { email_id?: string } } {
  try {
    const v = JSON.parse(payload) as { type?: unknown; data?: { email_id?: unknown } };
    const type = typeof v?.type === "string" ? v.type : undefined;
    const email_id = typeof v?.data?.email_id === "string" ? v.data.email_id : undefined;
    return { type, data: { email_id } };
  } catch {
    return {};
  }
}

/** Live Resend HTTP client. Errors are returned, never thrown with bodies. */
export function resendInboundDeps(env: Record<string, string | undefined> = process.env): InboundDeps | null {
  const key = env.RESEND_API_KEY;
  if (!key) return null;
  const auth = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
  return {
    async getReceived(id) {
      const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, { headers: auth });
      if (!r.ok) return null;
      const body = await r.json() as ReceivedEmail;
      if (!body || typeof body.id !== "string" || typeof body.from !== "string") return null;
      return {
        id: body.id,
        from: body.from,
        to: Array.isArray(body.to) ? body.to.map(String) : [],
        cc: Array.isArray(body.cc) ? body.cc.map(String) : [],
        bcc: Array.isArray(body.bcc) ? body.bcc.map(String) : [],
        reply_to: Array.isArray(body.reply_to) ? body.reply_to.map(String) : [],
        subject: body.subject ?? null,
        text: body.text ?? null,
        html: body.html ?? null,
        headers: body.headers && typeof body.headers === "object" ? body.headers as Record<string, string> : {},
        message_id: body.message_id ?? null,
      };
    },
    async listAttachments(id) {
      const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}/attachments`, { headers: auth });
      if (!r.ok) return [];
      const body = await r.json() as { data?: ReceivedAttachment[] };
      return Array.isArray(body?.data) ? body.data : [];
    },
    async downloadAttachment(url) {
      const r = await fetch(url);
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      return { content: buf, contentType: r.headers.get("content-type") || "application/octet-stream" };
    },
    async send(msg) {
      try {
        const payload: Record<string, unknown> = {
          from: msg.from,
          to: [msg.to],
          reply_to: msg.reply_to,
          subject: msg.subject,
          text: msg.text,
          headers: msg.headers,
        };
        if (msg.attachments.length) payload.attachments = msg.attachments;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { ...auth, "Idempotency-Key": msg.idempotencyKey },
          body: JSON.stringify(payload),
        });
        const body = await r.json().catch(() => null) as { id?: unknown } | null;
        const id = body && typeof body.id === "string" ? body.id : null;
        return r.ok ? { ok: true, id } : { ok: false, error: `resend ${r.status}` };
      } catch {
        return { ok: false, error: "resend unreachable" };
      }
    },
  };
}
