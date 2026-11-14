# Supabase auth email templates for branded links (B2-07 option A)

Where to change them: Supabase dashboard, project `iybmjtkjfxcqupvhoddh`, then **Authentication → Emails → Templates**.

Sending stays as it is today: custom SMTP through Resend, with no change to SMTP settings. Only the link inside each template changes.

## Before changing anything (rollback)

1. Copy the current **Subject** and **Body** of each of the three templates below into a safe place, for example `/home/box/pekko-qa/auth-templates-before.md`. These copies are the rollback. Pasting them back undoes the change right away. No deploy is needed.
2. Ship and verify the PR first. `/auth/confirm` must return 200 on pekkotv.com before any template points at it.

The links use `https://pekkotv.com` directly instead of `{{ .SiteURL }}`, so they work whatever the Site URL is set to.

The page confirms nothing until the person presses its button. Email link scanners that open the link therefore can't use it up.

---

## Exact dashboard steps (in this order)

1. Open https://supabase.com/dashboard/project/iybmjtkjfxcqupvhoddh/auth/templates (Authentication → Emails → Templates).
2. **Rollback copy first.** For **Reset Password**, **Confirm signup** and **Change Email Address**, copy the current **Subject heading** and the full **Message body** (switch to the source/HTML view) into `/home/box/pekko-qa/auth-templates-before.md`, one section per template. Don't change anything yet.
3. Open **Reset Password**. Replace the Subject and the Message body with section 1 below, then **Save**.
4. Ask QA Captain to run the end-to-end reset check below on the QA account. If anything fails, paste the saved Reset Password subject and body back and Save. That's the full rollback, and it needs no deploy.
5. Only after step 4 passes: replace **Confirm signup** (section 2) and **Change Email Address** (section 3) the same way, and Save each.
6. Leave alone: SMTP settings, "Confirm email" (stays off), Site URL, Redirect URLs, and the Magic link, Invite and Reauthentication templates.

## 1. Reset password ("Reset Password" template)

**Subject:** `Reset your Pekko password`

**Body (HTML):**

```html
<h2>Reset your Pekko password</h2>
<p>We got a request to reset the password for your Pekko account.</p>
<p><a href="https://pekkotv.com/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset my password</a></p>
<p>This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email and your password stays the same.</p>
<p>— Pekko · pekkotv.com</p>
```

## 2. Confirm sign-up ("Confirm signup" template)

Used only once "Confirm email" is turned on (E4). Until then nobody receives this email, but it's safe to update now.

**Subject:** `Confirm your email for Pekko`

**Body (HTML):**

```html
<h2>Confirm your email</h2>
<p>Thanks for signing up for Pekko. Confirm your email to start setting up your screens.</p>
<p><a href="https://pekkotv.com/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}">Confirm my email</a></p>
<p>If you didn't create a Pekko account, you can ignore this email.</p>
<p>— Pekko · pekkotv.com</p>
```

`next={{ .RedirectTo }}` passes along the app's `emailRedirectTo`. The page only follows it to a `/dashboard…` path on pekkotv.com. Android +13's `https://pantalla-chi.vercel.app/dashboard` becomes `/dashboard` on pekkotv.com. Anything else falls back to `/dashboard`.

## 3. Change email address ("Change Email Address" template)

**Subject:** `Confirm your new email for Pekko`

**Body (HTML):**

```html
<h2>Confirm your new email</h2>
<p>Someone asked to change the sign-in email on your Pekko account from {{ .Email }} to {{ .NewEmail }}.</p>
<p><a href="https://pekkotv.com/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm email change</a></p>
<p>If you didn't ask for this, don't press the link, and reply to this email.</p>
<p>— Pekko · pekkotv.com</p>
```

Leave the other templates (Magic link, Invite user, Reauthentication) unchanged. The web app doesn't send them, and `/auth/confirm` refuses those link types.

## Redirect URLs allowlist (Authentication → URL Configuration)

No change is needed for these templates, because the link no longer goes through `/auth/v1/verify`'s `redirect_to`.

For E4, before "Confirm email" is turned on, check two things:
- The Site URL is `https://pekkotv.com`.
- Whether `https://pantalla-chi.vercel.app/**` is on the allowlist.

Either way, after this PR, `pantalla-chi.vercel.app/dashboard` and `/auth/*` send a 307 to pekkotv.com.

## End-to-end check (QA account only)

1. On pekkotv.com, use Forgot password for the QA account.
2. The email link should start with `https://pekkotv.com/auth/confirm?token_hash=`, not `supabase.co`.
3. Open it. You should see "Reset your password" with a "Continue to reset password" button.
4. Press it. You should land on `/reset-password`, set a new password, and see "Password updated".
5. Open the same link again and press the button. You should see "This link has expired or was already used. Ask for a new one."
