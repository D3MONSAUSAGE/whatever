# Local Layout Studio check

This runs on a disposable database created by the test and then dropped. It does not use a production URL, a service-role key, or a customer record. It is not a production setup, and it does not turn `LAYOUT_STUDIO` on.

## What you need

- PostgreSQL listening on the local socket. The test connects with `sudo -u postgres psql`. It refuses to run if `inet_server_addr()` is not null.
- Node and this repository's dependencies (`npm install`).
- No Docker, no Supabase CLI, and no account keys.

## Run

```bash
npx vitest run tests/pg/layout-studio-sql.test.ts
```

The test reads `menu_create_playlist` and `menu_swap_media` from `supabase/migrations/0007_menu_boards.sql` and executes that text. It writes the photo and the rendered PNG under a temporary directory and deletes that directory afterward.

The flow is: refuse another account's video, save a draft without creating a playlist, reload the board, render the PNG from the stored photo bytes, create the playlist with the migration function, and build the player composition from the library video path. That path is not the bundled demo clip.

## What this machine cannot run

The official Supabase local stack (`supabase start`) needs Docker. Docker is not available here, so GoTrue, the Storage API, and PostgREST are not started.

Because of that, these boundaries stay out of this run:

- `requireAdmin` does not call Supabase Auth. A bearer token is not verified.
- `POST /api/media` does not call Storage. The test writes the file itself and inserts the `media` row.
- Row Level Security policies that call `auth.uid()` are not installed. The functions are executed as the local Postgres superuser.
- The public preview at `/layout-studio` still does not sign in.

An in-memory route test (`tests/api/layout-studio-account.test.ts`) checks the HTTP handler's account and flag rules. That client is not Auth and not Storage. Do not treat either test as a production deployment.
