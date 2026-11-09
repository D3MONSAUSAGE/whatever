# Screen-first Pekko

The screen is the workspace. Open Pekko, pick a screen or a group, see what is assigned, change it, preview, then publish. The phone app and the website share the endpoints in `docs/FLUTTER_MANAGEMENT.md`. Neither one gets a second library, scheduler, or publish path.

## Information architecture

- My Screens: all screens, screen groups, add a screen. Accounts that already have a screen start here.
- Content: a landing page for the media library, menus and layouts, playlists, and presentations. Those pages are unchanged.
- Schedules: upcoming for the next 7 to 14 days, recurring windows, and a week/month overview. The existing schedule rules are the only clock. Editing a rule stays on Rules.
- Account: settings, the existing billing page, and support. Billing is unchanged.

The website labels are My Screens, Content, Playlists, Schedules, and Account. Playlists stays beside Content because a playlist is still its own page.

`/dashboard/displays` and the other current routes stay. New work is added beside them.

## Screen workspace

`/dashboard/screens/[id]` shows the name, location, online or offline, last contact, what is assigned, and the next change. The picture is a preview of the assigned file, not a live camera of the TV. From that page the owner uploads into the existing library, changes the picture, video, document, menu, playlist, or layout, opens Layout Studio with `?screen=`, edits the playlist, saves a schedule, and publishes after a confirmation. Sync is `reportedState`: assigned, acknowledged, playing, pending, or unknown. A player that does not report a version stays unknown. Offline copy tells the owner to check power and Wi-Fi.

## Precedence

Schedules sit on top of the saved assignment, by time.

1. A schedule aimed at that screen beats a schedule aimed at its group.
2. Higher priority, then the newest update, then the lowest id.
3. When no schedule matches, the screen plays its saved assignment.

`POST /api/displays/publish` adds the playlist to the screens you pick. `willBeCleared` lists screens already playing it that you did not pick. They keep it unless `replace` is true, and the website asks before that. `POST /api/playlists/:id/publish` still uses `publish_playlist` as before. Assigning one layout board points only that screen at the board's playlist. A later publish of the board still swaps the picture with `menu_swap_media`.

## URLs

Customers use `https://pekkotv.com`. `/pair` and `/tv` open the existing player page. Already paired TVs keep calling `/player` and `/player.html`. `GET /api/config` returns the three addresses. It does not return a Vercel hostname.
