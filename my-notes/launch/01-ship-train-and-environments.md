# 01 — Ship Train and Environments

Goal: the code you have actually runs on staging and production, deployed from git,
with CI gating every merge. Everything else in the launch plan verifies against this.

## Current state (verified 2026-07-19)

- Working branch `feat/banking-connection-sync-system` is ~57 commits ahead of
  `develop`, ~50 ahead of `staging`, ~700 ahead of `main` (main abandoned since
  2026-05-27).
- `.github/workflows/ci.yml` runs quality (lint/typecheck/format) + tests, but only on
  push/PR to `main|staging|develop`. `branch-flow.yml` enforces the merge path
  feature → develop → staging → main.
- `.github/workflows/deploy-staging.yml` deploys the API to Fly on push to `staging`
  (waits for CI first; has a demo-seed input). The **last two staging deploys failed
  (2026-05-28)** and `https://api-staging.getaccountable.com/health/live` does not
  respond today.
- `https://staging.getaccountable.com` (Vercel) serves a ~May build. Vercel builds only
  `main` and `staging` (see `vercel.json` ignoreCommand).
- `fly.production.toml` exists but points at `apps/api/infra/docker/Dockerfile.prod`
  which **does not exist** (only `Dockerfile.staging`). There is no production deploy
  workflow, no production Fly app deployed, and `app.getaccountable.com` doesn't resolve.
- ML engine: `fly.ml-staging.toml` exists (staging only).
- Local suite: 171 files / 1272 tests green. `make deploy-check` (tests+lint+build) and
  `scripts/deploy-fly-staging.sh` exist. `scripts/setup-secrets.sh` exists for secrets.
- Reference docs: `docs/fly-deployment.md`, `docs/ENVIRONMENT.md`.

## Steps

### 1. Run the merge train (day 1)

1. Push the current branch (it is 7 commits ahead of origin) and open a PR
   `feat/banking-connection-sync-system → develop`. This is the first time CI sees two
   months of work — expect surprises; fix forward on the branch until CI is green.
2. Merge to `develop`. Open `develop → staging` PR. CI green → merge. This push
   triggers the staging deploy (next step will likely be needed to make it pass).
3. After staging is verified (step 3 below), open `staging → main` and merge, so main
   stops rotting and production can deploy from it.
4. From now on: **no long-running feature branches.** Small branches, PR to develop,
   merge within days. The banking branch pattern (2 months unmerged, no CI) is the
   single riskiest habit in this repo.

### 2. Resurrect staging (day 1–2)

1. Read the failing run logs: `gh run view <id> --log-failed` for the 2026-05-28
   Deploy Staging failures, plus `fly status -a accountable-books-api-staging` and
   `fly logs`. Likely suspects after 2 months: missing/renamed env vars (the env
   surface changed with the banking rework — regenerate with
   `pnpm generate-env` and diff against `fly secrets list`), migration failures
   (the migration baseline was rebuilt this year — if the staging DB predates it,
   decide: wipe staging DB and remigrate from zero + `make demo`-style seed, which is
   acceptable because staging has no real data), or Dockerfile/node version drift
   (Node 24.16, pnpm 11.3).
2. Get `Deploy Staging` green and `https://api-staging.getaccountable.com/health/ready`
   returning 200 (checks Postgres + Redis).
3. Confirm the Vercel staging build picked up the new `staging` push and that the web
   app's API base URL points at the staging API (check the web env generation; see
   `docs/ENVIRONMENT.md`).
4. Deploy ML engine staging (`fly deploy --config fly.ml-staging.toml`) and confirm the
   API can reach it (categorization suggestions work).
5. Verify the worker and scheduler processes are running (staging toml defines
   `web`/`worker`/`scheduler` process groups — confirm machines exist for each;
   the outbox drain and bank sync scan live there, nothing works without them).

### 3. Staging smoke flow (day 2)

Run by hand in a browser against staging, with bank providers in sandbox mode:

signup (accounting_firm) → verify email → onboarding → connect a Plaid sandbox bank →
sync completes (watch the outbox: sync intents move to processed, transactions appear) →
upload a CSV statement to a second account → categorize a few transactions in the Cat
Engine (ML suggestions appear) → post → journals list shows entries → call
`GET /api/:companyId/balances/trial-balance` (Swagger at `/docs`) and confirm it foots.

Write the result as a dated note in `my-notes/launch/smoke-runs.md`. This exact flow is
re-run after every workstream lands.

### 4. Stand up production (day 3–5)

1. Create `apps/api/infra/docker/Dockerfile.prod` — start as a copy of
   `Dockerfile.staging`; differences should be limited to env file selection and any
   staging-only tooling. Keep the `runtime` build target name that
   `fly.production.toml` expects.
2. Decide managed data stores (recommendation: whatever you can operate with least
   effort — Fly Postgres or a managed provider like Neon/Supabase for Postgres **with
   point-in-time recovery enabled**, plus Upstash Redis). Record the choice and
   connection topology in `docs/fly-deployment.md`.
3. Create the production Fly apps (`accountable-books-api`, ML engine prod app), set
   secrets via `scripts/setup-secrets.sh` (DATABASE_URL, REDIS_URL, JWT, Postmark/SES,
   Sentry, R2, Plaid, Mono, Bull Board password, `ADMIN_ALERT_EMAILS` — the outbox
   alerting is already built and only needs this env to be live).
4. Create `.github/workflows/deploy-production.yml` mirroring the staging workflow:
   trigger = push to `main` + `workflow_dispatch`, wait-for-CI step, migrate step, no
   demo seed. Deploy = `fly deploy --config fly.production.toml`.
5. DNS: `api.getaccountable.com` → Fly cert, `app.getaccountable.com` → Vercel
   production (Vercel already builds `main`; add the domain to the Vercel project).
   Cookie domain is `.getaccountable.com` (already in the toml env).
6. Deploy, run the same smoke flow on production with sandbox providers.

### 5. Guardrails (half a day)

- Add a branch protection rule: `develop`, `staging`, `main` require CI green + PR.
- The staging workflow's wait-for-CI pattern already exists; confirm production has it.
- Add the smoke flow as a checklist template in `my-notes/launch/smoke-runs.md`.

## Success criteria

- [ ] `git log main..develop` shows zero unmerged banking-branch commits; CI green on
      develop, staging, and main.
- [ ] `curl https://api-staging.getaccountable.com/health/ready` → 200, and the same
      for the production API URL.
- [ ] Staging AND production web apps load, log in, and hit their own API (no CORS or
      cookie-domain errors).
- [ ] Worker + scheduler machines running in both envs; `/admin/queues` reachable
      behind basic auth; an outbox intent written on staging is processed (visible in
      the health snapshot / DB status change).
- [ ] Full smoke flow (step 3) passes on staging and production, recorded in
      `my-notes/launch/smoke-runs.md` with dates.
- [ ] A push to `main` deploys production with zero manual steps besides approval.

## Out of scope

Blue/green or multi-region deploys, IaC/Terraform, load testing, autoscaling tuning,
custom status page. Post-launch.
