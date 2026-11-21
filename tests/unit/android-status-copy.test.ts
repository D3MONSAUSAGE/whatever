import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/supabase", () => ({ BUCKET: "media", db: () => ({}) }));

import { fail, json } from "@/lib/server/http";
import { withLocalizedErrors } from "@/lib/server/locale";
import { toResponse, warningFor, type EntitlementRow } from "@/lib/server/entitlements";
import {
  isAndroidAppRequest,
  PURCHASE_STEERING,
  rewriteAndroidStatusCopy,
  STATUS_COPY_CASES,
  statusOnlyText,
} from "@/lib/server/android-status-copy";

const EXAMPLES: Record<string, string> = {
  warning_expired: "Your free trial has ended, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on.",
  warning_canceled: "Your plan isn't active, so your screens are paused. Your content and settings are saved. Choose a plan to turn them back on.",
  warning_trial_grace: "Your free trial has ended. Screens keep playing until Nov 18, 2026 (UTC). Choose a plan to keep them on.",
  warning_past_due_grace_days: "Your payment grace ends in 2 days, on Nov 12, 2026 (UTC). Update your payment method to keep your screens playing. Your content is not deleted.",
  warning_past_due_before_date: "We couldn't take your last payment. Update your payment method before Nov 12, 2026 (UTC) to keep your screens playing.",
  warning_past_due_no_date: "We couldn't take your last payment. Update your payment method to keep your screens playing.",
  error_subscription_inactive: "Your plan isn't active, so new screens can't be added. Choose a plan to continue.",
  error_screen_limit: "Your plan's screen limit is reached. Choose a plan with more screens, or pause another screen first.",
  error_subscription_inactive_es: "Su plan no está activo, por lo que no se pueden agregar pantallas nuevas. Elija un plan para continuar.",
  error_screen_limit_es: "Alcanzó el límite de pantallas de su plan. Elija un plan con más pantallas o pause otra pantalla primero.",
  checkout_choose_plan: "Choose a plan.",
  checkout_manage_billing: "Use Manage billing to change this plan.",
  checkout_card_declined: "Your card was declined for this plan change, so your plan didn't change. Update your card in Manage billing, then try again.",
  checkout_unavailable: "Checkout isn't available yet.",
  portal_unavailable: "Billing isn't available yet.",
  portal_not_owner: "Only the account owner can manage billing.",
  warning_expired_es: "Su prueba gratis terminó, así que sus pantallas están en pausa. Su contenido y ajustes se conservan. Elija un plan para volver a activarlas.",
  warning_canceled_es: "Su plan no está activo, así que sus pantallas están en pausa. Su contenido y ajustes se conservan. Elija un plan para volver a activarlas.",
  warning_trial_grace_es: "Su prueba gratis terminó. Las pantallas siguen activas hasta el 18 nov 2026 (UTC). Elija un plan para mantenerlas encendidas.",
  warning_past_due_grace_days_es: "El período de gracia del pago termina en 2 días, el 12 nov 2026 (UTC). Actualice su método de pago para que las pantallas sigan activas. Su contenido no se elimina.",
  warning_past_due_before_date_es: "No pudimos procesar su último pago. Actualice su método de pago antes del 12 nov 2026 (UTC) para que las pantallas sigan activas.",
  warning_past_due_no_date_es: "No pudimos procesar su último pago. Actualice su método de pago para que las pantallas sigan activas.",
  warning_trial_ending_add_method: "5 days left in your free trial, ending Nov 26, 2026 (UTC). Add a payment method to keep your screens on.",
  warning_trial_ending_card: "5 days left in your free trial, ending Nov 26, 2026 (UTC). Your payment method (visa •••• 4242) is on file; billing starts when the trial ends.",
  warning_trial_ending_add_method_es: "Quedan 5 días de prueba gratis, hasta el 26 nov 2026 (UTC). Agregue un método de pago para mantener sus pantallas activas.",
  warning_trial_ending_card_es: "Quedan 5 días de prueba gratis, hasta el 26 nov 2026 (UTC). Su método de pago (visa •••• 4242) está guardado; la facturación comienza cuando termine la prueba.",
  status_trialing: "You're on a trial. Your payment method (visa •••• 4242) is on file; billing starts on Nov 26, 2026 (UTC).",
  status_trialing_es: "Está en un período de prueba. Su método de pago (visa •••• 4242) está guardado; la facturación comienza el 26 nov 2026 (UTC).",
  portal_not_owner_es: "Solo el propietario de la cuenta puede administrar la facturación.",
  checkout_choose_plan_es: "Elija un plan.",
  checkout_manage_billing_es: "Use Administrar facturación para cambiar este plan.",
  checkout_unavailable_es: "Checkout todavía no está disponible.",
  portal_unavailable_es: "La facturación todavía no está disponible.",
  rollout_notice_unenforced: "You're an early Pekko customer. Enforcement is off, so your 14-day transition has not started. You keep full access and get a notice before billing changes. Your content stays.",
};

const dart = (lang?: string, extra?: HeadersInit) =>
  new Request("https://pekkotv.com/api/entitlements", {
    headers: { "user-agent": "Dart/3.8.0 (dart:io)", ...(lang ? { "accept-language": lang } : {}), ...extra },
  });

const browser = () =>
  new Request("https://pekkotv.com/api/entitlements", {
    headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0", "accept-language": "en" },
  });

const base: EntitlementRow = {
  state: "trial", plan: "trial", screen_limit: 5, active_screens: 1, total_screens: 1,
  trial_started_at: "2026-11-01T08:00:00Z", trial_ends_at: "2026-11-15T08:00:00Z", playback_ends_at: "2026-11-18T08:00:00Z",
  subscription_status: null, current_period_end: null, cancel_at_period_end: false, grace_ends_at: null,
  playback_allowed: true, can_add_screen: true, server_time: "2026-11-01T08:00:00Z",
};

describe("Android app detection", () => {
  it("matches a lenient case-insensitive Dart/ User-Agent prefix", () => {
    expect(isAndroidAppRequest(dart())).toBe(true);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "user-agent": "dart/3.5 (dart:io)" } }))).toBe(true);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "user-agent": "  DART/3.0 (dart:io)" } }))).toBe(true);
    expect(isAndroidAppRequest(browser())).toBe(false);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "user-agent": "Mozilla/5.0 Dart/3.8" } }))).toBe(false);
    expect(isAndroidAppRequest(new Request("https://x.test"))).toBe(false);
  });
  it("also accepts a future X-Pekko-Client android header", () => {
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "x-pekko-client": "android/14" } }))).toBe(true);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "X-Pekko-Client": "Android/1.14.0" } }))).toBe(true);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "x-pekko-client": "android" } }))).toBe(true);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "x-pekko-client": "web" } }))).toBe(false);
    expect(isAndroidAppRequest(new Request("https://x.test", { headers: { "x-pekko-client": "ios/1.0" } }))).toBe(false);
  });
});

describe("status-only copy map", () => {
  it("covers every known case and strips purchase or steering words", () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...STATUS_COPY_CASES.map((c) => c.id)].sort());
    for (const item of STATUS_COPY_CASES) {
      const input = EXAMPLES[item.id];
      expect(input, item.id).toMatch(item.from);
      expect(input, item.id).toMatch(PURCHASE_STEERING);
      const out = statusOnlyText(input);
      expect(out, item.id).not.toBe(input);
      expect(out, item.id).not.toMatch(PURCHASE_STEERING);
      expect(out, item.id).not.toMatch(/\$/);
    }
    // Dated 1-day form of the past-due grace warning.
    const oneDay = "Your payment grace ends in 1 day, on Nov 12, 2026 (UTC). Update your payment method to keep your screens playing. Your content is not deleted.";
    expect(statusOnlyText(oneDay)).toBe("Payment for your plan is past due. Screens keep playing until Nov 12, 2026 (UTC). Your content is not deleted.");
    expect(statusOnlyText(oneDay)).not.toMatch(PURCHASE_STEERING);
  });
  it("leaves status-only and non-steering sentences unchanged", () => {
    const clean = "Your plan's screen limit is reached. Pause another screen to pair this one.";
    expect(statusOnlyText(clean)).toBe(clean);
    expect(statusOnlyText("Couldn't check your plan. Try again.")).toBe("Couldn't check your plan. Try again.");
    expect(statusOnlyText("That's more screens than your plan includes.")).toBe("That's more screens than your plan includes.");
  });
  it("uses a neutral fallback for unmatched steering copy, never a paused claim", () => {
    const out = statusOnlyText("Screens are paused. Choose a plan on the dashboard.");
    expect(out).toBe("That isn't available in this app.");
    expect(out).not.toMatch(PURCHASE_STEERING);
    expect(statusOnlyText("Elija un plan para continuar.")).toBe("Eso no está disponible en esta app.");
    expect(statusOnlyText("Please subscribe or upgrade.")).toBe("That isn't available in this app.");
    expect(statusOnlyText("Please suscríbase hoy.")).toBe("Eso no está disponible en esta app.");
  });
});

describe("warningFor web copy stays unchanged", () => {
  it("still tells the website to choose a plan or update payment", () => {
    expect(warningFor({ ...base, state: "expired" })?.message).toContain("Choose a plan");
    expect(warningFor({ ...base, state: "canceled" })?.message).toContain("Choose a plan");
    expect(warningFor({ ...base, state: "trial_grace" })?.message).toContain("Choose a plan");
    expect(warningFor({ ...base, state: "past_due", plan: "starter", grace_ends_at: "2026-11-12T08:00:00Z" })?.message).toMatch(/Update your payment/);
  });
});

describe("rewriteAndroidStatusCopy", () => {
  it("returns the same Response for web requests (byte-identical)", async () => {
    const row = { ...base, state: "expired" as const };
    const payload = toResponse("acc", row, "https://pekkotv.com/");
    const res = json(payload);
    const out = await rewriteAndroidStatusCopy(browser(), res);
    expect(out).toBe(res);
    expect(await out.clone().text()).toBe(JSON.stringify(payload));
    expect(payload.warning?.message).toContain("Choose a plan");
    expect(payload.plan_name).toBe("Free trial");
    expect(payload.billing_url).toContain("/dashboard/billing");
  });
  it("rewrites warning.message for Dart-UA requests and leaves plan_name, code and billing_url", async () => {
    const row = { ...base, state: "expired" as const };
    const payload = toResponse("acc", row, "https://pekkotv.com/");
    const out = await rewriteAndroidStatusCopy(dart(), json(payload));
    const body = await out.json() as typeof payload;
    expect(body.plan_name).toBe(payload.plan_name);
    expect(body.billing_url).toBe(payload.billing_url);
    expect(body.plan).toBe(payload.plan);
    expect(body.warning?.kind).toBe("expired");
    expect(body.warning?.action).toBe("open_plan");
    expect(body.warning?.message).toBe("Your free trial has ended, so your screens are paused. Your content and settings are saved.");
    expect(body.warning?.message).not.toMatch(PURCHASE_STEERING);
    // billing_url is a structured field, not on-screen copy; it is left unchanged.
    expect(body.billing_url).toBe("https://pekkotv.com/dashboard/billing");
  });
  it("rewrites every warning state the Plan screen can show, without purchase words", async () => {
    const states: EntitlementRow[] = [
      { ...base, state: "expired" },
      { ...base, state: "canceled", plan: "starter" },
      { ...base, state: "trial_grace" },
      { ...base, state: "past_due", plan: "starter", grace_ends_at: "2026-11-12T08:00:00Z", server_time: "2026-11-11T08:00:00Z" },
      { ...base, state: "past_due", plan: "starter", grace_ends_at: "2026-11-20T08:00:00Z", server_time: "2026-11-11T08:00:00Z" },
      { ...base, state: "past_due", plan: "starter", grace_ends_at: null },
      { ...base, state: "active", plan: "starter", screen_limit: 1, active_screens: 3 },
      { ...base, state: "trial", server_time: "2026-11-10T08:00:00Z" },
    ];
    for (const row of states) {
      const payload = toResponse("acc", row, "https://pekkotv.com/");
      const web = await rewriteAndroidStatusCopy(browser(), json(payload));
      expect(await web.clone().text(), row.state).toBe(JSON.stringify(payload));
      const app = await (await rewriteAndroidStatusCopy(dart(), json(payload))).json() as typeof payload;
      expect(app.plan_name, row.state).toBe(payload.plan_name);
      if (app.warning?.message) expect(app.warning.message, row.state).not.toMatch(PURCHASE_STEERING);
    }
  });
  it("keeps error codes unchanged when rewriting pair errors", async () => {
    const res = json({
      error: "Your plan's screen limit is reached. Choose a plan with more screens, or pause another screen first.",
      code: "screen_limit",
    }, 403);
    const out = await rewriteAndroidStatusCopy(dart(), res);
    expect(out.status).toBe(403);
    expect(await out.json()).toEqual({
      error: "Your plan's screen limit is reached. Pause another screen to pair this one.",
      code: "screen_limit",
    });
  });
});

describe("customer content is not rewritten for a Dart UA", () => {
  async function dartIdentical(payload: unknown) {
    const res = json(payload);
    const out = await rewriteAndroidStatusCopy(dart(), res);
    expect(out).toBe(res);
    expect(await out.clone().text()).toBe(JSON.stringify(payload));
  }

  it("leaves menu, promo, alert and layout bodies with $, Dashboard, Pricing or billing byte-identical", async () => {
    await dartIdentical({
      id: "menu-1",
      name: "Lunch",
      content: { title: "Taco Tuesday $2", sections: [{ name: "Specials", items: [{ name: "Taco", price: "$2" }] }] },
    });
    await dartIdentical({
      id: "promo-1",
      title: "Pricing board",
      message: "Ask about billing at the counter.",
      items: ["$5 deal", "Pricing board"],
    });
    await dartIdentical({
      alerts: [
        { id: "a1", title: "Dashboard", message: "Dashboard TV went offline at 9:00." },
        { id: "a2", message: "Billing TV came back online." },
      ],
    });
    await dartIdentical({
      board: { name: "Pricing", title: "Spring pricing", zones: [{ label: "$5 deal", text: "See the dashboard for billing." }] },
    });
  });

  it("leaves day-part style errors that embed a customer name with $ or Pricing untouched", async () => {
    await dartIdentical({
      error: "“Taco Tuesday $2” hasn't been published yet. Publish this board first, then schedule it.",
      code: "conflict",
    });
    await dartIdentical({
      error: "Pricing board: Check each part of the day.",
      code: "validation_failed",
    });
    await dartIdentical({
      error: "Dashboard special: a time is missing.",
      code: "validation_failed",
    });
  });

  it("does not rewrite a top-level error that has no code, or nested message/title fields", async () => {
    await dartIdentical({ error: "Choose a plan to continue." });
    await dartIdentical({ item: { message: "Choose a plan on the dashboard.", title: "Billing $5" } });
  });
});

describe("withLocalizedErrors Android rewrite", () => {
  const pairError = withLocalizedErrors(async (_req: Request) =>
    fail("Your plan isn't active, so new screens can't be added. Choose a plan to continue.", 403, "subscription_inactive"),
  );
  it("rewrites after Spanish localization and leaves the code", async () => {
    const res = await pairError(dart("es"));
    const body = await res.json() as { error: string; code: string };
    expect(res.status).toBe(403);
    expect(body.code).toBe("subscription_inactive");
    expect(body.error).toBe("Su plan no está activo, por lo que no se pueden agregar pantallas nuevas.");
    expect(body.error).not.toMatch(PURCHASE_STEERING);
  });
  it("leaves the web English and Spanish error text unchanged", async () => {
    const en = fail("Your plan isn't active, so new screens can't be added. Choose a plan to continue.", 403, "subscription_inactive");
    const webEn = await pairError(browser());
    expect(await webEn.json()).toEqual(await en.clone().json());
    const webEs = await pairError(new Request("https://pekkotv.com/api/displays/pair", {
      headers: { "user-agent": "Mozilla/5.0", "accept-language": "es" },
    }));
    expect(await webEs.json()).toEqual({
      error: "Su plan no está activo, por lo que no se pueden agregar pantallas nuevas. Elija un plan para continuar.",
      code: "subscription_inactive",
    });
  });
});
