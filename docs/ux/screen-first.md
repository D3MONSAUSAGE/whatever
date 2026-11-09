# Screen-first Pekko

The screen is the workspace. Open Pekko, pick a screen or a group, see what is assigned, change it, preview, then publish. The phone app and the website share the endpoints in `docs/FLUTTER_MANAGEMENT.md`. Neither one gets a second library, scheduler, or publish path.

## Information architecture

- My Screens: all screens, screen groups, add a screen. Accounts that already have a screen start here.
- Content: media, menus and layouts, playlists, presentations.
- Schedules: upcoming, recurring, calendar. The existing schedule rules are the only clock.
- Account: settings, billing, support. Billing is unchanged.

`/dashboard/displays` and the other current routes stay. New work is added beside them.

## Screen workspace

`/dashboard/screens/[id]` will show the name, location, online or offline, last contact, what is assigned, and the next change. The picture is a preview of the assigned file, not a live camera of the TV. Sync is `reportedState`: assigned, acknowledged, playing, pending, or unknown. A player that does not report a version stays unknown. Offline copy tells the owner to check power and Wi-Fi.

## Precedence

Schedules sit on top of the saved assignment, by time.

1. A schedule aimed at that screen beats a schedule aimed at its group.
2. Higher priority, then the newest update, then the lowest id.
3. When no schedule matches, the screen plays its saved assignment.

Publishing a playlist uses `publish_playlist`. Screens on that playlist that are not in the request lose it. The dry-run lists them before anything is written. Assigning one layout board points only that screen at the board's playlist and does not clear the others. A later publish of the board still swaps the picture with `menu_swap_media`.

## URLs

Customers use `https://pekkotv.com`. `/pair` and `/tv` open the existing player page. Already paired TVs keep calling `/player` and `/player.html`. `GET /api/config` returns the three addresses. It does not return a Vercel hostname.
