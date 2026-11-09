# Layout Studio audit (review only)

Status: proposal. Not implemented, not flagged on, not deployed. The TV is the existing web player (`public/player.html` at `/player`). The Flutter app is a controller. It does not render boards.

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
| Version | The screen's `content_version` is the payload `version`. The player sends `?v=` for what it is showing. `unchanged: true` means keep the current slide. Unknown JSON fields are ignored. There is no capability handshake. | `app/api/player/state/route.ts`, `pollState` |
| Group counters | Optional `groupIndex` / `groupCount` (0-based index, count of slides in that presentation). Manual UI shows `2/12` when `groupCount > 1`, and adds the playlist position when the playlist is longer than the group. Remote next/prev steps expanded slides. | `updateManualPos`, `copyGroup` |

Saving a menu today calls `menu_swap_media`, which repoints playlist rows and bumps `content_version`. There is no draft. Android and the player both treat the result as an image. Limits stay 4 sections, 12 items per section, 24 total. WebP cannot be drawn. Sample content already exists in `sampleMenu()`.

## Proposal (layoutVersion 1)

Not built. Gated later by `LAYOUT_STUDIO` exactly `1`. Unset keeps the three current templates and save-as-publish.

Five fixed 16:9 frames, geometry owned by the server for that version. The client sends slot content only. Free coordinates, HTML, and script are rejected. A saved board copies the version's boxes so a later template edit does not move it.

| Id | Frame |
| --- | --- |
| `menu-promo-67` | Menu 1280×1080, side 640×1080 |
| `triple-column` | Three 640×1080 columns |
| `split-50` | Two 960×1080 panes |
| `menu-banner` | Main 1920×920, bottom banner 1920×160 |
| `signature` | Full-bleed 1920×1080 with one readable overlay panel |

Zones are `menu`, `text`, or `image`. An image slot references a JPEG or PNG `mediaId` owned by the same account. A video chosen for a slot contributes its existing thumbnail to the PNG. It does not start a second decoder and it does not unmute. A playing video stays a later playlist item, one at a time, as today.

All zones share the published slide's one `durationMs` (menus use 30 seconds today). Per-zone timing is not proposed, because the player has one clock per item.

Publish renders one PNG through `renderMenuPng` and the existing `menu_swap_media` path. Draft save writes `content` only and does not bump screens. The player payload does not gain a zone list, so no capability negotiation is added. `groupIndex` / `groupCount` stay presentation-slide counters and are not reused for zones.

Rollback is the flag off and the previous deploy. Boards already published remain ordinary images. Existing menus, playlists, screens, and subscriptions are not rewritten.

### Example document

This is the proposed `menus.content` shape. Boxes come from the version catalog. They are not client input.

```json
{
  "layoutVersion": 1,
  "template": "menu-promo-67",
  "title": "Today's menu",
  "useBrand": true,
  "zones": [
    {
      "id": "menu",
      "type": "menu",
      "box": { "x": 0, "y": 0, "w": 1280, "h": 1080 },
      "source": {
        "kind": "items",
        "sections": [
          { "name": "Tacos", "items": [
            { "name": "Al pastor", "price": "$3.50", "description": "Pork, pineapple, onion" }
          ] }
        ]
      }
    },
    {
      "id": "feature",
      "type": "image",
      "box": { "x": 1280, "y": 0, "w": 640, "h": 1080 },
      "source": { "kind": "media", "mediaId": "00000000-0000-4000-8000-000000000001" }
    }
  ]
}
```

The published player item stays:

```json
{ "mediaId": "rendered-png-id", "url": "https://signed", "durationMs": 30000, "kind": "image", "width": 1920, "height": 1080 }
```

## Tests before any shared preview

Unit tests for the five frames at 1920×1080, long prices, overlay contrast, and rejection of HTML, WebP, and another account's media. Existing classic, fresh, and bold menus stay valid. Do not write boards on a Vercel preview that uses the production database. Local tests only.
