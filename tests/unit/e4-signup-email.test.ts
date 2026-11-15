import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { build, type Plugin } from "esbuild";
import { chromium } from "playwright";
import { maybeSendWelcome, welcomeKey, welcomeMessage } from "@/lib/server/welcome-email";
import { memoryNoticeLedger, sendTransactionalEmail } from "@/lib/server/transactional-email";

const admin = { userId: "u1", accountId: "a1", email: "owner@example.com" };
const NOW = Date.parse("2026-11-20T12:00:00Z");
const on = { WELCOME_EMAIL: "on", WELCOME_EMAIL_SINCE: "2026-11-15T00:00:00Z", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", ALERT_EMAIL_FROM: "Pekko <hi@pekkotv.com>" };
const fresh = async () => ({ emailConfirmedAt: "2026-11-19T10:00:00Z", accountCreatedAt: "2026-11-19T10:00:00Z" });

describe("E4: one-time welcome email", () => {
  it("is off unless WELCOME_EMAIL=on and WELCOME_EMAIL_SINCE are set", async () => {
    const send = vi.fn();
    expect(await maybeSendWelcome(admin, { env: {}, send, lookup: fresh, now: () => NOW })).toBe("disabled");
    expect(await maybeSendWelcome(admin, { env: { WELCOME_EMAIL: "on" }, send, lookup: fresh, now: () => NOW })).toBe("too-old");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends once to a new confirmed owner, via sendTransactionalEmail with the welcome:<account> key", async () => {
    const ledger = memoryNoticeLedger();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const send = vi.fn(sendTransactionalEmail);
      expect(await maybeSendWelcome(admin, { env: on, ledger, send, lookup: fresh, now: () => NOW, log: () => {} })).toBe("sent");
      expect(send.mock.calls[0][0]).toMatchObject({ idempotencyKey: welcomeKey("a1"), accountId: "a1", kind: "welcome", message: { to: "owner@example.com", subject: "Welcome to Pekko" } });
      expect(await maybeSendWelcome(admin, { env: on, ledger, send, lookup: fresh, now: () => NOW, log: () => {} })).toBe("already");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("never welcomes an unconfirmed address, an account from before the switch-on time, or one older than 7 days", async () => {
    const send = vi.fn();
    const base = { env: on, ledger: memoryNoticeLedger(), send, now: () => NOW, log: () => {} };
    expect(await maybeSendWelcome(admin, { ...base, lookup: async () => ({ emailConfirmedAt: null, accountCreatedAt: "2026-11-19T10:00:00Z" }) })).toBe("unconfirmed");
    expect(await maybeSendWelcome(admin, { ...base, lookup: async () => ({ emailConfirmedAt: "x", accountCreatedAt: "2026-11-14T23:59:00Z" }) })).toBe("too-old");
    expect(await maybeSendWelcome(admin, { ...base, now: () => Date.parse("2026-12-01T00:00:00Z"), lookup: fresh })).toBe("too-old");
    expect(await maybeSendWelcome(admin, { ...base, lookup: async () => null })).toBe("lookup-failed");
    expect(await maybeSendWelcome(admin, { ...base, lookup: async () => { throw new Error("boom"); } })).toBe("lookup-failed");
    expect(send).not.toHaveBeenCalled();
  });

  it("copy explains the first three steps and links the dashboard", () => {
    const m = welcomeMessage("o@example.com");
    expect(m.text).toContain("pekkotv.com/tv");
    expect(m.text).toContain("https://pekkotv.com/dashboard");
    expect(m.text).toContain("one-time email");
  });

  it("is triggered from GET /api/onboarding after the response, not from auth", () => {
    const route = readFileSync("app/api/onboarding/route.ts", "utf8");
    expect(route).toMatch(/after\(welcome\)/);
    expect(readFileSync("lib/server/auth.ts", "utf8")).not.toMatch(/welcome/i);
  });
});

describe("E4: sign-up confirmation keeps ?next= and can be resent", () => {
  const hasBrowser = (() => { try { return existsSync(chromium.executablePath()); } catch { return false; } })();
  const root = process.cwd();
  const stubs: Record<string, string> = {
    "next/navigation": `export function useRouter(){return {replace(p){window.__replaced=p}}} export function useSearchParams(){return new URLSearchParams(location.search)}`,
    "next/link": `import React from "react"; export default function Link(p){return React.createElement("a",{href:p.href,className:p.className},p.children)}`,
    "@/lib/supabase-browser": `export function supabaseConfigured(){return true}
      export function getSupabase(){return {auth:{
        getSession: async()=>({data:{session:null}}),
        signUp: async(a)=>{(window.__calls=window.__calls||[]).push(["signUp",a]);return {data:{session:null,user:{}},error:null}},
        signInWithPassword: async(a)=>{(window.__calls=window.__calls||[]).push(["signIn",a]);return {data:{session:null},error:{message:"Email not confirmed",code:"email_not_confirmed"}}},
        resend: async(a)=>{(window.__calls=window.__calls||[]).push(["resend",a]);return {data:{},error:null}},
      }}}`,
  };
  const stubPlugin: Plugin = { name: "stubs", setup(b) {
    b.onResolve({ filter: /^(next\/navigation|next\/link|@\/lib\/supabase-browser)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js", resolveDir: root }));
  } };

  it.skipIf(!hasBrowser)("sign-up sends the confirmation to ?next=, Resend waits 60 s, and an unconfirmed sign-in offers Resend", async () => {
    const out = await build({
      stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import LoginPage from "@/app/login/page"; createRoot(document.getElementById("root")).render(React.createElement(LoginPage));`, resolveDir: root, loader: "tsx" },
      bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
      alias: { "@": root }, define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" }, logLevel: "silent", plugins: [stubPlugin],
    });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.clock.install();
      await page.route("https://pekkotv.test/**", (r) => r.fulfill({ contentType: "text/html", body: `<div id="root"></div>` }));
      await page.goto("https://pekkotv.test/login?mode=up&next=%2Fdashboard%2Fscreens%3Fadd%3D1");
      await page.addScriptTag({ content: out.outputFiles[0].text });
      await page.getByLabel("Email").fill("new@example.com");
      await page.getByLabel("Password").fill("correct-horse-1");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect.poll(() => page.getByRole("status").textContent()).toContain("Check your email");
      const calls = () => page.evaluate(() => (window as unknown as { __calls: [string, { options?: { emailRedirectTo?: string }; email?: string; type?: string }][] }).__calls);
      expect((await calls())[0][1].options?.emailRedirectTo).toBe("https://pekkotv.test/dashboard/screens?add=1");

      const resend = page.getByTestId("resend-confirmation");
      expect(await resend.isDisabled()).toBe(true);
      expect(await resend.textContent()).toBe("Resend confirmation email (wait a minute)");
      expect(await page.getByTestId("resend-announce").textContent()).toBe("");
      await page.clock.runFor(30_000);
      expect(await resend.textContent()).toBe("Resend confirmation email (wait a minute)"); // static, no per-second label
      for (let i = 0; i < 61; i++) { await page.clock.runFor(1000); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null)))); }
      await expect.poll(() => resend.isDisabled()).toBe(false);
      expect(await resend.textContent()).toBe("Resend confirmation email");
      expect(await page.getByTestId("resend-announce").textContent()).toBe("You can send a new confirmation email now.");
      await resend.click();
      await expect.poll(async () => (await calls()).length).toBe(2);
      expect((await calls())[1]).toEqual(["resend", { type: "signup", email: "new@example.com", options: { emailRedirectTo: "https://pekkotv.test/dashboard/screens?add=1" } }]);
      expect(await page.getByRole("status").textContent()).toContain("We sent a new confirmation email to new@example.com");

      // Off-site ?next= is never used.
      await page.goto("https://pekkotv.test/login?next=https%3A%2F%2Fevil.example%2F");
      await page.addScriptTag({ content: out.outputFiles[0].text });
      await page.getByLabel("Email").fill("later@example.com");
      await page.getByLabel("Password").fill("correct-horse-1");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect.poll(() => page.getByRole("alert").textContent()).toContain("Confirm your email first");
      const again = page.getByTestId("resend-confirmation");
      expect(await again.isDisabled()).toBe(true); // unconfirmed sign-in starts the 60 s wait too
      expect(await again.textContent()).toBe("Resend confirmation email (wait a minute)");
      for (let i = 0; i < 61; i++) { await page.clock.runFor(1000); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null)))); }
      await expect.poll(() => again.isDisabled()).toBe(false);
      await again.click();
      await expect.poll(async () => (await calls()).at(-1)?.[0]).toBe("resend");
      expect((await calls()).at(-1)?.[1]).toEqual({ type: "signup", email: "later@example.com", options: { emailRedirectTo: "https://pekkotv.test/dashboard" } });
    } finally {
      await browser.close();
    }
  }, 60_000);
});
