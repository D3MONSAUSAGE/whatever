import { db } from "./supabase";
import { sendTransactionalEmail, supabaseNoticeLedger, type NoticeLedger, type SendResult } from "./transactional-email";
import type { EmailMessage } from "./email";
import { notificationLocale } from "./notification-locale";
import type { Locale } from "@/lib/i18n/locales";

/**
 * E4: one welcome email per account, sent the first time a new owner's dashboard loads setup progress
 * (GET /api/onboarding). Not wired into auth.
 *
 * Off unless WELCOME_EMAIL=on. Confirm email is off today, so an address isn't proven yet and a sign-up
 * with someone else's address could otherwise send them this email. Turn it on together with Confirm email (E7).
 * Even when on, it sends only when:
 *   - the owner's email is confirmed (email_confirmed_at is set),
 *   - the account was created on or after WELCOME_EMAIL_SINCE (ISO time, default: never), so existing
 *     customers never get a "welcome" when this is switched on, and within the last 7 days,
 *   - the "welcome:<accountId>" key was never claimed in billing_notices (one send, ever).
 */
export const WELCOME_KIND = "welcome";
export const WELCOME_WINDOW_MS = 7 * 24 * 3_600_000;

export function welcomeKey(accountId: string): string {
  return `welcome:${accountId}`;
}

export function welcomeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.WELCOME_EMAIL || "").toLowerCase() === "on";
}

/** The earliest account creation time that gets a welcome. Unset or invalid means nobody does. */
export function welcomeSince(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env.WELCOME_EMAIL_SINCE || "";
  const at = Date.parse(raw);
  return raw && Number.isFinite(at) ? at : null;
}

export function welcomeMessage(to: string, origin = "https://pekkotv.com", locale: Locale = "en"): EmailMessage {
  if (locale === "es") return welcomeMessageEs(to, origin);
  return {
    to,
    subject: "Welcome to Pekko",
    text: [
      "Hi,",
      "",
      "Thanks for creating your Pekko account. To get your first screen playing:",
      "",
      `1. On the TV, open ${origin.replace(/^https:\/\//, "")}/tv. It shows a 6-digit code.`,
      "2. In Pekko, open My Screens, choose Add screen and enter that code.",
      "3. Upload a photo, video or menu and publish it to the screen.",
      "",
      `Open your dashboard: ${origin}/dashboard`,
      "",
      "You're getting this one-time email because you just created a Pekko account with this address.",
      "",
      "Pekko",
    ].join("\n"),
  };
}

/** I18N-4: Spanish welcome. Same steps, links and one-time notice as English. */
function welcomeMessageEs(to: string, origin: string): EmailMessage {
  return {
    to,
    subject: "Le damos la bienvenida a Pekko",
    text: [
      "Hola:",
      "",
      "Gracias por crear su cuenta de Pekko. Para que su primera pantalla empiece a reproducir:",
      "",
      `1. En la TV, abra ${origin.replace(/^https:\/\//, "")}/tv. Mostrará un código de 6 dígitos.`,
      "2. En Pekko, abra Mis pantallas, elija Agregar pantalla y escriba ese código.",
      "3. Suba una foto, un video o un menú y publíquelo en la pantalla.",
      "",
      `Abra su panel: ${origin}/dashboard`,
      "",
      "Recibe este correo único porque acaba de crear una cuenta de Pekko con esta dirección.",
      "",
      "Pekko",
    ].join("\n"),
  };
}

export type WelcomeDeps = {
  env?: Record<string, string | undefined>;
  ledger?: NoticeLedger;
  now?: () => number;
  /** Owner's confirmed-at and account created-at. Null when they can't be read. */
  lookup?: (input: { userId: string; accountId: string }) => Promise<{ emailConfirmedAt: string | null; accountCreatedAt: string | null } | null>;
  send?: typeof sendTransactionalEmail;
  log?: (line: string) => void;
  /** I18N-4: accounts.locale, read only after every gate passed. Copy language only. */
  locale?: (accountId: string) => Promise<Locale>;
};

export type WelcomeOutcome = "disabled" | "no-email" | "already" | "unconfirmed" | "too-old" | "lookup-failed" | SendResult["reason"];

async function defaultLookup({ userId, accountId }: { userId: string; accountId: string }) {
  const [user, account] = await Promise.all([
    db().auth.admin.getUserById(userId),
    db().from("accounts").select("created_at").eq("id", accountId).maybeSingle(),
  ]);
  if (user.error || !user.data?.user || account.error) return null;
  return {
    emailConfirmedAt: user.data.user.email_confirmed_at ?? null,
    accountCreatedAt: (account.data as { created_at?: string } | null)?.created_at ?? null,
  };
}

/** Never throws. Callers don't wait on it for their response. */
export async function maybeSendWelcome(
  admin: { userId: string; accountId: string; email: string },
  deps: WelcomeDeps = {},
): Promise<WelcomeOutcome> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.info(line));
  try {
    if (!welcomeEnabled(env)) return "disabled";
    if (!admin.email) return "no-email";
    const since = welcomeSince(env);
    if (since === null) return "too-old";
    const ledger = deps.ledger ?? supabaseNoticeLedger();
    const key = welcomeKey(admin.accountId);
    if (await ledger.has(key)) return "already";
    const facts = await (deps.lookup ?? defaultLookup)({ userId: admin.userId, accountId: admin.accountId });
    if (!facts) return "lookup-failed";
    if (!facts.emailConfirmedAt) return "unconfirmed";
    const created = Date.parse(facts.accountCreatedAt ?? "");
    const now = (deps.now ?? Date.now)();
    if (!Number.isFinite(created) || created < since || now - created > WELCOME_WINDOW_MS) return "too-old";
    const locale = await (deps.locale ?? notificationLocale)(admin.accountId);
    const result = await (deps.send ?? sendTransactionalEmail)({
      idempotencyKey: key,
      accountId: admin.accountId,
      kind: WELCOME_KIND,
      message: welcomeMessage(admin.email, undefined, locale),
      env,
      ledger,
      log,
    });
    if (result.reason === "failed") log("welcome-email failed");
    return result.reason;
  } catch {
    log("welcome-email error");
    return "lookup-failed";
  }
}
