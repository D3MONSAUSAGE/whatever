# Presentation groups

A `.pptx` or multipage PDF upload becomes **one** library item. Its slides are
the existing image rows (`source_media_id` + `slide_index` from migration
`0018`). The player expands that one playlist item into those slides and uses
the same timing loop as every other image. Historical playlists that already
point at individual slides are not rewritten.

Migration `0019_presentation_groups.sql` is **not applied by this change**.
It adds columns and functions only. It does not `UPDATE` existing rows.
`updated_at` stays null until a group conversion or edit writes it. The app
treats null as "not touched".

Until the migration is applied, `.pptx` uploads keep the previous behavior and
PDF uploads return 503.

## Rollback (old deployment)

`supabase/rollback/0019_presentation_groups.sql` is forward-safe. It does not
drop columns, delete files, or clamp durations.

1. Run that file. It installs `presentation_flatten_playlist_items()` and runs
   it once. Each playlist item that points at a presentation parent is replaced
   with that parent's committed slide images, in order. A group with no slides
   is left alone. Screens on a flattened published playlist get a new
   `content_version`.
2. Confirm `player_playlist` for those screens returns image paths, not the
   `.pptx` or PDF.
3. Deploy the previous app. That player does not expand `kind = presentation`,
   but the playlist no longer points at the presentation file, so playback
   continues.
4. Leave the columns in place. Shipping this branch again is safe.

## Deferred: Replace Presentation

Not in this release. Replacing a deck has to keep the previous slide files
until slow or offline players have loaded the new version. Deleting the old
generation too early would break a TV that still holds those URLs. The replace
route and button are not shipped.

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
| Finish | `POST /api/media/presentation/complete` `{ mediaId, fileName, createPlaylist?, asGroup?, playbackMode?, playlistName? }` |
| Progress | While finish runs, `GET /api/media/presentation/:id` returns `processingStatus`, `processingDone`, and `slideCount`. `202` from finish means another request is already converting that id; retry finish. |
| Limits | 50 MB, 40 pages, `.pptx` or `.pdf`. `.ppt` and `.pptm` are rejected. |
| Durations | Group default 10 seconds. Per slide 3–3600 seconds. |

**No new flag (mobile and any existing client).** Finish behaves as it does today:
a **published** playlist, **manual** unless `playbackMode` is set, **one item per
slide**. The response still has `id`, `slideIds`, `slideCount`, `playlistId`,
and `warnings`. Additive fields: `processingStatus`, `defaultDurationMs`,
`asGroup: false`. `playlistId` is null on an idempotent retry, same as before.

**Website only.** The dashboard sends `asGroup: true` and `createPlaylist: false`.
The file becomes one group and no playlist is created. `asGroup: true` with
`createPlaylist: true` makes one **draft** item whose `mediaId` is the
presentation. It does not publish and it does not insert one item per slide.

A conversion claims the row with `presentation_claim_group` (`SELECT … FOR UPDATE`
and a `processing_token`). A second finish while that claim is fresh gets `202`
and does not delete anything. Cleanup (`presentation_discard_staging`) deletes
only staging slides for the token it still owns, and never a revision that is
already committed.

A failed or corrupt file is stored as `processingStatus: "failed"` and creates
**no** playlist items. A second finish after `ready` returns `200` and the same
slide ids.

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
| `updatedAt` | Last group edit, or null when this feature has not written the row |

`GET /api/media?grouped=1` (with the existing paging params) omits child slides (`sourceMediaId` set) so a deck appears once. Without `grouped=1` the previous list, including those slide images, is still returned.

`GET /api/media/presentation/:id` returns the group and `slides[]` in order (`id`, `fileName`, `index`, `url`, `width`, `height`, `durationMs`).

`PATCH /api/media/presentation/:id` accepts `name`, `defaultDurationMs`, and `slides: [{ id, durationMs }]` where `durationMs` is `null` to clear an override.

`DELETE /api/media/:id` is unchanged (409 while a playlist references the file). `DELETE /api/media/:id?detach=1` on a presentation removes playlist references to the group **and** its slides, renumbers positions, bumps screen versions, then deletes the rows and storage objects.

`POST /api/media/presentation/:id/playlist`

| Body | Result |
|---|---|
| `{ name, playbackMode? }` (no `asGroup`) | Previous behavior: published playlist, one item per slide. Default mode is manual. |
| `{ asGroup: true, playlistId }` | Appends one draft item. Idempotent if that id is already on the draft. Website only. |
| `{ asGroup: true, name, playbackMode? }` | New draft playlist, one item. Website only. |

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

## Where `kind: "presentation"` can appear

A client that never sends `asGroup: true` does not get a playlist made of presentation parents. Gother can regression-test against this table.

| Response | What can be `kind: "presentation"` |
|---|---|
| `POST /api/media/presentation/complete` | Not a media list. `asGroup` is false unless the request sent `asGroup: true`. `slideIds` are image rows. Default playlist items are those images. |
| `GET /api/media` | The source file only, which was already `kind: "presentation"` before this feature. Child slides stay `kind: "image"`. New fields are only on the source row (see Library). `updatedAt` is null until this feature writes it. |
| `GET /api/media/presentation/:id` | The group. `slides[]` are images. |
| `GET /api/playlists` and `GET /api/playlists/:id` | An item is `kind: "presentation"` only if a client saved or added the group with `asGroup: true`. The default upload playlist's items stay `kind: "image"`. |
| `GET /api/player/state` | Items stay `image` or `video`. `groupId`, `groupName`, `groupIndex`, and `groupCount` appear only when a published item is a presentation parent. A per-slide playlist does not get those fields. |

`DELETE /api/media/:id?detach=1` removes the group and its slides from playlists, renumbers what remains, and bumps `content_version` so a screen keeps playing the other items. It does not clear `assigned_playlist_id`.
