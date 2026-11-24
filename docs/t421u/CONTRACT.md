# t421u Shared Settings Contract — Item photo size + Featured photo framing (DRAFT for Gother)

Status: **proposal, not implemented**. Pantalla owns this contract; Gother to confirm before any shared API change.
Applies to `layoutVersion: 1` documents (`menus.content` JSON). **No database migration. No `custom.v` bump**
(stays `1`, so every shipped Android editor keeps editing; new keys are optional and ignored by older clients).

## 1. Fields

| Field | Where | Type / bounds | Absent means | Who already knows it |
|---|---|---|---|---|
| `itemPhotoSize` | **top-level** (sibling of `photoStyle`, `imageFit`) | `"small" \| "medium" \| "large"` | legacy size, which is **exactly "small"** (byte-identical render) | new |
| `imageFit` | top-level (existing) | `"cover"` (Fill) \| `"contain"` (Fit) | `"cover"` | all clients |
| `imageAnchor` | top-level (existing) | center/top/bottom/left/right | center | all clients |
| `custom.imageFocus` | `custom` (existing) | `{x, y}` percent, each clamped 0–100, 2 dp | no focal point (template placement) | web + Android ≥ guided-customization builds |
| `custom.imageZoom` | `custom` (new) | number, clamped **1.0–3.0**, 2 dp, UI step 0.05 | 1.0 | new |

Why these placements:
- The server keeps unknown keys **inside `custom`** and drops unknown top-level/item keys; Android round-trips both
  top-level and `custom.*`. `itemPhotoSize` is top-level so it does **not** switch a board onto the customized render
  path (`activeCustom`) — an uncustomized board with only `itemPhotoSize` keeps the template's own text fitting.
  `imageZoom` sits next to `imageFocus` because they are applied together by the same placement code.
- Nothing is stored per item (the server drops unknown item keys). The setting is per board.

### Example
```json
{
  "layoutVersion": 1, "design": "modern-restaurant", "template": "split-50",
  "itemPhotoSize": "medium",
  "imageFit": "contain", "imageAnchor": "center",
  "custom": { "v": 1, "imageZoom": 1.35, "imageFocus": { "x": 42, "y": 60 } }
}
```

## 2. Item photo size (Fix 1)

### Rendering (shared renderer only, `lib/menu-design-svg.ts`)
Thumbnail ladders (ratio × item-name size, same mechanism as today):

| Preset | Ratios tried (× item-name size), first accepted wins | Then |
|---|---|---|
| small (= absent/legacy) | 2.3, 1.8, 1.4, 1.15 (unchanged) | text-only fallback (`photosSuppressed`), unchanged |
| medium | 3.0, 2.8, 2.6, 3.2, 3.5, 3.8 | Small result |
| large | 3.8, 3.5, 3.2 (reported large), then 3.0, 2.8, 2.6 (reported medium) | Small result |

Safety rules (deployed): Small is always computed first exactly as before. A larger ratio is accepted only if
1. it drops no more items than Small;
2. the fitted menu scale is **≥ 0.88 ×** Small's scale (text at most 12% smaller to make room);
3. it shortens ("…") no more names/descriptions than Small;
4. the drawn thumbnail edge really is bigger: **≥ 1.12×** Small's for medium, **≥ 1.3×** for large;
5. the thumb edge is capped at `0.38 × column width`.
Otherwise the board draws exactly the Small result. `report.itemPhotos = { requested, effective }` (fit echo
`itemPhotos`) says what was drawn; `effective: null` = photos left off (as before).
Measured on the seed menus with a few item photos: Medium/Large take effect on ~85% of template × orientation cases;
with a photo on every item of a dense 3-section menu, about half fall back to Small (shown with the reduced note).

Per composition:
- `showcase`, `columns`, `promo`, `list` (all 22 food + 16 non-food that use them): ladders above, horizontal and vertical.
- `cards`: photo share of each card — small = today (rect `0.58/0.50/0.46` of card height by rows; circle
  `min(0.66·cardW, 0.52·cardH)`), medium = +0.06, large = +0.12 (circle: `0.72/0.57`, `0.78/0.62`); existing
  description-dropping/name-shrink logic keeps name + price; if name/price would hit the floor, step down.
- `featured`: dish-card photo `side` small = today (`k===1 ? 520 : 300`), medium = `560 / 340`, large = `600 / 380`,
  bounded by card height and a ≥ 300 px text column; the rest-of-menu list uses the ladders.
- Original layouts and classic boards: **not in this round** (row-height thumbnails). Field accepted and preserved,
  ignored by those renderers; spec reports `itemPhotoSize: null` so clients hide the control.

### Defaults and backward compatibility
- **Existing boards**: no `itemPhotoSize` → render byte-identical to today (pinned by tests). Nothing is backfilled.
  A live TV only changes when the owner picks a size and publishes.
- **New boards**: the seed document (`designDocument()`, used by the web gallery and the catalog
  `entries[].create.document` that Android posts) carries the template default:
  `list` → `"large"`; `showcase`, `columns`, `promo`, `cards`, `featured` → `"medium"`. Because Android sends the
  catalog seed as-is, even older Android builds create new boards with the default. No server-side insert hack.
- `switchDesign()` keeps the board's `itemPhotoSize` (the owner's choice travels; absent stays absent).
- UI: an absent value shows **Small** selected (because it is Small).

### Spec / catalog (additive)
`customizationSpec()` and catalog `entries[].customization` gain
`itemPhotoSize: { def: "medium" | "large" } | null` (null = control hidden). `CUSTOMIZATION_META` gains
`itemPhotoSizes: ["small","medium","large"]`. Older Android `tryParse` ignores both.

## 3. Featured photo framing (Fix 2)

### Model (one formula everywhere)
For featured box `B` (unchanged; still sized by `custom.mediaSize`) and photo natural size `(iw, ih)`:
```
base  = imageFit == "contain" ? min(Bw/iw, Bh/ih) : max(Bw/iw, Bh/ih)
s     = base × zoom                          // zoom = custom.imageZoom ?? 1
w, h  = iw·s, ih·s
focus = custom.imageFocus ?? anchorFocus(imageAnchor)   // center 50/50, left x=0, right x=100, top y=0, bottom y=100
x     = Bx + (Bw − w) · focus.x/100
y     = By + (Bh − h) · focus.y/100
draw: [Fit backdrop if w<Bw or h<Bh] + <image x y w h preserveAspectRatio="none"> clipped to B
```
- Works in both modes: in Fill, focus picks the crop; in Fit, focus slides the whole photo inside the spare space,
  and zoom > 1 grows it from "whole photo" toward/through "fills the area". Fit + zoom covers the full range between
  Fit and Fill, which fixes a wide photo cropped badly (pick Fit, or Fill + move the focus).
- **Legacy path untouched**: when neither `custom.imageFocus` nor `custom.imageZoom` is set, the renderer emits exactly
  today's `<image preserveAspectRatio=…>` (Fill or Fit). Existing Fill+focus boards keep `focusPlacement()` output
  (zoom 1 = same numbers).
- Natural size unknown (editor before the probe resolves): same formula approximated with an enlarged box and
  `slice`/`meet`; the server always has the size (extend the `imageDims` call in `layout-render.ts` to run when
  `imageZoom` or `imageFocus` is set, any fit). Web preview, Android preview (server PNG) and TV PNG all use the exact path.
- Original file never changes (no crop/re-encode); only the drawing transform.

### Fit backdrop
Under a Fit photo the unused part of `B` is filled with the template's panel colour (`designColors().panel` on
templates; the feature pane colour on original layouts). Production has **0 boards with `imageFit: "contain"`**, so no
live board changes; the pinned `photo-contain-*` fixtures in `scripts/customization-baseline.ts` /
`tests/fixtures/customization-default-baseline.json` are updated intentionally and only for those keys.

### Reset
"Reset photo" restores the template's own framing: delete `custom.imageZoom` and `custom.imageFocus`
(`applyCustomReset` / `CustomEditor.resetPaths` paths `custom.imageZoom`, `custom.imageFocus`) **and** set
`imageFit: "cover"`, `imageAnchor: "center"` (the `designDocument()` defaults). Container size (`custom.mediaSize`)
has its own existing Reset and is not touched. "Reset all" (`custom` + heading overrides) keeps working.

### Where it applies
Templates whose spec has `imageFocus: true` (`showcase`, `columns`, `promo`, all 7 original layouts), horizontal and
vertical. Not `list`/`cards`/`featured` (no board photo). **Not videos**: when a video is the featured media the controls
are hidden and nothing about video placement changes. `CUSTOMIZATION_META` gains `imageZoom: { min: 1, max: 3, step: 0.05 }`.

## 4. Server validation (`parseLayout` / `parseCustom`)
- `itemPhotoSize`: kept when one of the three values; `null`/absent → omitted; any other value → **400**
  `"Check the look settings."` (same rule as malformed known `custom` keys).
- `custom.imageZoom`: number → clamp 1–3, round 2 dp; non-number → 400; `1` is stored as given (clients delete the key
  to mean default).
- `custom.imageFocus`: unchanged (clamp 0–100, 2 dp); now also honoured in Fit.
- Unknown `custom` keys still preserved; `custom.v > 1` still preserved and not applied (zoom/focus included).
- `custom` size cap (4 KB) unchanged.
- **Older Android saving**: it sends back the key bag it loaded, so `itemPhotoSize` and `custom.imageZoom` survive.
  The save path replaces the whole document, which is safe because no new key lives where the server or Android drops
  keys (items). **No server-side merge is required.** Optional cheap guard, `itemPhotoSize` only: on update, if the
  stored document has it and the incoming document omits the key entirely, keep the stored value (no current client
  can clear it by omission, since absent is never a user choice). Do **not** do this for `custom`, because an absent
  `custom` is how "Reset all" is expressed.

## 5. Fit report additions (`/api/layout-studio/preview` `format: "fit"`, `BoardFit`)
`itemPhotos: { requested: "small"|"medium"|"large", effective: "small"|"medium"|"large"|null }` and
`photo: { fit, zoom, focus: {x,y} | null, natural: {w,h} | null }` (echo of what was drawn). Additive only.

## 6. UI (web; Android mirrors)
Step 4 Look, progressive disclosure:
- **Basic**: "Item photo size" Small / Medium / Large (segmented, ≥ 44 px targets; shown only when the board shows item
  photos and the spec allows it) · "Featured photo" Fill / Fit (moved up from Advanced; only with a featured photo,
  not video) · existing "Featured photo size" slider (container) stays.
- **Advanced** (existing collapsed section, "Featured photo" fieldset): Zoom slider (100–300%), "Drag the photo in the
  preview to move it" + existing X/Y sliders kept as the accessible fallback, Reset photo.
- Preview: in Step 4, dragging the featured-photo region moves `imageFocus` (pointer events, `touch-action: none`
  while dragging, 6 px tap-vs-drag threshold; tap still jumps to the size control; arrow keys nudge 2%).
- Step 3 Content's duplicate Fill/Fit stays (same field); its anchor `<select>` is hidden when `custom.imageFocus` is set.

## 7. EN/ES label keys (new)
| Key | EN | ES |
|---|---|---|
| `cz.itemPhotoSize` | Item photo size | Tamaño de las fotos de los artículos |
| `cz.itemPhoto.small` | Small | Pequeño |
| `cz.itemPhoto.medium` | Medium | Mediano |
| `cz.itemPhoto.large` | Large | Grande |
| `cz.itemPhotoReduced` | Showing {size} so every item and price still fits. | Se muestra en {size} para que todos los artículos y precios quepan. |
| `cz.featuredFraming` | How the photo fills its area | Cómo la foto llena su área |
| `cz.zoom` | Zoom {n}% | Ampliación {n}% |
| `cz.dragHint` | Drag the photo in the preview to choose what shows. | Arrastre la foto en la vista previa para elegir qué se ve. |
| `cz.photoReset` | Reset photo | Restablecer foto |
| `cz.fitBackdrop` | Empty space uses the template colour. | El espacio libre toma el color de la plantilla. |
| `cz.hitMediaDrag` | Featured photo. Drag to move it, or use the arrow keys. | Foto destacada. Arrástrela para moverla o use las flechas. |
Reused: `cz.fill` (Fill the area / Llenar el área), `cz.fitWhole` (Show the whole photo / Mostrar la foto completa),
`cz.photo`, `cz.focusX`, `cz.focusY`, `cz.reset`, `cz.mediaSize`.

## 8. Final decisions (Phase B, deployed)
- `custom.v` not bumped. `itemPhotoSize` top level; `custom.imageZoom` next to `custom.imageFocus`.
- No server-side guard keeping a stored `itemPhotoSize` when the key is missing: clients send `"small"` explicitly.
- "Reset all" unchanged. "Reset photo" = delete zoom + focus, Fill, center; `mediaSize` untouched.
- Framing controls hidden when the featured media is a video. Original layouts and classic boards out of scope
  (spec `itemPhotoSize: null`, control hidden).
- Gother notes adopted: drag also on the pinned Look preview; X/Y shown in Fit and Fill; `{size}` placeholder in ES.

## 8b. Questions for Gother (answered GO-with-notes)
1. OK with `itemPhotoSize` top-level and `custom.imageZoom` (vs. a nested `custom.featuredImage` object)?
2. Confirm every Android build that can save `layoutVersion: 1` (+17…+34) round-trips unknown top-level keys and
   unknown `custom.*` keys (our read of `layout_document.dart` / `custom_editor.dart` says yes).
3. Android new boards: confirm it posts the catalog `create.document` unchanged (so the default is seeded).
4. Drag on Android preview: the preview is a server PNG — fine to update `imageFocus` locally during the drag and
   re-request the PNG on release (debounced), or would you rather ship sliders first?
5. Reset semantics above (delete zoom+focus, set Fill/center) OK?

## 9. Implementation plan (focused PRs, after Gother agrees)
1. **PR-A Contract + renderer (server/shared)**: `lib/board-custom.ts` (types, `parseCustom` zoom, spec + meta),
   `lib/layout-studio.ts` (`parseLayout` itemPhotoSize, `layoutPhoto` placement), `lib/menu-design-svg.ts`
   (ladders, cards/featured presets, `photoImage` placement + backdrop, report), `lib/server/layout-render.ts`
   (natural size when zoom/focus), `lib/board-fit.ts` + preview route echo, `lib/menu-catalog.ts`, `designDocument()`
   defaults, `docs/FLUTTER_MANAGEMENT.md` contract section. Tests: legacy byte-identical pins, ladders, clamping, 400s,
   round-trip with unknown keys, older-client save simulation, all 38 templates × 16:9/9:16 × S/M/L.
2. **PR-B Web editor**: `components/menu-customize.tsx` (Basic size + Fill/Fit, Advanced zoom/reset),
   `components/menu-templates.tsx` (drag on featured region, notice, Step 3 anchor hide), i18n EN/ES. Playwright:
   desktop + 390 px mobile, EN + ES.
3. Merge + deploy A then B (A is invisible without B except seeds for new boards); health check, rollback target
   recorded. Gother builds the Android controls and the next signed private APK against the deployed contract.

## 10. Test matrix (t421u items)
| # | Item | How |
|---|---|---|
| 1 | Small/Medium/Large thumbnails | unit: thumb px per preset per composition; SVG snapshots |
| 2 | Dense menus | 24-item boards: no extra dropped items, scale ≥ 0.88× small, effective preset reported |
| 3 | Long names/prices | 40-char names, 12-char prices: no "…" added vs small, price x within column |
| 4 | Fit and Fill | placement math (wide/tall photos), backdrop only in Fit |
| 5 | Zoom + reposition | clamp 1–3, focus 0–100, exact placement equals `focusPlacement` at zoom 1 |
| 6 | Reset | paths delete zoom/focus, fit→cover, anchor→center, mediaSize untouched |
| 7 | Save/reopen/edit/publish | API flow tests through real routes; PNG size 1920×1080 / 1080×1920 |
| 8 | Horizontal + vertical | every case in both orientations |
| 9 | All food templates (22) | loop over designs |
| 10 | 16 non-food templates | loop; `non-food-svg-baseline.json` unchanged for seeds without photos |
| 11 | Existing boards regression | pinned baselines for docs without new keys byte-identical; replay of the 6 prod boards with item photos (read-only copies, rendered locally) unchanged |
| 12 | Web desktop + mobile | Playwright 1440 px and 390 px, touch drag |
| 13 | Android | Gother: controls, round-trip, server-PNG preview matches web SVG |
| 14 | EN + ES | i18n key parity test + ES screenshots |
| 15 | TV player | publish to a test screen on a QA account; player PNG matches editor SVG render |
