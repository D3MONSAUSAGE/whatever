# Remote control API (Manual slideshow)

Phone → TV remote for playlists in **Manual slideshow** mode (extends PR #38 / migration `0016`).  
Base URL: `https://pekkotv.com` (or the account’s deployment).  
Auth: same as other mobile APIs — `Authorization: Bearer <Supabase access token>` (account owner).

## Transport (poll, not push)

**The mobile app should poll.** There is no secure Realtime push channel for the TV player today (the player authenticates with an opaque `X-Display-Token`, not a Supabase user JWT, and `supabase_realtime` publishes no tables).

| Client | How it stays in sync |
| --- | --- |
| **Flutter Remote screen** | Poll `GET /api/remote/screens` every **1–2 seconds** while the Remote UI is open; stop or slow down when backgrounded. |
| **TV player** | Fast-polls `GET /api/player/state` (~1.5s) while Manual (or while commands are pending); otherwise the normal auto poll interval. |

Commands work across different networks (phone LTE, TV Wi‑Fi, etc.) because both sides talk to the same Vercel/Supabase backend.

Server state is canonical. After reconnect, the phone re-reads `/api/remote/screens`; the TV re-polls and applies any still-pending commands by `seq` (last command wins). Use `stateVersion` / `updatedAt` to detect stale UI snapshots.

Changing Automatic ↔ Manual updates the **assigned playlist’s** published `playbackMode`. Every screen on that playlist picks up the new mode. There is no per-screen playback engine.

---

## Screen state object

Returned by the list endpoint and embedded as `screen` on command / set-mode responses.

```json
{
  "id": "66a0e5ba-3b98-43bb-a44e-66a0196a3335",
  "name": "Lobby TV",
  "connected": true,
  "online": true,
  "lastSeenAt": "2026-11-05T17:00:00.000Z",
  "contentVersion": 4,
  "stateVersion": "2026-11-05T17:00:01.000Z",
  "updatedAt": "2026-11-05T17:00:01.000Z",
  "mode": "manual",
  "index": 1,
  "total": 8,
  "playlist": {
    "id": "ce88e163-47db-44ae-be35-fdf0e7546e4d",
    "name": "Manual QA Deck",
    "playbackMode": "manual",
    "itemCount": 8
  },
  "playback": {
    "playlistId": "ce88e163-47db-44ae-be35-fdf0e7546e4d",
    "playbackMode": "manual",
    "index": 1,
    "count": 8,
    "slide": 2,
    "updatedAt": "2026-11-05T17:00:01.000Z",
    "lastAppliedSeq": 12,
    "lastIssuedSeq": 12
  },
  "controllable": true
}
```

| Field | Meaning |
| --- | --- |
| `online` | `last_seen_at` within ~90s (same rule as the dashboard). |
| `lastSeenAt` | Last player heartbeat (ISO-8601) or `null`. |
| `connected` | TV has collected its display token. |
| `mode` | Flat `"auto"` \| `"manual"` \| `null` (from playback report or playlist). |
| `index` | 0-based current slide; `null` until the player reports. |
| `total` | Slide count; `null` until known. |
| `playback.slide` | 1-based slide for UI (“2 of 8”); `null` if unknown. |
| `stateVersion` / `updatedAt` | ISO timestamps for staleness (prefer the newer `stateVersion` when comparing). |
| `controllable` | Has a published playlist with slides **and** a token. |

---

## `GET /api/remote/screens`

```http
GET /api/remote/screens
Authorization: Bearer eyJ...
```

Response: JSON array of screen state objects (see above).

---

## `POST /api/remote/screens/{id}/command`

Issue **next** or **prev**. Returns the **new screen state**.

```http
POST /api/remote/screens/66a0e5ba-3b98-43bb-a44e-66a0196a3335/command
Authorization: Bearer eyJ...
Content-Type: application/json

{ "command": "next" }
```

```json
{
  "ok": true,
  "seq": 13,
  "commandId": "…",
  "command": "next",
  "screen": { "...": "full screen state object" }
}
```

```http
{ "command": "prev" }
```

| Status | When |
| --- | --- |
| `400` | Bad body |
| `401` | Not signed in |
| `403` | Screen belongs to another organization |
| `404` | Unknown id, inactive, or no published playlist assigned |

The TV applies commands idempotently by `seq` (wraps at playlist ends, same as on-TV Manual controls). Slide index in the immediate response may still be the pre-apply value until the TV heartbeats; keep polling 1–2s.

---

## `POST /api/remote/screens/{id}/playback-mode`

Switch Automatic ↔ Manual on the screen’s assigned playlist. Returns the **new screen state**. Only on explicit user action.

```http
POST /api/remote/screens/66a0e5ba-3b98-43bb-a44e-66a0196a3335/playback-mode
Authorization: Bearer eyJ...
Content-Type: application/json

{ "playbackMode": "manual" }
```

```json
{
  "ok": true,
  "playbackMode": "manual",
  "screen": { "...": "full screen state object" }
}
```

Same `403` / `404` rules as command.

---

## Player protocol (backend ↔ TV)

| Direction | Mechanism |
| --- | --- |
| Phone → server | Endpoints above |
| Server → TV | `commands: [{ "seq": 13, "command": "next" }]` on every `GET /api/player/state` (including `unchanged`) |
| TV → server | `POST /api/player/state` with `{ "playback": { "playlistId", "playbackMode", "index", "count", "version", "lastAppliedSeq" } }` |

`index` and `count` are positions in the list the TV is showing. A presentation group is expanded into its slides before that list is built, so Next/Previous moves one slide. Optional item fields `groupId`, `groupIndex`, and `groupCount` describe where that slide sits inside the group. See [PRESENTATION_GROUPS.md](./PRESENTATION_GROUPS.md).
| Poll interval | `pollMs` ≈ 1500 in Manual (or while commands pending); otherwise existing auto poll |

Local TV Previous/Next and keyboard still work; they also report `playback` so phones stay in sync.

---

## Suggested Flutter flow

1. While the Remote screen is open, poll `GET /api/remote/screens` every **1–2 s** (no push channel).
2. Show name, online/offline (`online` + `lastSeenAt`), `index`/`total` or `playback.slide`/`playback.count`, and `mode`.
3. Compare `stateVersion` (or `updatedAt`) to drop stale responses if requests overlap.
4. Large Previous / Next → `POST .../command`; replace local row with `response.screen`.
5. Mode switch → `POST .../playback-mode`; replace local row with `response.screen`.
6. Ignore `controllable: false` for the remote pad (still list as informational if useful).

## Security

- Owner JWT only (`requireAdmin` / single-owner accounts).
- Cross-organization access → **403**.
- RPCs are `service_role` only; tables are RLS owner-`SELECT`.

## Isolation

No Stripe, billing, Meta, or paid infrastructure. Migration `0017_remote_control.sql`; rollback `supabase/rollback/0017_remote_control.sql`.
