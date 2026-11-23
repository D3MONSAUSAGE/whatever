# PR B: vertical (9:16) editor and renderers

Scope approved in t413u: portrait drawing for the existing templates only (no new templates, no style redesigns),
the editor's Horizontal/Vertical choice, the screen orientation setting, and non-blocking mismatch hints.

## Rendering
- One switch: `orientation: "portrait"` on the board (absent = landscape). Canvas 1080×1920; PNG `w` is the width.
- Landscape takes the same code path as before (portrait is a separate branch), so horizontal output is unchanged:
  - SVG + fit corpus (every layout/template × 9 document variants, plus classic): 2640 keys, 0 SVG differences vs main;
    fit reports differ from main only by the `canvasWidth/canvasHeight` fields added in PR A.
  - PNG hashes (every layout, every template variant, every classic theme; native and 640 wide): 152/152 identical to main.
  - `tests/fixtures/render-guard.json`: `lib/menu-classic-svg.ts` source hash updated (portrait branch added);
    all 27 pinned SVG outputs are unchanged. Player untouched.
- Portrait adaptations (minimal, same fonts/colours/sizes/readable floors):
  - Photo/video/feature columns become a full-width band at the bottom (customised media size = share of the height).
  - Multi-column menus stack or use fewer columns (1–2); card grids are at most 3 across; round-card prices sit under the text.
  - Layout studio: two-column / triple-column / two-menu-promo stack their columns as full-width rows.
- Nothing is dropped silently: the same BoardFit warnings and publish block apply. Tests check a vertical board never
  hides more items than the same horizontal board (sample and dense menus, every template).

## Editor and screens
- Step 4 Look: "Screen shape" Horizontal (16:9) / Vertical (9:16). Switching keeps every item, price, photo, video and setting.
  Save bodies always send the shape (explicit `landscape` turns a vertical board back; the server keeps the stored
  value only for clients that omit it). The 16:9-only advanced editor button is hidden for vertical boards.
- Screen page: "How this TV is mounted" (PATCH `{orientation}`), pair form option (sent only when vertical). Copy says
  Pekko can't rotate the TV. A hint appears when the TV reports a picture of the other shape.
- Publish dialog: per-screen hint when the board and the screen differ ("will show centered with empty space; it won't be
  stretched"). Never blocks publishing.
- Thumbnails: `?orientation=portrait`; `CATALOG_RENDER_REVISION` 1 → 2 (catalog version changes; landscape pixels identical).
