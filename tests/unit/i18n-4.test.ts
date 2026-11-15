import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { englishOutputs, ACCOUNTS, NOW, ROWS } from "./helpers/notification-cases";
import { billingNoticeKey, billingNotices, billingTemplate, formatWhen, remainingPhrase } from "@/lib/server/billing-notices";
import { planOrgReminders, runBillingDispatcher, type DispatchIO, type ReminderAccount } from "@/lib/server/billing-dispatch";
import { emailFor } from "@/lib/server/alerts";
import { pushFor } from "@/lib/server/push";
import { maybeSendWelcome, welcomeMessage } from "@/lib/server/welcome-email";
import { notificationLocaleOf } from "@/lib/server/notification-locale";
import { memoryNoticeLedger } from "@/lib/server/transactional-email";

const ES_RULES = /\b(tú|tu cuenta|tienes|puedes|quieres|elige|escribe|ingresa)\b|televisor|prueba gratuita|desconectad|programación|Inténtelo|Ingrese/i;
const golden = JSON.parse(readFileSync("tests/fixtures/notifications-en.golden.json", "utf8")) as Record<string, unknown>;
const KINDS = ["trial_ending_3", "trial_ending_1", "payment_failed", "grace_ending_2", "grace_ending_1", "transition_14"] as const;

describe("I18N-4: English is byte for byte what main sent", () => {
  it("matches the golden output captured on main before any change", () => {
    const now = englishOutputs();
    expect(Object.keys(now).length).toBeGreaterThan(250);
    expect(JSON.stringify(now)).toBe(JSON.stringify(golden));
  });
  it("an explicit 'en' locale gives the same bytes as no locale", () => {
    const d = "2026-11-15T08:00:00.000Z";
    for (const k of KINDS) expect(billingTemplate(k, d, { now: NOW, tz: "America/Mexico_City", locale: "en" })).toEqual(billingTemplate(k, d, { now: NOW, tz: "America/Mexico_City" }));
    for (const row of Object.values(ROWS)) expect(billingNotices(row, { locale: "en" })).toEqual(billingNotices(row));
    const alert = { id: "a", kind: "screen.offline" as const, display_id: "d", display_name: "Office Tv", offline_since: "2026-11-12T02:05:00Z", offline_seconds: null };
    expect(emailFor(alert, "UTC", "https://pekkotv.com", "en")).toEqual(emailFor(alert, "UTC", "https://pekkotv.com"));
    expect(pushFor(alert, "en")).toEqual(pushFor(alert));
    expect(welcomeMessage("a@b.c", undefined, "en")).toEqual(welcomeMessage("a@b.c"));
  });
  it("only an exact 'es' picks Spanish; NULL, en, junk and missing mean English", () => {
    expect(notificationLocaleOf("es")).toBe("es");
    for (const v of [null, undefined, "en", "ES", "es-MX", "", 1]) expect(notificationLocaleOf(v)).toBe("en");
  });
});

describe("I18N-4: recipients, timing and dedupe are unchanged", () => {
  const withLocale = (locale?: "es" | "en"): ReminderAccount[] => ACCOUNTS.map((a) => ({ ...a, ...(locale ? { locale } : {}) }));
  it("plans the same kinds, deadlines, claim keys and transition stamps in every language", () => {
    for (const locale of ["es", "en"] as const) {
      for (const [i, a] of withLocale(locale).entries()) {
        const strip = (rows: ReturnType<typeof planOrgReminders>) => rows.map(({ kind, deadline, claimKey, transitionStart }) => ({ kind, deadline, claimKey, transitionStart }));
        expect(strip(planOrgReminders(a, NOW))).toEqual(strip(planOrgReminders(ACCOUNTS[i], NOW)));
      }
    }
    for (const row of Object.values(ROWS)) {
      const es = billingNotices(row, { locale: "es", enforced: true, transitionEndsAt: "2026-11-20T08:00:00.000Z" });
      const en = billingNotices(row, { enforced: true, transitionEndsAt: "2026-11-20T08:00:00.000Z" });
      expect(es.map((n) => billingNoticeKey("a", n))).toEqual(en.map((n) => billingNoticeKey("a", n)));
    }
  });
  it("the dispatcher sends to the same addresses, the same number of times, with the same claims", async () => {
    async function run(accounts: ReminderAccount[]) {
      const sends: { to: string; kind: string }[] = [];
      const claims: string[] = [];
      const io: DispatchIO = {
        now: NOW,
        list: async () => accounts,
        hasDelivered: async () => false,
        claim: async (n) => { claims.push(n.id); return true; },
        send: async (to, n) => { sends.push({ to, kind: n.kind }); return { ok: true, error: null }; },
        stamp: async () => true,
      };
      const result = await runBillingDispatcher({ enabled: true, dryRun: false, io });
      return { sends, claims, result };
    }
    const en = await run(withLocale());
    const es = await run(withLocale("es"));
    expect(es.sends).toEqual(en.sends);
    expect(es.claims).toEqual(en.claims);
    expect(es.result).toEqual(en.result);
    expect(en.sends.length).toBeGreaterThan(0);
  });
  it("the welcome email keeps its gates and key; the locale is read only after every gate passes", async () => {
    const env = { WELCOME_EMAIL: "on", WELCOME_EMAIL_SINCE: "2026-11-01T00:00:00Z" };
    const lookup = async () => ({ emailConfirmedAt: "2026-11-12T00:00:00Z", accountCreatedAt: "2026-11-12T00:00:00Z" });
    const now = () => Date.parse("2026-11-12T08:00:00Z");
    for (const lang of ["en", "es"] as const) {
      const sent: { key: string; to: string; subject: string }[] = [];
      let localeReads = 0;
      const out = await maybeSendWelcome({ userId: "u", accountId: "acc", email: "o@x.test" }, {
        env, now, lookup, ledger: memoryNoticeLedger(),
        locale: async () => { localeReads++; return lang; },
        send: async (i) => { sent.push({ key: i.idempotencyKey, to: i.message.to, subject: i.message.subject }); return { sent: true, reason: "sent", id: "x", error: null }; },
      });
      expect(out).toBe("sent");
      expect(sent).toHaveLength(1);
      expect(sent[0].key).toBe("welcome:acc");
      expect(sent[0].to).toBe("o@x.test");
      expect(sent[0].subject).toBe(lang === "es" ? "Le damos la bienvenida a Pekko" : "Welcome to Pekko");
      expect(localeReads).toBe(1);
    }
    let reads = 0;
    const off = await maybeSendWelcome({ userId: "u", accountId: "acc", email: "o@x.test" }, { env: {}, locale: async () => { reads++; return "es"; } });
    expect(off).toBe("disabled");
    expect(reads).toBe(0);
  });
  it("the senders read the locale separately, so a missing column can't change the recipient", () => {
    const alerts = readFileSync("lib/server/alerts.ts", "utf8");
    expect(alerts).toContain('select("owner_user_id")');
    expect(alerts).not.toMatch(/select\("[^"]*locale/);
    const push = readFileSync("lib/server/push.ts", "utf8");
    expect(push).toContain('select("alerts_enabled, alert_push_enabled")');
    const dispatch = readFileSync("lib/server/billing-dispatch.ts", "utf8");
    expect(dispatch).toContain('select("id, owner_user_id, billing_transition_started_at")');
    const loc = readFileSync("lib/server/notification-locale.ts", "utf8");
    expect(loc).toContain('if (error) return "en";');
    // No new provider, sender address or transport.
    for (const f of ["lib/server/email.ts", "lib/server/transactional-email.ts"]) expect(readFileSync(f, "utf8")).not.toMatch(/locale/i);
  });
});

describe("I18N-4: Spanish templates render", () => {
  it("billing reminders keep the same facts, date and promises, in usted", () => {
    const d = "2026-11-15T08:00:00.000Z";
    for (const k of KINDS) {
      const es = billingTemplate(k, d, { now: NOW, tz: "America/Mexico_City", locale: "es" });
      const en = billingTemplate(k, d, { now: NOW, tz: "America/Mexico_City" });
      expect(es.kind).toBe(en.kind);
      expect(es.deadline).toBe(en.deadline);
      expect(es.subject).not.toBe(en.subject);
      expect(`${es.subject} ${es.text}`).not.toMatch(ES_RULES);
      expect(es.text).toContain("15 nov 2026 a las 2:00 a.m. CST");
      expect(`${es.subject} ${es.text}`).toContain("Pekko");
      if (/content/i.test(en.text)) expect(es.text).toMatch(/Su contenido/);
      if (/deleted/.test(en.text)) expect(es.text).toMatch(/no se elimina/);
    }
    expect(formatWhen(d, "America/Los_Angeles", "es")).toBe("15 nov 2026 a las 12:00 a.m. PST");
    expect(remainingPhrase(d, NOW, "es")).toBe("en 3 días");
    expect(remainingPhrase("2026-11-12T09:30:00.000Z", NOW, "es")).toBe("en 1 hora");
    expect(remainingPhrase("2026-11-12T08:40:00.000Z", NOW, "es")).toBe("en menos de una hora");
  });
  it("trial-ended and paused notices follow the subscription state", () => {
    const grace = billingNotices(ROWS.trialGrace, { locale: "es" })[0];
    expect(grace.text).toContain("siguen reproduciendo hasta el");
    const expired = billingNotices(ROWS.expired, { locale: "es" })[0];
    expect(expired.text).toContain("están en pausa");
    const canceled = billingNotices(ROWS.canceled, { locale: "es" })[0];
    expect(canceled.subject).toBe("Sus pantallas de Pekko están en pausa");
    expect(canceled.text).toContain("no está activa");
    expect(canceled.text).not.toMatch(/cancel/i); // English says "not active", not "canceled"
    expect(billingNotices(ROWS.active, { locale: "es" })).toEqual([]);
    for (const row of Object.values(ROWS)) for (const n of billingNotices(row, { locale: "es", enforced: true, transitionEndsAt: "2026-11-20T08:00:00.000Z" })) {
      expect(`${n.subject} ${n.text}`, n.kind).not.toMatch(ES_RULES);
      expect(n.text, n.kind).not.toMatch(/\b(Starter|Business|Multi|\$\d)/); // no plan names or prices
    }
  });
  it("alert emails and pushes keep the screen name exactly as typed", () => {
    const name = 'Barra "Norte" — Taquería';
    const off = emailFor({ kind: "screen.offline", display_name: name, offline_since: "2026-11-12T02:05:00Z", offline_seconds: null }, "America/Los_Angeles", "https://pekkotv.com", "es");
    expect(off.subject).toBe(`Pekko: "${name}" está sin conexión`);
    expect(off.text).toContain("11 nov, 6:05 p.m. PST");
    expect(off.text).toContain("https://pekkotv.com/dashboard/displays");
    expect(off.text).toContain("https://pekkotv.com/dashboard/settings");
    const back = emailFor({ kind: "screen.recovered", display_name: name, offline_since: "2026-11-12T02:05:00Z", offline_seconds: 9000 }, "UTC", "https://pekkotv.com", "es");
    expect(back.subject).toBe(`Pekko: "${name}" volvió a estar en línea`);
    expect(back.text).toContain("2,5 h");
    for (const t of [off.subject, off.text, back.subject, back.text]) expect(t).not.toMatch(ES_RULES);
    const p = pushFor({ id: "a1", kind: "screen.offline", display_id: "d1", display_name: name }, "es");
    expect(p.title).toBe(`"${name}" está sin conexión`);
    expect(p.data).toEqual(pushFor({ id: "a1", kind: "screen.offline", display_id: "d1", display_name: name }).data);
    const pb = pushFor({ id: "a2", kind: "screen.recovered", display_id: "d1", display_name: name }, "es");
    expect(pb.title).toBe(`"${name}" volvió a estar en línea`);
  });
  it("the welcome email has the same steps and links", () => {
    const es = welcomeMessage("o@x.test", "https://pekkotv.com", "es");
    expect(es.to).toBe("o@x.test");
    expect(es.text).toContain("pekkotv.com/tv");
    expect(es.text).toContain("https://pekkotv.com/dashboard");
    expect(es.text).toContain("Mis pantallas");
    expect(es.text).toContain("Agregar pantalla");
    expect(es.text).not.toMatch(ES_RULES);
  });
});

describe("I18N-4: ES payment-grace wording (Gother review)", () => {
  it("uses 'periodo de gracia para el pago' and 'antes de entonces' (the deadline includes a time)", () => {
    const d = "2026-11-15T08:00:00.000Z";
    for (const k of ["grace_ending_2", "grace_ending_1"] as const) {
      const t = billingTemplate(k, d, { now: NOW, tz: "America/Mexico_City", locale: "es" });
      const s = JSON.stringify(t);
      expect(s).toContain("Su periodo de gracia para el pago termina el ");
      expect(s).toContain("Actualice su método de pago antes de entonces. Su contenido no se elimina.");
      expect(s).not.toMatch(/período de gracia del pago|antes de esa fecha/);
    }
  });
});
