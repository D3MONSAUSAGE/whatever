# One menu editor: architecture audit and checklist

Goal: one menu designer (Business → Menu → Photos → Look) for every board, optional item photos in every menu style, no lost features, no change to existing boards. Behind the `UNIFIED_MENU_EDITOR` flag (developers only until enabled).

## 1. Audit: what existed before this change

### Board types (all stored in `public.menus`, no schema change)

| Type | Stored as | Rendered by | Saved through | Who edits it today |
| --- | --- | --- | --- | --- |
| Premium templates (22) | `LayoutDocument` with `design` | `lib/menu-design-svg.ts`, the same SVG in the browser and resvg | `POST /api/layout-studio` (+ `/assign`) | Guided editor (`components/menu-templates.tsx`) |
| Original layouts (7): Two-column, Menu + promo, Two menus + promo, Three columns, Split showcase, Menu and banner, Signature | `LayoutDocument` without `design` | `layoutSvg()` in `lib/layout-studio.ts`, same SVG both sides | `POST /api/layout-studio` (+ `/assign`) | Layout Studio, the three-panel editor (`components/layout-studio.tsx`) |
| Classic full-screen menu (Classic night / Fresh day / Bold blue) | `MenuContent` (`template` = classic/fresh/bold) | `menuSvg()` in `lib/server/menu-render.ts`, server only; the editor shows the server PNG (`POST /api/menus/preview`) | `POST /api/menus`, `PATCH /api/menus/:id`; every save re-renders and swaps the image on its screens (no draft) | Classic editor (`components/classic-editor.tsx`), **and the Android app** |

`classifyBoardContent()` (`lib/menu-board-unify.ts`) tells the types apart: layoutVersion 1 → layout, otherwise classic.

### Entry points (`components/menu-boards.tsx`)
- **New menu board** with `MENU_TEMPLATES`: template gallery → guided editor. "Choose a layout instead" → layout picker → **Layout Studio** or **Classic editor**. These are the two other editors the report is about.
- **Edit** on a board: template boards → guided editor; layout boards → Layout Studio; classic → Classic editor.
- The guided editor's **Advanced editor** button opens the same board in Layout Studio.

### Where the editors differ

| Capability | Guided (templates) | Layout Studio (layouts) | Classic |
| --- | --- | --- | --- |
| Steps | Business, Menu, Photos, Look | Preview, Template, Section, Content, Style, Publish; zone tapping on the board | Preview, Content, Photo, Style, Publish |
| Title / subtitle / footer | ✓ | ✓ | ✓ |
| Sections / items, reorder, move across sections | ✓ | ✓ (column layouts: one section per column) | ✓ |
| **Per-item photos** | ✓ | ✗ (renderer ignores them) | ✗ (not in the data model) |
| Board photo | Library, upload, sample | Library, upload, per zone | Library, upload (right 38%) |
| Video | Library only | Library **and upload** (signed upload) | ✗ |
| Photo fit / position | ✗ | ✓ fit/fill, centre/top/bottom/left/right | ✗ |
| Feature / promo text | ✓ | ✓ | ✗ |
| Layout choice | 22 templates | 7 layouts | 3 themes |
| Proportion (split) | ✗ | ✓ slider per layout | ✗ |
| Column widths | ✗ | ✓ (three columns, two menus + promo) | ✗ |
| Colours | Colour styles per template, Brand Kit apply/restore, automatic contrast | Palette (classic/fresh/bold), text, background, feature, accent colours, Brand Kit apply, built-in colours | Theme + "Use my Brand Kit" |
| Fonts | Template fonts (restored by "Restore template style") | Heading font + body font | Fonts copied from the Brand Kit at creation |
| Type size | Automatic fit | Room / Counter | Automatic |
| Logo | ✓ | ✗ | From the Brand Kit |
| Capacity | Report + publish blocked if items don't fit | Long-menu reflow; reports shortened names | Two-column reflow |
| Save | Draft or Publish | Draft or Publish | Save = publish (re-render) |

### Rendering and publishing
- Template and layout boards: the editor preview is the exact SVG the server rasterises (fidelity test). Classic: the preview is the server PNG itself.
- Publish (layouts): `applyLayoutSave` checks media ownership, renders, swaps the image in every playlist and schedule already showing the board; `assign` adds new screens. Classic: `rerenderMenu` + `menu_swap_media`. Schedules and day-parts point at playlists, not editors, so they are untouched by editor changes.
- Item photos were drawn only for `design` boards (`renderLayoutPng`, `layout-boards.ts` both gated on `doc.design`).

### Android / older clients
- Android edits **classic** boards through `PATCH /api/menus/:id` and knows nothing about item photos. `parseMenuContent` drops unknown item keys, so any item photo on a classic board would be erased by an Android edit. Fonts already have this guard (`keepStoredFonts`).
- Android cannot edit layout/template boards: `PATCH` returns 409 for content/template edits on them (added with templates). Renaming and assigning still work.
- `POST /api/brand/apply` re-renders classic boards; it must load item photos too or a Brand Kit apply would drop them from the TV image.

## 2. Unification design

**One editor (`TemplateEditor`, now the menu designer) with three board engines behind it.** The interface, steps, terminology and item-photo controls are identical; only design-specific settings differ.

| Engine | Boards | Preview | Save |
| --- | --- | --- | --- |
| `design` | Premium templates | Shared SVG (client) | `/api/layout-studio` draft/publish |
| `layout` | Original 7 layouts | `layoutSvg` (client, identical to TV) | `/api/layout-studio` draft/publish |
| `classic` | Full-screen classic | Server PNG (`/api/menus/preview`, the TV image) | `/api/menus` (save updates its screens; no draft, which the editor says) |

Layout Studio controls move into the steps:
- **Menu:** sections/items, per-item photos. On column layouts each section is labelled "Column 1/2/3" and the editor says so.
- **Photos:** board photo (library/upload/remove), video (library/**upload**/remove) where the layout has a safe video area, feature/promo text. **Advanced:** photo fit and position.
- **Look:** design switcher (templates and original layouts in one list), colour styles or palette, item photos show/hide, Brand Kit apply/restore. **Advanced options:** text/background/feature/accent colours, heading and body fonts, type size (Room/Counter), proportion slider, column widths.

**One gallery:** 22 templates, 7 original layouts and the classic full-screen menu, with filters for business type, style, photo-friendly and layout structure, plus Start from scratch. Original layouts open in the same editor.

**Item photos everywhere:**
- Templates: as today.
- Original layouts and classic: optional compact thumbnails beside items that have a photo. Drawn only when an item has an owner photo and photos aren't hidden. Text shifts right; sizes follow the existing row height, so nothing overlaps and the layout keeps its identity. A board with no item photos is byte-for-byte unchanged.
- `photoStyle` ("thumbs"/"text") now also applies to original layouts. Classic boards get an optional `itemPhotos: false` (hide) flag.

**Existing boards:** open in the unified editor in their own engine. Nothing is converted. Switching an existing classic board to another design is offered as "start a new board with this content", because classic and layout boards are stored and published differently; the original stays as it is.

**Data safety:**
- Classic items accept an optional `imageMediaId`. `PATCH` keeps stored item photos when the client doesn't send the key (Android). Matching is by section index and item name.
- Every item photo id is checked against the account's media on save; foreign ids are dropped. Rendering loads only the account's own images.

## 3. Checklist

Status: ☑ done · ◐ partly · ☐ not done. Evidence is in the tests named.

- ☑ Audit board types, editors, renderers, publish paths, Android (this document)
- ☑ Flag `UNIFIED_MENU_EDITOR` (unset → developers; list; `all`; `off`), also needs `MENU_TEMPLATES` on for the account; returned as `unified` by `GET /api/menu-templates`; `?unified=off` / `?unified=on` per browser (`menu-unified.test.ts` › rollout flag)
- ☑ Original-layout item photo thumbnails in `layoutSvg`; `photoStyle` for every layout board; server loads item photos for every layout board (`menu-unified.test.ts` › item photos in every menu style)
- ☑ Classic item photos: data model, `menuSvg` thumbnails (now in shared `lib/menu-classic-svg.ts`), server art loading for save, preview and Brand Kit apply (`artFor`), ownership check (`keepOwnItemPhotos`), Android keep-stored guard (`keepStoredItemPhotos`), hide option (`itemPhotos: false`) (`menu-unified-patch.test.ts`)
- ☑ Unified editor: engines `design` / `layout` / `classic`, same four steps, same item photo controls (upload, choose from Media, replace, remove, preview)
- ☑ Layout Studio controls migrated: layout switch (in Look, templates and layouts in one list), proportion, column widths, photo fit/position, video library **and upload**, palette, text/background/feature/accent colours, heading/body font, type size, Brand Kit apply, built-in colours, feature text
- ☑ Classic controls: theme, Use my Brand Kit, fonts (Advanced), side photo, "Save and update screens" wording, screen picker
- ☑ One gallery: 22 templates + 7 original layouts + full-screen classic, filters for business, style, layout structure and photo-friendly, Start from scratch
- ☑ Existing boards open in the unified editor in their own engine, unconverted (`menu-unified.test.ts` › lossless classic boards; render baselines)
- ☑ Old boards unchanged: 63 layout baselines, 108 template hashes, render guard outputs (classic, layouts, promos) byte-for-byte equal
- ☑ Browser vs TV fidelity: 22 templates, 2 templates with owner photos, 7 layouts and 3 classic themes with item photos (`menu-design-fidelity.test.ts`)
- ☑ UX run in the preview harness: gallery, each engine, item photo add/hide/show, Advanced, switching; 1440 / 1024 / 390, EN/ES; axe 0 violations across all steps
- ☐ Layout Studio's on-board zone tapping is not reproduced (the same settings are in the steps instead)
- ☐ Old editors are still in the code for flag-off; remove them once the flag is `all` and stable

## 4. Testing on your account

1. Released to every customer (both `MENU_TEMPLATES` and `UNIFIED_MENU_EDITOR` unset = everyone; `LAYOUT_STUDIO=1` must be on). `developers` limits it to developer accounts, `off` turns it off.
2. Open Menu Boards → **New menu board**: one gallery with templates and original layouts. Try a template, an original layout (e.g. Two-column menu) and Full-screen menu.
3. In each: Business → Menu (tap a photo square to add a food photo) → Photos → Look (Advanced options at the bottom). Save draft / Publish (classic: Save and update screens).
4. Open an existing board of each type with **Edit**; it opens in the same editor and looks the same.
5. To compare with the previous editors in one browser, add `?unified=off` to the Menu Boards URL (`?unified=on` to return).

Rollback: set `UNIFIED_MENU_EDITOR=developers` (or `off`) and redeploy, or revert the release commit; one browser can opt out with `?unified=off`. Boards edited in the unified editor stay valid for the previous editors: item photos on original layouts and classic boards are optional fields those editors keep (classic) or ignore when drawing.
