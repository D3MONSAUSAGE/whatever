# Phase 2A plan: playlists and slideshows

Audit of the live Pantalla app and the smallest backward-compatible change that adds playlists. This phase does not include video, scheduling, or a dashboard redesign.

The production database is not modified by this work. Apply `supabase/migrations/0002_playlists.sql` only after the pull request is approved.

## What exists today

### Schema (`supabase/migrations/0001_init.sql`)

| Table | Role |
| --- | --- |
| `accounts` | One row per owner (`owner_user_id` unique). |
| `locations` | Created with the account (`Main location`). Not shown in the UI. |
| `media` | Image metadata. Bytes live in the private `media` bucket at `<account_id>/<media_id>.<ext>`. |
| `displays` | A paired TV. `assigned_media_id` is the one image on screen. `content_version` increments when that assignment changes. `token_hash` is the SHA-256 of the TV's secret. |
| `pairing_sessions` | 6-digit code claim flow. Service role only. |
| `rate_limits` | Fixed-window counters. Service role only. |

`displays.assigned_media_id` is the only content assignment. There is no playlist table.

Row level security is enabled on every table. `authenticated` can `SELECT` its own account, locations, media, and displays (column grant on displays omits `token_hash`). There are no insert/update/delete policies. `pairing_sessions` and `rate_limits` have no grants for `anon` or `authenticated`.

Server functions (`ensure_account`, `rate_limit_hit`, `cleanup_stale`, `claim_pairing`, `player_state`, `assign_media`, `delete_media`) are not `SECURITY DEFINER`. Execute is granted to `service_role` only. `search_path` is empty.

### Request flow

1. The dashboard signs in with the Supabase browser client. Every read and write goes through `/api/*` with the user access token. `requireAdmin` validates the token and calls `ensure_account`.
2. Routes use the service-role client and always pass `account_id` from that session.
3. `PATCH /api/displays/:id` with `{ mediaId }` calls `assign_media`, which checks the image belongs to the account, sets `assigned_media_id`, and increments `content_version`. `null` clears the screen.
4. `DELETE /api/media/:id` calls `delete_media`, which clears that image from displays (and bumps their version), deletes the row, and returns the storage path for the route to remove.
5. The TV (`public/player.html`, ES5) polls `GET /api/player/state` every 10 seconds with `X-Display-Token` and `?v=<content_version>`. The route calls `player_state`, which heartbeats `last_seen_at` at most once per 30 seconds and returns `content_version`, `media_id`, and `storage_path`.
6. When `v` matches, the response is `{ version, unchanged: true }` and no signed URL is minted. Otherwise the route returns `{ version, mediaId, url }` (URL null when nothing is assigned). The player preloads the image and paints it on top of the previous one. A failed poll or a failed image leaves the last picture up.

A display with one image assigned must keep this exact response shape and this player behavior.

### Dashboard

Navigation is Overview, Media, Displays, Settings (`app/dashboard/layout.tsx`). Displays publishes a single library image. There is no playlist UI.

## Design

### New tables and one new column

`0002_playlists.sql` only adds objects.

- `playlists`: account, name, draft `default_duration_ms` (1s–600s, default 10s), draft `transition` (`none` or `fade`), `published_at`, `published_transition`, `revision`, timestamps.
- `playlist_items`: rows for both the editable draft and the published snapshot (`kind` is `draft` or `published`). Position, optional per-slide `duration_ms`, `media_id`, denormalized `account_id`. Unique on `(playlist_id, kind, position)`. At most 40 slides.
- `displays.assigned_playlist_id`: nullable FK to `playlists`, `ON DELETE SET NULL`. Indexed. No existing column is altered.

Draft rows are what the editor saves. Published rows are what a TV plays. Saving a draft does not increment `content_version`, so a TV that already loaded a playlist keeps playing it. Publishing copies draft items into the published snapshot (duration resolved as slide override or playlist default), sets `published_transition`, increments `revision`, assigns the chosen displays, clears `assigned_media_id` on those displays, and increments `content_version`.

Displays that were showing this playlist and are unchecked are unassigned and their version is incremented, so the TV leaves the slideshow. Publishing a single image goes through the existing `assign_media` function, whose body is replaced to also clear `assigned_playlist_id`. The function signature does not change. When `assigned_media_id` is set, the player API does not look at a playlist.

`playlist_items.media_id` uses `ON DELETE CASCADE` so deleting an account (which already cascades to `media`) still succeeds. The app does not take that path for a single image. `delete_media` is replaced (same signature) to raise `media_in_playlist` before the delete when any draft or published item still points at the image, and the media route returns 409 with an explicit message. Removing the image from the playlist and publishing again (so the published snapshot drops it) allows deletion. Images that are only on a display, not in a playlist, still clear that display and delete, as they do today.

### Security

RLS is enabled on `playlists` and `playlist_items`. `authenticated` gets `SELECT` only, limited to rows whose `account_id` belongs to `auth.uid()`. No insert, update, or delete grants. New functions follow the existing pattern: `search_path` empty, not security definer, `REVOKE` from `public` / `anon` / `authenticated`, `GRANT` to `service_role`.

`assigned_playlist_id` is added to the displays column grant so a display read that lists columns still works. `token_hash` stays excluded. Storage is unchanged: the player and the dashboard receive signed URLs from the service role. No browser storage policy is added.

New functions:

| Function | Purpose |
| --- | --- |
| `save_playlist` | Replace draft name, timing, transition, and draft items. Does not touch the published snapshot or any TV. |
| `publish_playlist` | Snapshot the draft and assign it to the given displays. |
| `delete_playlist` | Bump version on TVs showing it, then delete. |
| `player_playlist` | Published slides for the display token. Empty when the display has a single image assigned. |

`player_state` is not modified, so the heartbeat and the single-image query stay as they are.

### API

| Route | Behavior |
| --- | --- |
| `GET/POST /api/playlists` | List or create. |
| `GET/PATCH/DELETE /api/playlists/:id` | Read, save draft, delete. |
| `POST /api/playlists/:id/publish` | `{ displayIds }` publishes to those active displays in the same account. |

`GET /api/player/state` keeps today's JSON when the display has a single image or nothing assigned. When a playlist is assigned and the version changed (or `refresh=1` on an unchanged playlist version), the body adds:

```json
{
  "version": 4,
  "mediaId": "<first slide>",
  "url": "<signed url of the first slide>",
  "playlist": {
    "id": "<uuid>",
    "transition": "none",
    "items": [{ "mediaId": "<uuid>", "url": "<signed url>", "durationMs": 10000 }]
  }
}
```

`mediaId` and `url` are the first slide so a TV still running the previous player script shows that still image instead of "No content assigned". The new player uses `playlist` and ignores the single-image fields.

`refresh=1` is ignored for single-image displays, so their unchanged response stays `{ version, unchanged: true }`. Slideshow URLs expire after one hour; the player asks for a refresh on a failed slide load and about every 30 minutes, then swaps URLs in place without restarting the loop.

If `playlists` or `player_playlist` is missing (migration not applied), playlist routes return 503 with an explanation, media delete skips the playlist check, the displays list falls back to the current select, and player state keeps the single-image response. Existing screens keep working.

### Dashboard

Playlists is added between Displays and Settings in the side nav and the bottom nav. The list creates, opens, and deletes playlists. The editor renames, sets the default duration and transition (`none` or `fade`), adds library images, reorders with Move up / Move down, overrides a slide's duration, previews the loop, saves a draft, and publishes to one or more displays. Layout stacks on a phone and sits in two columns on a desktop. No new UI library.

### Player (`public/player.html`)

Still one ES5 script. When the poll has a `playlist` with at least one item and the version is new, the player preloads slide 0, swaps only after `onload`, then preloads the next slide while the current duration runs. It loops. Fade uses an opacity transition; `none` uses the existing instant swap. The previous layer stays up until the next image has loaded, including when the next URL fails or the network drops. A later poll with a new version replaces the loop without reloading the page. Pairing, empty, single-image, reconnect, and disconnect behavior is unchanged.

## Rollback

Do this only if the feature must come back out after `0002_playlists.sql` was applied. Single-image assignments, display tokens, accounts, and storage paths are not rewritten.

1. Promote the previous Vercel deployment (or revert the app) so browsers stop calling playlist routes. Paired TVs keep their token. Reload `/player` once if a TV is still running the playlist script.
2. Run the following in the Supabase SQL editor. It bumps any TV that was on a playlist so the next poll clears the slideshow, restores the two replaced functions to their `0001_init.sql` bodies, then drops only the objects this phase added.

```sql
update public.displays
  set assigned_playlist_id = null,
      content_version = content_version + 1
  where assigned_playlist_id is not null;

create or replace function public.assign_media(p_account_id uuid, p_display_id uuid, p_media_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_media_id is not null and not exists (
    select 1 from public.media where id = p_media_id and account_id = p_account_id
  ) then
    return false;
  end if;

  update public.displays
    set assigned_media_id = p_media_id, content_version = content_version + 1
    where id = p_display_id and account_id = p_account_id and status = 'active';
  return found;
end $$;

create or replace function public.delete_media(p_account_id uuid, p_media_id uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare v_path text;
begin
  update public.displays
    set assigned_media_id = null, content_version = content_version + 1
    where assigned_media_id = p_media_id and account_id = p_account_id;

  delete from public.media where id = p_media_id and account_id = p_account_id
    returning storage_path into v_path;
  return v_path;
end $$;

revoke execute on function public.save_playlist(uuid, uuid, text, integer, text, jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.publish_playlist(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke execute on function public.delete_playlist(uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.player_playlist(text) from public, anon, authenticated, service_role;

drop function if exists public.save_playlist(uuid, uuid, text, integer, text, jsonb);
drop function if exists public.publish_playlist(uuid, uuid, uuid[]);
drop function if exists public.delete_playlist(uuid, uuid);
drop function if exists public.player_playlist(text);

drop table if exists public.playlist_items;
drop table if exists public.playlists;
alter table public.displays drop column if exists assigned_playlist_id;
```

3. Confirm a paired TV with a single image still updates, and that media delete works again for images that were only referenced by a playlist.

Do not run `0001_init.sql` again. Do not drop `accounts`, `media`, `displays`, or the `media` bucket.

## Safe window before the migration

A Vercel preview of this branch uses the production database. Until `0002_playlists.sql` is applied there:

- Sign-in, pairing, upload, single-image publish, and the current player keep working.
- Playlists in the nav opens a page that explains the migration has not been applied.
- The player never receives a `playlist` field, so old and new player scripts stay on the single-image path.

After the migration and this deployment, reload `/player` once on each TV so it picks up the slideshow script. Pairing state in `localStorage` is kept. Content updates after that ride the existing 10 second poll.
