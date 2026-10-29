# Setup

Pantalla needs one Supabase project and one Vercel project. Nothing is shared with any other app. Do not commit `.env`, `.env.local`, or a service key.

## 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. Open the SQL Editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) once. It creates the tables, row-level security, the private `media` bucket, and the server-only functions. Running it twice fails with "relation already exists". That is expected. See [RECOVERY.md](RECOVERY.md).
3. For playlists, run [`supabase/migrations/0002_playlists.sql`](supabase/migrations/0002_playlists.sql) once after that. Until it is applied, sign-in, pairing, and single-image publishing keep working, and the Playlists page says the migration is missing. Rollback steps are in [docs/PHASE_2A_PLAN.md](docs/PHASE_2A_PLAN.md).
4. In **Authentication → URL Configuration**:
   - **Site URL:** `https://YOUR-APP.vercel.app` (use `http://localhost:3000` while you are only developing locally).
   - **Redirect URLs:** add each of these that you use:
     - `http://localhost:3000/dashboard`
     - `https://YOUR-APP.vercel.app/dashboard`
5. For the first TV test and for `npm run test:e2e`, open **Authentication → Providers → Email** and turn **Confirm email** off. You can turn it back on later. With it on, sign-up shows "Check your email" and does not create a session until the link is opened.
6. In **Project Settings → API keys**, copy:
   - the project URL
   - the **publishable** key (`sb_publishable_...`), or the legacy `anon` key if the project has not created new keys yet
   - a **secret** key (`sb_secret_...`), or the legacy `service_role` key

The publishable key and the legacy anon key are public by design. The secret key and the legacy service role key bypass row-level security. They stay on the server.

Legacy anon and service_role keys work until the end of 2026. Prefer the publishable and secret keys on a new project. Both key styles are passed to `createClient` the same way. See [Supabase's key migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## 2. Local

```bash
cp .env.example .env.local
# fill in the four values
# PAIRING_CODE_SECRET: openssl rand -hex 32
npm install
npm run dev
```

Dashboard: `http://localhost:3000`. Player: `http://localhost:3000/player`.

## 3. Vercel

Import the GitHub repo as a Next.js app. Set the variables below for Production (and Preview, if you use preview URLs). The two `NEXT_PUBLIC_` values are copied into the browser bundle **at build time**. If you add or change them, redeploy.

`npm run build` succeeds without these variables. Sign-in will not work until they are present at build time.

### Env vars

| Name | Public? | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes, it is in the browser | `https://YOUR-PROJECT.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes, it is in the browser | Publishable key (`sb_publishable_...`) or legacy anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **No. Server only.** | Secret key (`sb_secret_...`) or legacy service_role key |
| `PAIRING_CODE_SECRET` | **No. Server only.** | `openssl rand -hex 32` |
| `CRON_SECRET` | **No. Server only.** | `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer`. If unset, `GET /api/cron/orphan-uploads` returns 503 and deletes nothing. |

Do not put the secret key, `PAIRING_CODE_SECRET`, or `CRON_SECRET` in a `NEXT_PUBLIC_` variable. Do not paste them into the TV page, a client component, or git.

After the first deploy, set the Supabase Site URL and redirect URLs to the real Vercel origin, then open `https://YOUR-APP.vercel.app/player` on the TV. Use the production URL on the TV. Preview URLs change.

## 4. Tests that need a live project

```bash
# Against the Supabase project. Skips when these are unset.
# Node 20 needs the websocket flag so the Supabase client can open Realtime.
# Node 22 and later already have it. Without the flag, RLS and e2e cleanup
# fail while creating the client.
NODE_OPTIONS=--experimental-websocket \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run test:rls

# Against the deployed site. Installs nothing until you run it.
npx playwright install chromium
BASE_URL=https://YOUR-APP.vercel.app npm run test:e2e
```

`test:e2e` signs up two users through the UI, so Confirm email must be off and `${BASE_URL}/dashboard` must be a redirect URL. If `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` are also set in that shell, the test deletes the users it created (`pantalla-e2e-...@mailinator.com`).

`npm test` always runs the unit tests, the API tests, and the player simulation. The RLS file is part of that run and skips itself when the Supabase variables are absent.

## 5. What the migration locks down

- Row-level security is on for every table. Authenticated users can read only their own account, locations, media, and displays.
- `displays.token_hash` is not granted to the browser role.
- `pairing_sessions` and `rate_limits` have no grants for `anon` or `authenticated`.
- The functions are not `SECURITY DEFINER`. Execute is granted to `service_role` only, and `search_path` is empty.
- The `media` bucket is private. There is no storage policy for browsers. The server issues signed URLs, which expire after one hour.

The dashboard never reads those tables with the user token. Isolation is still enforced in the API (every query is filtered by account) and in Postgres.
