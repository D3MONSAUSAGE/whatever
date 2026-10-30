# M14: list paging, search and the end-to-end QA journey

## Lists (backward compatible)
`GET /api/media`, `GET /api/playlists` and `GET /api/displays` behave exactly as before when called without the new parameters: same plain-array shape, same order. They now read in 1,000-row pages internally, so large accounts get every row (previously PostgREST silently capped a response at ~1,000 rows), and URL signing and `.in()` lookups run in chunks.

Opt-in parameters (any one switches to the page envelope `{ items, total, offset, limit, nextOffset }`):
- `limit` (1-200, default 50), `offset` (default 0)
- `q`: case-insensitive name search
- `sort`: media `newest|oldest|name|size|duration`; playlists and screens `name`
- media only: `kind=image|video|upload|menu|promo`, `unused=1` (not in any playlist)

Media pages sign URLs only for the returned page. No database migration.

## Dashboard
- Media library loads 48 files at a time with "Load more", server-side search, a type filter ("All files, Images, Videos, My uploads, Menu boards, Promos"), "Not in a playlist", and a "Showing N of M files" line.
- Playlists and Displays show a search box once there are 6 or more.

## QA journey (tests/e2e/journey.spec.ts)
Sign-up, pair a simulated TV, upload, search/filter, publish a playlist (TV plays it), menu board, dated promo following the menu, times of day, offline alert, analytics, then every dashboard page at 390 px wide: heading visible, no sideways scroll, every visible control labelled, no page errors. Finally deletes the promo and menu in the UI and checks nothing is left for the account after cleanup.

Found and fixed by the pass: Delete on menu boards and promos did nothing (confirm dialog never rendered); the Playlists page scrolled sideways on phones with long playlist names.
