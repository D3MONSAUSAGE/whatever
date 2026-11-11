# Turning on billing enforcement (needs Francisco's approval for each step)

1. Merge `commercial-launch` to main (merge commit). Production deploys with enforcement still off; nothing changes for users. Check `/api/entitlements` shows `enforced: false`, `/api/health` ok, checkout `available: true`.
2. Back up billing data (accounts, displays.billing_active, stripe_events: counts + sha256), then run `docs/billing/launch-migration.sql` in one transaction. It is non-destructive and also writes in-database backup tables.
   - QA orgs (`vivalopez06-wh5rwz+%`) drop their sandbox Stripe ids and follow the trial rules from creation.
   - grandfathered / comp orgs get a normal 14-day trial from activation.
3. Set `BILLING_ENFORCE=1` on Production only and redeploy (env vars are read at build).
4. Verify: entitlements `enforced: true`; a paid org plays up to its allowance; an expired org's player gets 402 and shows the paused card; pairing over the allowance is refused; webhook deliveries succeed.
5. Rollback: remove `BILLING_ENFORCE` and redeploy (immediate); data via `docs/billing/launch-rollback.sql`; code by promoting the previous production deployment.
