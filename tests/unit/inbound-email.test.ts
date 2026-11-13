import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_ATTACHMENT_BYTES,
  SUPPORT_FORWARD_FROM,
  SUPPORT_FORWARD_TO,
  SUPPORT_RECEIVE_ADDRESS,
  alreadyForwarded,
  buildForwardText,
  handleReceivedEvent,
  htmlToText,
  isAutoreply,
  isLoopSender,
  parseReceivedEvent,
  sameMailbox,
  shouldForward,
  verifyResendSignature,
  type ForwardMessage,
  type InboundDeps,
  type ReceivedEmail,
} from "@/lib/server/inbound-email";

function sign(payload: string, secret: string, id = "msg_1", ts = "1000000000") {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const sig = createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  return { id, ts, signature: `v1,${sig}` };
}

const secret = `whsec_${Buffer.from("test-webhook-secret-bytes!!").toString("base64")}`;

function email(over: Partial<ReceivedEmail> = {}): ReceivedEmail {
  return {
    id: "em_1",
    from: "customer@example.com",
    to: [SUPPORT_RECEIVE_ADDRESS],
    subject: "Help with a screen",
    text: "The TV is stuck.",
    html: null,
    headers: {},
    ...over,
  };
}

function deps(over: Partial<InboundDeps> & { sent?: ForwardMessage[] } = {}): InboundDeps & { sent: ForwardMessage[]; logs: string[] } {
  const sent: ForwardMessage[] = over.sent ?? [];
  const logs: string[] = [];
  const received = email();
  return {
    sent,
    logs,
    getReceived: over.getReceived ?? (async () => received),
    listAttachments: over.listAttachments ?? (async () => []),
    downloadAttachment: over.downloadAttachment ?? (async () => null),
    send: over.send ?? (async (msg) => { sent.push(msg); return { ok: true, id: "out_1" }; }),
    log: (line) => logs.push(line),
  };
}

describe("verifyResendSignature", () => {
  it("accepts a valid v1 signature within the tolerance window", () => {
    const payload = '{"type":"email.received"}';
    const { id, ts, signature } = sign(payload, secret);
    expect(verifyResendSignature({ payload, id, timestamp: ts, signature, secret, now: 1000000000 })).toEqual({ ok: true });
  });

  it("rejects a wrong signature, a stale timestamp, and missing headers", () => {
    const payload = '{"type":"email.received"}';
    const { id, ts, signature } = sign(payload, secret);
    expect(verifyResendSignature({ payload, id, timestamp: ts, signature: "v1,aaaa", secret, now: 1000000000 })).toMatchObject({ ok: false });
    expect(verifyResendSignature({ payload, id, timestamp: ts, signature, secret, now: 1000000000 + 400 })).toMatchObject({ ok: false, reason: "timestamp" });
    expect(verifyResendSignature({ payload, id: "", timestamp: ts, signature, secret })).toMatchObject({ ok: false, reason: "missing" });
    expect(verifyResendSignature({ payload: payload + "x", id, timestamp: ts, signature, secret, now: 1000000000 })).toMatchObject({ ok: false });
  });

  it("accepts a matching v1 signature among several listed values", () => {
    const payload = "{}";
    const { id, ts, signature } = sign(payload, secret);
    const multi = `v1,xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx= ${signature}`;
    expect(verifyResendSignature({ payload, id, timestamp: ts, signature: multi, secret, now: 1000000000 }).ok).toBe(true);
  });
});

describe("recipient and loop guards", () => {
  it("treats plus-tags and display names as the same mailbox", () => {
    expect(sameMailbox("Pekko Support <support@pekkotv.com>", "support+ticket@pekkotv.com")).toBe(true);
    expect(sameMailbox("a@x.com", "b@x.com")).toBe(false);
    expect(isLoopSender("vivalopez06-wh5rwz+tag@mail.grokbot.com")).toBe(true);
    expect(isLoopSender("Pekko <billing@pekkotv.com>")).toBe(true);
    expect(isLoopSender("customer@example.com")).toBe(false);
  });

  it("forwards only mail addressed to support@, and skips loops and autoreplies", () => {
    expect(shouldForward(email())).toEqual({ forward: true });
    expect(shouldForward(email({ to: ["billing@pekkotv.com"] }))).toMatchObject({ forward: false, reason: "recipient" });
    expect(shouldForward(email({ from: "support@pekkotv.com" }))).toMatchObject({ forward: false, reason: "loop" });
    expect(shouldForward(email({ from: SUPPORT_FORWARD_TO }))).toMatchObject({ forward: false, reason: "loop" });
    expect(shouldForward(email({ headers: { "X-Pekko-Support-Forward": "1" } }))).toMatchObject({ forward: false, reason: "loop" });
    expect(shouldForward(email({ headers: { "Auto-Submitted": "auto-replied" } }))).toMatchObject({ forward: false, reason: "autoreply" });
    expect(shouldForward(email({ to: ["other@pekkotv.com"], cc: ["support@pekkotv.com"] }))).toEqual({ forward: true });
    expect(alreadyForwarded({ "x-pekko-support-forward": "1" })).toBe(true);
    expect(isAutoreply({ Precedence: "bulk" })).toBe(true);
    expect(isAutoreply({ "Auto-Submitted": "no" })).toBe(false);
  });
});

describe("handleReceivedEvent", () => {
  it("ignores events that are not email.received", async () => {
    const d = deps();
    const r = await handleReceivedEvent({ type: "email.delivered", data: { email_id: "em_1" } }, d);
    expect(r).toMatchObject({ ok: true, action: "ignored" });
    expect(d.sent).toHaveLength(0);
  });

  it("forwards a support@ message once, with reply-to, loop header, and no body in logs", async () => {
    const d = deps();
    const r = await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, d);
    expect(r).toMatchObject({ ok: true, action: "forwarded" });
    expect(d.sent).toHaveLength(1);
    const msg = d.sent[0];
    expect(msg.to).toBe(SUPPORT_FORWARD_TO);
    expect(msg.from).toBe(SUPPORT_FORWARD_FROM);
    expect(msg.reply_to).toBe("customer@example.com");
    expect(msg.subject).toBe("[support@pekkotv.com] Help with a screen");
    expect(msg.subject).toContain("Help with a screen");
    expect(msg.headers["X-Pekko-Support-Forward"]).toBe("1");
    expect(msg.idempotencyKey).toBe("support-forward/em_1");
    expect(msg.text).toContain("From: customer@example.com");
    expect(msg.text).toContain("The TV is stuck.");
    expect(d.logs.join("\n")).toContain("support-forward forwarded email_id=em_1");
    expect(d.logs.join("\n")).not.toContain("The TV is stuck.");
    expect(d.logs.join("\n")).not.toContain("Help with a screen");
  });

  it("uses the original reply-to when it is not a loop address", async () => {
    const d = deps({
      getReceived: async () => email({ reply_to: ["Owner <owner@shop.com>"] }),
    });
    await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, d);
    expect(d.sent[0].reply_to).toBe("Owner <owner@shop.com>");
  });

  it("does not send when the message is a loop or the wrong recipient", async () => {
    const loop = deps({ getReceived: async () => email({ from: SUPPORT_FORWARD_TO }) });
    expect(await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, loop)).toMatchObject({
      ok: true, action: "skipped", reason: "loop",
    });
    expect(loop.sent).toHaveLength(0);

    const other = deps({ getReceived: async () => email({ to: ["billing@pekkotv.com"] }) });
    expect(await handleReceivedEvent({ type: "email.received", data: { email_id: "em_2" } }, other)).toMatchObject({
      ok: true, action: "skipped", reason: "recipient",
    });
    expect(other.sent).toHaveLength(0);
  });

  it("returns an error so Resend can retry when fetch or send fails", async () => {
    const missing = deps({ getReceived: async () => null });
    expect(await handleReceivedEvent({ type: "email.received", data: { email_id: "em_x" } }, missing)).toMatchObject({
      ok: false, action: "error", reason: "fetch",
    });
    const fail = deps({ send: async () => ({ ok: false, error: "resend 500" }) });
    expect(await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, fail)).toMatchObject({
      ok: false, action: "error", reason: "send",
    });
  });

  it("attaches files under the size cap and names ones that were omitted", async () => {
    const small = Buffer.from("hello");
    const huge = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1, 1);
    const d = deps({
      listAttachments: async () => [
        { id: "a1", filename: "note.txt", content_type: "text/plain", size: 5, download_url: "https://example.com/a1" },
        { id: "a2", filename: "big.bin", content_type: "application/octet-stream", size: huge.length, download_url: "https://example.com/a2" },
      ],
      downloadAttachment: async (url) =>
        url.endsWith("a1")
          ? { content: small, contentType: "text/plain" }
          : { content: huge, contentType: "application/octet-stream" },
    });
    await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, d);
    expect(d.sent[0].attachments).toEqual([
      { filename: "note.txt", content: small.toString("base64"), content_type: "text/plain" },
    ]);
    expect(d.sent[0].text).toContain("1 attachment(s) omitted: big.bin");
  });

  it("keeps the internal-test subject phrase so a routine can ignore it", async () => {
    const subject = "[Pekko internal test] support@ receiving check";
    const d = deps({ getReceived: async () => email({ subject }) });
    await handleReceivedEvent({ type: "email.received", data: { email_id: "em_1" } }, d);
    expect(d.sent[0].subject).toContain(subject);
  });
});

describe("helpers", () => {
  it("turns simple HTML into text and builds a forwarded body", () => {
    expect(htmlToText("<p>Hi<br>there</p><script>alert(1)</script>")).toBe("Hi\nthere");
    const text = buildForwardText(email({ cc: ["cc@x.com"], html: "<p>Only html</p>", text: null }), ["photo.jpg"]);
    expect(text).toContain("From: customer@example.com");
    expect(text).toContain("Cc: cc@x.com");
    expect(text).toContain("Only html");
    expect(text).toContain("1 attachment(s) omitted: photo.jpg");
    expect(text).not.toContain("<p>");
  });

  it("parses a webhook payload without exposing unknown fields", () => {
    expect(parseReceivedEvent('{"type":"email.received","data":{"email_id":"em_9","body":"secret"}}')).toEqual({
      type: "email.received",
      data: { email_id: "em_9" },
    });
    expect(parseReceivedEvent("not-json")).toEqual({});
  });
});
