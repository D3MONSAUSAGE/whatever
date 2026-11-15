# Push notifications (M16)

Offline/recovery alerts (docs/ALERTS.md) can also go to the Pekko mobile app over Firebase Cloud Messaging (HTTP v1).

- Devices: `POST /api/devices` {token, platform, appVersion?, notifyOffline?, notifyRecovery?}, `DELETE /api/devices/:token` (URL-encoded) or `DELETE /api/devices` {token}, `GET /api/devices` (tokens masked). Table `public.push_devices` is server-only (RLS on, no anon/authenticated grants). A token belongs to one login; registering it under another login moves it.
- Sign-out cleanup: `POST /api/session/sign-out` `{scope:"global"}` deletes all of the caller's `push_devices` rows; `{scope:"local", token}` deletes that one token; `{scope:"local"}` removes nothing. **It only clears push devices. It does NOT end the session:** the client must still sign out itself (Supabase `auth.signOut()`, with `{scope:"global"}` for "sign out of all devices"), after calling this route while the session is still valid.
- Test push: `POST /api/push/test` body `{}` → `{devices, sent, failed}`; caller's own devices only; 5/hour/user (a 503 when push isn't configured does not count); data `{type:"test"}`.
- Account switch: `alert_push_enabled` via `PATCH /api/alerts/preferences {pushEnabled}`. Per-device: notifyOffline / notifyRecovery.
- Delivery: `GET /api/cron/alert-push` (Bearer CRON_SECRET, `?dryRun=1`). Uses `alerts.push_status` (pending → sent/skipped/failed) with a compare-and-set claim, so an alert is pushed once. It only targets devices of the alert's own account. Tokens FCM reports as UNREGISTERED/404 are deleted. Tokens not refreshed for 60 days are purged on every run (`push_devices_purge`).
- Off by default: without `FCM_SERVICE_ACCOUNT` (Firebase service-account JSON, raw or base64; server env only, never NEXT_PUBLIC) pending pushes are marked skipped and nothing is sent.

## Turning it on (once Firebase credentials exist)
1. Francisco creates or chooses the Firebase project (release applicationId com.pekkotv.app, project pekko-effa3; the old com.pekko.app entry is not the release app) and a service account with the "Firebase Cloud Messaging API Admin" role. Download its JSON key.
2. Add it in Vercel → pantalla → Settings → Environment Variables as `FCM_SERVICE_ACCOUNT` (Production), then redeploy.
3. Check with `curl -H "Authorization: Bearer $CRON_SECRET" "$APP/api/cron/alert-push?dryRun=1"` (provider should be "fcm").
4. Delivery is scheduled by migration 0012 (cron job `pekko-alert-delivery`, pg_cron + pg_net, every minute, only when something is pending). Vercel Hobby crons are daily only.

Rollback: remove `FCM_SERVICE_ACCOUNT` (push stops; alerts are marked skipped). The table and columns are additive and ignored by older code.
