# Menu boards and day parts (M10)

## What customers get
- **Media → Make a menu board** (also linked from the setup tracker's "Upload media" step).
- Three Seemple templates: *Classic night* (navy), *Fresh day* (light with blue header), *Bold blue* (blue with yellow price tags).
- Title, subtitle, up to 4 sections × 12 items (24 total), each with a price and optional description, plus a footer. Live preview.
- Optional "show on these screens now". Editing later updates every screen that shows the menu.
- **Schedule → Breakfast, lunch & dinner**: pick a screen or group, times (default 06–11, 11–16, 16–22) and a menu board or playlist for each part.

## How it works (no player change)
- The server renders SVG → **1920×1080 PNG** with `@resvg/resvg-js` (open source, runs in the Vercel function) and the bundled Inter fonts (`assets/fonts`, SIL OFL). No paid service.
- The PNG is stored as an ordinary `media` row/object, and a one-slide published playlist (30 s) is created for it. The existing player, offline cache, playlists and schedules use it unchanged; `player.html` is untouched.
- Editing renders a new PNG and calls `menu_swap_media`, which repoints every playlist item and directly assigned screen from the old image to the new one, bumps the playlist revision and screen content versions so TVs reload within one poll, then deletes the old image.
- Deleting a menu removes only the editable copy; its last image and playlist remain so nothing goes blank.
- Day parts are ordinary `schedules` rows (priority 10, all weekdays), created all-or-nothing.

## Database (0007_menu_boards.sql, additive)
- `menus` table (RLS on, no policies: server-only), `menu_create_playlist()`, `menu_swap_media()` (service role only).
- Rollback: redeploy the previous build. The table and functions can stay; nothing else reads them.

## API
See `docs/api/openapi.yaml`: `GET/POST /api/menus`, `GET/PATCH/DELETE /api/menus/{id}`, `POST /api/menus/preview` (PNG), `POST /api/schedules/day-parts`.

## Branding (M11)

- **Brand kit** — one per account in `brand_kits` (migration `0008_brand_kits.sql`, additive; RLS on, no client access). Logo (`logo_media_id`, cleared automatically if the media is deleted), main colour, highlight colour.
- **API** — `GET/PUT /api/brand`, `POST /api/brand/apply` (re-renders menus in batches of 8; menus with `useBrand: false` are skipped).
- **Menus** — `content.photoMediaId` adds a photo on the right 38% of the slide; `content.useBrand` (default true) turns the brand on or off per menu. No change to the `menus` table.
- **Images** — logos and photos must be PNG or JPEG from the same account, ≤15 MB. WebP is refused because the renderer can't draw it.
- **Readability** — colours are adjusted automatically: text on a brand background is black or white, whichever contrasts more (≥4.5:1); section headings fall back to white/black when the brand colour is too close to the background.
- **Saving the brand does not change existing screens.** Only "Apply to all menus" (or editing a menu) re-renders; screens then refresh like any menu edit. Player is unchanged.
- **Rollback** — redeploy the previous build. The `brand_kits` table and the two optional content fields are ignored by older code.
