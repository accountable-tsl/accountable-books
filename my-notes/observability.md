# Accountable — Observability Implementation Guide

> **How we actually implement observability.**  
> [`observability-strategy.md`](./observability-strategy.md) = where we want to end up (metrics, ML depth, runbooks).  
> **This file** = how we get there while shipping the product.  
> Areas derived from [`codebase-deep-dive-2026-05-24.md`](./codebase-deep-dive-2026-05-24.md).

---

## The approach (read this first)

We are **not** executing the strategy doc’s Phase 1–16 block before touching product code.

```
Step 1 — Baseline tightening (small, shared, merge once)
Step 2 — First full slice: signup + workspace provisioning (reference implementation)
Step 3 — Each app area brought to “production-grade observability” as we make it launch-ready
Step 4 — Strategy ambitions (metrics dashboards, ML quality reports, etc.) when pain justifies them
```

**Production-grade for an area** means: you can answer _what happened_, _why it failed_, _who was affected_, and _what changed in the books_ for that area — without ad-hoc DB spelunking or guessing which log line matters.

Mark an area **Done** only when its checklist below is satisfied (or explicitly N/A with a one-line reason).

---

## Universal completion bar (every area)

Use this mental model when reading any checklist section.

| Dimension       | Production-grade means                                                                                                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correlation** | `correlation_id` flows FE → API → audit → BullMQ jobs → logs; searchable in Better Stack                                                                                                                                               |
| **Logs**        | Structured `flow` + `step`; success and failure paths; `companyId` = UUID; no tier-3 data                                                                                                                                              |
| **Audit**       | Every **committed** domain mutation has an `audit_events` row with `context` (`request_id`, `correlation_id`, IP, UA) — see [Audit vs security logs](#audit-vs-security-logs)                                                          |
| **Security**    | Denied / failed auth and abuse signals use structured logs (`flow: auth`, reason codes) — **not** `audit_events` unless a row was actually committed (e.g. password changed)                                                           |
| **Elevation**   | Mutations under `break_glass` / `support_grant` include `accessOrigin` + session id in payload                                                                                                                                         |
| **Product**     | User-visible steps have PostHog events from `event-catalog.ts` (FE and/or BE) — [PostHog policy](#posthog-launch-policy)                                                                                                               |
| **Errors**      | Unhandled failures reach Sentry with scrubbed tags (`flow`, `step`, `correlation_id`) — not raw bodies                                                                                                                                 |
| **Traces**      | Main operation has a span (OTEL or Sentry); child steps for multi-step pipelines                                                                                                                                                       |
| **Jobs**        | Async work enqueued with `_telemetry`; worker logs same `correlation_id`                                                                                                                                                               |
| **Privacy**     | Scrubber applied; no passwords, tokens, amounts, descriptions, account numbers in vendors                                                                                                                                              |
| **Integrity**   | Financial write paths use existing [`constraints-registry`](../../apps/api/src/domains/constraints/constraints-registry.ts) + synchronous checks; violations logged (metric when Prometheus exists) — no parallel validation framework |
| **Verify**      | Documented “how to test failure” + “where to look” for this area                                                                                                                                                                       |

**Do not** create new audit tables per area. **Do not** audit rolled-back transactions.

### Audit vs security logs

`audit_events` answers: **what committed state changed, for which tenant, under whose authority?**

| Signal                              | Where it goes                                          | Examples                                                                                                                |
| ----------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Committed mutation                  | `audit_events`                                         | Journal posted, role granted, settings saved, login succeeded (session created), password changed, support grant issued |
| Denied / failed attempt (no commit) | Structured **logs** (+ Sentry/PostHog when useful)     | Login failed, permission denied, invalid token, constraint blocked before write                                         |
| Security / abuse monitoring         | Logs + alerts (+ optional Redis counters per strategy) | Brute-force login, refresh-token reuse, break-glass opened                                                              |

Failed login is **not** an `audit_events` row — it is a security log (`logFlowStep` / `auth.events.ts` pattern from strategy doc). PostHog `auth.login_failed` is product analytics, not audit.

---

## Step 1 — Baseline tightening (merge before signup slice)

One or two PRs. No `audit_events` schema change — the table is already correct.

| #   | Task                                                                                             | Notes                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1  | Add deps: `posthog-node`, `posthog-js`, `@sentry/react`, OTEL API + SDK, `@sentry/opentelemetry` | Installed; prod can stay off via env flags                                                                                                                                                                   |
| B2  | Env schema: `POSTHOG_*`, `TELEMETRY_ENABLED`, `POSTHOG_ENABLED`, web `VITE_*`                    | `env-schema.ts` both apps; PostHog Cloud per [policy](#posthog-launch-policy)                                                                                                                                |
| B3  | `scrubForTelemetry()` + Sentry `sendDefaultPii: false` + fix signup Sentry payload               | Stop password leaks **now**                                                                                                                                                                                  |
| B4  | `RequestContext` (ALS): `requestId`, `correlationId`, `userId`, `companyId` (UUID), `source`     | Middleware + worker job wrapper                                                                                                                                                                              |
| B5  | Web: `X-Correlation-Id` on Axios; session-scoped id                                              | One id per browser tab session                                                                                                                                                                               |
| B6  | **Unify Pino** + context propagation                                                             | Consolidate `pino-http` in `app.ts`, shared `logger.ts`, and separate raw instances in `worker.ts` / `scheduler.ts` → one `getLogger()` + ALS; standard fields: `flow`, `step`, `correlationId`, `companyId` |
| B7  | `logFlowStep()` helper                                                                           | Contract below — do not use raw `logger.info` for pipeline steps                                                                                                                                             |
| B8  | `captureProductEvent()` abstraction + `event-catalog.ts`                                         | PostHog only (Mixpanel removed PR4); verify staging gate below before relying on funnels                                                                                                                     |
| B9  | BullMQ: `_telemetry` on enqueue; worker restores context                                         | **Pattern** for every queue; fully wire [launch-critical queues](#launch-critical-queues) first (see cross-cutting)                                                                                          |
| B10 | CI: `bootstrap` after staging migrate                                                            | Signup depends on platform/partner firms                                                                                                                                                                     |
| B11 | `/health/live` + `/health/ready`; update Fly health checks                                       | See [Health endpoints](#health-endpoints) below                                                                                                                                                              |
| B12 | Better Stack log drain + uptime on `/health/ready`                                               | Ops; can follow B11 by days                                                                                                                                                                                  |

**Not in baseline:** Prometheus `/metrics`, `/health/deep`, self-hosted PostHog, new SQL tables, repo-wide `console.log` purge, product drift detection, CRM export, security anomaly scoring.

### `logFlowStep` (B7)

One structured log line per pipeline step. Merges **RequestContext** (ALS): `requestId`, `correlationId`, `userId`, `companyId` when set. Use for multi-step flows (signup, provisioning, journal post, sync); use plain `logger` only for one-off debug.

```ts
// apps/api/src/shared/telemetry/log-flow-step.ts (path TBD)
logFlowStep({
  flow: 'signup', // required — domain pipeline name
  step: 'insert_company', // required — step within flow
  outcome: 'failed', // 'started' | 'ok' | 'failed'
  errorCode: 'billing_failed', // required on failed when known
  assignedFirmId: '…', // optional extras (UUIDs only)
});
// → single Pino line, level: debug/info/warn/error by outcome
```

Example log shape (searchable in Better Stack):

```json
{
  "flow": "signup",
  "step": "insert_company",
  "outcome": "failed",
  "errorCode": "billing_failed",
  "correlationId": "…",
  "companyId": "…",
  "msg": "flow step"
}
```

On `outcome: 'failed'`, include `errorCode` and sanitized `err.message` — never request bodies, passwords, or financial detail.

### PostHog product analytics (B8)

**Launch:** [PostHog Cloud](#posthog-launch-policy) (not self-hosted — see strategy backlog).

**Code (done):** Mixpanel removed; `captureProductEvent` → PostHog only (API `posthog-node`, web `posthog-js`). Event names are catalog keys (`signup.completed`, not `User Signed Up`).

**Staging verification checklist** — run once before trusting signup funnels in PostHog:

| Gate               | Requirement                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Env                | `TELEMETRY_ENABLED` + `POSTHOG_ENABLED` + keys set on API and web in staging                                                 |
| Catalog events     | `signup.started` (web), `signup.completed`, `workspace.created`, `signup.failed` (API/web) in PostHog Live                   |
| Success properties | `user_id`, `company_id`, `assigned_firm_id` (UUIDs); optional `country`, `company_type`                                      |
| Failure properties | `step`, `error_code` on `signup.failed`; no email/password                                                                   |
| Dashboard          | Recreate or relabel funnels: legacy Mixpanel `User Signed Up` / `Company Created` → `signup.completed` / `workspace.created` |
| Human check        | One happy signup + one forced failure per [Verify runbook](#verify-runbook-template--copy-for-high-risk-areas)               |

### Health endpoints

Replace the unconditional `GET /health` (`{ ok: true }` always) in `app.ts`:

| Endpoint        | Purpose               | Pass when                                                          |
| --------------- | --------------------- | ------------------------------------------------------------------ |
| `/health/live`  | Process is up         | Always 200 if Node is running (Fly liveness)                       |
| `/health/ready` | Safe to serve traffic | PostgreSQL reachable, Redis reachable — **dependency checks only** |

**Do not** put in `/health/ready`:

- **ML engine** — categorization may degrade; core API can still serve existing tenants.
- **Platform/partner firms bootstrapped** — business/bootstrap invariant, not infra. A missed seed must not 503 the whole API (login, journals, reads). Enforce via **B10 CI bootstrap**, signup error code, and `/health/deep` (below).

`/health/deep` (optional baseline follow-up or strategy backlog): migrations version, queue depth, **platform + partner firms present**. Uptime alerts stay on `/health/ready` (cheap deps only).

### Review-aligned execution order (foundation only)

When in doubt, ship baseline tasks in this order: (1) unify Pino + context → (2) live/ready + Fly → (3) Better Stack drain → signup slice. Prometheus + constraint/AI instrumentation come next via area checklists and strategy backlog — not before baseline merges.

---

## Step 2 — Signup + workspace provisioning (reference slice)

**Do this immediately after baseline.** Other areas copy this pattern.

**Code:** `signup.service.ts`, `signup.controller.ts`, `company-provisioning.service.ts`, `partner-firm.service.ts`, `workspace-bootstrap.service.ts`, web `auth-signup`.

### Implementation tasks

| #   | Task                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1  | `logFlowStep` on signup: `create_user`, `provision_workspace`, post-commit side effects                                                                                        |
| S2  | `logFlowStep` on each provisioning step: `insert_company`, `firm_meta`, `firm_assignment`, `billing`, `coa`, `settings`, `role_grant` — **log step on failure with step name** |
| S3  | Pass `auditContext` into all provisioning audit writers                                                                                                                        |
| S4  | Add `workspace.provisioned` summary audit at end of pipeline                                                                                                                   |
| S5  | PostHog: `signup.started` (web), `signup.completed`, `signup.failed` `{ step, error_code }`                                                                                    |
| S6  | Spans: `signup.register`, `provisioning.pipeline`, child per step                                                                                                              |
| S7  | Sentry: tags only; no full `input`                                                                                                                                             |
| S8  | Post-commit: log email/analytics/fiscal-calendar job outcomes with same `correlation_id`                                                                                       |
| S9  | Fix async `warnings` race (await side effects or remove sync warnings)                                                                                                         |
| S10 | If bootstrap firms missing at signup time: fail signup with clear `error_code` (e.g. `platform_not_bootstrapped`) + structured log — do not rely on `/health/ready` for this   |

### Signup + provisioning — completion checklist

- [ ] **Correlation** — single `correlation_id` from signup form through provisioning, audit rows, and email queue job
- [ ] **Logs** — failed signup identifiable by `step` without reading stack trace; success logs include `companyId`, `assignedFirmId`
- [ ] **Audit** — committed workspace has `firm_assignment`, `role_grant`, `workspace.provisioned` events with `request_id` / `correlation_id`
- [ ] **Audit** — failed signup (rollback) has **no** orphan audit rows; failure only in logs + Sentry + PostHog
- [ ] **Product** — funnel events in PostHog; properties use UUIDs
- [ ] **Traces** — one trace per signup attempt with step timing
- [ ] **Jobs** — `fiscal-calendar` / email jobs carry `_telemetry`
- [ ] **Privacy** — no password/email in PostHog; no full body in Sentry
- [ ] **Ops** — staging bootstrap runs in CI (B10); `/health/ready` = PG + Redis only; missing firms block **signup** (S10), not global traffic; ML not in ready
- [ ] **Verify** — runbook below executed once in staging (or documented equivalent)

When this section is all checked, treat it as the **template** for other areas — including the **Verify runbook** subsection for other areas.

### Verify runbook (template — copy for high-risk areas)

**How to test failure (signup):**

1. Staging: trigger signup with invalid data or mock failure at provisioning `billing` step (feature flag / test hook / break billing insert).
2. Note `correlation_id` from browser network tab (`X-Correlation-Id`) or response.

**Where to look:**

| Signal  | Where                                | Expect                                                              |
| ------- | ------------------------------------ | ------------------------------------------------------------------- |
| Logs    | Better Stack: `correlationId:"<id>"` | `flow: signup`, `step: billing`, `outcome: failed`, `errorCode` set |
| Product | PostHog Live                         | `signup.failed` with `step`, `error_code`; no password/email        |
| Errors  | Sentry                               | Issue tagged `correlation_id`, `flow`, `step`; no full signup body  |
| Audit   | DB `audit_events`                    | **No** rows for rolled-back signup                                  |
| Data    | `companies`                          | **No** new row for that attempt                                     |

**Success path smoke:** one happy signup → `signup.completed` in PostHog; `workspace.provisioned` in audit; same `correlation_id` on email queue job logs.

---

## Step 3 — Per-area production-grade checklists

Check off an area when **every applicable row** in the universal bar is met for that area’s flows.  
Status column: `—` not started · `◐` partial · `✓` done.

**Verify:** Universal bar requires documented failure test + where to look. Only **Step 2 (signup)** ships a full runbook by default. Before marking **✓** on high-risk areas, add an explicit **Verify** checklist row (same table format as signup runbook): journals (10), ledger (11), balances (12), bank sync (14), categorization (16). Low-risk CRUD areas can rely on the universal bar unless an incident forces a runbook.

### Cross-cutting (must exist for launch)

These are not product domains but must be done once (baseline covers most).

| Area                   | Scope                                                                    | Done when                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform telemetry** | RequestContext, scrubber, log helpers, event catalog, OTEL shell         | Baseline B1–B9 complete; documented in README or this file                                                                                   |
| **Web shell**          | Sentry init, PostHog init, correlation header, error boundaries          | All API calls send `X-Correlation-Id`; FE errors in Sentry with scrubbing                                                                    |
| **Background jobs**    | [Launch-critical queues](#launch-critical-queues) + scheduler heartbeats | Launch-critical set: full `_telemetry` + worker logs; **new** enqueue sites use pattern from day one; remaining queues before GA             |
| **Infrastructure**     | API, worker, scheduler on Fly; Neon; Redis                               | Better Stack drain for all 3 processes; uptime on `/health/ready`; Fly liveness on `/health/live`; deploy gate on ready (not ML)             |
| **Audit platform**     | `audit_events` writers, middleware                                       | Domains use `createAuditWriter` + `context` for **commits**; security denials use logs per [Audit vs security logs](#audit-vs-security-logs) |

### Launch-critical queues

Full telemetry bar applies to these for **launch** (aligns with Step 2 signup + MVP paths). Other queues: adopt `_telemetry` when that area’s checklist is worked — not a hidden all-12 rewrite.

| Queue                                                    | Why launch-critical         |
| -------------------------------------------------------- | --------------------------- |
| `email`                                                  | Signup, verify, reset       |
| `fiscal-calendar`                                        | Post-provision side effect  |
| `balance-recalc`                                         | Ledger integrity            |
| `transaction-sync`                                       | Bank MVP                    |
| `enrichment`, `rule-runner`, `ml-prediction`, `autopost` | Categorization MVP pipeline |

**Post-launch / area-driven:** `task-evaluation`, `journal-auto-reversal`, `recurring-journal-templates`, `partition-maintenance`. Scheduler crons: structured heartbeat logs at minimum for launch; full spans when touching that cron’s domain.

---

### Existing areas (code in production path today)

#### 1. Auth — session & credentials

Sub-areas: login, logout, token refresh, CSRF, `/auth/me`, password reset.

| Check                                                                                                                    |     |
| ------------------------------------------------------------------------------------------------------------------------ | --- |
| [ ] Failed login: structured security log (`flow: auth`, `step: login_failed`, reason code, IP) — **not** `audit_events` |     |
| [ ] Successful login: `audit_events` (`auth.login_succeeded`) + optional security log                                    |     |
| [ ] Refresh token anomalies: security logs (reuse, wrong IP); alert when strategy defines                                |     |
| [ ] PostHog: `auth.login_failed` (product) — no credential data                                                          |     |
| [ ] Sentry on auth middleware unexpected errors with `correlation_id`                                                    |     |
| [ ] No raw tokens in logs                                                                                                |     |

#### 2. Auth — signup

Covered in **Step 2** above.

#### 3. Auth — email verification & password reset

Sub-areas: token in `tokens` table, verify flow, reset flow.

| Check                                                                                |     |
| ------------------------------------------------------------------------------------ | --- |
| [ ] Email jobs (`email` queue) use `_telemetry`                                      |     |
| [ ] Verify/reset success and failure logged (no token hash, no link URL with secret) |     |
| [ ] Audit on `email_verified_at` set / password changed                              |     |
| [ ] PostHog: `email.verified`, `password.reset_completed` / `failed`                 |     |
| [ ] Failed email delivery visible in worker logs + Sentry                            |     |

#### 4. Users & onboarding

Sub-areas: user model, onboarding JSONB, `/onboarding/:step`, company switch.

| Check                                                                       |     |
| --------------------------------------------------------------------------- | --- |
| [ ] Each onboarding step completion → PostHog `onboarding.step_completed`   |     |
| [ ] Company switch logged with `userId`, from/to company UUIDs              |     |
| [ ] Onboarding guard failures (incomplete state) logged at warn, not silent |     |
| [ ] FE funnel from signup → first onboarding step in PostHog                |     |

#### 5. Companies & workspaces

Sub-areas: company CRUD, settings, provisioning (Step 2), bootstrap commands.

| Check                                                                           |                            |
| ------------------------------------------------------------------------------- | -------------------------- | --- |
| [ ] Provisioning — see Step 2                                                   |                            |
| [ ] `company.settings_updated` audit with field-level before/after (no secrets) |                            |
| [ ] Settings PATCH logs + `accessOrigin` when elevated                          |                            |
| [ ] Bootstrap/reconcile scripts log `action: provisioned                        | reconciled` + company UUID |     |
| [ ] Demo workspace provisioning uses `demo` policy; auditable same as customer  |                            |

#### 6. Accounting firms & multi-tenancy

Sub-areas: firm meta/slug, client assignments, partner routing, firm user client access.

| Check                                                                             |     |
| --------------------------------------------------------------------------------- | --- |
| [ ] Firm assignment changes audited (provisioning already partial)                |     |
| [ ] Client assignment create/update/revoke → `audit_events`                       |     |
| [ ] Partner routing decision logged at provision time (`assignedFirmId`, country) |     |
| [ ] Firm slug never confused with UUID in telemetry                               |     |

#### 7. Roles & permissions (RBAC)

Sub-areas: role grants, invites, permission checks.

| Check                                                                                                    |     |
| -------------------------------------------------------------------------------------------------------- | --- |
| [ ] Role grant/revoke → audit (`access.role_granted`, etc.)                                              |     |
| [ ] Invite sent/accepted → audit + PostHog                                                               |     |
| [ ] Permission denied logged at debug/info with `userId`, `companyId`, permission key — not spammy alert |     |
| [ ] Bulk role changes auditable                                                                          |     |

#### 8. Support access & break-glass

Sub-areas: grants, break-glass sessions, customer notifications.

| Check                                                                                            |     |
| ------------------------------------------------------------------------------------------------ | --- |
| [ ] Grant/revoke/break-glass open/close audited with `auditContext` **(already done)**           |     |
| [ ] **Every mutation** in customer workspace while elevated includes `accessOrigin` + session id |     |
| [ ] Break-glass open triggers alert (Slack) in staging/prod                                      |     |
| [ ] Support actions queryable: `audit_events` filter by `payload.accessOrigin`                   |     |

#### 9. Chart of accounts

Sub-areas: accounts, templates, locked accounts, must-have at provision.

| Check                                                                   |     |
| ----------------------------------------------------------------------- | --- |
| [ ] Account create/update/deactivate → audit                            |     |
| [ ] Template load at provision logged as step (not per-account audit)   |     |
| [ ] Locked account modification attempts logged + audit or denied audit |     |
| [ ] No account names/amounts in PostHog                                 |     |

#### 10. Journal entries

Sub-areas: draft CRUD, post, void, reverse, copy, CSV import, recurring, auto-reversal job.

| Check                                                                                                                                                                         |     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| [ ] All journal mutations audited via `journals.audit.ts` **with `auditContext`**                                                                                             |     |
| [ ] Replace ad-hoc `traceId` with shared `correlationId`                                                                                                                      |     |
| [ ] Post/void/reverse: `logFlowStep` + span; failure includes `journalBatchId`                                                                                                |     |
| [ ] PostHog: `journal.posted`, `journal.post_failed`, import started/completed                                                                                                |     |
| [ ] CSV import: log batch id, row counts, validation errors (no row amounts in logs)                                                                                          |     |
| [ ] `journal-auto-reversal` + `recurring-journal-templates` jobs: full job telemetry                                                                                          |     |
| [ ] **Integrity:** synchronous trial balance check before commit on post (strategy Track 2)                                                                                   |     |
| [ ] **Integrity:** constraint violations from `constraints-registry` logged with `code`, `severity`, `journalBatchId` / entry ids — extend existing path, no second framework |     |
| [ ] **Verify:** runbook — unbalanced post rejected; find attempt via `correlation_id`; no committed batch in DB                                                               |     |

#### 11. Ledger

Sub-areas: ledger transaction/entry creation, bank leg, partitioning, `ledger_audit_logs`.

| Check                                                                                         |     |
| --------------------------------------------------------------------------------------------- | --- |
| [ ] Ledger create path: `logFlowStep` through validation → insert → balance queue             |     |
| [ ] New writes use `audit_events` (freeze new `ledger_audit_logs` writes)                     |     |
| [ ] Bank leg validation failures logged with `ledgerTransactionId`, reason code               |     |
| [ ] Balance-recalc enqueue logged with correlation from parent operation                      |     |
| [ ] Partition missing errors alert-worthy in logs                                             |     |
| [ ] Constraint failures on ledger write path logged same as journals (`constraints-registry`) |     |

#### 12. Balances

Sub-areas: GL/bank snapshots, `balance-recalc` queue, opening balances.

| Check                                                                               |     |
| ----------------------------------------------------------------------------------- | --- |
| [ ] Recalc job: start/complete/fail logs with `companyId`, range, duration          |     |
| [ ] Recalc failure → Sentry; critical queue backlog alert (Better Stack pattern)    |     |
| [ ] Snapshot discontinuity detection (scheduled job — strategy Phase 6)             |     |
| [ ] Opening balance journal path correlated to bank account id (not account number) |     |

#### 13. Banking — account connection

Sub-areas: Plaid Link, Mono, OAuth callback, credentials storage, provider registry.

| Check                                                                                 |     |
| ------------------------------------------------------------------------------------- | --- |
| [ ] Connect start/complete/fail → PostHog + logs                                      |     |
| [ ] Plaid/Mono tokens **never** logged (already redacted in model — verify all paths) |     |
| [ ] Connection audit summary (provider, account count — not credentials)              |     |
| [ ] FE Plaid/Mono errors to Sentry with `correlation_id`                              |     |

#### 14. Banking — transaction sync

Sub-areas: webhooks, daily scan, sync service, dedupe, sign flip.

| Check                                                                                 |     |
| ------------------------------------------------------------------------------------- | --- |
| [ ] Webhook handler: `correlation_id` per webhook; span per sync run                  |     |
| [ ] `transaction-sync` job telemetry; lock acquire/release logged                     |     |
| [ ] Sync stall detectable (last sync timestamp in logs/metrics later)                 |     |
| [ ] Import batch: counts, provider, company UUID; no transaction descriptions in logs |     |
| [ ] Removed/modified transaction handling logged                                      |     |

#### 15. Banking — CSV / manual upload

Sub-areas: upload flow, batch fingerprint, fallback import.

| Check                                         |     |
| --------------------------------------------- | --- |
| [ ] Upload start/complete/fail PostHog + logs |     |
| [ ] Duplicate fingerprint hits logged         |     |
| [ ] Audit: import completed summary           |     |

#### 16. Transaction categorization

Sub-areas: enrichment job, rule runner, ML prediction job, autopost, human review, candidates.

| Check                                                                            |     |
| -------------------------------------------------------------------------------- | --- |
| [ ] Pipeline stages logged: enriched → rule → ml → autopost → human              |     |
| [ ] `categorization_task_events` for workflow (keep); not a substitute for audit |     |
| [ ] Accept/reject → PostHog + audit or outcome table when built                  |     |
| [ ] ML call: trace spans API → ml-engine; propagate `traceparent`                |     |
| [ ] Autopost failure → Sentry with `companyId`, `txId` — no description/amount   |     |
| [ ] Rule conflict/partial logged with rule ids                                   |     |

#### 17. AI — chat & tools

Sub-areas: streaming chat, history, capabilities, guardrails, tool runs.

| Check                                                                                                                                  |     |
| -------------------------------------------------------------------------------------------------------------------------------------- | --- |
| [ ] `ai.chat.requested` audit **(exists)** with context wired                                                                          |     |
| [ ] **Extend** existing `ai_chat_runs` + `ai_tool_runs` (model, tokens, cost, status) — do not introduce a parallel AI telemetry store |     |
| [ ] No prompts/responses in logs or PostHog                                                                                            |     |
| [ ] PostHog: `ai.chat_opened`, feedback events when UI supports                                                                        |     |
| [ ] Guardrail blocks logged with reason code                                                                                           |     |

#### 18. ML engine (Python)

Sub-areas: FastAPI predict, TF-IDF pipeline, COA snapshot cache.

| Check                                                               |     |
| ------------------------------------------------------------------- | --- |
| [ ] Structured JSON logs with `correlation_id` from incoming header |     |
| [ ] Predict latency + outcome logged; errors to Sentry (Python SDK) |     |
| [ ] Health endpoint monitored                                       |     |
| [ ] No transaction description text in logs                         |     |

#### 19. Multi-currency & FX

Sub-areas: exchange rates, monetary detection, FX positions.

| Check                                                                  |     |
| ---------------------------------------------------------------------- | --- |
| [ ] Missing rate failures logged with currency pair, date, `companyId` |     |
| [ ] FX posting path auditable via ledger/journal audits                |     |
| [ ] Rate fallback usage logged at warn                                 |     |

#### 20. Contacts

| Check                                                    |     |
| -------------------------------------------------------- | --- |
| [ ] CRUD mutations → audit                               |     |
| [ ] Search failures not logged with PII (email in query) |     |

#### 21. Projects

| Check                                                                |     |
| -------------------------------------------------------------------- | --- |
| [ ] CRUD mutations → audit                                           |     |
| [ ] Link to journal/ledger entries traceable via entity ids in audit |     |

#### 22. Reporting & fiscal calendar

Sub-areas: period open/close/lock, fiscal auto-extend job, trial balance view, ledger view.

| Check                                                                |     |
| -------------------------------------------------------------------- | --- |
| [ ] Period status changes → audit                                    |     |
| [ ] `fiscal-calendar` job telemetry                                  |     |
| [ ] Lock violation attempts logged + audit (`period.lock_violation`) |     |
| [ ] Close workflow events in PostHog when task system fires          |     |
| [ ] Report generation (when built) — see New Areas                   |     |

#### 23. Tasks & month-end workflow

Sub-areas: 10 task types, auto-detect sweep, blockers, priorities.

| Check                                                              |     |
| ------------------------------------------------------------------ | --- |
| [ ] Task create/resolve logged with `taskType`, `companyId`, scope |     |
| [ ] `task-evaluation` cron job telemetry                           |     |
| [ ] Task evaluation audit **(partial exists)** with context        |     |
| [ ] PostHog funnel hooks for close workflow (strategy Layer 4)     |     |

#### 24. Billing

Sub-areas: accounts, ownership, catalog, profiles, subscriptions (no Stripe yet).

| Check                                                         |     |
| ------------------------------------------------------------- | --- |
| [ ] Plan/subscription/ownership changes → audit               |     |
| [ ] Provisioning billing step logged in workspace flow        |     |
| [ ] When payment webhooks added → new subsection in New Areas |     |
| [ ] No tax IDs / billing addresses in PostHog                 |     |

#### 25. File storage (objects)

Sub-areas: R2 upload intent, finalize, attachments.

| Check                                                                                  |     |
| -------------------------------------------------------------------------------------- | --- |
| [ ] Upload intent/finalize logged with object type, size, checksum — not file contents |     |
| [ ] Failed uploads in Sentry                                                           |     |
| [ ] Attachment link to ledger/journal/bank entity in audit metadata                    |     |

#### 26. Frontend (web app)

Cross-cutting UI observability for launch.

| Check                                                                           |     |
| ------------------------------------------------------------------------------- | --- |
| [ ] Sentry browser SDK + source maps                                            |     |
| [ ] PostHog initialized per [PostHog policy](#posthog-launch-policy)            |     |
| [ ] Critical route errors captured (signup, connect bank, cat-engine, journals) |     |
| [ ] API client sends correlation id on all requests                             |     |

---

### New areas (not built or immature — apply checklist when implemented)

When these ship, they must meet the **universal bar** from day one. No retrofit debt.

| Area                                   | Notes for observability                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Financial reports** (P&L, BS, CF)    | Report generation audit; latency logs; PostHog `report.generated`; errors with report type + period — not line items |
| **Payment processing** (Stripe etc.)   | Webhook correlation; payment audit events; never log card data; alert on webhook failures                            |
| **Payroll** (`web-payroll`)            | Separate app: own Sentry/PostHog projects or tagged; same correlation conventions                                    |
| **OAuth / SSO**                        | Auth audit events; provider type; no OAuth tokens in logs                                                            |
| **Marketing site**                     | Lightweight: uptime + basic analytics only unless it shares signup                                                   |
| **Demo app**                           | Lower product bar; still no secrets in logs                                                                          |
| **Spreadsheet import** (migration)     | Same bar as journal CSV import                                                                                       |
| **Account classification** (migration) | Audit classification changes; ML override reasons                                                                    |

---

## Area status tracker (living document)

Update as areas reach production-grade.

| #   | Area                              | Status | Reference / notes                                                               |
| --- | --------------------------------- | ------ | ------------------------------------------------------------------------------- |
| 0   | Platform baseline                 | —      | Step 1 (B1–B12)                                                                 |
| 1   | Signup + provisioning             | ◐      | Active work — Step 2                                                            |
| 2   | Auth (session)                    | —      |                                                                                 |
| 3   | Auth (verify/reset/email jobs)    | —      |                                                                                 |
| 4   | Users & onboarding                | —      |                                                                                 |
| 5   | Companies & settings              | —      |                                                                                 |
| 6   | Firms & multi-tenancy             | —      |                                                                                 |
| 7   | RBAC                              | —      |                                                                                 |
| 8   | Support access                    | ◐      | Lifecycle audit done; elevation on mutations pending                            |
| 9   | COA                               | —      |                                                                                 |
| 10  | Journals                          | —      |                                                                                 |
| 11  | Ledger                            | —      |                                                                                 |
| 12  | Balances                          | —      |                                                                                 |
| 13  | Bank connect                      | —      |                                                                                 |
| 14  | Bank sync                         | —      |                                                                                 |
| 15  | Bank CSV upload                   | —      |                                                                                 |
| 16  | Categorization                    | —      |                                                                                 |
| 17  | AI chat                           | ◐      | Partial audit + runs table                                                      |
| 18  | ML engine                         | —      |                                                                                 |
| 19  | FX                                | —      |                                                                                 |
| 20  | Contacts                          | —      |                                                                                 |
| 21  | Projects                          | —      |                                                                                 |
| 22  | Fiscal / reporting                | —      |                                                                                 |
| 23  | Tasks / close                     | —      |                                                                                 |
| 24  | Billing                           | —      |                                                                                 |
| 25  | Objects / files                   | —      |                                                                                 |
| 26  | Web shell                         | —      |                                                                                 |
| 27  | Background jobs (launch-critical) | —      | See [Launch-critical queues](#launch-critical-queues); not all 12 before launch |
| 28  | Infrastructure                    | —      |                                                                                 |

---

## Strategy parity backlog

Items from [`observability-strategy.md`](./observability-strategy.md) that are **out of scope** for Step 1 baseline and Step 3 area checklists until pain justifies them. Pull into execution when an incident or launch gate requires it.

| Item                                                              | Why deferred                                                                                       | When to promote                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Prometheus `/metrics` + BullMQ + DB pool gauges                   | Baseline focuses on correlation + logs + audit first                                               | Queue backlog or pool exhaustion in prod                                           |
| Grafana dashboards + alert rules on metrics                       | Needs metrics endpoint                                                                             | After `/metrics` ships                                                             |
| `/health/deep`                                                    | Ready = PG + Redis only for launch                                                                 | Ops wants migration version, queue depth, **bootstrap firms present** in one probe |
| Tail-based trace sampling (“100% of requests >1s”)                | SDK head sampling alone cannot guarantee that — needs collector tail sampling or Sentry equivalent | High-volume prod; don’t overpromise in docs until implemented                      |
| Firm health score scheduled job                                   | Product analytics, not ops survival                                                                | Firm success / churn instrumentation phase                                         |
| Langfuse / deep LLM eval                                          | `ai_chat_runs` covers launch                                                                       | Model quality regressions become frequent                                          |
| `pg_stat_statements` / pganalyze                                  | Neon has some visibility                                                                           | Slow query incidents                                                               |
| Self-hosted PostHog                                               | **PostHog Cloud** chosen for launch — see [PostHog launch policy](#posthog-launch-policy)          | Cost, data residency, or EU data center requirement                                |
| Evidently / drift detection, CRM export, security anomaly scoring | Not foundation                                                                                     | Explicit product/security initiatives                                              |

**Intentional divergences from strategy doc:** (1) ML not in `/health/ready`; (2) bootstrap firms checked in CI + `/health/deep` + signup errors, not in ready (see [Health endpoints](#health-endpoints)).

---

## Tools (chosen path)

| Role                  | Tool                                                                |
| --------------------- | ------------------------------------------------------------------- |
| Logs + uptime         | **Better Stack**                                                    |
| Errors + early traces | **Sentry**                                                          |
| Product analytics     | **PostHog Cloud** (launch) — policy below; self-hosted deferred     |
| Tracing standard      | **OpenTelemetry** → Sentry first                                    |
| Audit                 | **`audit_events`** (+ `ai_chat_runs`, `categorization_task_events`) |
| Strategy eventual     | [Strategy parity backlog](#strategy-parity-backlog)                 |

### PostHog launch policy

**Decision:** **PostHog Cloud** for launch. Strategy’s self-hosted option is deferred to [strategy parity backlog](#strategy-parity-backlog) (cost / data residency). Cloud does **not** relax what we send — masking is the same as self-hosted would be.

| Allowed event properties                                                       | Never send to PostHog                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `user_id`, `company_id`, `assigned_firm_id` (UUIDs)                            | Passwords, tokens, session cookies, magic links                       |
| `correlation_id` only if needed for support correlation                        | Email, phone, tax IDs, billing addresses                              |
| `step`, `error_code`, `flow`, event name from `event-catalog.ts`               | Amounts, balances, FX rates, invoice totals                           |
| Low-cardinality enums: `country`, `company_type`, `provider` (e.g. plaid/mono) | Transaction descriptions, memos, journal line detail                  |
|                                                                                | Contact/customer/vendor names, COA account names tied to transactions |
|                                                                                | Free-text user input, file contents, prompts/responses                |

**SDK config (web):** autocapture off or minimal; session replay **off** at launch; identify users by internal UUID only. All product events go through `captureProductEvent()` + catalog — no ad-hoc `posthog.capture` with arbitrary payloads.

**Backend:** same allowlist via `captureProductEvent`; run payloads through `scrubForTelemetry()` if properties are built dynamically.

---

## Key rules

1. **Strategy doc = destination; this doc = how we work today.**
2. **Baseline once → signup slice as template → check off areas for launch.**
3. **Audit ≠ security logs ≠ PostHog.** `audit_events` = committed mutations only; failed auth → logs. Rolled-back work → logs only.
4. **`companyId` in telemetry = UUID.** Optional `companyShortCode` for humans.
5. **No new audit tables** without the three-question test (see strategy / prior discussion).
6. **Financial integrity** uses existing `constraints-registry` + trial balance on post — instrument violations, don’t build a parallel framework (areas 10–11).
7. **Tracing:** “sample all slow requests” requires tail-based sampling when we add OTEL at scale — see strategy parity backlog.

---

## Code map

| Piece                          | Path                                                                   |
| ------------------------------ | ---------------------------------------------------------------------- |
| Reference audit + context      | `domains/support-access/`                                              |
| Signup                         | `features/signup/signup.service.ts`                                    |
| Provisioning                   | `domains/companies/company-provisioning.service.ts`                    |
| Audit core                     | `domains/audit/`                                                       |
| Company middleware             | `core/middlewares/companies.middleware.ts`                             |
| Journals                       | `domains/journals/journals.command.ts`                                 |
| Constraints                    | `domains/constraints/constraints-registry.ts`                          |
| AI telemetry (extend)          | `domains/ai/telemetry/ai-chat-runs.model.ts`                           |
| Health (replace)               | `apps/api/src/app.ts`                                                  |
| Web Sentry                     | `apps/web/src/sentry.bootstrap.ts`, `components/SentryAppBoundary.tsx` |
| Worker / scheduler loggers     | `apps/api/src/worker.ts`, `apps/api/src/scheduler.ts`                  |
| Event catalog + scrub (shared) | `packages/utils/src/telemetry/event-catalog.ts`, `telemetry/scrub.ts`  |
| PostHog (API)                  | `lib/posthog.ts`                                                       |
| `logFlowStep` (B7)             | `shared/telemetry/log-flow-step.ts` (when added)                       |
| Product events                 | `packages/utils/src/telemetry/event-catalog.ts`                        |
| Deploy / bootstrap             | `.github/workflows/deploy-staging.yml`, `config/test-db.ts`            |
| Auth security logs (strategy)  | `features/auth/auth.events.ts` (when added)                            |

---

## Related

- [`observability-strategy.md`](./observability-strategy.md) — metrics, ML funnel, DB observability, runbooks, long-term phases
- [`codebase-deep-dive-2026-05-24.md`](./codebase-deep-dive-2026-05-24.md) — domain map this guide is based on
- [`docs/architecture/workspace-provisioning.md`](../docs/architecture/workspace-provisioning.md)
- [`docs/security/customer-support-access-policy.md`](../docs/security/customer-support-access-policy.md)
