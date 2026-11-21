# Automatic HEVC conversion (flag off until approved)

Written 21 November 2026, America/Los_Angeles. Implementation is in the web/backend only. The pipeline is **off** in production (`HEVC_CONVERSION_ENABLED` unset). With the flag off, HEVC uploads still receive HTTP 415 `video_codec`, exactly as today.

## Selected provider

**Coconut** (https://www.coconut.co), transcode-and-return into our existing `media` bucket. TVs and the editor keep playing our signed URLs. No playback-origin change.

### Why Coconut, versus the alternatives

Official docs were fetched on 21 November 2026.

| Provider | Official price (fetched 21 Nov 2026) | HEVC input | Hard cap? | Notes |
| --- | --- | --- | --- | --- |
| **Coconut** | **$0.015 per HD output minute**, no monthly minimum, failed jobs free, billed on the 1st for the prior month. Source: https://www.coconut.co/pricing | ffmpeg-based; MOV/MP4 inputs; `force_sdr` (API 2026-001, June 2026) converts HDR to SDR. No dedicated public table lists every HEVC profile. Dolby Vision Profile 8.4 / HLG is not explicitly documented; we attempt conversion and **fail closed** if `inspectMp4` rejects the output. | **No account-level spend lock or prepaid hard stop.** Our Postgres ledger is the real-time cap. | Best fit for transcode-and-return. Webhooks have **no HMAC**; we use Coconut's documented per-job token in `notification.params`, plus idempotency. |
| AWS MediaConvert | Basic tier, first 100k normalized minutes: $0.0075/min in US East; HD AVC ≤30 fps is 2× → **$0.015/output minute** (same unit rate as Coconut). Source: https://aws.amazon.com/mediaconvert/pricing/ | Broad HEVC / HDR support, including more Dolby Vision cases. | AWS Budgets *actions* can stop work, but they lag **hours**. Not a real-time hard cap. Needs an AWS account, IAM, and S3. | Strong format coverage; weaker cap; more infrastructure. |
| Mux | Plus encoding at 1080p is about **$0.03125 per input minute**, plus storage and delivery. Pay-as-you-go includes a $20 monthly usage credit; prepaid credits bill overage at PAYG. Source: https://www.mux.com/docs/pricing/overview | Excellent HEVC/HDR input. | Prepaid is **not** a $15 hard stop (overage is billed). | Would change the TV playback origin if used as the host/CDN. |
| Cloudflare Stream | Encoding is free; storage has a **$5/month floor**, plus delivery. Source: https://developers.cloudflare.com/stream/pricing/ | HEVC ingest supported. | The $5 storage floor already is a recurring cost, and Stream is a host+CDN, not transcode-and-return. | Rejected: paid floor and playback-origin change. |

Coconut matches our “convert only, keep our bucket and player” design and the $0.015/HD-minute rate, with $0 minimum and free failed jobs. It cannot itself enforce $15. That cap is our ledger (below), and the residual risk is documented in **Maximum financial exposure**.

### Output we request

`mp4:1080p_h264_30fps::quality=4,vprofile=high,level=42,pix_fmt=yuv420p,force_sdr`

That is H.264 High 4.2, 1080p, 30 fps, 4:2:0, SDR. Output must pass the existing `inspectMp4` + `enforceVideoLimits` checks before the media row is marked `ready`. Already-compatible H.264/AAC uploads are never sent to Coconut.

## Budget enforcement

- Cap: **$15.00 per America/Los_Angeles calendar month**, stored as thousandths of a dollar (`cap_millis = 15000`).
- Before any provider API call, `reserve_video_conversion` locks the month row and adds a **worst-case reserve**: $0.015 × `ceil(duration_minutes)`, at least 1 minute, at most 3 minutes (our duration limit) → **$0.015–$0.045 per job**.
- A new job is refused with 429 when `reserved + spent + this reserve > $15`, including jobs that are still pending.
- Concurrent requests serialize on `SELECT … FOR UPDATE` of the month row (covered by a Postgres test).
- On success, spend is reconciled to the output duration at the same rate, never above the reserve; the unused reserve is released.
- On a **provider failure**, Coconut does not charge; we record `$0` spend and release the reserve.
- On **output that fails `inspectMp4`** after Coconut succeeded, we record the reserved amount as spend (we were charged) and mark the media `failed`.
- Provider-side: Coconut has no hard account cap. We will not activate a paid account until Francisco approves. If a Coconut dashboard or other out-of-band job is ever run with the same API key, it would sit outside this ledger.

## Maximum financial exposure (if later activated)

Assuming the flag and key are on, and only this app submits jobs:

- **Ledger cap: $15.00 / month** for jobs we submit, including in-flight reserves.
- Residual, above $15, that we cannot hard-stop in Coconut itself:
  1. **Out-of-band jobs** in the Coconut dashboard (mitigate: do not share the API key; do not click “try a job” in their UI with this key).
  2. **Estimate or price-list changes.** We reserve the 3-minute HD worst case. Coconut bills output minutes of the finished video (typically ≤ 3 minutes, one output). If they ever added a second billable output or raised the HD rate, a job already submitted could cost more than its reserve. Unlikely with the current published rate and a single MP4 output; still not a vendor-side lock.
  3. **Supabase egress** for Coconut to fetch the original (signed GET) and for us to download the output. Roughly 2 × file size per job. At ~20 clips/month and ~100 MB average output, about 4 GB/month, usually within the current Supabase plan. This is not counted inside the $15 processing ledger.
  4. **Vercel execution time** for the webhook download (maxDuration 300s). Not a Coconut charge; a large 4K source could time out, in which case we fail the job and should not leave a charged-but-unvalidated object in the library (we only replace the original after `inspectMp4` succeeds).
  5. **Coconut “test” storage** is documented as not for production (files deleted within 24 hours). We copy the output into our bucket during the webhook and never serve Coconut URLs to TVs. On activation, a restricted S3-compatible write to a conversion prefix is the sturdier option if webhook downloads prove unreliable.

At the assumed early volume of about 20 three-minute HD conversions a month: 20 × $0.045 = **$0.90**, well under $15. The maximum this app will submit is 15 / 0.015 = **1,000 reserved minutes** (about 333 three-minute jobs) per PT month.

## Setup Francisco would need to approve before anything paid is turned on

Nothing below has been created or purchased.

1. Approve the residual-risk disclosure above (Coconut has no vendor-side hard cap).
2. Create a Coconut account at https://www.coconut.co and add a payment method. Set the API version to **2026-001** so `force_sdr` is available.
3. Create an API key (keep it out of chat and out of the Coconut dashboard “try a job” flow).
4. In Vercel (project `pantalla`, production only when ready):
   - `HEVC_CONVERSION_ENABLED=1`
   - `NEXT_PUBLIC_HEVC_CONVERSION_ENABLED=1` (lets the web client upload convertible files; without this, Safari/Chrome still reject HEVC before upload)
   - `COCONUT_API_KEY=…` (server only)
   - `NEXT_PUBLIC_APP_URL=https://pekkotv.com` (already used elsewhere; the webhook is `{APP_URL}/api/webhooks/video-conversion?token=…`)
5. Apply migration `0033_video_conversion.sql` to production Supabase if it is not already applied by the usual process.
6. Do not set `HEVC_CONVERSION_PROVIDER=mock` in production.
7. Optional later: a restricted Supabase S3 key limited to a conversion prefix, if we stop using Coconut's temporary storage + webhook download.
8. After enablement, watch `/developer/analytics` → **Video conversion** (developer-only) and the Coconut invoice. Gother should only ship the Flutter processing-status path after we confirm the flag is on.

Until those steps are approved and done, leave every variable unset. Flag-off code is safe to deploy: no provider account, no keys, no charges, same 415 behavior.

## Coordination

See `docs/FLUTTER_MANAGEMENT.md` section “Supported media contract”, item 4, marked **inactive until enabled**. No Flutter or Google Play changes in this work.
