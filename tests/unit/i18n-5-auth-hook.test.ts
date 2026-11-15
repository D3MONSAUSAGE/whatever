import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import { handleSendEmailHook, hookLocale, normalizeHookSecret, parseHookPayload, planEmails, verifyHookSignature, type HookDeps, type HookPayload } from "@/lib/server/auth-email/hook";
import { AUTH_EMAIL_FROM, AUTH_EMAIL_TYPES, escapeHrefUrl, hrefFor, renderAuthEmail, supabaseConfirmationUrl } from "@/lib/server/auth-email/templates";

const fx = JSON.parse(readFileSync("tests/fixtures/auth-email-current.json", "utf8"));
const H: string = fx.tokenHash;
const SB: string = fx.supabaseUrl;
const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese|tuvo contacto/i;

// ---------- signature ----------
const rawKey = randomBytes(32);
const secret = `v1,whsec_${rawKey.toString("base64")}`;
function signed(body: string, opts: { key?: Buffer; ts?: number; id?: string } = {}) {
  const id = opts.id ?? "msg_test_1";
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", opts.key ?? rawKey).update(`${id}.${ts}.${body}`).digest("base64");
  return new Request("https://pekkotv.com/api/webhooks/supabase-send-email", { method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}`, "content-type": "application/json" } });
}

describe("I18N-5 hook signature (Standard Webhooks)", () => {
  const body = JSON.stringify({ user: { id: "u1", email: "a@example.com" }, email_data: { email_action_type: "recovery", token_hash: H } });
  it("accepts a valid signature made with the dashboard secret format v1,whsec_…", () => {
    expect(verifyHookSignature(signed(body), body, secret)).toEqual({ ok: true });
    expect(normalizeHookSecret(secret)).toBe(`whsec_${rawKey.toString("base64")}`);
  });
  it("rejects a wrong key, a changed body, missing headers and an old timestamp", () => {
    expect(verifyHookSignature(signed(body, { key: randomBytes(32) }), body, secret).ok).toBe(false);
    expect(verifyHookSignature(signed(body), body.replace("recovery", "signup"), secret).ok).toBe(false);
    expect(verifyHookSignature(new Request("https://x/", { method: "POST", body }), body, secret).ok).toBe(false);
    expect(verifyHookSignature(signed(body, { ts: Math.floor(Date.now() / 1000) - 3600 }), body, secret).ok).toBe(false);
  });
  it("ignores svix-* headers (only webhook-* count)", () => {
    const r = signed(body);
    const svix = new Request("https://x/", { method: "POST", body, headers: { "svix-id": r.headers.get("webhook-id")!, "svix-timestamp": r.headers.get("webhook-timestamp")!, "svix-signature": r.headers.get("webhook-signature")! } });
    expect(verifyHookSignature(svix, body, secret).ok).toBe(false);
  });
});

describe("I18N-5 route", () => {
  it("rejects an unsigned or badly signed call before reading anything, and sends nothing", async () => {
    vi.resetModules();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET = secret;
    process.env.RESEND_API_KEY = "re_test_not_real";
    process.env.NEXT_PUBLIC_SUPABASE_URL = SB;
    const { POST } = await import("@/app/api/webhooks/supabase-send-email/route");
    const body = JSON.stringify({ user: { id: "u1", email: "a@example.com" }, email_data: { email_action_type: "recovery", token_hash: H } });
    const bad = await POST(signed(body, { key: randomBytes(32) }));
    expect(bad.status).toBe(401);
    expect(bad.headers.get("content-type")).toBe("application/json");
    expect(await bad.json()).toEqual({ error: { http_code: 401, message: "Invalid signature." } });
    const none = await POST(new Request("https://x/", { method: "POST", body }));
    expect(none.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    delete process.env.SUPABASE_SEND_EMAIL_HOOK_SECRET;
    const off = await POST(signed(body));
    expect(off.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

// ---------- EN parity ----------
const base = { tokenHash: H, redirectTo: "", siteUrl: "https://pekkotv.com", supabaseUrl: SB, email: "owner@example.com", newEmail: "new@example.com", token: "123456" };

describe("I18N-5 English parity with today's templates", () => {
  it("recovery: same subject and byte-identical HTML (branded token_hash link) as the delivered email", () => {
    const r = renderAuthEmail({ ...base, type: "recovery", locale: "en", redirectTo: "https://pekkotv.com/reset-password" });
    expect(r.subject).toBe(fx.recovery_live.subject);
    expect(r.html).toBe(fx.recovery_live.html);
  });
  it("Supabase ConfirmationURL: same token, type, redirect_to and &amp; escaping as a delivered default-template email", () => {
    const href = hrefFor({ type: "signup", tokenHash: H, redirectTo: fx.recovery_default_before_b207.redirectTo, siteUrl: "", supabaseUrl: SB });
    expect(href).toBe(fx.recovery_default_before_b207.href.replace("type=recovery", "type=signup"));
    expect(escapeHrefUrl(supabaseConfirmationUrl({ type: "recovery", tokenHash: H, redirectTo: fx.recovery_default_before_b207.redirectTo, siteUrl: "", supabaseUrl: SB }))).toBe(fx.recovery_default_before_b207.href);
  });
  it("signup and email change: the dashboard template text with the same link", () => {
    const s = renderAuthEmail({ ...base, type: "signup", locale: "en", redirectTo: "https://pekkotv.com/dashboard" });
    const sHref = escapeHrefUrl(supabaseConfirmationUrl({ ...base, type: "signup", redirectTo: "https://pekkotv.com/dashboard" }));
    expect(s.subject).toBe(fx.signup_template.subject);
    expect(s.html).toBe(fx.signup_template.body.replace("{{ .ConfirmationURL }}", sHref));
    const c = renderAuthEmail({ ...base, type: "email_change", locale: "en" });
    const cHref = escapeHrefUrl(supabaseConfirmationUrl({ ...base, type: "email_change" }));
    expect(c.subject).toBe(fx.email_change_template.subject);
    expect(c.html).toBe(fx.email_change_template.body.replace("{{ .ConfirmationURL }}", cHref).replace("{{ .NewEmail }}", "new@example.com"));
  });
  it("an empty redirect_to falls back to the site URL, like Supabase", () => {
    expect(supabaseConfirmationUrl({ type: "magiclink", tokenHash: H, redirectTo: "", siteUrl: "https://pekkotv.com", supabaseUrl: SB })).toBe(`${SB}/auth/v1/verify?token=${H}&type=magiclink&redirect_to=https://pekkotv.com`);
  });
  it("Gother LOW 1: token, type and redirect_to are query-encoded; a normal link is unchanged", () => {
    const url = supabaseConfirmationUrl({ type: "signup", tokenHash: "a&b=c#d e", redirectTo: "https://pekkotv.com/x?next=/y&z=1#frag", siteUrl: "", supabaseUrl: SB });
    const q = new URL(url).searchParams;
    expect([...q.keys()]).toEqual(["token", "type", "redirect_to"]);
    expect(q.get("token")).toBe("a&b=c#d e");
    expect(q.get("type")).toBe("signup");
    expect(q.get("redirect_to")).toBe("https://pekkotv.com/x?next=/y&z=1#frag");
    expect(url).toContain("redirect_to=https://pekkotv.com/x%3Fnext%3D/y%26z%3D1%23frag");
    expect(supabaseConfirmationUrl({ type: "recovery", tokenHash: H, redirectTo: "https://pekkotv.com/reset-password", siteUrl: "", supabaseUrl: SB }))
      .toBe(`${SB}/auth/v1/verify?token=${H}&type=recovery&redirect_to=https://pekkotv.com/reset-password`);
  });
  it("Gother LOW 2: CR/LF in the reauthentication token never reaches the subject", () => {
    for (const locale of ["en", "es"] as const) {
      const r = renderAuthEmail({ ...base, locale, type: "reauthentication", token: "12\r\n3456\nBcc: x@evil.test" });
      expect(r.subject).not.toMatch(/[\r\n]/);
      expect(r.subject).toContain("123456");
    }
    expect(renderAuthEmail({ ...base, locale: "en", type: "reauthentication" }).subject).toBe(renderAuthEmail({ ...base, locale: "en", type: "reauthentication", token: "123456" }).subject);
  });
  it("customer-typed addresses are HTML-escaped, never inserted raw", () => {
    const c = renderAuthEmail({ ...base, type: "email_change", locale: "en", newEmail: "x\"<b>@example.com" });
    expect(c.html).toContain("x&#34;&lt;b&gt;@example.com");
  });
  it("sender is the existing verified pekkotv.com no-reply address", () => {
    expect(AUTH_EMAIL_FROM).toBe("Pekko <no-reply@pekkotv.com>");
    expect(fx.from).toContain("no-reply@pekkotv.com");
  });
});

// ---------- ES ----------
describe("I18N-5 Spanish rendering", () => {
  for (const type of AUTH_EMAIL_TYPES) {
    it(`${type}: Spanish copy in usted, with exactly the same link as English`, () => {
      const en = renderAuthEmail({ ...base, type, locale: "en", redirectTo: "https://pekkotv.com/dashboard" });
      const es = renderAuthEmail({ ...base, type, locale: "es", redirectTo: "https://pekkotv.com/dashboard" });
      const links = (h: string) => h.match(/href="[^"]*"/g) ?? [];
      expect(links(es.html)).toEqual(links(en.html));
      expect(es.subject).not.toBe(en.subject);
      expect(`${es.subject} ${es.html}`).not.toMatch(ES_RULES);
      expect(es.html).not.toMatch(/\b(the|your|link below)\b/i);
      if (type === "reauthentication") { expect(es.subject).toContain("123456"); expect(es.html).toContain("123456"); }
    });
  }
  it("recovery reads as expected", () => {
    const es = renderAuthEmail({ ...base, type: "recovery", locale: "es" });
    expect(es.subject).toBe("Restablezca su contraseña de Pekko");
    expect(es.html).toContain(`https://pekkotv.com/auth/confirm?token_hash=${H}&type=recovery`);
    expect(es.html).toContain("vence en una hora");
  });
});

// ---------- planning + handler ----------
const payload = (type: string, extra: Partial<HookPayload["email_data"]> = {}, user: Partial<HookPayload["user"]> = {}): HookPayload => ({
  user: { id: "user-1", email: "owner@example.com", ...user },
  email_data: { token: "111111", token_hash: H, redirect_to: "https://pekkotv.com/reset-password", email_action_type: type, site_url: "https://pekkotv.com", token_new: "", token_hash_new: "", ...extra },
});

function deps(over: Partial<HookDeps> & { locale?: unknown } = {}) {
  const sent: { to: string; subject: string; html: string; idempotencyKey: string; from: string }[] = [];
  const logs: string[] = [];
  const d: HookDeps = {
    supabaseUrl: SB,
    readAccountLocale: over.readAccountLocale ?? (async () => over.locale ?? null),
    send: over.send ?? (async (m) => { sent.push(m); return { ok: true, status: 200 }; }),
    log: (l) => logs.push(l),
  };
  return { d, sent, logs };
}

describe("I18N-5 locale and fallback", () => {
  it("es only for exactly 'es'; NULL, 'en', unknown and missing accounts are English", async () => {
    for (const [v, want] of [["es", "es"], [null, "en"], ["en", "en"], ["fr", "en"], [undefined, "en"], ["ES", "en"]] as const) {
      expect((await hookLocale(deps({ locale: v }).d, "u")).locale, String(v)).toBe(want);
    }
  });
  it("a failed or slow lookup falls back to English and still sends", async () => {
    const { d, sent } = deps({ readAccountLocale: async () => { throw new Error("db down"); } });
    expect((await handleSendEmailHook(payload("recovery"), "w1", d)).status).toBe(200);
    expect(sent[0].subject).toBe("Reset your Pekko password");
    vi.useFakeTimers();
    const slow = deps({ readAccountLocale: () => new Promise(() => {}) });
    const p = hookLocale(slow.d, "u");
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toEqual({ locale: "en", fallback: true });
    vi.useRealTimers();
  });
  it("an es account gets Spanish", async () => {
    const { d, sent } = deps({ locale: "es" });
    await handleSendEmailHook(payload("recovery"), "w1", d);
    expect(sent[0].subject).toBe("Restablezca su contraseña de Pekko");
  });
});

describe("I18N-5 sending and fail-safe", () => {
  it("sends one email from no-reply@pekkotv.com with an idempotency key per hook delivery; logs carry no address or token", async () => {
    const { d, sent, logs } = deps();
    const r = await handleSendEmailHook(payload("recovery"), "msg_abc", d);
    expect(r).toEqual({ status: 200, body: {} });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ from: "Pekko <no-reply@pekkotv.com>", to: "owner@example.com", idempotencyKey: "supabase-auth/msg_abc/0" });
    expect(logs.join(" ")).not.toMatch(/owner@example\.com|111111|0123456789abcdef/);
  });
  it("a send error returns 500 so Supabase reports it (a reset email is never dropped silently)", async () => {
    const { d, logs } = deps({ send: async () => ({ ok: false, status: 422 }) });
    const r = await handleSendEmailHook(payload("recovery"), "w", d);
    expect(r.status).toBe(500);
    expect(r.body).toEqual({ error: { http_code: 500, message: "The email couldn't be sent. Please try again in a minute." } });
    expect(logs.join(" ")).toContain("send-failed type=recovery");
  });
  it("a thrown or hanging send is an error too", async () => {
    expect((await handleSendEmailHook(payload("recovery"), "w", deps({ send: async () => { throw new Error("x"); } }).d)).status).toBe(500);
    vi.useFakeTimers();
    const p = handleSendEmailHook(payload("recovery"), "w", deps({ send: () => new Promise(() => {}) }).d);
    await vi.advanceTimersByTimeAsync(4100);
    expect((await p).status).toBe(500);
    vi.useRealTimers();
  });
  it("unknown types (e.g. security notifications) and incomplete payloads are refused with an error, not skipped", async () => {
    const { d, sent } = deps();
    expect((await handleSendEmailHook(payload("password_changed_notification"), "w", d)).status).toBe(500);
    expect((await handleSendEmailHook(payload("recovery", { token_hash: "" }), "w", d)).status).toBe(500);
    expect(sent).toHaveLength(0);
  });
  it("email change with Secure Email Change: two emails, with Supabase's reversed hash mapping", async () => {
    const p = payload("email_change", { token_hash: "hashfornewaddress", token_hash_new: "hashforcurrentaddress", token_new: "222222" }, { new_email: "new@example.com" });
    expect(planEmails(p, "email_change")).toEqual([
      { to: "owner@example.com", tokenHash: "hashforcurrentaddress", token: "111111" },
      { to: "new@example.com", tokenHash: "hashfornewaddress", token: "222222" },
    ]);
    const { d, sent } = deps();
    expect((await handleSendEmailHook(p, "w9", d)).status).toBe(200);
    expect(sent.map((s) => [s.to, s.idempotencyKey])).toEqual([["owner@example.com", "supabase-auth/w9/0"], ["new@example.com", "supabase-auth/w9/1"]]);
    expect(sent[0].html).toContain("token=hashforcurrentaddress&amp;type=email_change");
  });
  it("email change without Secure Email Change: one email to the new address", () => {
    expect(planEmails(payload("email_change", {}, { new_email: "new@example.com" }), "email_change")).toEqual([{ to: "new@example.com", tokenHash: H, token: "111111" }]);
  });
  it("if the second email-change send fails, the hook errors (a retry reuses the same keys, so the first isn't duplicated)", async () => {
    let n = 0;
    const { d } = deps({ send: async () => ({ ok: n++ === 0 }) });
    const p = payload("email_change", { token_hash_new: "h2", token_new: "2" }, { new_email: "new@example.com" });
    expect((await handleSendEmailHook(p, "w", d)).status).toBe(500);
  });
  it("parses the documented Supabase payload and rejects junk", () => {
    expect(parseHookPayload("not json")).toBeNull();
    expect(parseHookPayload(JSON.stringify({ user: { id: "x" }, email_data: {} }))).toBeNull();
    const ok = parseHookPayload(JSON.stringify({ user: { id: "u", email: "e@x.com", new_email: "n@x.com", user_metadata: {} }, email_data: { token: "1", token_hash: "h", redirect_to: "r", email_action_type: "recovery", site_url: "s", token_new: "", token_hash_new: "" } }));
    expect(ok?.user).toEqual({ id: "u", email: "e@x.com", new_email: "n@x.com" });
  });
});
