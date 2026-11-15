/**
 * I18N-5: Supabase Auth emails rendered by the Send Email Hook.
 *
 * English reproduces the templates that are live in the Supabase dashboard today (see
 * docs/auth-email-hook.md, "Current setup"): same subject, same HTML, same link, same token_hash.
 * Recovery uses the branded B2-07 link; the other types still use Supabase's own
 * {{ .ConfirmationURL }} (…/auth/v1/verify?token=…&type=…&redirect_to=…).
 * Spanish uses usted and the I18N glossary. Customer content is never translated.
 *
 * Escaping mirrors Go html/template (what Supabase renders with): data in text is HTML-escaped,
 * a URL inserted into href is normalized and then attribute-escaped (& becomes &amp;), and
 * literal template text is copied as written.
 */
import type { Locale } from "@/lib/i18n/locales";

export const AUTH_EMAIL_FROM = "Pekko <no-reply@pekkotv.com>";
export const BRANDED_CONFIRM_BASE = "https://pekkotv.com/auth/confirm";

/** Email action types this hook renders. Anything else is refused with an error (never dropped). */
export const AUTH_EMAIL_TYPES = ["recovery", "signup", "email", "email_change", "magiclink", "invite", "reauthentication"] as const;
export type AuthEmailType = (typeof AUTH_EMAIL_TYPES)[number];
export const isAuthEmailType = (v: unknown): v is AuthEmailType => (AUTH_EMAIL_TYPES as readonly unknown[]).includes(v);

/** Go html/template text escaping. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&#34;").replace(/'/g, "&#39;");
}

/** Go html/template for a whole URL placed in an href: normalize, then attribute-escape. */
export function escapeHrefUrl(url: string): string {
  const normalized = Array.from(url).map((ch) => (/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(ch) ? ch : encodeURIComponent(ch))).join("");
  return normalized.replace(/&/g, "&amp;").replace(/"/g, "&#34;").replace(/'/g, "&#39;");
}

/** Go html/template for a value inside a URL query in a literal href (query-escaped). */
export function escapeQueryValue(v: string): string {
  return encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export type LinkInput = {
  type: AuthEmailType;
  tokenHash: string;
  redirectTo: string;
  siteUrl: string;
  /** Supabase project URL, e.g. https://<ref>.supabase.co */
  supabaseUrl: string;
};

/** Supabase's {{ .ConfirmationURL }}: …/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<redirect>. */
export function supabaseConfirmationUrl(i: LinkInput): string {
  const redirect = i.redirectTo || i.siteUrl;
  return `${i.supabaseUrl.replace(/\/+$/, "")}/auth/v1/verify?token=${i.tokenHash}&type=${i.type}&redirect_to=${redirect}`;
}

/** The B2-07 branded link used by the live Reset Password template (href already escaped). */
export function brandedRecoveryHref(tokenHash: string): string {
  return `${BRANDED_CONFIRM_BASE}?token_hash=${escapeQueryValue(tokenHash)}&type=recovery`;
}

export type RenderInput = LinkInput & { locale: Locale; email: string; newEmail: string; token: string };
export type Rendered = { subject: string; html: string };

type Copy = { subject: string; html: (href: string, v: { email: string; newEmail: string; token: string }) => string };

/** Href for this type: recovery is branded; the rest are Supabase's ConfirmationURL (as live today). */
export function hrefFor(i: LinkInput): string {
  return i.type === "recovery" ? brandedRecoveryHref(i.tokenHash) : escapeHrefUrl(supabaseConfirmationUrl(i));
}

const EN: Record<AuthEmailType, Copy> = {
  // Live since 3:28 PM PST Nov 14 (docs/auth-email-templates.md section 1), verified in a delivered email.
  recovery: {
    subject: "Reset your Pekko password",
    html: (href) => `<h2>Reset your Pekko password</h2>
<p>We got a request to reset the password for your Pekko account.</p>
<p><a href="${href}">Reset my password</a></p>
<p>This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same.</p>
<p>— Pekko · pekkotv.com</p>
`,
  },
  // Supabase default "Confirm signup" (recorded in auth-templates-before.md; not changed since).
  signup: {
    subject: "Confirm your email address",
    html: (href) => `<h2>Confirm your email address</h2>

<p>Follow the link below to confirm this email address and finish signing up.</p>
<p><a href="${href}">Confirm email address</a></p>
`,
  },
  email: { subject: "", html: () => "" }, // replaced below: same template as signup
  // Supabase default "Change Email Address" (recorded; not changed since).
  email_change: {
    subject: "Confirm your new email address",
    html: (href, v) => `<h2>Confirm your new email address</h2>

<p>Follow the link below to confirm ${escapeHtml(v.newEmail)} as your new email address.</p>
<p><a href="${href}">Confirm new email address</a></p>

<p>If you didn't request this change, you can safely ignore this email.</p>
`,
  },
  // Supabase defaults for templates the web app never triggers. NOT yet compared with the dashboard:
  // the runbook makes that comparison a precondition for enabling the hook.
  magiclink: {
    subject: "Your sign-in link",
    html: (href) => `<h2>Your sign-in link</h2>

<p>Follow the link below to sign in. This link expires shortly and can only be used once.</p>
<p><a href="${href}">Sign in</a></p>
`,
  },
  invite: {
    subject: "You've been invited",
    html: (href) => `<h2>You've been invited</h2>

<p>You've been invited to create an account. Follow the link below to accept.</p>
<p><a href="${href}">Accept invitation</a></p>
`,
  },
  reauthentication: {
    subject: "{{token}} is your verification code",
    html: (_href, v) => `<h2>Your verification code</h2>

<p>Use the code below to verify your identity. It expires shortly.</p>
<p>${escapeHtml(v.token)}</p>
`,
  },
};
EN.email = EN.signup;

const ES: Record<AuthEmailType, Copy> = {
  recovery: {
    subject: "Restablezca su contraseña de Pekko",
    html: (href) => `<h2>Restablezca su contraseña de Pekko</h2>
<p>Recibimos una solicitud para restablecer la contraseña de su cuenta de Pekko.</p>
<p><a href="${href}">Restablecer mi contraseña</a></p>
<p>Este enlace funciona una sola vez y vence en una hora. Si usted no lo solicitó, puede ignorar este correo y su contraseña seguirá igual.</p>
<p>— Pekko · pekkotv.com</p>
`,
  },
  signup: {
    subject: "Confirme su dirección de correo electrónico",
    html: (href) => `<h2>Confirme su dirección de correo electrónico</h2>

<p>Siga el enlace de abajo para confirmar esta dirección de correo electrónico y terminar de registrarse.</p>
<p><a href="${href}">Confirmar dirección de correo electrónico</a></p>
`,
  },
  email: { subject: "", html: () => "" },
  email_change: {
    subject: "Confirme su nueva dirección de correo electrónico",
    html: (href, v) => `<h2>Confirme su nueva dirección de correo electrónico</h2>

<p>Siga el enlace de abajo para confirmar ${escapeHtml(v.newEmail)} como su nueva dirección de correo electrónico.</p>
<p><a href="${href}">Confirmar nueva dirección de correo electrónico</a></p>

<p>Si usted no solicitó este cambio, puede ignorar este correo.</p>
`,
  },
  magiclink: {
    subject: "Su enlace para iniciar sesión",
    html: (href) => `<h2>Su enlace para iniciar sesión</h2>

<p>Siga el enlace de abajo para iniciar sesión. Este enlace vence pronto y solo se puede usar una vez.</p>
<p><a href="${href}">Iniciar sesión</a></p>
`,
  },
  invite: {
    subject: "Recibió una invitación",
    html: (href) => `<h2>Recibió una invitación</h2>

<p>Recibió una invitación para crear una cuenta. Siga el enlace de abajo para aceptarla.</p>
<p><a href="${href}">Aceptar la invitación</a></p>
`,
  },
  reauthentication: {
    subject: "{{token}} es su código de verificación",
    html: (_href, v) => `<h2>Su código de verificación</h2>

<p>Use el código de abajo para verificar su identidad. Vence pronto.</p>
<p>${escapeHtml(v.token)}</p>
`,
  },
};
ES.email = ES.signup;

export function renderAuthEmail(i: RenderInput): Rendered {
  const copy = (i.locale === "es" ? ES : EN)[i.type];
  const href = hrefFor(i);
  return {
    subject: copy.subject.replace("{{token}}", i.token),
    html: copy.html(href, { email: i.email, newEmail: i.newEmail, token: i.token }),
  };
}
