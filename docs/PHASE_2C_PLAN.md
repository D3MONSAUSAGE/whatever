# Phase 2C plan: dashboard UI

Audit of the live dashboard, then a visual and interaction pass. This is not a rebuild. Authentication, pairing tokens, account ownership, row-level security, and the TV player stay as they are. No database migration.

Production is not modified by this work. Do not merge and do not promote a deployment until the owner reviews the pull request.

## What exists today

Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4. No component library. Styling is `app/globals.css` (`ink`, `paper`, `line`, `muted`, `live`, `danger`) plus utility classes. Shared pieces are `components/tv.tsx` (screen bezel and online dot) and `components/toast.tsx`.

The browser talks to Supabase only to sign in (`lib/supabase-browser.ts`). Every read and write goes through `/api/*` with the user access token. The server uses the service role. The TV is `public/player.html` (ES5). It is not part of this phase.

A display is **online** when `last_seen_at` is within `ONLINE_MS` (60 seconds) in `lib/server/limits.ts`. That timestamp is the player heartbeat: the TV polls `/api/player/state` about every 10 seconds, and the server writes `last_seen_at` at most once every 30 seconds. There is no separate presence service. Offline means the last heartbeat is older than 60 seconds, or there has never been one. "Waiting" means the row exists but the TV has not collected its token yet (`connected === false`).

### Pages

| Route | What it does |
| --- | --- |
| `/` | Redirects to `/dashboard`. |
| `/login` | Email and password sign-in and sign-up. Supabase Auth, unchanged. |
| `/dashboard` | Counts online screens and library size. Empty account gets three pairing steps. Screen cards link to Displays. |
| `/dashboard/media` | Image upload (JPG/PNG/WebP, 15 MB, resized in the browser) and video upload (MP4 H.264, signed URL, progress). Grid, duration, size, delete. Empty copy is "No images yet". |
| `/dashboard/playlists` | Create, list, delete. Draft / published / unpublished-changes label. Slide count and how many TVs. |
| `/dashboard/playlists/[id]` | Name, default seconds, transition, slides, per-image seconds, video "Plays until the end", up/down reorder, save draft, publish to checked TVs, side preview. |
| `/dashboard/displays` | Pair with the 6-digit code, rename (`prompt`), disconnect (`confirm`), publish one image, show playlist name and `playerError`. |
| `/dashboard/settings` | Business name, email, player URL, sign out. |
| `/player` | Static player. Unchanged. |

Navigation is a desktop sidebar and a five-item bottom bar below the `md` breakpoint (768px). Buttons already use a 44px minimum height.

### Behavior that must keep working

Playwright in `tests/e2e/phone-and-tv.spec.ts` drives the phone UI. These accessible names stay:

- Links: Overview, Media, Displays, Playlists, Settings.
- Buttons: Sign out, Connect TV, Change image, Disconnect, Create playlist, Add images, Add selected, Publish, Up / Down labeled `Move {file} up`.
- Labels: Code on the TV, TV name, Playlist name, Seconds for {file}, Transition.
- Heading: Edit playlist. Display name is a heading.
- Empty library text: "No images yet".
- File inputs: `accept` contains `image` and `video`.
- Toast `role="status"` text includes "Published" and, for a bad video, "H.264".
- Checkbox names are the file name and the display name.
- Video slides say "Plays until the end".

Disconnect used a native `confirm()`. Phase 2C replaces that with one in-app dialog. The existing spec accepts that dialog by clicking **Disconnect this TV**. The server call is still `DELETE /api/displays/:id`.

Draft and publish already exist (`playlists.published_at`, `playlist_items.kind` of `draft` or `published`). Saving a draft does not change a TV. Publish copies the draft into the published snapshot and assigns the chosen displays. Existing published rows stay the live state. No new columns.

### Limits (unchanged)

| Kind | Rule |
| --- | --- |
| Image | JPG, PNG, or WebP. 15 MB. The phone resizes to a JPEG before `POST /api/media`. |
| Video | MP4 H.264 Baseline/Main/High, level ≤ 4.2, AAC or silent. ≤ 50 MB, 0.5 s–3 min, each edge ≤ 1920. `POST /api/media/upload` returns a signed URL. The browser `PUT`s the file. `POST /api/media/upload/complete` checks the object. |
| Playlist | Up to 40 slides. Image duration 1–600 seconds, or blank for the default. Video plays until it ends. |

Deleting a file that is still on a draft or published slide returns 409. The message now names the playlists. The file is not deleted. Removing it from the playlist does not delete the library file. Publish again so the published snapshot drops it, then delete.

## Design

Same palette and type stack. Cards, badges, a page header, skeletons, and one confirmation dialog are shared. Desktop keeps the sidebar. Phones keep the bottom nav and gain a short top bar with the product name. Tablet width (768px) is the sidebar breakpoint already in the app: at 768px and wider the bottom nav is hidden.

Overview shows total screens, online, offline, media, and playlists. Counts come from `/api/displays`, `/api/media`, and `/api/playlists`. Online and offline use the heartbeat rule above. Screen cards show the current thumbnail (the assigned image, or the first published slide of a playlist), the name, a status badge, the assigned file or playlist, the last heartbeat, and Manage. An account with nothing set up gets four steps: Upload media, Create a playlist, Assign a screen, Publish. A step checks off when the data says it is done. The checklist stays until all four are done.

Media keeps both upload buttons and adds a grid/list switch, search, sort, and a queue with per-file progress. The queue lives in the dashboard shell, so opening another page does not drop an upload. Closing or reloading the site still stops it, and the browser warns before that happens. Images report XHR progress. Videos report the signed-upload progress they already had. Validation errors stay in the toast (so the H.264 check is still announced) and in the queue row. Delete asks in the shared dialog. If `usedIn` lists playlists, the dialog explains where and does not delete. The API still returns 409 if the UI is stale. A playlist thumbnail is the draft slide with the lowest position, including when that slide is a video.

Playlists keep save draft and Publish. Slides can be dragged on a pointer that supports HTML drag, and Up / Down stay for phones and keyboards. The list shows a thumbnail, duplicate, and the screen names. Duplicate creates a new draft with the same slides and does not publish it. Full preview opens the loop in a dialog. The side preview stays.

Displays keep pairing, Change image, and the player error line. Rename and disconnect use the shared dialog. Last heartbeat is the real `lastSeenAt`. Assign playlist picks one playlist and one or more screens, then calls the existing `POST /api/playlists/:id/publish`. That publishes the **saved draft** (not unsaved editor fields) and, as it does today, clears this playlist from active screens that are unchecked. The dialog says so, and screens already on that playlist start checked.

### API additions (no migration)

- `GET /api/media` adds `usedIn: { id, name }[]`. Older clients ignore it.
- `DELETE /api/media/:id` 409 text names the playlists and still matches `/playlist/i`.
- `GET /api/playlists` adds `displayNames: string[]` and `thumbnailUrl`. Thumbnail is the first **draft** slide (video thumbnail when `kind` is video). Older clients ignore the fields.

If the playlist tables are missing, media still loads and `usedIn` is empty. Delete protection is unchanged. Playlist routes still return 503 with the existing message.

### Rollback

There is no SQL. To take the UI off production, promote the previous Vercel deployment. Pairing `localStorage`, accounts, media, playlists, and assignments are not rewritten. The extra JSON fields disappear with the old build. Published playlists keep playing.

```sql
-- No Phase 2C migration was applied. Nothing to roll back in Postgres.
```

## Tests

- API: deleting a slide that is in "Lunch loop" returns 409 and the body names that playlist.
- Playwright (existing): phone publish, playlist loop, video loop, account isolation. Disconnect confirms in the in-app dialog.
- Playwright (new): `tests/e2e/dashboard-ui.spec.ts` at 1440, 768, and 390. Login and logout, media upload and delete, playlist create, reorder, duplicate, preview, draft, publish, pairing, multi-screen assign, and a second account that cannot see the first. Video upload and playback run only when `POST /api/media/upload` is not 503. If `BASE_URL` is unset, or the video migration is absent, those cases skip with that reason. They are not reported as passed.
- The suite creates `pantalla-e2e-...@mailinator.com` users and deletes them, including storage objects, the same way as Phase 2B. Point `BASE_URL` at a local or preview origin, never at production data you cannot throw away.

Screenshot harness: `/preview` returns 404 unless `PANTALLA_UI_PREVIEW=1`. It renders the same shell and cards with sample data so a review image can be taken without a Supabase session. It is not linked from the app.
