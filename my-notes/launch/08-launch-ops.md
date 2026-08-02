# 08 — Launch Ops

Goal: when something breaks after a real firm is on the system, you find out from an
alert, not from the firm — and you can restore their books. Almost everything here is
turning on things that are already built.

## Current state (verified 2026-07-19)

- Sentry bootstrap exists in BOTH apps (`apps/api/src/sentry.bootstrap.ts` wired into
  server + scheduler; `apps/web/src/sentry.bootstrap.ts`). Needs DSNs in env.
- Outbox alerting is fully built (`domains/outbox/outbox.alerts.ts`): dead-letter
  alerts + hourly health snapshot (failed backlog / stalled drain) → emails via
  `alertAdmins`. **Dormant until `ADMIN_ALERT_EMAILS` is set.**
- Health endpoints exist: `/health/live`, `/health/ready` (Postgres + Redis), used by
  Fly checks. Bull Board at `/admin/queues` behind basic auth.
- Rate limiting exists on auth routes (`core/middlewares/rateLimiter.middleware.ts`).
- Email: SES/Postmark providers + dev provider; queue + worker durable.
- No uptime monitoring, no backup/restore verification, no runbooks yet.

## Steps

1. **Env + alerts (hours):** set Sentry DSNs (both apps, staging + production), set
   `ADMIN_ALERT_EMAILS` to your address in both envs. Force one synthetic outbox
   failure on staging to see the dead-letter email arrive. Confirm Sentry receives a
   thrown test error from web and api.
2. **Uptime (hours):** external pinger (UptimeRobot/Better Stack free tier) on
   production + staging `/health/ready` and the web root; alerts to email/phone.
3. **Backups (half day, non-negotiable before Gate A):** enable automated backups /
   PITR on the managed Postgres chosen in workstream 01. Then run ONE restore drill:
   restore to a scratch instance, point a local API at it, log in, see the books.
   An untested backup is a rumor. Record the drill in `my-notes/launch/smoke-runs.md`.
4. **Migration safety:** production deploy runs migrations (mirroring the staging
   workflow's migrate step). Rule for launch: **additive-only migrations** once a
   real firm is on production (no drops/renames without an explicit two-step
   expand/contract).
5. **Runbooks (half day):** `my-notes/launch/runbooks.md` with the checks you already
   use locally, one section each: API down (Fly status/logs, health endpoints),
   outbox backlog (health snapshot, Bull Board, dead letters + retry path), bank
   connection broken (from workstream 07), email not sending (queue + provider
   dashboard), "restore from backup" (from the drill).
6. **Legal/trust minimum for Gate A (day):** privacy policy + terms pages reachable
   from the app (the `apps/marketing` app or static pages — whatever is fastest),
   support email address that reaches you, and a from-address/domain (SPF/DKIM)
   verified for Postmark/SES so onboarding emails do not land in spam. Send test
   invites to Gmail/Outlook accounts and check placement.
7. **Demo/sales workspace (hours):** the demo seed system exists (`make demo`,
   workspace class `demo`, staging workflow has a seed input). Keep one seeded demo
   firm on staging for showing prospects — never demo on production.

## Success criteria

- [ ] Kill the staging API on purpose → uptime alert within 5 minutes; Fly restarts
      it; you did nothing.
- [ ] Dead-letter email received from the synthetic failure; Sentry shows one test
      event per app per env.
- [ ] Restore drill completed and written down, with how long it took.
- [ ] Invite/verification emails land in inbox (not spam) for Gmail + Outlook.
- [ ] Privacy, terms, and support contact reachable from the logged-in app.
- [ ] Runbooks file exists with the five sections and honest commands.

## Out of scope

Log aggregation/dashboards beyond Sentry + Fly logs, SOC2-style controls, on-call
tooling, synthetic browser monitoring, status page, multi-region failover.
