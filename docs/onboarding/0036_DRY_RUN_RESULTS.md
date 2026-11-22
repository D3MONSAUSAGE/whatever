# 0036 Onboarding Milestones — Read-Only Backfill Dry Run

Query: [`docs/onboarding/0036_dry_run.sql`](./0036_dry_run.sql) (read-only aggregate query; returns counts only, no IDs, names, emails, or customer content).

Executed against production Supabase (`iybmjtkjfxcqupvhoddh`) on Sunday, Nov 22, 2026 (America/Los_Angeles):

| Metric | Count |
|---|---:|
| `accounts` | 44 |
| `accounts_updated` | 28 |
| `first_menu_credit` | 20 |
| `celebrated_set_no_popup` | 20 |
| `customize_menu` | 4 |
| `screen` | 25 |
| `show_on_tv` | 19 |
| `first_update` | 13 |
| `playlists` | 13 |
| `schedules` | 2 |
| `completed_via_v1_rules` | 11 |
| `completed_via_required_steps` | 11 |
| `completed_at_stamped` | 15 |
| `dismissed_preserved` | 1 |
| `first_publish_backfill_rows` | 5 |

Notes:
- `completed_via_v1_rules` (11) and `completed_via_required_steps` (11) overlap, resulting in `completed_at_stamped = 15`.
- All 20 accounts receiving `first_menu` credit also receive `first_menu_celebrated_at`, preventing a retroactive "Your first menu is ready!" popup.
- `onboarding_dismissed_at` is never cleared (`dismissed_preserved = 1`).
