# 0037 Display Orientation — Read-Only Dry Run

Query: [`docs/vertical/0037_dry_run.sql`](./0037_dry_run.sql) (read-only aggregate query; returns counts only, no IDs, names, emails, or customer content).

Executed against production Supabase (`iybmjtkjfxcqupvhoddh`) on Sunday, Nov 22, 2026 (America/Los_Angeles), before applying 0037:

| Metric | Count |
|---|---:|
| `displays_total` | 65 |
| `displays_active` | 41 |
| `new_columns_already_present` | 0 |
| `menus_total` | 51 |
| `menus_with_orientation_key` | 0 |
| `layout_boards` | 32 |
| `classic_boards` | 19 |
| `board_renders` | 123 |
| `board_renders_not_1920x1080` | 0 |

What 0037 will do:
- Adds `displays.orientation` (`text not null default 'landscape'`, check `landscape|portrait`). All 65 display rows read `landscape`; no row is rewritten by hand and no other column changes. On Postgres 11+ a constant default is metadata-only (no table rewrite).
- Adds nullable `displays.player_viewport_width/height` (1..20000) and `player_viewport_at`. All null until a TV reports them (player PR C).
- Touches no `menus` row: no board carries `orientation` today (0), so all 51 boards stay landscape and every one of the 123 stored renders stays 1920×1080.
- No function, policy, trigger, or backup table is altered. The November 11 backup tables are untouched.

Rollback: [`supabase/rollback/0037_display_orientation.sql`](../../supabase/rollback/0037_display_orientation.sql) drops only the two constraints and four columns added here. The app tolerates the columns being absent (list falls back to the older select, PATCH `{orientation}` returns 503 `Screen orientation isn't available yet…`, viewport reports are accepted and ignored).

After applying, re-run the query: expect `new_columns_already_present = 4`, plus
`select orientation, count(*) from public.displays group by 1;` → `landscape | 65` (or the then-current total).
