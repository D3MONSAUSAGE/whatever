# Premium menu templates

A gallery of 18 professionally designed menu boards, plus a guided editor (Business → Menu → Photos → Look) shown when an owner clicks **New menu board**. It is behind a rollout flag.

## How it works

- **Templates are presets** (`lib/menu-designs.ts`). Picking one writes an ordinary Layout Studio document into a **new** board. That document has a layout, colours, fonts, realistic sample content and, optionally, a bundled stock photo. Nothing is live-linked: editing or adding templates never changes a saved board.
- **One renderer for preview and TV** (`lib/menu-design-svg.ts`).
  - The editor shows the same SVG that the server turns into the 1920×1080 PNG with resvg.
  - Text is measured from the bundled font files (`lib/board-font-metrics.ts`, regenerate with `node scripts/gen-font-metrics.mjs`). As a result, wrapping, automatic sizing and alignment are identical in the browser and on the TV.
  - `tests/unit/menu-design-fidelity.test.ts` checks this pixel by pixel.
- **Additive document fields**: `design`, `variant`, `stockPhoto` and `logoMediaId`. Boards without `design` take the original code path unchanged. `tests/fixtures/layout-svg-baseline.json` pins 63 existing board renders byte for byte.
- **Saving reuses the existing workflow**:
  - `POST /api/layout-studio`: Save draft never moves a screen. Publish swaps the image on every screen and schedule already showing the board.
  - `POST /api/layout-studio/assign` adds new screens.
  - No database migration.
- **Brand Kit**:
  - "Apply my Brand Kit" copies the kit's colours and logo into the board only. "Restore template style" removes them.
  - Text colours are adjusted automatically to keep body text at 4.5:1 or better and headings at 3:1 or better.
  - The saved Brand Kit is never written.
- **Media**:
  - Photos come from the account library, an upload (`POST /api/media`) or the template's bundled sample photo (`assets/menu-templates`, served to the browser from `public/menu-templates`; Unsplash licence, see `docs/MARKETING_PHOTOS.md`).
  - A muted video plays only in the template's photo area (`designVideoBox`).
- The **Advanced editor** (the existing Layout Studio) opens any template board.

## Rollout flag

Set in the deployment environment (Vercel → Project → Settings → Environment Variables), then redeploy:

| `MENU_TEMPLATES` | Who sees the gallery and guided editor |
| --- | --- |
| *(unset)* | Developer accounts only (`public.developer_users`) |
| `owner@example.com, other@example.com` | Developers plus these accounts (emails or account ids, comma-separated) |
| `all` | Every customer |
| `off` | Nobody, not even developers (kill switch) |

`LAYOUT_STUDIO=1` must also be on.

The unified menu designer (one editor for templates, original layouts and classic boards; see `docs/MENU_EDITOR_UNIFY.md`) has its own switch, `UNIFIED_MENU_EDITOR`, with the same values. It is only on for an account when `MENU_TEMPLATES` is on for it too. A single browser can opt out with `?templates=off`, and opt back in with `?templates=on`.

Boards already made from a template keep rendering and stay editable whatever the flag says. With the flag off they open in the Advanced editor.

## Rollback

Set `MENU_TEMPLATES=off` and redeploy. If a full code rollback is needed, redeploy the previous build: older code ignores the four extra fields and draws template boards with that build's layout renderer (the image already on screens is unchanged until the board is republished).

## Per-item food photos

- **Storage:** a photo belongs to its menu item, inside the board's existing JSON (`menus.content.sections[].items[]`). The item can have:
  - `imageMediaId`: the owner's photo, a same-account JPEG, PNG or WebP from Media;
  - `stockPhoto`: a template sample photo.

  No table or migration is involved. Items without these keys parse and render exactly as before.
- **Photos travel with items.** Editing, reordering, moving an item between sections (↑/↓ at a section edge) and switching templates all move whole item objects (`lib/menu-item-photos.ts`).
- **Presentation** (shared renderer, `lib/menu-design-svg.ts`; the editor preview and the TV PNG are the same SVG):
  - *Compact thumbnails:* small rounded photos beside items. This is the default on Taquería Specials.
  - *Food photo cards:* Photo Menu Grid and Café Favorites. Up to 15 cards per screen.
  - *Featured dishes:* Featured Dishes. Items with photos (up to 3) are shown large beside the full list.
  - *Text-focused:* the original 18 templates. With no owner photos they render exactly as before. **As soon as an item has an owner photo, item photos show automatically as compact thumbnails** beside the items that have one (no placeholder tiles for the others; the template's layout, fonts and colours are unchanged).
  - *Hiding is an explicit choice:* Look → "Hide (keep on items)" stores `photoStyle: "text"`. The photos stay on their items. The editor then shows a notice in the Menu step and in the photo dialog, a "Hidden" badge on the item's photo, and a one-tap **Show item photos** button. Card and featured templates always show photos.
  - *History:* until this fix, text-focused templates hid item photos unless thumbnails were turned on in Look, so a photo added to an item (e.g. Burrata on Modern Restaurant) appeared in the editor's item list but not on the TV. `tests/unit/menu-item-photos.test.ts` ("regression: … Burrata …") and the fidelity test (`modern-restaurant+item-photo`) cover it.
- **Images:**
  - Photos are always cropped to fill their box (`slice`), never stretched, and clipped to a rounded rectangle or circle.
  - Items without a photo show a tinted tile with the item's initial.
  - A photo that can't be loaded (deleted, or not the account's) falls back to that tile.
- **Ownership:** on save, every item photo and logo id is checked against the account's media rows (`applyLayoutSave`). A reference that isn't the account's own image is dropped from the stored board, and the item keeps its text. The server loads item photos only through `imageBytes` (account-checked) and reduces each to 900 px before drawing.
- **Nothing is cut silently:**
  - The renderer reports items that don't fit.
  - The editor explains why and offers a roomier template, hiding item photos, or moving the extra items to a second board (the current board is saved as a draft first).
  - **Publish is refused** (client and server) while any item doesn't fit; Save draft still works.
  - A long section may continue into the next column, but only when whole sections can't fit at any size, so menus that fit today render unchanged.
- **Older clients:**
  - `PATCH /api/menus/:id` (classic menus; used by the Android app) now refuses content and template edits on Layout Studio or template boards with HTTP 409 "edit on the web". Renaming and assigning to screens still work.
  - `POST /api/brand/apply` skips these boards.

  Before this, both re-rendered such boards with the classic renderer and overwrote their layout. The advanced editor keeps unknown item fields.

### Item sample photos

From Unsplash under the [Unsplash License](https://unsplash.com/license): free for commercial use, no attribution required. Ids (`https://images.unsplash.com/photo-<id>`):

salmon 1467003909585-2f8a72700288 · pasta 1621996346565-e3dbc646d9a9 · parfait 1488477181946-6428a0291777 · smoothie 1505252585461-04db1eb84625 · cinnamon 1509365465985-25d11c17e812 · bowl 1512621776951-a57141f2eefd · sandwich 1528735602780-2552fd46c7af · salad 1540189549336-e6e99c3679fe · donuts 1551024601-bec78aea704b · tacos 1565299585323-38d6b0865b47 · carnitas 1599974579688-8dbdd335c77f · streettacos 1551504734-5ee1c4a1479b · wings 1567620832903-9fc6debc209f · macarons 1569864358642-9d1684040f43 · cake 1578985545062-69928b1d9587 · chicken 1598103442097-8b74394b95c6 · muffins 1607958996333-41aef7caefaa · quesadilla 1618040996337-56904b7850b9 · burrito 1626700051175-6818013e1d4f.

Photos showing third-party brands (bottles, newspaper mastheads) were rejected.
