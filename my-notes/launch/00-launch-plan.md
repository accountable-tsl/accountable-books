# Launch Plan — Shortest Path to Production

Date: 2026-07-19. Everything below was verified against code on branch
`feat/banking-connection-sync-system` (not docs — PROJECT_STATUS.md and TODOS.md are stale).

## Read this first

You have not failed to build the product. The product is built. What is missing is
**assembly and shipping**: joining halves that both already exist, and putting the result
on a server. Evidence from this audit:

- 171 API test files, **1272 tests, all passing** (37s run, 2026-07-19).
- Real end-to-end today: signup (business + accounting firm), onboarding, Plaid **and**
  Mono connect, the reworked per-account bank sync with leased outbox execution,
  bank statement upload, categorization engine (rules + ML), journals + recurring
  templates, chart of accounts, ledger posting with transactional outbox, trial balance
  API, close-readiness + fiscal calendar backend, contacts, projects, AI threads,
  email infra (SES/Postmark), Sentry bootstrap in web AND api, rate limiting on auth.
- Every mock screen was built **contract-first**: the Zod contracts are frozen in
  `packages/contracts` and the UI validates against them. The backends just need to be
  written to contracts that already exist. That was the right way to build; now collect.

Do not start over. Starting over discards ~1300 passing tests and two years of
correctness work (double-entry invariants, outbox guarantees, sync dedup) that a rewrite
would have to re-learn bug by bug.

## Launch definition (decided 2026-07-19)

- **Customer:** accounting firms managing client companies. Not self-serve businesses.
- **Markets:** Nigeria (Mono) and US (Plaid), both at launch.
- **Payments:** real payments are required for launch.
- **Shape:** undecided → this plan uses two gates so "payments required" does not block
  the first real firms:
  - **Gate A — Design-partner beta.** 2–5 firms you personally onboard, on production
    infrastructure, doing real client books. Billing = manual (comped or invoiced).
    This is the moment you have launched something real.
  - **Gate B — Paid launch.** Checkout live, open firm signup.

If you disagree with the two-gate shape, the only change is that workstream 06
(payments) moves before Gate A — nothing else in the plan changes.

## The blunt facts the plan fixes

1. **Nothing is deployed.** Last CI run May 27. Last staging deploy **failed** May 28.
   `api-staging.getaccountable.com` is down; `staging.getaccountable.com` serves a
   2-month-old web build pointed at a dead API; `app.getaccountable.com` does not
   resolve. `fly.production.toml` references `Dockerfile.prod`, which does not exist.
   `main` is 700 commits behind your working branch.
2. **The first screen after login is demo data.** Dashboard overview/income/balance tabs
   are mocks (with a demo badge). The reporting contract + UI are done; the API module
   (`apps/api/src/domains/reporting/reports/`) was never written.
3. **The firm layer — your actual product — is 100% mock in the UI**: firm dashboard
   shell, client roster, task queue, client invite wizard, team members list, billing.
   And there is **no API endpoint for a firm to add a client company**, even though the
   full provisioning service (`provisionCompanyWorkspace`) exists and is battle-tested
   by signup/demo/partner flows.
4. **CI only runs on pushes/PRs to develop/staging/main.** Feature-branch work is
   guarded only by local hooks. The 2026 commit history is months of deep backend work
   on a branch CI has never seen.

## Ranked problems (highest impact first)

| # | Problem | Workstream | Gate | Size |
|---|---------|-----------|------|------|
| 1 | No path to production; staging dead; branch never merged | [01-ship-train-and-environments](01-ship-train-and-environments.md) | A | M |
| 2 | Financial statements (P&L/BS) have no backend — the client deliverable is fake | [02-financial-statements-backend](02-financial-statements-backend.md) | A | M–L |
| 3 | Firms cannot add clients — no provisioning endpoint, invite is mock | [03-firm-client-onboarding](03-firm-client-onboarding.md) | A | M |
| 4 | Firm dashboard (roster + task queue) is mock | [04-firm-dashboard-real-data](04-firm-dashboard-real-data.md) | A | M |
| 5 | Trial balance UI is a stub; team settings list is mock | [05-trial-balance-and-team](05-trial-balance-and-team.md) | A | S |
| 6 | Bank providers not production-certified (Plaid approval takes weeks — START THE APPLICATION NOW) | [07-bank-provider-production](07-bank-provider-production.md) | A | S build, L calendar |
| 7 | No payments | [06-payments](06-payments.md) | B | L |
| 8 | Ops basics unproven: backups, alerts wiring, restore drill, runbooks | [08-launch-ops](08-launch-ops.md) | A/B | S |

Sizes are relative (S ≈ a day or two focused, M ≈ up to a week, L ≈ multi-week).

## Order of work

```
Week 1        01 ship train + staging back up            ← unblocks everything
              07 Plaid production application submitted   ← calendar time, start day 1
Weeks 2–3     02 financial statements backend + UI swap
              05 trial balance UI + team list (small, parallelizable)
Weeks 3–4     03 firm→client onboarding
              04 firm roster + task queue on real data
Week 5        08 ops checklist, production deploy, real-bank testing (07)
              → GATE A: onboard first design-partner firm
Weeks 6–8     06 payments (checkout + webhooks + billing UI swap)
              → GATE B: paid launch
```

Do 01 first even though it is "just plumbing": every other workstream's success
criteria end with "verified on staging," and right now staging cannot verify anything.

## Triage rule (the loop guard)

For any issue discovered while executing this plan, classify before touching it:

- **Wrong numbers / data corruption / security** → fix now, it blocks launch.
- **Missing capability** → only if it is on this plan; otherwise write it in
  `my-notes/launch/backlog.md` and keep moving.
- **Inelegant structure / duplication / "should be reworked"** → post-launch, no
  exceptions. Write it down and keep moving.

Deliberately **not** launch work (already triaged, do not reopen):
ledger page + account-notes page (hide the stubs — see 05), the three cat-engine copies,
`domains-pending-migration/` cleanup, the `/table` demo route, remaining circular deps +
CI cycle ratchet, `postLedgerTransactions` consolidation, dirty-range watermark refactor,
bank opening-balance split (bank-side anchor rework), web-payroll (separate funnel
track), data-export.tsx (intentionally kept), firm dashboard analytics/charts panels,
Mono webhook receiver (pull-based sync is fine at launch), CSV/batch client invite,
chat-driven invite.

## Gate checklists

**Gate A — you can onboard a design-partner firm when:**
- [ ] Current code is merged through develop → staging → main; CI green on all three.
- [ ] Staging + production API/web/ML deployed; smoke flow passes on both
      (signup → onboard → connect sandbox bank → sync → categorize → post → trial balance).
- [ ] A firm can sign up, add a client company, and (optionally) invite the client owner.
- [ ] Dashboard income statement + balance sheet show real ledger numbers (demo badge gone).
- [ ] Trial balance page renders the real API and foots (debits = credits).
- [ ] Firm queue + roster show real data; every deep link lands filtered correctly.
- [ ] One real bank connected end-to-end on production via Plaid AND via Mono.
- [ ] Backups on; alerts firing to your inbox; restore drill done once.

**Gate B — you can charge money when:**
- [ ] A firm completes checkout in test mode end-to-end on staging, then live in production.
- [ ] Provider webhooks are processed through the durable store-then-outbox path.
- [ ] Billing page shows the real subscription; entitlements are soft (banners, not lockouts).

## Notes for whoever implements (you + Claude)

- Every workstream doc is self-contained: current state with file paths, design
  decisions already made, steps, and checkable success criteria. Feed one doc to one
  session.
- Contracts are law. If a backend wants a different shape than the frozen contract,
  the default is: backend adapts. Changing a contract requires updating the UI consumer
  in the same PR.
- No new scope may enter Gate A. New ideas go to `my-notes/launch/backlog.md`.
