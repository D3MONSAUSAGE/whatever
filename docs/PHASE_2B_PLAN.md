# Phase 2B plan: H.264 video

Audit of upload limits, TV browsers, and cost, then the smallest backward-compatible change that plays MP4 video in playlists. No server-side transcoding and no new paid infrastructure. Phase 2A playlists stay as they are.

The production database is not modified by this work. Apply `supabase/migrations/0003_video.sql` only after the pull request is approved.

## What exists today

Images upload through a Vercel function (`POST /api/media`). The phone resizes them to a JPEG under 4 MB first, because Vercel rejects larger request bodies. The private `media` bucket allows `image/jpeg`, `image/png`, and `image/webp`, with a 15 MB object cap (`0001_init.sql`). The TV (`public/player.html`, ES5) paints images as CSS backgrounds and, since phase 2A, walks a playlist on a timer. A display with one image assigned never receives a `playlist` field.

Storage objects are not deleted when a test user is deleted. Postgres cascades the `media` row, the file in the bucket stays. Cleanup in this phase removes only the objects under accounts the test itself created.

## Limits that actually apply

Checked against current Supabase docs (storage file limits, storage size, egress) and the Vercel function body cap. This repo does not record the Supabase plan in git. The bucket migration sets a 50 MB object cap, which is the highest value a Free project can use and is also a safe cap on Pro.

| Constraint | Limit | What it means here |
| --- | --- | --- |
| Vercel function request body | 4.5 MB | A video must not be posted to `/api/*`. The browser uploads with a signed URL straight to Storage. |
| Supabase signed upload URL | Valid 2 hours. Service role creates it; the browser needs no storage RLS policy. | Upload is `PUT` to the signed URL. |
| Supabase global file size | Free: 50 MB max. Pro and above: configurable up to 500 GB. The per-bucket limit cannot exceed the global limit. | 50 MB works on every plan. Do not raise the bucket above the project's global setting. |
| Supabase storage quota | Free: 1 GB, no overage. Pro: 100 GB, then $0.0213 per GB-month. | Video bytes are stored once, not once per screen. |
| Supabase egress | Free: 5 GB uncached and 5 GB cached, no overage. Pro: 250 GB each, then $0.09 / GB uncached and $0.03 / GB cached. | Each TV that downloads a file spends egress. A loop must not re-download it. |
| Storage Range requests | Signed URLs are normal HTTPS. TV browsers send `Range` so playback can start before the whole file arrives. | Objects are uploaded with `Cache-Control: max-age=86400`. The player keeps the same signed URL for a `mediaId` until that URL fails. |

Image uploads stay on the existing function path. They are already resized under 4 MB. The app still rejects images over 15 MB even though the bucket now allows 50 MB for video.

## TV browsers

The player script stays ES5. Video uses two `<video>` elements (`muted`, `playsinline`, `webkit-playsinline`). There is no `object-fit`; the script letterboxes from `videoWidth` / `videoHeight`.

| Browser | What plays | Autoplay |
| --- | --- | --- |
| Samsung Tizen 2.4–4 (2016–2018, Chromium ~47–56) and later | H.264 in MP4. AAC-LC. HEVC and VP9 are missing or inconsistent on the older sets. | Muted autoplay usually works. Set `video.muted = true` in script, not only the attribute. |
| LG webOS 3–4 (Chromium ~38–53) and later | H.264 High/Main up to 1080p. AAC-LC. VP9/WebM is a poor bet on webOS 3–4. | Muted inline video is the reliable path. A failed `play()` promise is treated as a block. |
| Fire TV (Silk) and Android TV Chrome | H.264 High profile, AAC-LC. Newer sticks decode HEVC in hardware; the browser often still will not. | Muted autoplay is allowed. Older WebViews want `playsinline`. |
| Older WebKit | H.264 Baseline or Main, yuv420p, AAC-LC or no audio. Level 4.0/4.1 is the safe 1080p30 ceiling. Level 5 (4K) fails on many sets. | No gesture is available after pairing. If autoplay is blocked, the player skips and reports it. |

Codecs the upload accepts, checked from the MP4 boxes (`ftyp`, `moov`, `stsd`), not the file extension:

- Video sample entry `avc1` or `avc3` only.
- `avcC` profile Baseline (66), Main (77), or High (100). Level 1.0 through 4.2. High 10, 4:2:2, and 4:4:4 are rejected.
- Audio sample entry `mp4a` only, or no audio track. AC-3, Opus, and MP3 in MP4 are rejected.
- `moov` may sit at the front or the end. The server reads that box only. Fast start (`-movflags +faststart`) is still the right export: older TVs that mishandle `Range` can paint the first frame sooner.

The dashboard also opens the file in a `<video>` element and rejects it if that browser cannot read duration and dimensions. A JPEG frame from a canvas is stored as the thumbnail. The server does not trust those numbers for the limit; it parses `mvhd` / `stsd` from the object after the direct upload.

## Recommended upload limits

These are enforced in the client and again on `POST /api/media/upload/complete`.

| Rule | Value | Why |
| --- | --- | --- |
| Container / codec | MP4, H.264 Baseline/Main/High, level ≤ 4.2, AAC or silent | The TV set above. |
| File size | 50 MB | Free-plan global cap. A 1080p clip at about 2.5 Mbps is roughly 19 MB per minute, so 50 MB is a bit over two minutes at that bitrate. |
| Duration | 0.5 s to 3 min | Stops a slideshow from sticking on one file, and keeps a 50 MB file from being a very low-bitrate hour. |
| Frame size | Each edge ≤ 1920 | 1080p and portrait 1080×1920. 4K is out of reach for the older browsers and for the memory budget. |
| Pixel format | yuv420p (8-bit). High 10 is rejected via the profile byte. | 10-bit H.264 is not dependable on Tizen/webOS. |
| Audio | AAC-LC, or no audio. Stereo 44.1 or 48 kHz is the export to recommend. | The parser accepts any `mp4a` box. HE-AAC usually still decodes; AAC-LC is the one to publish. |
| Fast start | Recommended, not required | `moov` at the front. |

Export recipe that matches the limits:

```bash
ffmpeg -i input -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease" \
  -c:a aac -b:a 128k -movflags +faststart -t 180 output.mp4
```

There is no transcoder in this app. A file that fails the check must be re-exported on the owner's computer.

## Cost

Storage is per byte kept, not per screen. Egress is per TV that downloads a byte it does not already have. Prices below are Supabase's published overage on Pro ($0.0213 / GB-month storage, $0.09 / GB uncached egress, $0.03 / GB cached). Free has no overage; crossing 1 GB stored or 5 GB egress is a hard stop until the next cycle or an upgrade.

Assumption for the table: one shared library, 5 clips, about 20 MB each, 100 MB of unique video. Images stay negligible next to that (a 200 KB JPEG × 100 screens × a daily reboot is under 1 GB/month).

The player pins a signed URL to the `mediaId` and does not swap `src` when the signature is refreshed (hourly URL, refresh request about every 30 minutes). A TV that stays on the playlist downloads each clip once per page load. A reboot or a failed URL downloads again. The "resign every 30 minutes and change `src`" column is what we are not doing. It is here so the difference is obvious.

| Screens | Storage (same 100 MB library) | Egress if each TV reboots daily | Egress if `src` changed every 30 min |
| --- | --- | --- | --- |
| 1 | 100 MB. $0 on Free or Pro. | ~3 GB/month. Inside Free's 5 GB. | ~144 GB/month. Free stops. Pro ~$0 (inside 250 GB) if uncached. |
| 10 | 100 MB. $0. | ~30 GB/month. Over Free. Pro $0 inside 250 GB. | ~1.4 TB/month. About $107 uncached overage on Pro, or the Free project is restricted. |
| 50 | 100 MB. $0. | ~150 GB/month. Pro $0 inside 250 GB. A second daily reboot would cross it. | ~7.2 TB/month. Hundreds of dollars uncached. |
| 100 | 100 MB. $0 until the library itself grows past 100 GB. | ~300 GB/month. About 50 GB over the Pro uncached quota, ~$4.50, less if the CDN caches the stable URL. | ~14 TB/month. Not viable. |

Cached egress is cheaper ($0.03) when Smart CDN hits. A brand-new signed URL is a different cache key, which is why the player keeps the previous URL string for an unchanged `mediaId`.

Ten accounts with 100 MB each is 1 GB, the whole Free quota. Pro's 100 GB covers a large library before storage overage matters. Egress, not storage, is the bill that grows with screens.

## Design

### Migration `0003_video.sql`

Additive. Nullable columns so existing image rows stay images (`kind` null is treated as `image`).

- `media.kind` (`image` or `video`), `duration_ms` (1–180000), `width`, `height`, `thumbnail_path`.
- `displays.player_error` (≤ 180 chars) and `player_error_at`. Granted to `authenticated` for select. `token_hash` stays excluded.
- Bucket: 50 MB, mime types gain `video/mp4`. Image checks in the app stay at 15 MB.
- `assign_media` (same signature) refuses a video, so a single-image assignment cannot become a video.
- `player_playlist` is dropped and recreated with extra return columns: `kind`, `width`, `height`, `media_duration_ms`. Image rows come back as `image`. Slide `duration_ms` is unchanged.
- `report_player_error(token_hash, message)` sets or clears `player_error`. Empty `search_path`, not security definer, execute for `service_role` only.

No new tables. RLS on `media` and `displays` already limits rows to the owner. Thumbnails live in the same private bucket (`<account_id>/<media_id>-thumb.jpg`). There is still no browser storage policy. The service role signs reads and the one-time upload.

`delete_media` is not replaced. The media route reads `thumbnail_path` first and deletes both objects after the row delete. A file that is still on a draft or published slide returns 409, same as an image. Removing it from the playlist does not delete the library file. Publish again so the published snapshot drops it, then delete.

### Upload

1. The browser parses the MP4 and probes `<video>` (duration, dimensions, JPEG thumbnail).
2. `POST /api/media/upload` checks the schema and the 50 MB cap and returns a signed upload URL. Before `0003_video.sql`, this is 503 with an explanation.
3. The browser `PUT`s the file to that URL and reports progress.
4. `POST /api/media/upload/complete` downloads the object back from Storage (not from the browser), parses `moov`, checks duration and size, stores the thumbnail, and inserts the row. A bad file is deleted from the bucket and the response says what to export instead.

An abandoned signed URL can leave an object with no row. Test cleanup lists only that test account's prefix and removes those objects too. Production orphans are a known limitation; they are not reachable without a signed URL, and the URL dies in two hours.

### Player

Image slides and a single assigned image use the same timers, fades, and poll as phase 2A. `kind` other than `video` is an image, including responses from a database that has not been migrated (the old `player_playlist` simply has no `kind` column).

A video slide:

- Muted, inline, `play()` when it becomes current.
- Plays until `ended`, then advances. It does not use the slide's seconds. A one-clip playlist seeks to 0 instead of tearing down the element.
- The previous image or frame stays up until `playing`.
- The other element preloads the next clip. Elements that are neither current nor next get `pause()`, `removeAttribute('src')`, and `load()`.
- If `play()` rejects, the element errors, the clip has not started within its slide duration (capped at 4 seconds), or playback freezes for that same cap, the player marks the clip bad, drops that element's src, and moves to the next item immediately. Later passes do not set src or show the video layer until a scheduled retry, and that retry stays hidden unless playback actually starts. The previous image stays only until that next item is ready, so a 2 second slide is not held for a retry. A known-bad clip is skipped for several loops, then tried once; a failed retry waits longer. If every item is bad, the player waits 8 seconds and tries again. The last good frame stays up. The failure is `POST /api/player/state`. The displays page shows `playerError`. A new playlist version or a successful single image clears it.
- A failed poll shows "Reconnecting..." and does not clear the video that is already playing.
- Signed URL refresh updates the stored URL but does not change `src` for a `mediaId` that already played.

### Dashboard

Media gains "Upload video", a progress bar, a `<video>` preview with the thumbnail as `poster`, and duration plus size. "Upload image" and the empty "No images yet" line stay, so the existing phone test still finds them. The single-image picker lists images only. Playlist editor keeps the "Add images" button; the dialog also lists videos. A video slide says "Plays until the end" instead of a seconds field. Reorder and remove work the same way. Remove does not delete the library file.

## Tests

- Unit: real fixtures in `tests/fixtures/` (`h264-aac.mp4`, `h264-aac-moov-end.mp4`, `h264-silent.mp4`, `hevc.mp4`, `vp9-renamed.mp4`).
- API: image playlist unchanged; video upload, codec rejection, playlist kind, delete protection, cross-account, player error, single image replacing a playlist.
- Player simulation: image-only loop, video-only loop, image→video→image, completion and auto-advance, unsupported / blocked / stall / timeout, connection loss, single image hold.
- RLS: the other account cannot read a video row or download the video or the thumbnail. If `0003_video.sql` is not applied the test fails, unless `PANTALLA_VIDEO_MIGRATION=absent` is set, which skips it with that reason. Cleanup removes the account prefix even if the test fails.
- Playwright: image pairing and image playlists unchanged. Video cases skip on a deployment that has no video control, or when `0003` is not applied yet.

## Rollback

Do this only if the feature must come back out after `0003_video.sql` was applied. Pairing tokens, accounts, and image files are not rewritten. Video bytes inserted by this phase are removed.

1. Promote the previous Vercel deployment (or revert the app). Reload `/player` once on each TV so it drops the video script. Pairing `localStorage` stays.
2. Run the following in the Supabase SQL editor.

```sql
-- Drop video slides and their files' rows. Playlist items cascade.
-- Remove the objects from Storage after this, using the paths you selected.
create temporary table _video_paths as
select storage_path, thumbnail_path
from public.media
where kind = 'video';

update public.displays
  set content_version = content_version + 1
  where assigned_playlist_id in (
    select distinct playlist_id from public.playlist_items
    where media_id in (select id from public.media where kind = 'video')
  );

delete from public.media where kind = 'video';

-- Restore phase 2A assign_media.
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
    set assigned_media_id = p_media_id,
        assigned_playlist_id = null,
        content_version = content_version + 1
    where id = p_display_id and account_id = p_account_id and status = 'active';
  return found;
end $$;

drop function if exists public.player_playlist(text);
create function public.player_playlist(p_token_hash text)
returns table (
  playlist_id uuid,
  transition text,
  "position" integer,
  media_id uuid,
  storage_path text,
  duration_ms integer
)
language sql
set search_path = ''
as $$
  select pl.id, pl.published_transition, pi.position, pi.media_id, m.storage_path, pi.duration_ms
  from public.displays d
  join public.playlists pl on pl.id = d.assigned_playlist_id
  join public.playlist_items pi on pi.playlist_id = pl.id and pi.kind = 'published'
  join public.media m on m.id = pi.media_id and m.account_id = d.account_id
  where d.token_hash = p_token_hash
    and d.status = 'active'
    and d.assigned_media_id is null
  order by pi.position;
$$;

revoke execute on function public.report_player_error(text, text) from public, anon, authenticated, service_role;
drop function if exists public.report_player_error(text, text);

revoke execute on function public.player_playlist(text) from public, anon, authenticated;
grant execute on function public.player_playlist(text) to service_role;

alter table public.displays drop column if exists player_error_at;
alter table public.displays drop column if exists player_error;
alter table public.media drop column if exists thumbnail_path;
alter table public.media drop column if exists height;
alter table public.media drop column if exists width;
alter table public.media drop column if exists duration_ms;
alter table public.media drop column if exists kind;

update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'media';
```

3. Delete the objects listed in `_video_paths` from the `media` bucket (Storage UI or `storage.objects` plus the storage API). Do not empty the bucket.
4. Confirm a paired TV with a single image still updates, and that an image-only playlist still loops.

Do not run `0001_init.sql` or `0002_playlists.sql` again. Do not drop `accounts`, `displays`, `playlists`, or the `media` bucket.

## Safe window before the migration

A Vercel preview of this branch uses the production database. Until `0003_video.sql` is applied there:

- Sign-in, pairing, image upload, single-image publish, and image playlists keep working. The player script understands video, but the API never sends `kind: "video"`, so those TVs stay on the image path.
- "Upload video" is visible. Choosing a file that is not H.264 fails in the browser with an export message. A real H.264 file gets a 503 that names `0003_video.sql` and nothing is stored.
- Displays do not show a player error, because `report_player_error` is missing and the player treats that as a no-op.
- The media list falls back to the phase 2A columns if `kind` is absent.

After the migration and this deployment, reload `/player` once on each TV so it picks up the video script. Pairing state in `localStorage` is kept. Content updates after that ride the existing 10 second poll.

## Known limitations

- No transcoding. HEVC, VP9, AV1, and odd audio have to be re-exported.
- The server accepts any `mp4a` audio box. AAC-LC is what the TVs are known to play; HE-AAC is usually fine and is not rejected separately.
- Profile and level come from `avcC`. A file without that box is rejected even if the video track is `avc1`.
- 50 MB and 3 minutes are hard caps. A quieter, longer clip needs a lower bitrate or a trim, not a bucket change, unless the Supabase plan's global limit is raised first.
- Signed URLs still change when they are reissued. The player avoids a re-download by keeping the previous URL. A full page reload after the URL has expired downloads again. That is the reboot row in the cost table.
- A TV that never fires `timeupdate` will not be skipped for a mid-playback stall. The start cap (at most 4 seconds) and the element `error` / `play()` rejection still run.
- Orphan objects from an upload that never calls `complete` are not swept in production. They are private and the signed URL expires in two hours.
- Thumbnails are a single JPEG frame, not a filmstrip. The library `<video>` uses it as `poster` and does not download the MP4 until play (`preload="none"`).
