# Pekko running costs (Milestone B)

Prices checked October 2026. Usage figures are estimates from the code paths below. Check them against the Vercel and Supabase usage pages after one month (see "Measuring usage").

## What a TV costs us

| Per screen, per month | Before B (10 s polls) | After B (30 s polls + saved media) |
|---|---|---|
| Server calls (Vercel function invocations) | ~260,000 | ~88,000 (86,400 polls + ~1,400 URL refreshes) |
| Database calls (`player_state` + schedule read) | ~260,000 | ~88,000 |
| Media downloads (Supabase egress), 10 photos of 0.3 MB | ~4 GB (re-downloaded each time the signed URL changed, ~every 30 min) | ~3 MB plus whatever new content is published |
| Media downloads, a 50 MB video loop | ~70 GB | 50 MB once, plus new content |

Four TVs on 10 s polling already made ~1.04M calls a month, the Hobby limit. Players that are already running pick up the new page the next time the TV reloads it; until then they keep polling every 10 s.

## Estimates

Assumptions: ~20 ms active CPU and ~150 ms wall time per call at 2 GB memory (Fluid compute), 50 MB of new media per screen per month. Vercel Pro: $20/month with $20 usage credit; invocations $0.60/M, active CPU $0.128/h, memory $0.0106/GB-h. Total ≈ $0.19 per screen per month on Vercel.

### Shared costs (already paid, not caused by Pekko)

| | 10 | 50 | 100 | 500 screens |
|---|---|---|---|---|
| Supabase Pro plan (shared with Teamtegrate) | $25 | $25 | $25 | $25 |

### Pekko-specific costs, per month

| | 10 | 50 | 100 | 500 screens |
|---|---|---|---|---|
| Supabase added usage (compute share, storage, egress) | ~$10 | ~$10 | ~$10 | ~$20–30 (larger compute + egress past 250 GB) |
| Vercel Pro seat (required to sell; Hobby is non-commercial) | $20 | $20 | $20 | $20 |
| Vercel usage after the $20 credit | $0 (~$2 used) | $0 (~$10) | $0 (~$19) | ~$75 (~$95 used) |
| **Pekko total** | **~$30** | **~$30** | **~$30** | **~$115–125** |
| Same on the old 10 s polling, for comparison | ~$30 | ~$40 | ~$67 | ~$305+ (plus media egress) |

Media egress after B at 500 screens: ~25 GB/month, inside Supabase Pro's 250 GB. Before B, a single video playlist on 500 screens could have reached tens of TB.

## What changed

- **Smarter polling.** The server tells the TV how often to poll (`pollMs`, default 30 s, env `PLAYER_POLL_MS`, 5–120 s). The TV also wakes just after a scheduled switch (`nextTransitionAt`), so schedules stay on time. Old players ignore the field.
- **Saved media (persistent cache).** On browsers with the Cache API, the TV saves each file once, keyed by media id (each upload is immutable), and plays it from the TV. New signed URLs no longer cause a re-download. Up to 60 MB is kept; files unused for 14 days are removed. Disconnecting the TV wipes the saved files.
- **Incremental downloads.** A new playlist downloads only the files the TV does not have.
- **Offline playback.** The TV remembers the last playlist. If it restarts with no internet, a small service worker (scope `/player` only, network first) opens the saved player page and plays saved files. When the network returns it continues normally.
- **Access is not weakened.** Media stays private and signed; URLs still last 1 hour. Nothing public was added. Saved files live only on that paired TV.
- **Online window** is now 90 s (was 60 s) so a TV polling every 30 s does not flicker offline.
- **Dashboard tabs** in the background stop polling and refresh when you come back.
- Older TVs without the Cache API behave exactly as before.

## Video compression evaluation (no paid transcoding)

Uploads are already limited in the browser (`lib/prepare-video.ts`, `lib/mp4.ts`): MP4 H.264, 50 MB, 3 minutes, 1920 px. With saved media each video is downloaded once per TV, so compression no longer multiplies cost. Recommendation: no server transcoding now. Option for later at no cost: in-browser re-encode with WebCodecs before upload (Chrome/Edge only), or guidance text "export at 1080p, ~5 Mbps". Revisit if storage passes 100 GB.

## Measuring usage

- Vercel → project `pantalla` → Usage: Function invocations, Active CPU, Fast data transfer. Compare with ~88,000 calls per screen per month.
- Supabase → project → Usage: Egress, Storage size, Database compute.
- Logs: each request to `/api/player/state` is one invocation; `GET /api/health` shows the service is up.
