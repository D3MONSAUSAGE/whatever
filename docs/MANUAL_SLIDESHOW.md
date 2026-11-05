# Manual slideshow mode

Additive playlist option. Default remains **Automatic** (existing duration-based advance).

## Customers

1. Open a playlist in the dashboard.
2. Set **Playback** to **Manual slideshow**.
3. Save the draft, then **Publish** (or snapshot for schedules).
4. On the TV/browser player: one slide stays up until someone advances with the on-screen Previous/Next controls, or Left/Right keys (including TV remote D-pad where the browser reports arrow keys).

Boundaries **wrap** (last Next → first, first Previous → last), same idea as Automatic looping.

## Video / mixed media

Images are first-class. Videos in a Manual playlist **play once, then hold** on the last frame until the next advance. They do not loop themselves and do not auto-advance. Prefer image-only playlists for presentation use.

## Remote control from phone/dashboard

See [REMOTE_CONTROL_API.md](./REMOTE_CONTROL_API.md). Phone apps use `/api/remote/screens` + command/playback-mode POSTs. The TV receives commands via fast poll of `/api/player/state` (no Realtime; player has no Supabase JWT).

## Mobile (Gother)

HTTP API is additive:

- `GET /api/playlists/:id` includes `playbackMode` (`auto` | `manual`) and optional `publishedPlaybackMode`.
- `PATCH /api/playlists/:id` accepts optional `playbackMode`. Omitting it leaves the draft mode unchanged.
- Player state `playlist.playbackMode` is `auto` or `manual`.

Native playlist editors can ignore the field (stays Automatic) or surface the same Automatic / Manual choice. No native change is required for existing Automatic playlists or for TVs already on Automatic.

## Isolation

No Stripe, billing, Meta, or paid services. Migration `0016_manual_slideshow.sql` only.
