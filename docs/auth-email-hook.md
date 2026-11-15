# I18N-5: Supabase auth emails in each account's language (Send Email Hook)

Status: **code only. The hook is NOT enabled.** Supabase keeps sending auth emails through its
custom SMTP (Resend) exactly as today until someone enables the hook in the dashboard, after
Gother's review and QA's EN/ES reset tests. Nothing in this PR changes Supabase settings, SMTP,
keys, rate limits or the Resend account.

## 1. Current setup (inspected read-only, Nov 14 2026, 11:55 PM PST)

| What | Today |
| --- | --- |
| Sending | Supabase Auth → custom SMTP → Resend (account with the verified `pekkotv.com` domain, us-east-1, open/click tracking off). |
| Sender | `"Pekko" <no-reply@pekkotv.com>` (From header of delivered auth emails in Resend). |
| Site URL / Redirect URLs | `https://pekkotv.com`; `https://pantalla-teamtegrate.vercel.app/dashboard`, `https://pekkotv.com/**`, `https://www.pekkotv.com/**` (recorded at 3:27 PM PST). |
| Confirm email | OFF (E4). Sign-ups log in immediately, so no sign-up confirmation emails go out. |
| Change email | No UI exists (U2-06 proposal), so no email-change emails go out from the app. |
| Magic link / Invite / Reauthentication | Not used by the web or Android apps. `/auth/confirm` refuses those link types. |

### Templates (Authentication → Emails → Templates)

| Template | Subject | Link | Source |
| --- | --- | --- | --- |
| Reset Password | `Reset your Pekko password` | `https://pekkotv.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (B2-07 branded) | Changed at ~3:28 PM PST Nov 14 (docs/auth-email-templates.md §1). Confirmed in the delivered email of 5:43 PM PST. |
| Confirm signup | `Confirm your email address` | `{{ .ConfirmationURL }}` | Supabase default, recorded in `/home/box/pekko-qa/auth-templates-before.md`. B2-07 step 5 (branded link) was not applied. |
| Change Email Address | `Confirm your new email address` | `{{ .ConfirmationURL }}` | Supabase default, recorded the same way. |
| Magic link, Invite user, Reauthentication | Supabase defaults | `{{ .ConfirmationURL }}` / `{{ .Token }}` | Not recorded. **Copy them before enabling** (runbook step 2). |

`{{ .ConfirmationURL }}` renders as
`https://iybmjtkjfxcqupvhoddh.supabase.co/auth/v1/verify?token=<token_hash>&type=<type>&redirect_to=<redirect>`
with `&` written as `&amp;` in the href (seen in the delivered default reset email of 1:34 PM PST).

### Which auth emails actually go out today

Auth logs and Resend for the last 24 h show only **password reset** emails (`/recover`). Sign-ups log
in directly (`immediate_login_after_signup`), and there were no email-change, magic-link, invite or
reauthentication sends.

## 2. What the hook does

Endpoint: `POST https://pekkotv.com/api/webhooks/supabase-send-email` (Next route, Node runtime).

- Verifies the Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`,
  5-minute tolerance) with `SUPABASE_SEND_EMAIL_HOOK_SECRET`. Bad or missing signature → 401, nothing read or sent.
- Renders recovery, signup (and `email`), email_change (one or two emails, using Supabase's reversed
  `token_hash`/`token_hash_new` mapping), magiclink, invite and reauthentication.
- Language: `accounts.locale` of the account where `owner_user_id = user.id`. Exactly `es` → Spanish.
  NULL, `en`, any other value, no account yet (e.g. a brand-new sign-up), a read error, or a read slower
  than 1 s → English. The lookup never decides whether an email is sent.
- English output = today's templates: same subject, same HTML, same link and token_hash
  (tests compare against a delivered email). Spanish uses usted and the glossary, with the same links.
- Sends with the existing `RESEND_API_KEY` from `Pekko <no-reply@pekkotv.com>`, HTML only (as SMTP does).
  `Idempotency-Key: supabase-auth/<webhook-id>/<n>`, so a Supabase retry can't send a second copy.
- Fail safe: a Resend error, a timeout (3 s), an unknown email type (for example security notification
  emails) or an incomplete payload returns a JSON error (500). Supabase then fails the request and
  reports it, so the user sees an error instead of waiting for an email that never comes.
- No rate limiting of its own: Supabase checks its email rate limit and the 60 s per-user cooldown
  before calling the hook, and those settings stay as they are.
- Logs only the type, language and outcome. Never the address, token or token_hash.

## 3. Runbook: enabling (manual, after Gother's GO and QA's EN/ES tests)

Order matters: env first, then the hook. Each step can be undone on its own.

1. **Env var (Vercel, project `pantalla`, Production only).** Add `SUPABASE_SEND_EMAIL_HOOK_SECRET`
   with the value Supabase generates in step 3 (format `v1,whsec_…`). `RESEND_API_KEY` and
   `NEXT_PUBLIC_SUPABASE_URL` already exist and are reused. Redeploy (or wait for the next deploy) so the
   route sees it. Never paste the secret in chat, tickets or logs.
   *Practical order:* open step 3 first to generate the secret, add it in Vercel, redeploy, then come back
   and press Enable/Save in step 3.
2. **Rollback copies.** In Authentication → Emails → Templates, copy the Subject and Body of all six
   templates (Confirm signup, Invite user, Magic link, Change Email Address, Reset Password,
   Reauthentication) into `/home/box/pekko-qa/auth-templates-before-i18n5.md`. Compare Magic link,
   Invite and Reauthentication with `lib/server/auth-email/templates.ts`. If any subject or body differs,
   stop and update the EN template first (a small PR). Also note the values on Authentication → Rate Limits
   and confirm "Secure email change" and security notification emails (Authentication → Emails →
   Notifications) are as expected. If notification emails are ON, keep the hook off: it refuses them.
3. **Enable the hook.** Authentication → Hooks (Auth Hooks) → **Send Email hook** → Add hook →
   type **HTTPS** → URL `https://pekkotv.com/api/webhooks/supabase-send-email` → **Generate secret**
   (copy it into Vercel per step 1) → Enable → Save. Leave SMTP settings untouched; Supabase stops using
   SMTP while the hook is on and uses it again when the hook is off.
4. **Smoke test right away** with QA's English account (QA plan below, test 1). If it fails, roll back (section 5).

## 4. QA test plan (QA accounts only; no customer accounts)

Before enabling (preview or production, hook off):
- 0a. `POST /api/webhooks/supabase-send-email` without signature headers → 401 JSON, no email.
- 0b. Previews in `/home/box/pekko-qa/qa1-fixes/previews-i18n5/`: check the EN and ES text.

After enabling:
1. **EN reset.** Account with `locale` NULL or `en` (Harbor): Forgot password on pekkotv.com.
   The email comes from `Pekko <no-reply@pekkotv.com>`, subject `Reset your Pekko password`, body
   identical to before, and the link starts with `https://pekkotv.com/auth/confirm?token_hash=` and ends
   with `&type=recovery`. Press Continue → /reset-password → set password → "Password updated" → sign in.
   Reusing the link → "expired or already used".
2. **ES reset.** Switch the QA account to Español in Settings (`accounts.locale = es`), repeat.
   Subject `Restablezca su contraseña de Pekko`, Spanish body, same kind of link, same flow. Switch back afterwards.
3. **Unknown email.** Forgot password for an address with no account → same "sent" screen, no email
   (Supabase doesn't call the hook).
4. **Cooldown/rate limit unchanged.** Two requests for the same account within 60 s → the second gets
   Supabase's wait error, and only one email arrives.
5. **Logs.** Vercel logs show `auth-email-hook sent type=recovery locale=en|es count=1` and no address or token.
   Supabase auth logs show the hook call succeeded.
6. Signup, email change, magic link, invite and reauthentication can't be triggered from the apps today
   (Confirm email off, no change-email UI). They're covered by unit tests and previews only.

## 5. Rollback

1. Authentication → Hooks → Send Email hook → **Disable** (or delete). Supabase goes back to the custom
   SMTP (Resend) and the dashboard templates right away. No deploy is needed. Templates and SMTP were never changed.
2. Optional: remove `SUPABASE_SEND_EMAIL_HOOK_SECRET` from Vercel. With it unset, the route answers 500
   and sends nothing.
3. Code rollback, if ever needed: redeploy the previous production deployment. The route is inert while the hook is off.
