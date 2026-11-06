# PowerPoint (.pptx) uploads

Customers upload a `.pptx` or PDF in the Media library. After migration
`0019_presentation_groups.sql`, that file is **one presentation group**.
Slides, durations, playlists, and the player are described in
[PRESENTATION_GROUPS.md](./PRESENTATION_GROUPS.md). The notes below describe
the original per-slide conversion that still runs when `0019` is not applied,
and when a caller passes `expandSlides: true`.

## Conversion method (cost: $0)

**Server-side [pptx-glimpse](https://www.npmjs.com/package/pptx-glimpse) (MIT).**

| Option | Cost | Verdict |
|---|---|---|
| LibreOffice headless on Vercel | $0 compute, but LO cannot ship in serverless functions | Rejected |
| LibreOffice on Fly/Cloud Run/Railway | Free tiers need new accounts / cards | Stop — needs Francisco approval |
| Paid APIs (CloudConvert, ConvertAPI, Aspose) | Per-conversion fees | Stop — needs approval |
| GitHub Actions | $0 but not interactive | Unsuitable |
| Shared agent box | Not production infra | Rejected |
| **pptx-glimpse in the existing Node route** | **$0** (npm MIT, uses current Vercel) | **Chosen** |

Why this path: additive to the media library, no new paid service, no new
infrastructure account, works on Vercel with `maxDuration = 300`, preserves
aspect ratio (16:9 → 1280×720, 4:3 → 1280×960 in tests), and reuses signed
uploads like video.

## Limits

- `.pptx` only (not `.ppt` / `.pptm`)
- 50 MB upload
- 40 slides (playlist max)
- Static render: animations, transitions, embedded video do not play
- Macro packages rejected (`vbaProject.bin`)

## Schema

Migration `0018_pptx_presentations.sql`:

- `media.kind` may be `presentation`
- `media.source_media_id` + `media.slide_index` link slide images to the source
- Storage MIME allow-list includes the Open XML presentation type
- RPC `presentation_create_playlist(...)` builds a Manual playlist by default

Rollback: `supabase/rollback/0018_pptx_presentations.sql` (manual).

## Customer flow

1. Media library → **Upload PowerPoint**
2. File uploads to private storage; server converts to PNGs
3. Slides appear in the library; a Manual playlist is created
4. Assign the playlist to a screen; use on-TV controls or phone remote (PR #39)

## Isolation

Does not change Stripe, Meta, billing, player HTML, or remote-control command
APIs. Existing automatic playlists are untouched.
