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

`LAYOUT_STUDIO=1` must also be on. A single browser can opt out with `?templates=off`, and opt back in with `?templates=on`.

Boards already made from a template keep rendering and stay editable whatever the flag says. With the flag off they open in the Advanced editor.

## Rollback

Set `MENU_TEMPLATES=off` and redeploy. If a full code rollback is needed, redeploy the previous build: older code ignores the four extra fields and draws template boards with that build's layout renderer (the image already on screens is unchanged until the board is republished).
