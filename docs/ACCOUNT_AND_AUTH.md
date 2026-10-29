# Accounts and password recovery (Milestone 3)

All auth is Supabase Auth. No server routes or database changes were added for it.

## Web pages
| Page | What it does |
| --- | --- |
| `/login` | Sign in or create an account. Has a **Forgot password?** link. |
| `/forgot-password` | Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: "<origin>/reset-password" })`. It always shows "Check your email", so it never reveals whether an account exists. |
| `/reset-password` | Opens from the email link. supabase-js picks up the recovery session (from the implicit `#access_token…&type=recovery` hash, or a PKCE `?code=`). The user picks a new password and the page calls `supabase.auth.updateUser({ password })`. An expired or used link (`#error_description=…`) shows "This link can't be used" with a **Send a new link** button. |
| `/dashboard/settings` | Shows the account email, business name and TV address. Saves the display name to `user_metadata.display_name`. Changes the password after re-checking the current one. Has **Sign out** and **Sign out of all devices** (`signOut({ scope: "global" })`). |

If a recovery link lands on the Site URL instead (for example, the redirect isn't allow-listed), `/login` and the dashboard shell detect `type=recovery` and forward to `/reset-password` with the hash intact.

## Behaviour to know
- Changing the password signs out every other session. Supabase revokes their refresh tokens; this was confirmed locally. The current device stays signed in.
- Sign out of all devices revokes every refresh token, including this one. Access tokens already issued stay valid until they expire (default 1 hour). TVs are unaffected because they use display tokens, not user sessions.
- Display name: `user.user_metadata.display_name` (string, at most 60 characters, may be empty). It's read through `supabase.auth.getUser()`, and `/api/me` doesn't return it.

## Production Supabase Auth settings (dashboard → Authentication → URL Configuration)
- **Site URL:** `https://pantalla-chi.vercel.app`
- **Redirect URLs (allow-list):** add
  - `https://pantalla-chi.vercel.app/reset-password`
  - `https://pantalla-chi.vercel.app/dashboard`
  - optionally `https://pantalla-*-teamtegrate.vercel.app/**` for previews
  - for the native app, its deep link, e.g. `seemple://reset-password`
- The Supabase MCP connector cannot read or change these settings, so they have to be set in the dashboard or through the Management API.

## Email limits
- The built-in Supabase email sender is for testing only. It sends a small number of auth emails per hour per project, about 2 to 4 depending on the plan default (`rate_limit_email_sent`), only to addresses on the project's team unless custom SMTP is configured, and with a 60-second per-user resend cooldown.
- For real customers, configure custom SMTP (for example Resend, Postmark or SES; some have free tiers) under Authentication → SMTP. That's an account and credential step for the owner.
- The forgot-password page turns rate-limit errors into "Too many emails were sent recently. Wait a few minutes, then try again."

## Native app (Gother)
- Request a reset: `supabase.auth.resetPasswordForEmail(email, redirectTo: "seemple://reset-password")`. The deep link must be in the allow-list. To send users to the web instead, use `https://pantalla-chi.vercel.app/reset-password`.
- On the deep link, Supabase Flutter emits `AuthChangeEvent.passwordRecovery`. Show the new-password screen and call `updateUser(UserAttributes(password: …))`.
- Display name: `updateUser(UserAttributes(data: {"display_name": name}))`.
- Sign out everywhere: `signOut(scope: SignOutScope.global)`.
