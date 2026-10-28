# Pantalla

Pantalla puts one menu image on a TV. You upload the image from your phone, type the 6-digit code the TV is showing, and the screen updates over the internet. The phone and the TV do not have to be on the same network.

This is a small standalone app: Next.js on Vercel, Supabase for Postgres, Auth, and private Storage. It does not do billing, video, or scheduling. A playlist is a loop of images.

## How it works

- **Dashboard** (`/dashboard`) is a React app. The browser uses Supabase only to sign in. Every read and write goes through `/api/*`, which checks the user's access token and then uses the server key.
- **TV player** (`/player`) is one static ES5 page (`public/player.html`). It uses `XMLHttpRequest` and CSS `background-size: contain`, so it runs on old Tizen and webOS browsers.
- **Sync.** The TV polls `/api/player/state` every 10 seconds. That poll is also the heartbeat. A signed image URL is issued only when the content version changes. The TV preloads the new image, then paints it on top of the old one. A display is online if it was seen in the last 60 seconds. Heartbeat writes are at most one every 30 seconds. If the network drops, the last image stays up and a "Reconnecting..." line appears.
- **Playlists.** A playlist is drafted in the dashboard, then published to one or more TVs. The player loops the slides, preloads the next image, and keeps the current picture if a slide or the network fails. One image assigned to a display still behaves as a single still. See [docs/PHASE_2A_PLAN.md](docs/PHASE_2A_PLAN.md).
- **Pairing.** The TV gets a 6-digit code and a session secret. You enter the code and a name. The TV then collects a display token once and stores it in `localStorage`. Codes expire after 10 minutes, are single-use, and are stored only as an HMAC. Session secrets and display tokens are stored only as SHA-256 hashes. Disconnecting a display revokes its token immediately.
- **Uploads.** JPG, PNG, and WebP up to 15 MB. The phone resizes to a 1920×1080 (or 1080×1920) JPEG on black before uploading, which stays under Vercel's request-body limit and is easy for a TV to decode. The server ignores the claimed content type: it reads the file bytes, checks the format, and refuses images larger than 7680×4320.

## Docs

- [SETUP.md](SETUP.md) — Supabase, the migration, auth URLs, and the Vercel env vars
- [RECOVERY.md](RECOVERY.md) — pairing, keys, and what to do when a TV or a deploy breaks
- [FIRST_TV_TEST.md](FIRST_TV_TEST.md) — the first run on a real television

## Scripts

```bash
npm install
npm run dev          # http://localhost:3000 and http://localhost:3000/player
npm run lint
npm run typecheck
npm test             # unit, API, RLS (skips without Supabase), player simulation
npm run build
npm run test:e2e     # skips unless BASE_URL points at a deployed origin
```

Unit and API tests do not need a Supabase project. The RLS test and the Playwright test do. See SETUP.md.
