# Layout Studio audit (review only)

Status: isolated preview and player behavior, flag off, not deployed. The TV is the existing web player (`public/player.html` at `/player`). The Flutter app is a controller. It does not render boards. The proposal section is the contract.

Play-launch work, including the unmerged deletion billing fix, is unchanged by this note.

## Existing support

| Concern | What the player does today | Source |
| --- | --- | --- |
| Geometry | One item fills the screen. Images use `background-size: contain` (no crop). Video is scaled with `Math.min(screen/video)` and centered. Output boards that are exactly 1920×1080 fill a 16:9 screen. | `public/player.html` `.layer`, `fitVideo` |
| Menu source | `menus.content` is items, sections, prices, optional JPEG/PNG photo. Server draws SVG to a 1920×1080 PNG (`MENU_WIDTH`/`MENU_HEIGHT`) and stores a normal `media` row. | `lib/menu-templates.ts`, `lib/server/menu-render.ts`, `lib/server/menus.ts` |
| Other media | Playlist items are `image` or `video` only. Presentations are expanded into image slides before the player sees them. | `docs/PRESENTATION_GROUPS.md` |
| Timing | One `durationMs` per item. Automatic mode waits that long, then advances. Manual mode ignores duration. There is no per-zone clock. | `present()` in `public/player.html` |
| Video and audio | One visible video. `va` and `vb` only preload the next clip. Both are forced `muted`. A bad clip is skipped. Two simultaneous decoders are not supported and are not assumed. | `present`, `armVideo`, `buryVideos` |
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

A player that understands `layoutVersion: 1` paints the PNG, then starts at most one muted video in the box, using the existing video element. It must not send `playing.version` or treat `?v=` as that version until either the video is actually playing, or the video has failed and the full PNG (poster included) is what remains on screen. A pending video is not an acknowledgement. A hole, a menu with the video area missing, or a version ack for a frame that was not painted is not allowed.

There is no per-zone clock. The playlist item's existing `durationMs` is the only timer. Manual mode still ignores duration. Cache and offline keep using `mediaId`. The PNG and the video are separate cached files. If the video file is missing offline, the player falls back to the whole PNG and only then acknowledges.

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

Rollback is the flag off and the previous player script. Boards already published remain ordinary images. Existing menus, playlists, screens, and subscriptions are not rewritten.

## Isolated preview

`/dev/layout-studio` returns 404 when `NODE_ENV` is production. It does not write menus, playlists, or screens. Draft is the editor. Publish preview only freezes that picture in the browser.

Tests cover the five frames, rejected HTML and out-of-range splits, one-video parsing, and the acknowledgement rule: a video zone does not count as shown until it is playing, or until playback fails and the full still remains. They do not claim a device played two decoders.
