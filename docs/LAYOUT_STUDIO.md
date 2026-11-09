# Layout Studio audit (review only)

Status: isolated preview and player behavior, flag off, not deployed. The TV is the existing web player (`public/player.html` at `/player`). The Flutter app is a controller. It does not render boards. The proposal section is the contract.

Play-launch work, including the unmerged deletion billing fix, is unchanged by this note.

## Existing support

| Concern | What the player does today | Source |
| --- | --- | --- |
| Geometry | One item fills the screen. Images use `background-size: contain` (no crop). Video is scaled with `Math.min(screen/video)` and centered. Output boards that are exactly 1920×1080 fill a 16:9 screen. | `public/player.html` `.layer`, `fitVideo` |
| Menu source | `menus.content` is items, sections, prices, optional JPEG/PNG photo. Server draws SVG to a 1920×1080 PNG (`MENU_WIDTH`/`MENU_HEIGHT`) and stores a normal `media` row. | `lib/menu-templates.ts`, `lib/server/menu-render.ts`, `lib/server/menus.ts` |
| Other media | Playlist items are `image` or `video` only. Presentations are expanded into image slides before the player sees them. | `docs/PRESENTATION_GROUPS.md` |
| Timing | Legacy items: one `durationMs`, and the clock starts when that image or video is committed. A board with a video zone waits until the zone settles (a decoded frame, or 8 seconds without one) and only then starts `durationMs`. Manual mode ignores duration either way. There is no per-zone clock. | `present()`, `scheduleAdvance` |
| Video and audio | Legacy: one visible video. `va` and `vb` preload the next clip. Both are forced `muted`. A board zone uses one element and does not arm the other while that zone is open. That is not a device test of one decoder. | `present`, `armVideo`, `zoneOpen` |
| Cache / offline | Files are stored by `mediaId` in Cache Storage `seemple-media-v1`, up to 60 MB, dropped after 14 days unused. A failed image is skipped. No network on startup plays the last saved state if those files are still cached. | `public/player.html`, `public/player-sw.js` |
| Version | The screen's `content_version` is the payload `version`. The player sends `?v=` for what it is showing and posts `playing.version` once that frame is up. `unchanged: true` means keep the current slide. Unknown JSON fields are ignored. There is no capability handshake. | `app/api/player/state/route.ts`, `pollState`, `markPainted` |
| Group counters | Optional `groupIndex` / `groupCount` (0-based index, count of slides in that presentation). Manual UI shows `2/12` when `groupCount > 1`, and adds the playlist position when the playlist is longer than the group. Remote next/prev steps expanded slides. | `updateManualPos`, `copyGroup` |

Saving a menu today calls `menu_swap_media`, which repoints playlist rows and bumps `content_version`. There is no draft. Android and the player both treat the result as an image. Limits stay 4 sections, 12 items per section, 24 total. WebP cannot be drawn. Sample content already exists in `sampleMenu()`.

## Proposal (layoutVersion 1)

Isolated development. `LAYOUT_STUDIO` must be exactly `1`. Absent or any other value sends no composition metadata and leaves classic, fresh, and bold menus unchanged. Not activated in production.

Flutter does not render boards. The existing web player is the only renderer.

`va` and `vb` preload the next playlist item. That is not proof that two videos can play at once. One muted video zone per board is a proposed limit, not a device-tested guarantee. Audio stays muted, matching `armVideo`.

`groupIndex` and `groupCount` stay presentation slide counters. They are never zone indexes. Remote index and total stay playlist-item positions.

### Geometry

Five templates. Each has one bounded split the editor may change. The server recomputes integer boxes that cover 1920×1080 with no gaps. Client-supplied coordinates are rejected. HTML and script are rejected.

| Id | Default | Allowed split |
| --- | --- | --- |
| `menu-promo-67` | Menu 67% | 0.55–0.75 of the width |
| `triple-column` | Equal columns | First column 0.25–0.45 of the width; the other two share the rest |
| `split-50` | Half | Left pane 0.40–0.60 |
| `menu-banner` | Banner 15% tall | Banner 0.12–0.28 of the height |
| `signature` | Overlay 55% wide | Overlay 0.40–0.70 over a full-bleed background |

### Real video, and the whole-board fallback

The non-video zones are drawn to one opaque 1920×1080 PNG, including a poster in the video slot, through the existing SVG renderer. The player item stays `kind: "image"` with that PNG as `url`. Additive `composition` may name one video and its box. Absence of `composition` is the legacy item.

A player that does not understand `composition` paints the PNG and acknowledges `version` when that image is on screen. The PNG is the whole board, so this is not a partial zone.

A player that understands `layoutVersion: 1` paints the PNG, then starts at most one muted video in the safe box, using one existing video element. It does not set a source on the other element while that zone is open. That is not a device test that the television has only one decoder.

The slide clock starts only after the zone settles. Settled means the muted video has produced a frame, or 8 seconds have passed with no frame. Until then the player does not send `playing.version` and does not send that version as `?v=`, even if `present` is later called without a version number. A pending video is not an acknowledgement. A hole, or menu text covered by the video, is not allowed.

The signature background is the full board. Its video box is only the strip beside the menu card. The three-column template has no video box, because every column is menu text. The still never says the video is playing. An assigned photo is drawn in the feature area. If the video does not start, the player hides it, reports that the still image is showing, and acknowledges that degraded frame. A successful video clears that note.

There is no per-zone clock. After the zone settles, the playlist item's existing `durationMs` is how long that settled frame stays up. Manual mode still ignores duration.

The cached file is the board PNG (`mediaId` of the playlist item). The zone video is not written to the cache. Offline playback shows that PNG and drops `composition`. This is not offline video.

Item limits match the existing menu editor: 4 sections, 12 items in a section, 24 items in total. Blank rows are ignored. Every kept item is drawn, with type sized to the column. A long line is ellipsized on the board; the stored text is unchanged.

### Example

```json
{
  "mediaId": "rendered-png-id",
  "url": "https://signed-png",
  "durationMs": 30000,
  "kind": "image",
  "width": 1920,
  "height": 1080,
  "composition": {
    "layoutVersion": 1,
    "fallbackUrl": "https://signed-png",
    "video": {
      "mediaId": "promo-video-id",
      "url": "https://signed-mp4",
      "box": { "x": 1286, "y": 0, "w": 634, "h": 1080 }
    }
  }
}
```

`groupIndex` is not in this object. A presentation slide beside this board still carries its own slide counters.

Rollback does not require a new content version. While `LAYOUT_STUDIO` is not exactly `1`, player responses include `layoutStudio: false`. The player deletes `composition` and hides the zone video. A same-version URL refresh does the same when the new payload has no `composition`. Boards already published remain ordinary images. Existing menus, playlists, screens, and subscriptions are not rewritten. Flutter is not changed and does not call `/api/player/*`.

## Isolated preview

`/layout-studio` and `/dev/layout-studio` return 404 when `VERCEL_ENV` is `production`. A local server and a Vercel preview can open them. They do not write menus, playlists, or screens. Draft and publish preview are stored in this browser only. Opening the player check shows that published picture, not a built-in sample. Account draft and publish go through `POST /api/layout-studio` only when `LAYOUT_STUDIO` is exactly `1`. The route returns 404 before any database call otherwise. Draft writes `menus.content` and does not call `menu_swap_media`. Publish renders the PNG and swaps it with that existing function, so only that account's screens move. A photo or video must already belong to the same account. Inter and Noto Serif are the bundled faces; the published PNG uses the face stored on the board, and the preview loads that same face. Colors are the classic, fresh, and bold sets or a chosen primary and accent. The public preview does not turn the flag on and does not call this route. The behavior was proven on a disposable local database named `layout_studio_scratch`, which the test creates and drops. It was not run against production. This branch's preview deployment does not serve the rest of the app.

`onplaying` is not treated as a displayed frame. The zone is acknowledged only after the element has a video size and a current time, or after the 8 second still fallback. That check is not a hardware test.

Tests cover the five frames, rejected HTML and out-of-range splits, one-video parsing, and the acknowledgement rule: a video zone does not count as shown until it is playing, or until playback fails and the full still remains. They do not claim a device played two decoders.
