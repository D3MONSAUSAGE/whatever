# HEVC / incompatible Apple video conversion (proposal only)

> Update, 21 November 2026: the flag-off pipeline is documented in `docs/HEVC_CONVERSION.md`. This file is the original priced investigation. Nothing paid is activated.

Date: 20 November 2026 (America/Los_Angeles). Not implemented. No paid service or recurring infrastructure is activated.

Compatible H.264/AAC (or silent) MP4, MOV, and M4V files already upload without transcoding. This proposal is only for files `inspectMp4` rejects, typically iPhone/Mac HEVC (H.265). Requirements that stay in force: 500 MB cap, TV-safe H.264/AAC output, no weakening of validation or media security, no unnecessary duplicate originals, no TV player change, and no paid activation without approval.

## On-device conversion (investigated, not shipped)

| Approach | Verdict |
| --- | --- |
| WebCodecs HEVC decode + H.264 encode and an MP4 muxer | Safari / iPhone can often decode HEVC in the browser. Chrome and Firefox generally cannot. Encoding a TV-safe High/Main/Baseline level ≤ 4.2 file with AAC, for clips up to 500 MB, is not something we can guarantee across browsers. A failed or non-conformant encode would still have to be rejected by `inspectMp4`. |
| ffmpeg.wasm | Can transcode in principle, but a 500 MB source is typically loaded into WASM memory (often 1–2 GB+). Jobs of that size are slow, can freeze or crash the tab, and the common builds are LGPL/GPL. Not reliable enough for a production upload path. |

Recommendation: do not ship on-device HEVC transcoding until a clearly reliable, free, well-tested path exists for files up to 500 MB in the browsers our customers use. Keep the current reject-and-explain behavior (HTTP 415, `code: video_codec`, iPhone “Most Compatible” / Mac H.264 export guidance).

## Cloud conversion (architecture, not enabled)

Only run a job when `inspectMp4` returns `codec` (or an equivalent HEVC/ProRes/PCM rejection). Never transcode a file that already passes. Flow:

1. Client uploads bytes to the existing signed `video/mp4` path (bucket unchanged).
2. `POST /api/media/upload/complete` inspects the object. If it is already compatible, the row is saved as today and nothing is transcoded.
3. If the file is incompatible but convertible (HEVC/H.265 in a MOV/MP4/M4V, within the 500 MB / 3 minute / 1920 px caps), the object is not published to the library as playable video. The API would need a later, approved design for a “processing” state. **That state does not exist today.** Until then, the upload is rejected.
4. A worker transcodes to a single H.264 (Baseline/Main/High ≤ 4.2) + AAC (or silent) MP4, ≤ 1920 px, then the complete path runs `inspectMp4` + `enforceVideoLimits` on the output and replaces the original object. The original is deleted so we do not store a duplicate. Failed or still-invalid output is discarded and reported as `video_codec` (or a new `video_transcode_failed` code, if added later).
5. The TV player and editors only ever receive a validated library row. No player change.

A hard spending cap would sit in front of the job: a monthly counter (minutes and/or dollars) checked before enqueue, plus the vendor’s account budget where one exists. When the cap is reached, new incompatible uploads are rejected with a clear message instead of running a job.

## Pricing (public pages, November 2026) and a low-volume estimate

Current production library (Safari audit, read-only, 20 November 2026): 27 videos, all already stored as `video/mp4`, none named `.mov`. Initial HEVC volume is therefore small. Assumption for “initial expected usage”: about 20 incompatible clips per month, average 90 seconds, 1080p, one output file (our player needs one H.264/AAC MP4, not an ABR ladder).

| Option | Rate used | Est. monthly processing | Recurring floor | Sources |
| --- | --- | --- | --- | --- |
| Coconut pay-as-you-go, one HD output | $0.015 / output minute | 30 min × $0.015 = **$0.45** | $0 (no minimum; free 1-minute test plan) | https://www.coconut.co/pricing |
| AWS Elemental MediaConvert, on-demand Basic tier, HD AVC ≤ 30 fps (US East first volume tier) | $0.015 / output minute | 30 min × $0.015 = **$0.45** | $0 plus ordinary AWS account usage; cap with an AWS Budget | https://aws.amazon.com/mediaconvert/pricing/ (also summarized at https://www.transcodely.com/blog/video-transcoding-pricing-compared, rates re-verified 8 August 2026) |
| Mux Video Plus quality, 1080p input | $0.03125 / input minute | 30 min × $0.03125 ≈ **$0.94** plus Mux storage and delivery if we served from Mux | Mux plans start at $20 for $100 of prepaid usage, or pay-as-you-go | https://www.mux.com/docs/pricing/overview |
| Mux Basic quality | Free input | **$0** encoding | Still incurs Mux storage/delivery if used as the origin, and would change how TVs fetch video | same Mux overview |
| Cloudflare Stream | Encoding is free | **$0** encode | **$5 / month** prepaid per 1,000 minutes of *storage capacity* (even at low duration); $1 / 1,000 minutes delivered; Stream is a host+CDN, not a transcode-and-return-to-our-bucket service | https://developers.cloudflare.com/stream/pricing/ |
| Self-hosted ffmpeg on a scale-to-zero worker (Cloud Run / similar) | Compute only | Likely **well under $5** at this volume | Only if the worker has no idle minimum. Still new infrastructure and operational work | Vendor compute price lists; no service is proposed for activation |

All of the metered transcode-only options sit far below the $10–$20/month target at this volume. The hard cap should still be set at **$15/month** so a sudden burst cannot run away.

## Recommendation

- Ship the zero-cost work now: accept compatible MOV/M4V, convert HEIC on the client where the browser can decode it, improve EN/ES errors, reject HEVC with `video_codec` and export guidance.
- Do **not** enable Cloudflare Stream or Mux as the playback origin (that would change the TV player and storage model).
- If automatic HEVC conversion is approved later, prefer **Coconut** or **MediaConvert** as a transcode-and-replace step in front of the existing complete/validation path, with a $15/month hard cap, no duplicate originals, and a processing-state contract agreed with Flutter before anything is live. That is a substantial architectural change and is not started here.
