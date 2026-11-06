# Presentation groups

A `.pptx` or multipage PDF upload becomes **one** library item. Its slides are
the existing image rows (`source_media_id` + `slide_index` from migration
`0018`). The player expands that one playlist item into those slides and uses
the same timing loop as every other image. Historical playlists that already
point at individual slides are not rewritten.

Migration `0019_presentation_groups.sql` is **not applied by this change**.
Apply it before using the new columns. Until then, `.pptx` uploads keep the
previous per-slide behavior and PDF uploads return 503. Rollback:
`supabase/rollback/0019_presentation_groups.sql` (manual). It does not delete
media or playlist rows. A playlist duration above 600 seconds is clamped to
600 seconds so the previous check can be restored.

## What is unchanged

- Image and video upload, limits, and playback.
- Existing playlist items, including slides created by earlier PowerPoint uploads.
- `GET /api/player/state` for a single assigned image, and for playlists that do not contain a presentation row.
- Manual slideshow and remote `next` / `prev`. After a group is expanded, `index` and `count` count **slides**, which is what the TV is showing.
- Billing, Stripe, and Meta.

## Upload

| | |
|---|---|
| Start | `POST /api/media/presentation` `{ fileName, sizeBytes }` |
| Bytes | `PUT` the returned `signedUrl` (same as video) |
| Finish | `POST /api/media/presentation/complete` `{ mediaId, fileName, createPlaylist?: boolean, expandSlides?: boolean, playbackMode?: "auto" \| "manual", playlistName?: string, replace?: boolean }` |
| Progress | While finish runs, `GET /api/media/presentation/:id` returns `processingStatus`, `processingDone`, and `slideCount`. `202` from finish means another request is already converting that id; retry finish. |
| Limits | 50 MB, 40 pages, `.pptx` or `.pdf`. `.ppt` and `.pptm` are rejected. |
| Durations | Group default 10 seconds. Per slide 3–3600 seconds. |

`createPlaylist: true` (the API default, **not** what the website sends) creates a **draft** playlist with **one** item whose `mediaId` is the presentation. It does not publish and it does not insert one item per slide.

`expandSlides: true` keeps the previous behavior: a published playlist with one item per slide (`presentation_create_playlist`). Use this only for an old client that still expects that shape.

A failed or corrupt file is stored as `processingStatus: "failed"` and creates **no** playlist items. A retry of finish after the processing row is older than 2 minutes deletes the partial slide rows and converts again. A second finish after `ready` returns `200` and the same slide ids.

### Replace

`POST /api/media/presentation/:id/replace` `{ fileName, sizeBytes }` returns a signed URL for the next generation. Then `POST /api/media/presentation/complete` with `replace: true`.

Slides for the new generation are stored first. `presentation_commit_group` then advances `group_revision` and, in the same transaction, bumps `playlists.revision` and `displays.content_version` for screens publishing that group. Players with the previous version keep the previous payload (`unchanged: true`) until that version changes, then receive the whole new slide list. They never receive a mix of the two generations. Slides that were added to a playlist on their own are kept.

## Library

`GET /api/media` is unchanged for images and videos. These fields are added **only** on `kind: "presentation"`:

| Field | Meaning |
|---|---|
| `slideCount` | Committed slides |
| `processingStatus` | `pending`, `processing`, `ready`, `failed`, or null for a deck from before this migration |
| `processingError` | Last failure, or null |
| `processingDone` | Slides saved so far |
| `defaultDurationMs` | Default per-slide time (3–3600s) |
| `coverUrl` | Signed URL of slide 1 |
| `updatedAt` | Last group edit |

`GET /api/media?grouped=1` (with the existing paging params) omits child slides (`sourceMediaId` set) so a deck appears once. Without `grouped=1` the previous list, including those slide images, is still returned.

`GET /api/media/presentation/:id` returns the group and `slides[]` in order (`id`, `fileName`, `index`, `url`, `width`, `height`, `durationMs`).

`PATCH /api/media/presentation/:id` accepts `name`, `defaultDurationMs`, and `slides: [{ id, durationMs }]` where `durationMs` is `null` to clear an override.

`DELETE /api/media/:id` is unchanged (409 while a playlist references the file). `DELETE /api/media/:id?detach=1` on a presentation removes playlist references to the group **and** its slides, renumbers positions, bumps screen versions, then deletes the rows and storage objects.

`POST /api/media/presentation/:id/playlist`

| Body | Result |
|---|---|
| `{ playlistId }` | Appends one draft item. Idempotent if that id is already on the draft. |
| `{ name, playbackMode? }` | New draft playlist, one item. |
| `{ expandSlides: true, name?, playbackMode? }` | Previous per-slide published playlist. |

## Playlist editor

A presentation is one draft item. `GET /api/playlists/:id` adds, only when `kind` is `"presentation"`:

`slideCount`, `groupDurationMs`, `url` (cover), and `slides[]` with each slide's `durationMs` override (`null` means "use the item duration").

`PATCH /api/playlists/:id` is the same body as before. For a presentation item, `durationMs` must be `null` or 3000–3600000. Image and video items stay 1000–600000. The playlist default stays 1–600 seconds.

## Player (`GET /api/player/state`)

The `playlist.items` array is what the TV walks. A presentation item is replaced by its committed slides before URLs are signed. Each expanded slide is a normal image:

```json
{
  "mediaId": "slide-uuid",
  "url": "https://…",
  "durationMs": 4000,
  "kind": "image",
  "width": 1280,
  "height": 720,
  "groupId": "presentation-uuid",
  "groupName": "Quarterly review",
  "groupIndex": 0,
  "groupCount": 12
}
```

`groupId`, `groupName`, `groupIndex`, and `groupCount` are new and optional. Players that ignore unknown fields still advance by `durationMs`. The effective time is:

1. the slide's own `durationMs` override, else
2. the playlist item's `durationMs`, else
3. the group's `defaultDurationMs`, else
4. 10 seconds

clamped to 3–3600 seconds. A slide with no file is omitted. The player skips an image that fails to load instead of retrying it forever. The next slide is preloaded; only two on-screen layers are decoded. Images use `background-size: contain` (no crop, no stretch) for both portrait and landscape.

Manual mode and remote commands step through this expanded list. `POST /api/player/state` playback reports are unchanged: `index` / `count` are positions in that list.

A playlist that already lists slide images (the pre-group PowerPoint flow) is not expanded. Those items play exactly as stored.

## Rendering

| Format | Engine | License |
|---|---|---|
| `.pptx` | `pptx-glimpse` | MIT |
| `.pdf` | `pdfjs-dist` + `@napi-rs/canvas` | Apache-2.0 + MIT |

No LibreOffice and no paid conversion API. Animations, transitions, and embedded video become still images. Password-protected PDFs are rejected. Text uses the Liberation fonts shipped with pdf.js.
