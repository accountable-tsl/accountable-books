# Launch Feature Inventory

Date: 2026-07-25.
Verified against code on branch `feature/work-queue-close` (= `origin/develop`), not against docs.
`PROJECT_STATUS.md` and `TODOS.md` are stale in places; where they disagree with code, code wins.

This is the *feature* cut of the launch question: every capability the product needs before first external launch, with its real status.
The workstream cut lives in [00-launch-plan.md](00-launch-plan.md).
Read both: this file tells you what exists, that one tells you in what order to build.

## Status legend

| Mark | Meaning |
| --- | --- |
| ✅ | Real end to end: API + UI, tested, works today |
| 🟡 | Backend only: API is real and tested, no UI consumes it |
| 🟠 | UI only: screen is built and contract-validated, served by mock data |
| ❌ | Missing: neither side exists |
| ⚙️ | Built but not operational: code exists, needs credentials/env/deploy |
| 🔵 | Deliberately out of launch scope (see [backlog.md](backlog.md)) |

---

## Read this first: launch scope changed after the 19 July plan

Two documents in this repo currently define "launch scope" and they do not agree.

**The 19 July launch plan** ([00-launch-plan.md](00-launch-plan.md)) says: adapt the firm queue UI to the existing, tested `GET /work-queue` API, do not extend the work materializer, and ship the firm layer on simple derived status.
Gate A is roughly 5 weeks of work.

**The 20-21 July Work Queue and Close V2 design** (`my-notes/work-queue-close-v2/`) says the opposite: the existing work materializer, `legacy_work_items`, `workflow_runs`, `engagement_tasks` and the close-review signal tables are all **deleted**, replaced by a greenfield twelve-table system, and *the complete V2 product blocks first external launch*.
That is: Engagement authorization, 8 work types, 12 evidence-backed Findings, monthly Close with versions and approvals, Close Confirmations, Catch-up Packages, firm transfers, cascading reopen with durable Reopen Requests, firm oversight scopes, bulk commands, SSE realtime invalidation, and a complete projection-driven SPA.
It is currently at design stage: 10 tickets closed, Stage 0 (freeze and inventory) not started, nothing implemented.

Those are not the same launch.
V2 as scoped is a multi-month build on its own, and it obsoletes workstream [04](04-firm-dashboard-real-data.md) entirely and changes parts of [03](03-firm-client-onboarding.md) (the Engagement-activation contract becomes the real integration point, not a bare `provisionCompanyWorkspace` call).

The inventory below marks V2 items as their own block so you can see the two shapes side by side and decide.
My recommendation is at the bottom.

---

## A. Identity, access, and security

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| A1 | Signup (business + accounting firm) | Creates user + provisions a workspace, both customer and firm shapes | ✅ | Required |
| A2 | Email verification | Token-based verify + resend | ✅ | Required |
| A3 | Login / logout / session refresh | Cookie session, refresh token, CSRF token endpoint | ✅ | Required |
| A4 | **Password reset** | Forgot-password request, emailed token, set new password | ❌ **The login page links to `/forgot-password`, which has no route and 404s.** Token type `password_reset` and a `reset-password` email template exist; no controller, no route, no page | Required |
| A5 | Auth rate limiting | `authLimiter` on login/signup | ✅ | Required |
| A6 | Company access enforcement | `checkCompanyId` on every company-scoped route | ✅ | Required, plus the cross-company access audit in `TODOS.md` |
| A7 | Role grants | `POST /grant-access` gives a user a role on a company | 🟡 no list endpoint, no management UI | Required (list needed by A8/F6) |
| A8 | Team member list | Who has access to this company, with role and status | 🟠 `MOCK_TEAM_MEMBERS_RESPONSE` | Required ([05](05-trial-balance-and-team.md)) |
| A9 | Multi-company switching | Company switcher across accessible workspaces | ✅ | Required |
| A10 | Support access / break-glass | Time-boxed support grants, break-glass sessions, policy + runbook | 🟡 API + docs, no admin UI | Required (API is enough at Gate A) |
| A11 | Audit events | Durable audit trail of domain events | ✅ backend | Required |
| A12 | User action trails across the app | Broader activity tracking surfaced to users | ❌ | 🔵 Post-launch |
| A13 | Staging isolation | Nobody reaches staging by accident | ❌ | Required (`TODOS.md` critical) |

## B. Company setup and accounting configuration

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| B1 | Onboarding wizard | Company info, verify email, first bank account | ✅ | Required |
| B2 | Workspace provisioning | `provisionCompanyWorkspace`: company, class, firm assignment, billing ownership, COA, settings, role grant | ✅ canonical, battle-tested | Required |
| B3 | Chart of accounts | Full COA with element/type taxonomy, bootstrap catalogs | ✅ | Required |
| B4 | Company settings | Name, identity, company profile | ✅ | Required |
| B5 | Financial settings | Accounting basis, fiscal year end, reporting framework, currency | ✅ | Required |
| B6 | Fiscal year-end defaults by country | UK 5 Apr etc. | ✅ | Required |
| B7 | Invalid FYE guard | Reject 30 Feb, 31 Sep on signup | ❌ | Required (`TODOS.md` critical) |
| B8 | Accounting-basis default | Default to modified cash on company creation | ❌ | Required (`TODOS.md` critical) |
| B9 | Company timezone at onboarding | Captured, drives close deadlines and business-day sweeps | ❌ | Required if V2 close ships (its sweep is timezone-aware) |
| B10 | Currencies + exchange rates | Currency table, rate ingestion, conversion | ✅ backend | Required |
| B11 | CBN rate freshness | Nigerian official rate kept current | ⚙️ | Required for NGN books |
| B12 | Full ISO 4217 currency list | All codes seeded | ❌ | 🔵 Post-launch |
| B13 | Fiscal calendar / periods | Monthly period generation, status, period locking on journal entry | ✅ backend, consumed by journals UI | Required |
| B14 | Opening / conversion balances | Ledger-side conversion balance journals at the accounting conversion date | ❌ | **Required.** A firm taking on an existing client cannot start without it |
| B15 | Bank opening balance anchor | Bank-side balance anchor derived from provider | ✅ | Required (rework of the split is 🔵) |

## C. Banking

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| C1 | Connect bank via Plaid (US) | Link token, exchange, connection details, sync | ⚙️ code done, **production approval not applied for** | Required ([07](07-bank-provider-production.md), longest calendar item) |
| C2 | Connect bank via Mono (NG) | Same interface, widget in web | ⚙️ code done, production keys + business verification pending | Required |
| C3 | Provider registry, country mapping | DB-driven provider enablement | ✅ | Required |
| C4 | Per-account transaction sync | Cursors, leased outbox execution, retry budget, daily scan | ✅ | Required |
| C5 | Plaid webhooks | Store-then-outbox durable receipt | ✅ | Required |
| C6 | Mono webhooks | Push updates for NG | ❌ | 🔵 Pull-based sync is the launch behaviour |
| C7 | Reconnect / reauth | Rematch as connection replace, selected-account reauth, no duplicate history | ✅ | Required |
| C8 | Disconnect detection + notify | Bank-side revoke marks state and notifies | ✅ | Required |
| C9 | Manual "sync now" | User-triggered sync | ✅ | Required (the only fresh-data lever for Mono) |
| C10 | Bank statement upload (CSV) | Import transactions without a feed | ✅ | Required |
| C11 | Historical import offer | "N older transactions available from {date}" + earlier-date picker | 🟡 backend + contract done, **frontend never wired** | Required if any client needs history, which is every client |
| C12 | Sync health surfacing | Distinguish `action_required` from `delayed`/`pending` in the UI | 🟡 | Required. A silently stale feed produces wrong books |
| C13 | Superseded / removed transaction review | Provider retracted or replaced a transaction | 🟡 backend + notifications, no review surface | Required |
| C14 | Bank accounts management UI | List, status, last synced, per-account actions | 🟠 partial, lives inside the accounting workspace | Required |
| C15 | View raw bank txn batches, delete batch | Inspect and undo an import | ❌ | 🔵 Post-launch |
| C16 | Transfer detection between own accounts | Avoid double-counting internal moves | ❌ | 🔵 Post-launch, but expect it to bite in the first real books |
| C17 | Webhook payload purge + sync-run retention | Scheduled cleanup | ✅ | Required (verify running in prod) |

## D. Bookkeeping core

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| D1 | Categorization engine (Cat Engine) | The main working surface: categorize, match, split, post | ✅ | Required |
| D2 | ML suggestions | `apps/ml-engine` scoring service | ⚙️ real, staging Fly app only, no production app | Required |
| D3 | Categorization rules | Rule-driven auto-categorization | ✅ | Required |
| D4 | Autopost | Post without manual review where confidence permits | ✅ | Required |
| D5 | Cat Engine pagination correctness | Cursor-based instead of offset (offset can skip/duplicate rows under infinite scroll) | ❌ | **Required.** This is a wrong-data risk, not a nicety |
| D6 | Cat Engine advanced filters | Amount range, confidence, contact, project | ❌ "coming soon" | 🔵 Post-launch |
| D7 | Cat Engine bulk actions | Act on many transactions at once | ❌ | 🔵 Post-launch, unless V2 bulk commands land |
| D8 | Manual journals | Create, edit, post, reverse, draft | ✅ | Required |
| D9 | Recurring journal templates | Schedule, generate occurrences | ✅ | Required |
| D10 | Journal import | `POST /journals/import` + preflight | 🟡 API real, **no web route mounted**, no UI | Required for onboarding an existing client's history |
| D11 | Journal attachments | Presigned upload, persist, signed download | ⚠️ contract/API mismatch, fabricated public URLs (`TODOS.md` critical) | Required |
| D12 | Ledger posting + double-entry invariants | Transactional outbox, balanced-entry enforcement | ✅ | Required |
| D13 | GL balances and snapshots | `gl_current_balances`, daily snapshots, period balances | ✅ | Required |
| D14 | GL balance refresh on every mutation | `enqueueGLBalance` wired into all ledger-entry paths | ⚠️ partial (`TODOS.md` critical) | **Required.** Missing this means stale statements |
| D15 | Contacts | Customers/suppliers, linked to postings | ✅ | Required |
| D16 | Projects | Cost/revenue tagging dimension | ✅ | Required |
| D17 | FX positions and revaluation | Open monetary exposure register, period revaluation | ⚠️ `fx_positions` + movements exist, handling incomplete (`TODOS.md` critical) | Required for any multi-currency client, and V2 Finding `fx_revaluation_decision_review` depends on it |

## E. Reporting and client deliverables

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| E1 | Trial balance API | `GET /balances/trial-balance` + refresh | ✅ | Required |
| E2 | Trial balance page | Grouped, footing, period picker | ❌ 12-line stub: "Content will be implemented next" | Required ([05](05-trial-balance-and-team.md)) |
| E3 | Income statement | P&L for a period | 🟠 contract + UI frozen and done, **API module never written** | Required ([02](02-financial-statements-backend.md)) |
| E4 | Balance sheet | Position as of a date, with period result in equity | 🟠 same | Required |
| E5 | Statement line detail | Accounts behind a statement line | 🟠 same | Required |
| E6 | Statement line transactions | Cursor-paginated drill-through to entries | 🟠 same | Required |
| E7 | IFRS / US-GAAP labelling | Framework-driven nomenclature | ✅ in catalog + UI | Required |
| E8 | Dashboard overview tab | Firm/client home summary | 🟠 mock with demo badge | Required, or hide the tab |
| E9 | Client dashboard (client portal view) | What the client owner sees | 🟠 `mock-client-dashboard-overview` | Required if clients log in at Gate A; otherwise hide |
| E10 | Ledger page | General ledger drill-through | ❌ stub | 🔵 Hide the route |
| E11 | Account notes page | Per-account notes | ❌ stub | 🔵 Hide the route |
| E12 | Statement export (XLSX/CSV/PDF) | Hand the client a file | ❌ | 🔵 Post-launch, but this is the first thing a real firm will ask for |
| E13 | Cash flow statement | Third statement | ❌ | 🔵 Post-launch |
| E14 | Comparatives (prior period column) | Side-by-side periods | ❌ | 🔵 Post-launch |

## F. Firm layer (the actual product)

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| F1 | Firm signup + firm workspace | Firm as a first-class workspace class | ✅ | Required |
| F2 | Firm slug / branded identity | Slug check and resolution | ✅ backend | Required |
| F3 | **Firm adds a client company** | Provision a managed client workspace from the firm | ❌ **no endpoint at all**, despite provisioning existing | **The single hardest blocker.** Without it a firm cannot use the product |
| F4 | Client invite + accept | Email the client owner, token, grant on accept | 🟠 wizard built and contract-validated, `invite-firm-client.ts` returns a hardcoded response | Required ([03](03-firm-client-onboarding.md)) |
| F5 | Client roster | List of clients with status, open work, last activity | 🟠 `mock-firm-clients.ts` | Required |
| F6 | Firm task queue | The firm's daily work list | 🟠 mock over the *legacy* contract; the real `GET /work-queue` API exists and nothing consumes it | Required, shape depends on the V2 decision |
| F7 | Firm dashboard shell (aggregate stats, weekly activity) | Practice-level metrics | 🟠 `mock-firm-dashboard-shell.ts` | 🔵 Hide the panels rather than fake them |
| F8 | Open client book / switch into a client | Firm user enters a client workspace | ✅ | Required |
| F9 | Firm staff assignment to clients | Who works which client | 🟠 in the invite wizard only | Required (becomes V2 Engagement responsibilities) |
| F10 | Manual firm verification | Firms verified by you before they can add clients | ❌ | Required (`TODOS.md` critical) |
| F11 | Client intake: all acquisition paths | Invite, branded signup, direct signup with placement, referral, transfer | ❌ | Partially required. Invite + direct is the launch minimum; referral/transfer belong to V2 |
| F12 | Historical catch-up question at intake | "Does this client need catch-up bookkeeping?" and the accepted range | ❌ | Required if catch-up ships (V2), and honestly required regardless to set expectations |
| F13 | CSV/bulk client import | Add many clients at once | ❌ | 🔵 Post-launch |
| F14 | Chat-driven client invite | Add a client from the AI chat | ❌ | 🔵 Post-launch |

## G. Work Queue and Close V2 (the new scope block)

Everything here is **design-complete, implementation not started**.
Per `full-launch-scope-and-finding-catalogue.md` and `implementation-and-prelaunch-replacement-programme.md`, all of it is declared blocking for first external launch.
Stages are dependency boundaries, explicitly not release cuts.

| # | Feature | What it does | Status | Stage |
| --- | --- | --- | --- | --- |
| G1 | Twelve authoritative tables | Engagements, team assignments, firm defaults, work items, period closes, versions, packages, findings, reopen requests, finding resolutions, confirmations, confirmation responses | ❌ | 1 |
| G2 | Firm-Client Engagement + activation contract | One shared contract every intake path must satisfy; Lead + Bookkeeper required before activation | ❌ | 2 |
| G3 | Effective-dated responsibilities | Client Lead, Primary Bookkeeper, Contributors, firm defaults, fallback-to-admin | ❌ | 2 |
| G4 | Authorization scopes | `my_work`, `portfolio`, capability-gated `firm_oversight` | ❌ | 2 |
| G5 | Work kernel | Work Type Registry, target adapters, prepared sync contexts, transactional reconciliation, outbox-driven recovery, occurrence lifecycle | ❌ | 3 |
| G6 | Work type: `categorize_bank_transaction` | First complete vertical slice, ledger to UI | ❌ | 4 |
| G7 | Work type: `review_categorization_candidate` | Includes server-issued bounded bulk manifests + partial results | ❌ | 5 |
| G8 | Work type: `review_draft_journal` | Unresolved drafts as work | ❌ | 5 |
| G9 | Work type: `restore_bank_connection` | Only for `requires_action`; resolved by verified reauth | ❌ | 5 |
| G10 | Work type: `resolve_accounting_finding` | Findings as work | ❌ | 5 |
| G11 | Work types: close preparation, close approval, reopen-request review | The remaining three of the eight | ❌ | 3-6 |
| G12 | Finding catalogue: 8 transaction/ledger definitions | Bank offset to non-cash, receipt direct to revenue, payment direct to expense, suspense activity, missing counterparty, missing supporting document, journal posted to bank, accumulated depreciation movement | ❌ evaluators exist in current close-readiness code and are reusable as logic, but not as persistence | 5 |
| G13 | Finding catalogue: bank ingestion | `transaction_dated_in_closed_period` with safe match / open `fs_date` / reopen paths | ❌ | 6 |
| G14 | Finding catalogue: 3 period definitions | Fixed-asset depreciation review, FX revaluation decision, modified-cash asset/liability pattern | ❌ | 6 |
| G15 | Finding evidence + resolution contracts | Reasoning, exact rows, correcting commands, authorized professional accept/not-applicable with reason and evidence, staleness on facts change | ❌ | 5-6 |
| G16 | Monthly Period Close lifecycle | Materialize 5 business days before month end, Preview to Preparing, overdue derivation, hourly business-day sweep in client timezone | ❌ | 6 |
| G17 | Period Close Versions | Numbered, frozen on submit, one approval decision each, firm attribution preserved across transfers | ❌ | 6 |
| G18 | Close Confirmations (Final checks) | Monthly human confirmations even with no anomaly, immutable responses | ❌ | 6 |
| G19 | Submission and approval | Same-person submit-and-close, and split Bookkeeper submit / Lead approve-reject | ❌ | 6 |
| G20 | Close Frontier | Earliest actionable close, one row per client | ❌ | 6 |
| G21 | Guided close workspace | Clear work, resolve findings, final checks, review | ❌ | 6 |
| G22 | Catch-up / Reclose Packages | Bounded contiguous months (max 12), owns the operational deadline, split, reassign, reasoned deadline change, atomic approval | ❌ | 6 |
| G23 | Cascading reopen + durable Reopen Requests | Client Lead decision, client-scoped cascade, locked-period rejection, six-month package suggestion | ❌ | 6 |
| G24 | Firm transfers | Accepted transfer mid-preparation without rewriting the predecessor firm's versions | ❌ | 6 |
| G25 | Queue projections API | One authorized firm-scoped snapshot, derived work groups, one close row per client, facets, pagination, lazy peek | ❌ | 7 |
| G26 | Domain commands + concurrency | `commandId`, expected domain state, convergent outcomes, server-confirmed deltas | ❌ | 7 |
| G27 | Independent bulk commands | Bounded set, partial success with per-target errors | ❌ | 7 |
| G28 | SSE realtime invalidation | One resumable firm-scoped stream, targeted invalidation, bounded polling fallback | ❌ | 7 |
| G29 | Projection-driven SPA | Queue, stream, close, roster, safety cues, complete loading/error states, responsive | ❌ | 7 |
| G30 | Removal of superseded paths | Delete legacy work items, workflow runs, engagement tasks, old close-review tables, both obsolete queue contracts, all firm mocks; recreate DBs from final migration history | ❌ | 8 |

## H. Notifications and communications

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| H1 | Notification API | List, unread count, mark viewed, mark all read, preferences | ✅ backend, rich | Required |
| H2 | **Notification UI** | Bell, dropdown/list, unread badge, preference screen | ❌ The header bell is **commented out** with a hardcoded `8` badge next to it | Required. Bank disconnects, sync failures and invites all notify into a void today |
| H3 | Email infrastructure | SES/Postmark providers, durable queue + worker, templates | ✅ | Required |
| H4 | Email deliverability | Verified sending domain, SPF/DKIM, inbox placement checked on Gmail + Outlook | ❌ | Required ([08](08-launch-ops.md)) |
| H5 | Notification channel registry | Per-channel routing and preferences | ✅ backend | Required |
| H6 | Provider-neutral notification intents | Outbox-emitted typed intents, policy selects recipients/channels | Partly built; V2 formalizes it | Required with V2 |

## I. AI

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| I1 | AI chat + threads | Persistent threads, messages | ✅ | Required (it is a differentiator already built) |
| I2 | AI approvals | Proposed action, execute or reject | ✅ | Required |
| I3 | AI command bar | Single consistent input surface | ✅ | Required |
| I4 | AI inline autocomplete | Ghost-text suggestions while typing | ❌ | 🔵 Post-launch |
| I5 | AI gateway with PII redaction | Reversible redaction, zero-trust RAG access | ❌ | 🔵 Post-launch, but revisit before firms upload client documents |

## J. Billing and payments

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| J1 | Plan catalog | Plans, prices, features | ✅ backend | Required |
| J2 | Billing accounts + workspace ownership | Who pays for which workspace, resolver, provisioning hooks | ✅ backend (phases 1-2) | Required |
| J3 | Subscriptions | Entity, states (trialing/active/past_due/canceled) | ❌ | Gate B |
| J4 | Provider checkout | Hosted checkout session, redirect back to settings | ❌ no payment SDK in the repo at all | Gate B |
| J5 | Payment webhooks | Signature verify, store-then-outbox, idempotent handler, dead-letter alert | ❌ | Gate B |
| J6 | Entitlement read model + banners | Soft enforcement, never a lockout | ❌ | Gate B |
| J7 | Billing settings page | Current plan, change plan, status | 🟠 mock plans and a fake subscription | Gate B (make the copy honest at Gate A) |
| J8 | Second payment provider | Stripe *and* Paystack | ❌ | 🔵 Post-launch, but `TODOS.md` insists on a fallback by default: decide deliberately |
| J9 | Internal invoices, credits, payout ledgers | Later billing slices | ❌ | 🔵 Post-launch |

## K. Platform, deployment, and operations

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| K1 | CI on every branch | Currently only `main`/`staging`/`develop` | ⚙️ | Required |
| K2 | Merge train to `main` | `main` is **702 commits behind** `develop`; last touched 2026-05-27 | ⚙️ banking work reached `develop`; `staging` is 54 behind, `main` 702 behind | Required ([01](01-ship-train-and-environments.md)) |
| K3 | Staging environment alive | API, web, ML, worker, scheduler | ⚙️ last deploy failed 2026-05-28; API down | Required |
| K4 | Production environment | `Dockerfile.prod` **does not exist**; no `deploy-production.yml`; `app.getaccountable.com` does not resolve | ❌ | Required |
| K5 | Managed Postgres + Redis with PITR | Chosen, provisioned, documented | ❌ | Required |
| K6 | Automated backups + one restore drill | An untested backup is a rumour | ❌ | **Required, non-negotiable before any real client data** |
| K7 | Migration safety policy | Additive-only once a real firm is on production | ❌ written | Required |
| K8 | Sentry DSNs live | Bootstrap exists in both apps | ⚙️ needs env | Required |
| K9 | Outbox dead-letter + health alerts | Fully built, dormant until `ADMIN_ALERT_EMAILS` is set | ⚙️ one env var | Required |
| K10 | Uptime monitoring | External pinger on `/health/ready` and web root | ❌ | Required |
| K11 | Health endpoints | `/health/live`, `/health/ready` (Postgres + Redis) | ✅ | Required |
| K12 | Bull Board queue console | `/admin/queues` behind basic auth | ✅ | Required |
| K13 | Runbooks | API down, outbox backlog, bank connection broken, email not sending, restore | ❌ | Required |
| K14 | Release versioning and tagging | Know what is deployed | ❌ | Required (`TODOS.md` critical) |
| K15 | Fly staging destroy protection | Prevent accidental teardown | ❌ | Required |
| K16 | Demo/sales workspace on staging | Seeded demo firm, never demo on production | ✅ seed system exists | Required |
| K17 | Global rate limiting | Beyond auth routes | ⚙️ auth only | Required |
| K18 | File upload limits | Reject oversized files, avoid loading large files into memory | ❌ | Required |
| K19 | Orphaned blob cleanup | Delete unreferenced uploads | ❌ | 🔵 Post-launch |
| K20 | Grafana/Prometheus monitoring | Beyond Sentry + Fly logs | ❌ | 🔵 Post-launch |

## L. Legal, trust, and go-to-market

| # | Feature | What it does | Status | Launch |
| --- | --- | --- | --- | --- |
| L1 | Privacy policy | Reachable from app and marketing | ❌ the signup form links `href="#"` for both | Required |
| L2 | Terms of service | Same | ❌ same dead link | Required |
| L3 | GDPR/data-handling position | Data residency, retention, deletion, sub-processors | ❌ | Required at least as a written statement |
| L4 | Support contact that reaches you | Email or in-app | ❌ | Required |
| L5 | Marketing site | Landing page + wall of love exist | ⚙️ built, not pointed at production signup | Required |
| L6 | Pricing page | Public pricing | ❌ (notes exist in `my-notes/pricing/`) | Required at Gate B, useful at Gate A |
| L7 | web-payroll (free NG payroll tool) | Top-of-funnel product | ⚙️ separate app in repo | 🔵 Separate track |

---

## Summary counts

| Status | Count | Notes |
| --- | --- | --- |
| ✅ Real end to end | ~40 | The accounting engine, banking sync, cat engine, journals, ledger, contacts, projects, AI, email, audit |
| 🟡 Backend only | 8 | Trial balance, work queue, journal import, notifications, historical import, sync health, superseded review, support access |
| 🟠 UI on mocks | 10 | Both financial statements + drill-throughs, dashboard overview, client dashboard, roster, task queue, firm shell, team list, billing, client invite |
| ⚙️ Built, not operational | 12 | Everything in K, plus Plaid/Mono production credentials and the ML production app |
| ❌ Missing | ~45 | Of which 30 are the V2 block |

The shape of the problem has not changed since 19 July: **very little of what is missing is accounting logic**.
It is assembly, deployment, and one large newly-scoped system.

## What I would flag to you

1. **F3 (firm adds a client) is still the highest-leverage single missing endpoint.** The provisioning service is done and tested. Without the endpoint there is no firm product at all.
2. **A4 (password reset) is a hard launch blocker nobody has written down.** The login page already advertises it and the link 404s. Any real user who forgets a password is stuck and you have no recovery path.
3. **H2 (notification UI) is a hidden blocker.** You have a complete notification backend feeding a bell icon that is commented out with a hardcoded `8`. Bank disconnect, sync failure and invite notifications currently reach nobody.
4. **B14 (conversion/opening balances) blocks the actual use case.** A firm onboarding an existing client needs to bring in opening balances. It is in `TODOS.md` as critical and in no workstream.
5. **D5, D11, D14, D17 are correctness issues, not polish.** Offset pagination that can skip rows, attachments with fabricated URLs, GL snapshots that do not always refresh, and incomplete FX handling all produce wrong numbers or lost documents. By your own triage rule these are fix-now.
6. **C11/C12/C13 are built backends with no UI.** Historical import, sync health, and provider-removed review. Cheap to wire, and each one prevents silently wrong books.

## The scope decision you need to make

Two coherent options. They are not compatible.

**Option 1 - the 19 July plan, V2 after launch.**
Gate A ships on the existing work materializer with a simple derived roster status.
The firm queue shows `categorize_transactions` and `review_suggestions` only.
No close product at launch: firms do their close by judgement, using the trial balance and statements.
Roughly the 5-week plan already written, plus the six flagged items above (call it 7-8 weeks).
Design partners get a working bookkeeping product with a thin queue, and you learn what close actually needs from real firms before building it.

**Option 2 - V2 in launch scope, as `full-launch-scope-and-finding-catalogue.md` declares.**
Add Stages 0-8: twelve tables, eight work types, twelve findings with evidence and resolution contracts, monthly close with versions and approvals, catch-up packages, transfers, cascading reopen, SSE, and a new SPA.
That is a multi-month programme on top of the existing plan, and it deletes and replaces code that currently works.
Workstream 04 is obsolete under this option and should be marked so.

My recommendation is **Option 1 with one deliberate carve-out**: ship Gate A on the current queue, and treat V2 as the immediate next programme rather than a launch blocker.
The reasoning is that V2's value is close management, and close management is exactly the thing you have no real-firm feedback on yet.
Twelve Finding definitions specified before a single firm has closed a month in the product is a large bet placed blind.
Design partners closing months manually will tell you which of the twelve actually matter, and Stage 5's evaluators already exist as close-readiness logic, so the work is not wasted by waiting.

If you disagree and V2 is genuinely non-negotiable for launch, then say so explicitly and I will rewrite [00-launch-plan.md](00-launch-plan.md) around it, retire workstream 04, and fold the Engagement-activation contract into workstream 03 so they are not built twice.
