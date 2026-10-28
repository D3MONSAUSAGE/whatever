# Recovery

Use this when a TV, a login, or a deploy stops behaving. None of these steps need a code change unless a key was leaked.

## TV shows a pairing code again

The player drops back to a code when its display token is rejected. That happens when:

- someone pressed **Disconnect** on that display
- the TV's browser storage was cleared
- the display row was removed from the database

The dashboard entry, if it is still listed, will not update the TV. Disconnect it if it is still there, then enter the new code and publish the image again. The old token cannot be revived.

## TV stays on the last image

That is the reconnect path. A failed poll does not clear the picture. "Reconnecting..." sits along the bottom until a poll succeeds.

Check, in order:

1. The TV has a route to the internet. Phone hotspot is a useful test.
2. The dashboard shows the display as offline (no poll in the last 60 seconds).
3. After the network returns, wait about 15 seconds. The next poll picks up a new version.
4. If the page itself is an old cached copy, reload `/player` once. The response is sent with `Cache-Control: no-cache, must-revalidate`.

A broken image URL also keeps the last picture. The following poll asks for a fresh signed URL.

## TV never leaves "Connecting..." or the code

- `/player` did not load: certificate error, captive portal, or the URL is a dead preview deployment. Use the production origin.
- The code request returns 429: that IP asked for more than 30 codes in an hour. Wait, or reload after the hour. Disconnecting and repairing does not need a new code more than a few times.
- The code is right but the dashboard says it does not match: the code expired (10 minutes) or was already used. Read the new code on the TV.
- "Too many attempts" on the phone: 10 code attempts per account and 30 per IP, each 15 minutes. Wrong codes and successful connects both count. A blank or short code does not. Wait 15 minutes. This is stored in `rate_limits`, not in memory, so a new Vercel instance does not reset it.

## "No content assigned"

The display is paired and the current version has no image. Publish one, or the image was deleted. Deleting an image clears every TV that was showing it and bumps their version, so they leave the picture on purpose.

## Login

- **Check your email:** Confirm email is on. Open the link, or turn confirmation off for a test project (Authentication → Providers → Email).
- **Invalid login credentials:** reset the password from the Supabase dashboard (Authentication → Users), or sign up a new address.
- **Redirect lands in the wrong place:** Site URL and Redirect URLs must include `https://YOUR-APP.vercel.app/dashboard` and, for local work, `http://localhost:3000/dashboard`.
- **Banner says Supabase is not configured:** the Vercel build did not have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Add them and redeploy. They are baked in at build time.
- **API says sign in, but the page looks logged in:** the access token was rejected. Sign out and sign in again.

## Uploads

- The phone refuses the file before upload when it is not a JPG, PNG, or WebP, is over 15 MB, or is still over about 4 MB after it is resized to JPEG. Export the menu at 1920×1080.
- The server returns 415 when the bytes are not a real JPG, PNG, or WebP, or when the dimensions are above 7680×4320. Renaming a PDF to `.jpg` does not pass.
- On Vercel the platform rejects request bodies around 4.5 MB before the route runs. The phone resize exists so a normal upload stays under that. A direct API call with a larger file can fail at the platform even though the app's own limit is 15 MB.

## Keys

| What you rotate | What keeps working | What you must do |
| --- | --- | --- |
| `PAIRING_CODE_SECRET` | TVs that already have a display token. Tokens are SHA-256, not HMAC. | Update the Vercel env var and redeploy. Codes on screen that have not been entered yet stop matching. Those TVs will show a new code on their own within 10 minutes, or reload `/player`. |
| Supabase secret / service role | Display tokens and user passwords. | Put the new key in `SUPABASE_SERVICE_ROLE_KEY` and redeploy. Treat the old key as public until it is revoked. |
| Publishable / anon key | Server routes, once the new key is deployed. | Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` and redeploy. Users sign in again. Paired TVs are unaffected. |
| Supabase project | Nothing. This is a new database. | Run the migration, set every env var, redeploy, pair the TVs again. |

If a secret key or `PAIRING_CODE_SECRET` was committed or pasted into a client, rotate it. The publishable key is not a secret.

## Database

- Do not run `0001_init.sql` a second time on a project that already has the tables. Restore from a Supabase backup instead of replaying the migration over live data.
- A backup restore brings tokens back with the rows. TVs that still have the matching token in `localStorage` reconnect. TVs whose storage was cleared need a new code.
- Storage files are not inside the SQL backup. If you restore the database without the objects, publish the images again. The player will show "No content assigned" or keep the last picture until the new version arrives.
- To drop a test project, delete it in the Supabase dashboard. There is no production data to merge.

## Vercel

- A bad deploy: Vercel → Deployments → the last good one → Promote, or `Redeploy`.
- The player is static. If a TV is running an old script, reload `/player`. Pairing state is in `localStorage`, so a reload does not unpair it.
- Logs for `/api/player/state` and `/api/displays/pair` are in the Vercel function logs. 401 on the player means the token is revoked or unknown. 429 means the rate limit. 503 on state means the signed URL could not be created; the TV keeps its picture and retries.

## Still stuck

Sign in on the phone, open Displays, and note whether the TV is "Waiting for the TV to finish connecting", "Online", or "Offline". Then reload `/player` and note which full-screen message you get: the code, "Connecting...", "No content assigned", or the picture plus "Reconnecting...". Those four states are enough to tell pairing, network, and content apart.
