# Accountable Books — Codebase Deep Dive

_Generated 2026-05-24 via multi-agent codebase exploration. Updated 2026-06-20. Based on actual code, not .md docs._

---

## What This Product Actually Is

**Accountable Books is a multi-tenant, AI-augmented accounting platform built for accounting firms and their clients.**

The firm-first architecture is the defining design choice: accounting firms are the primary customers, and they use the platform to manage books for multiple client companies. Clients get their own workspace but the firm is always in the relationship. The platform also supports direct business signups and individual users without a firm.

**Two core markets today**: Nigeria (Mono bank feeds, NGN) and the US/Europe (Plaid bank feeds, USD/EUR). The demo seed and banking providers make this clear.

**Where it's heading**: A premium, full-stack accounting SaaS — think QuickBooks or Xero but firm-native, with AI-driven categorization and a month-end close workflow engine. The payroll module (separate app) and the yet-unbuilt financial reporting layer (P&L, Balance Sheet, Cash Flow) are the obvious next frontiers.

---

## A Day in the Life

**Without this context, the data structures below won't stick.**

An accounting firm — say, Greenfield Advisors — signs up and gets an _accounting firm_ workspace. They onboard their client, Lagos Foods Ltd, which gets its own _customer_ workspace assigned to Greenfield.

A Greenfield staff member connects Lagos Foods' GTBank account via Mono (Nigeria). Each night, new bank transactions sync automatically — debits and credits arrive as raw records in the database.

The categorization pipeline kicks in: the rule engine checks user-defined rules first ("any payment to Shoprite → Cost of Sales"). Unmatched transactions go through ML enrichment, which normalizes the description, resolves the payee, and asks the Python ML engine for a top-5 account suggestion with confidence scores. High-confidence matches are auto-posted to the accounting ledger; low-confidence ones surface as tasks for the Greenfield accountant to review in the UI.

At month-end, the task system generates a checklist: categorize remaining transactions → review AI suggestions → prepare period for review → client approves → period closes. The firm sees this workflow across all their clients in one dashboard.

That loop — bank feed → categorization → human review → period close — is the core product.

---

## Repo Structure

```
accountable-books/
├── apps/
│   ├── api/            # Node.js/Express REST API (main backend)
│   ├── web/            # React 18 SPA (main accounting app)
│   ├── web-payroll/    # React 19 payroll module (separate app)
│   ├── marketing/      # React 19 marketing site
│   ├── demo/           # React 18 demo/sandbox app
│   └── ml-engine/      # Python FastAPI ML microservice
├── packages/
│   ├── contracts/      # Shared Zod schemas + Python Pydantic models
│   └── utils/          # Env helpers, timezone data, firm-slug utils
└── infra/
    ├── postgres/        # Custom PG17 Docker image (pgvector, pg_cron, pg_uuidv7)
    └── nginx/           # Reverse proxy config
```

**Stack**: Express v5 · PostgreSQL 17 · Redis · BullMQ · React 18 · Zustand · TanStack Query · Vite · TailwindCSS v4 · shadcn/ui · Python FastAPI (ML) · Fly.io · Turbo monorepo · pnpm

---

## How to Navigate the Code

### API: `domains/` vs `features/`

The API (`apps/api/src/`) has two organizational concepts:

- **`domains/`** — pure data and business logic, no HTTP awareness. Each domain owns its DB model, validation schemas, and service functions (e.g. `contacts/`, `companies/`, `banking/`, `categorization/`). These are reusable building blocks.
- **`features/`** — HTTP-facing code that orchestrates domains. A feature has a controller (routes + request parsing), a service (use-case logic calling into domains), and sometimes its own types (e.g. `signup/`, `auth/`, `communications/`). Adding a new API endpoint means working in `features/`.

**Rule of thumb**: domains are libraries, features are applications of those libraries.

### The "Domains Pending Migration" Pattern

`apps/api/src/domains-pending-migration/` contains older code that predates the domains/features split. It works and is in production — it is not dead code. The plan is to incrementally refactor each sub-directory into the clean `domains/` + `features/` structure. When touching this code, either migrate it properly or leave it as-is; don't add new code there. The frontend has the same pattern: `apps/web/src/domains-pending-migration/` is legacy, `apps/web/src/features/` is the target.

### Request Lifecycle

A typical request flows like this:

```
React component
  → TanStack Query hook (server state management)
  → service function in apps/web/src/shared/services/
  → Axios client (apps/web/src/lib/axios.ts) — attaches CSRF token + correlation ID
  → Express router (apps/api/src/features/<feature>/<feature>.routes.ts)
  → request context middleware — seeds ALS with requestId, userId, companyId
  → feature controller — parses + validates request
  → feature/domain service — use-case logic
  → domain model — Knex DB query
  → response
```

Local/UI state (auth session, modals, flags) lives in Zustand stores. Mutations that need to invalidate server state do so via TanStack Query's `invalidateQueries`.

---

## Major Areas & Sub-Areas

### 1. Auth

- **Signup** — email/password only (no OAuth); user + company created atomically in a DB transaction; email verification token generated on signup
- **Login** — bcrypt password check → build auth context (companies, roles, onboarding state) → issue JWT access token (15 min, HTTP-only cookie) + refresh token (7d, Redis-backed, rotated on use, max 5 per user)
- **Email Verification** — one-time bcrypt-hashed token in `tokens` table, 24h TTL; marks `email_verified_at` and updates onboarding state
- **Password Reset** — `password_reset` token flow (token hashed in DB, 24h TTL); not fully traced but structure is in place
- **Token Refresh** — refresh token validated against Redis set → issues new access + refresh pair
- **Logout** — removes refresh token from Redis, clears cookies
- **CSRF** — double-submit cookie pattern; token injected on login/me, attached to every mutating request via Axios interceptor
- **Get Me** (`/auth/me`) — returns user context + CSRF token; used by frontend to restore session

---

### 2. Auth Background Jobs

- **Email: Verify Email** — queued via BullMQ email queue after signup; Postmark/SES/Ethereal provider; 3 attempts, exponential backoff
- **Email: Password Reset** — same email queue; password reset link delivery
- **Email: User Invite** — invite token generated, email queued with join link

---

### 3. Users & Onboarding

- **User Model** — `firstname`, `lastname`, `email`, `password_hash`, `email_verified_at`, `onboarding_state` (JSONB), `last_active_company_id`, `user_type` (regular/demo/system)
- **Onboarding State** — JSONB on both `users` and `companies`; tracks step completion (email_verified, company_details_confirmed, etc.); guards app access via `RequireOnboardingComplete` route guard
- **Onboarding Flow** — `/onboarding/:step` — dynamic step-based UI; steps vary by company type
- **Switch Company** — users can belong to multiple companies; `currentCompanyId` in JWT payload; `domains-pending-migration/switchCompany`

---

### 4. Companies & Workspaces

- **Company Model** — `legal_name`, `display_name`, `short_code` (11-char unique URL key), `type` (corporation/individual/accounting_firm/etc.), fiscal year-end, `accounting_basis`, `reporting_framework`, `country_id`, `reporting_currency_id`, `default_timezone`, `workspace_class`, `assigned_firm_id`, `onboarding_state`, verification timestamps
- **workspace_class** — `customer` (normal), `demo` (sandbox), `platform` (single internal admin), `partner` (future)
- **Company Provisioning** (`company-provisioning.service.ts`) — 10-step atomic setup: resolve country/currency/timezone → generate short_code → insert company → firm assignment → accounting firm metadata → billing → roles → COA → settings → queue side effects
- **Firm Assignment Strategies** — `explicit` (provided firm_id), `auto` (jurisdiction → partner firm → platform fallback), `default` (platform), `self` (firm manages itself)
- **Company Settings** — `domains/settings/` — company-level preferences, currency display, feature flags

---

### 5. Accounting Firms & Multi-Tenancy

- **Firms are Companies** — `type = 'accounting_firm'` in `companies` table + row in `accounting_firms_meta` (slug, firm_type)
- **Client Assignments** — `client_firm_assignments`: firm → client; `firm_user_client_assignments`: firm staff → client access
- **Partner Firms** — `workspace_class = 'partner'`; jurisdiction-based resolution; not fully implemented
- **Firm User Access** — firm staff inherit access to all assigned clients via role mediation in `getAccessibleCompaniesForUser()`
- **Partner Firm Service** (`partner-firm.service.ts`) — resolves which partner firm should manage a given company based on geography

---

### 6. Roles & Permissions (RBAC)

- **Platform Roles** — `super_admin`, `support_admin`, `support_agent`
- **Company Roles** — `admin`, `client_owner`, `user`
- **Assignment** — `user_company_roles`: one active role per user per company (unique partial index)
- **Permissions** — `permissions` table + `roles_permissions` junction; permission keys checked for authorization
- **Firm-mediated Access** — firm role at parent firm grants access to client companies
- **Support Access** — time-limited grants (read-only up to 7d, write up to 24h) + break-glass sessions (1h max) with full audit trail

---

### 7. Chart of Accounts (COA)

- **68 Account Types** — organized into elements (Assets, Liabilities, Equity, Revenue, Expenses) with `report_code` (e.g., `BS.ASS.CUR.BNK`) for statement generation. Includes 11 non-current asset types, 12 current asset types, 4 non-current liability types, 15 current liability types, 4 equity types, 4 revenue types, and 20 expense types
- **COA Record** — `name`, `code`, `description`, `account_type_id`, `currency_id`, `is_active`, `locked`, `source` (user/system/template), `version_seq`
- **Locked Accounts** — Trade Receivables, Trade Payables, Owner Equity (cannot be modified/deleted)
- **COA Templates** — seeded per country and company type; provisioned during workspace setup
- **Must-Have Accounts** — enforced at provisioning time
- **COA Lifecycle Management** — archive and delete operations with impact analysis; preflight checks resolve impacts on draft journals, recurring templates, and categorization rules before applying; full audit trail via `coa-lifecycle.audit.ts`

---

### 8. Journal Entries

- **Journal Batch** — container with `title`, `reference` (JE-YYYYMM-NNNN), `date`, `status` (draft/posted/voided), `contact_id`, `currency_id`, `exchange_rate`, `auto_reversal_date`, `journal_source` (one_off/recurring)
- **Journal Entry** — line item: `coa_id`, `project_id`, `description`, `side` (debit/credit), `amount`
- **Double-Entry Enforcement** — min 2 entries, debits must equal credits (netted to zero); enforced at schema + business logic level
- **Reversals** — creates opposing entries; linked via `reversal_journal_id`; auto-reversals scheduled as background jobs
- **Recurring Templates** — `journal_source = 'recurring'`; scanned hourly by cron job
- **CSV Import** — preflight validation, partial or all-or-nothing batch mode
- **Draft → Posted workflow** — journals can be reviewed in draft before posting to ledger

---

### 9. Ledger

- **Ledger Transaction** — posted record with `transaction_source` (bank*transaction/manual_journal), `contact_id`, `source_transaction*\*`fields,`categorization_source`, `is_trainable`
- **Ledger Entry** — individual movement: `coa_id`, `project_id`, `fs_date`, `source_currency_id`, `source_amount`, `system_exchange_rate`, `is_monetary`, `is_bank_leg`, `human_reviewed`, `review_notes`
- **Bank Leg Concept** — every bank-sourced ledger transaction has exactly one `is_bank_leg = true` entry matching the bank account's COA, currency, and amount magnitude
- **Creation Process** — validation → advisory lock → partition check → bank leg validation → FX determination → constraint checks → DB insert → balance queue → audit log
- **Partitioning** — ledger entries are date-partitioned in PostgreSQL

---

### 10. Balances

- **Materialized, Not Live** — balances are NOT calculated on-demand; stored in daily snapshots
- **GL Balances** — `gl_daily_balance_snapshots` (per company + COA + day), `gl_period_balance` (per fiscal period), `gl_current_balance`
- **Bank Balances** — `bank_daily_balance_snapshots` (per company + bank_account + day in native currency), `bank_account_current_native_balances`
- **Balance Recalc Queue** — BullMQ `balance-recalc` queue; triggered by ledger entry creation/deletion; priority: manual(10) > soft_delete(7) > ledger_entry(5) > backfill(2); deduplicated via range hashing; max 3 attempts
- **Multi-Currency Cash** — `getTotalCashInBank()` sums across all bank accounts using current exchange rates to reporting currency

---

### 11. Banking — Bank Account Connection

- **Plaid** (US, CA, GB, IE, FR, ES, NL, DE) — cursor-based sync; Link token → exchange public token → access token stored; `SYNC_UPDATES_AVAILABLE` webhook triggers sync job
- **Mono** (Nigeria) — date-range overlap sync strategy
- **Bank Provider Registry** — providers enabled/disabled per country in DB; `ProviderRegistry` loads at runtime
- **Bank Account Credentials** — Plaid/Mono access tokens stored in `bank_account_credentials` with sync state (cursor position, last sync date)
- **Frontend** — Plaid Link SDK (`react-plaid-link`); `/banking/connect` and `/banking/plaid-oauth` routes; `/banking/upload` for CSV import

---

### 12. Banking — Transaction Sync

- **Webhook-Driven** — Plaid webhook → BullMQ `transaction-sync` queue (concurrency: 3)
- **Daily Scan** — `transactionSyncDailyScan` cron at 2 AM UTC catches missed webhooks
- **Sync Service** — distributed lock per credential; paginated fetch; handles added/modified/removed; stores to `bank_transactions` with `external_id` for deduplication
- **Plaid Amount Convention** — Plaid amounts are sign-flipped on import (Plaid uses opposite sign convention)
- **Bank Transaction Batch** — groups imported transactions with `fingerprint` to prevent re-imports; `source` enum: file_import/bank_feed/manual_entry

---

### 13. Transaction Categorization

- **Layer 1 — Rule Engine** (deterministic, user-defined): conditions + actions compiled to executable functions; priority-ordered evaluation; field locking for conflict detection; result: no_match/applied/partial/conflict/error
- **Layer 2 — ML Prediction** (heuristic, remote): enriched transaction sent to Python ML engine API; TF-IDF GlobalIntentClassifier → TenantAccountRanker → AccrualResolver; returns top-5 candidates with confidence scores
- **Layer 3 — Enrichment Pipeline**: normalizes description, resolves contact/payee, computes temporal features, detects recurring patterns, caches company COA context in Redis; produces versioned `EnrichedTransaction` object
- **Autopost** — `categorization-autopost` job automatically posts high-confidence categorizations
- **Categorization Candidate** — AI-suggested GL posting stored in `categorization_candidates`; linked to `ledger_transaction` after human approval
- **Trainable Flag** — `is_trainable = true` on ledger entries that passed human review; used to improve model
- **Rule Runner Job** — BullMQ `rule-runner` queue (concurrency: 5); runs categorization rules against new transactions

**Pipeline flow end-to-end**:

```
Plaid webhook (SYNC_UPDATES_AVAILABLE)
  → BullMQ transaction-sync queue
  → Sync service: fetch new transactions → store to bank_transactions
  → BullMQ bank-transactions-enrichment queue
  → Enrichment pipeline: normalize description, resolve payee/contact,
    detect recurring patterns, cache COA context in Redis
    → produces versioned EnrichedTransaction
  → BullMQ rule-runner queue
  → Rule engine: evaluate user-defined rules in priority order
    → match found: apply COA mapping, lock fields → done
    → no match: continue to ML
  → BullMQ ml-prediction queue
  → Python ML engine (FastAPI): TF-IDF → top-5 COA candidates + confidence scores
  → BullMQ categorization-autopost queue
    → confidence ≥ threshold: auto-post to ledger (is_trainable = true)
    → below threshold: surface as task for human review in the UI
  → human approves → ledger entry created → BullMQ balance-recalc queue triggered
  → balance snapshots updated (GL daily + period + current; bank native balances)
```

---

### 14. AI Features

- **LLM** — OpenAI GPT-4o-mini via Vercel AI SDK (`@ai-sdk/openai`); configurable model via `OPENAI_MODEL` env
- **AI Chat** — streaming chat via `ai.chat.service.ts`; chat history persisted in `ai_chat_history`; capabilities registry controls what AI can do; guardrails layer for safety
- **AI Tool Runs** — tracked in `ai_tool_runs` with latency/cost telemetry
- **AI Inline Actions** — `@ai-sdk/react` frontend integration; contextual actions within the accounting UI
- **ML Engine** — separate Python FastAPI service (`apps/ml-engine/`); connects to PG + Redis; exposes `POST /api/v1/predict`; TF-IDF based (not trained neural models yet)
- **Model Pricing** — `ai_model_pricing` table tracks API costs per model/token

---

### 15. ML Engine (Python Microservice)

- **Framework** — FastAPI (Python)
- **Prediction Components**:
  - `GlobalIntentClassifier` — TF-IDF vectorizer over account type labels; top-5 predictions
  - `TenantAccountRanker` — ranks company's specific COA accounts by relevance
  - `AccrualResolver` — determines if transaction should be accrued (accrual vs cash basis)
- **COA Snapshot** — fetches and caches company's chart of accounts from PG
- **Contracts** — shared via `packages/contracts/` (Zod → SchemaX → Pydantic Python models)
- **Tooling** — uv + hatch (migrated from Poetry); `uv.lock` replaces `poetry.lock`

---

### 16. Multi-Currency & FX

- **Exchange Rates** — stored per date + currency pair (unidirectional); resolved at ledger entry time with fallback to most recent rate
- **Monetary Entry Detection** — `determineMonetaryEntries()` identifies which ledger entries need FX tracking (monetary account types, foreign currency)
- **FX Position Tracking** — optional per company (`track_fx_positions` setting); tracks realized/unrealized gains; `fx_transaction_id` links to position
- **GL in Reporting Currency** — all GL balances converted to company's reporting currency; bank balances kept in native currency

---

### 17. Contacts

- **Contact Model** — `display_name`, `normalized_name`, `email`, `address`, `notes`, `status` (active/inactive), contact_type (customer/vendor/employee/other)
- **Usage** — optional reference on journal batches and ledger transactions; per-entry override possible
- **Search** — fuzzy/similarity search; filter by status, type, name/email
- **Contact Resolution** — review queue for resolving observed counterparties (payees/payers from bank transactions) into confirmed contacts; supports link-to-existing, create-new, and ignore actions
- **Aliases** — contacts can have multiple aliases (alternative names seen in bank transactions); aliases can be reassigned between contacts or deleted
- **Contact Type Assignments** — service layer for classifying contacts (customer/vendor/employee) based on transaction patterns

---

### 18. Projects

- **Simple tracking module** — `name`, `code`, `description`, `status`, `contact_id`, `start_date`, `end_date`
- **Purpose** — allocate transactions/entries to projects for reporting/billing
- **Linked** — `project_id` available on journal entries and ledger entries
- **Search** — hybrid fuzzy + similarity ranking

---

### 19. Reporting & Close Readiness

- **Fiscal Calendar** — period types: monthly/quarterly/yearly; statuses: open/closed/locked; configurable fiscal year-end; `fiscalAutoExtend` cron extends future periods daily
- **Period Status** — lock/close workflow; period approval task type in task system
- **Close Readiness** — signal evaluation framework that assesses whether a period is ready to close. `closeSignalEval` BullMQ queue evaluates signals when ledger entries are posted or periods change. Surfaces findings (uncategorized transactions, unreviewed suggestions, balance discrepancies) as structured period findings. Close review decisions (approve/reject) recorded with full audit trail
- **Financial Reports NOT YET BUILT** — P&L, Balance Sheet, Cash Flow Statement directories exist but are empty; this is the most significant missing production feature
- **Trial Balance** — visible in frontend routing (`/accounting/trial-balance`); reads from GL balance snapshots; supports manual refresh via API
- **Ledger View** — `/accounting/ledger` — shows posted entries

---

### 20. Tasks & Accounting Workflow

- **10 Task Types**: `categorize_transactions`, `review_ai_categorizations`, `review_draft_journals`, `prepare_period_for_review`, `request_review`, `approve_period`, `send_reports`, `close_period`, `reconnect_bank`, `respond_to_queries`
- **Auto-detect & Auto-resolve** — system evaluates conditions every 15 minutes (`taskEvaluationSweep` cron)
- **Scopes** — company-level, period-level, bank_account-level tasks
- **Blockers** — tasks can be blocked by system conditions, client actions, or upstream tasks (hard blockers vs warnings)
- **Priority Levels** — urgent/high/normal/low
- **This is the month-end close workflow engine** — drives the accounting firm's operational process with clients

---

### 21. Work Queue & Outbox Materialization

- **Outbox Pattern** — significant state changes write intents to `outbox_intents` table (types: `work_materialization_requested`, `activity_event_requested`, `notification_requested`, `notification_comms_requested`). The `outboxDispatch` BullMQ worker processes intents with deduplication (UNIQUE partial index on scope_key for pending intents), idempotency keys, and exponential backoff (max 10 attempts)
- **Work Materialization** — reconciles the categorization work queue for a given scope (currently bank_account level). When bank transactions arrive, categorization candidates are created/rejected/posted, or ledger entries change, materialization re-evaluates which work items are open vs closed. Uses PostgreSQL advisory locks per scope to prevent races
- **Work Queue API** — `GET /:companyId/work-queue` returns the current state of work items for a company (what needs human review)
- **Scope Model** — `bank_account:{clientCompanyId}:{bankAccountId}` is the implemented scope. Future scopes (company_period, company, firm) are typed but not yet active
- **Dispatch Flow** — sync write to outbox in request transaction → after-commit kick → outbox worker dispatches to appropriate handler (materialization, activity, notification, comms)

---

### 22. Notifications & Communications

- **Notifications Domain** (`domains/notifications/`) — in-app notification feed with event registry, delivery planning, and user preferences. Notification types include: work_assigned, work_overdue, bank_reconnect_required, close_approval_requested/rejected, sync_failure, and more
- **Notification Preferences** — per-user, per-company channel preferences (in-app, email, etc.); controls which notifications produce comms deliveries
- **Notification Delivery Plan** — determines which channels to use for each notification based on user preferences and notification type
- **Comms Feature** (`features/comms/`) — modern multi-channel communications dispatch, separate from the legacy email worker. `commsDispatch` BullMQ queue with job types: `delivery` (send a message), `scan_due_deliveries` (periodic scan for pending deliveries), `purge_old_deliveries` (retention cleanup). Has its own provider abstraction and template system
- **Legacy Email** (`features/communications/email/`) — still handles verification emails and user invites directly via the `email` BullMQ queue. The comms system handles everything else
- **Admin Alerts** — `admin-alerts.ts` in comms feature for internal operational notifications
- **Integration** — notifications write outbox intents → outbox worker dispatches → notification handler creates in-app record → if user prefs allow, writes `notification_comms_requested` intent → comms worker delivers via channel

---

### 23. Billing (Custom, No Stripe)

- **Billing Accounts** — per company; invoice currency, billing cycle anchor, timezone, status (active/suspended/closed)
- **Catalog** — plan families: `firm | business | individual`; plan kinds: `free | paid | custom_contact`; feature codes: seat limits, credit allowances, bank account limits, branding tier, support tier, currency mode
- **Ownership** — maps workspaces to billing accounts; commercial modes: `self_serve | firm_managed | firm_internal`; software payer: `billing_account | client_billing_account`
- **Profiles** — legal entity, billing email, tax ID/exemption, address, billing country
- **Subscription Statuses** — trialing/active/past_due/suspended/cancel_scheduled/canceled/payment_failed
- **Charge Types** — firm_subscription, managed_workspace_wholesale, client_sell_subscription, credit_topup, adjustment
- **No Payment Processor Yet** — billing data structures are complete but no Stripe/payment gateway integration observed

---

### 24. Audit & Observability

- **Audit Events** — comprehensive `audit_events` table; entity types: company/bank_transaction/journal/ai/task_evaluation/support_access; actor types: user/system/api_key/integration; event sources: web/api/worker/webhook/import
- **Activity Events** — domain-level audit trail via outbox pattern; all significant actions write `activity_event_requested` intents dispatched asynchronously
- **Impersonation Tracking** — actor fields support recording when support staff act as users
- **Sequence Tracking** — application-level sequence counters (e.g., JE-YYYYMM-NNNN journal references)
- **Sentry** — error tracking (`@sentry/*` packages); `sendDefaultPii: false`; `beforeSend` hook scrubs `event.request.data` and `event.extra`
- **PostHog** — product analytics (replacing Mixpanel); `captureProductEvent()` wrapper runs payloads through `scrubForTelemetry()`; gated by `POSTHOG_ENABLED` env var; browser SDK (`@posthog/react`) and server SDK (`posthog-node`); only UUIDs allowed — no PII, amounts, descriptions, or free-text
- **Session Correlation** — tab-scoped UUID in `sessionStorage`, attached as `X-Correlation-Id` to every Axios request; read by API `requestContextMiddleware` into AsyncLocalStorage; flows through pino logs and audit rows
- **OpenTelemetry** — `@opentelemetry/*` packages present; structured observability
- **Bull Board** — BullMQ admin UI at `/admin/queues` with HTTP Basic Auth

---

### 25. File Storage (Objects Domain)

- **Provider** — Cloudflare R2 (AWS S3-compatible)
- **Object Types** — `company_logo`, `txn_attachment`
- **Upload Flow** — create signed upload intent → upload directly to R2 → finalize intent (optional checksum); prevents direct server proxying of large files
- **File Record** — `key`, `bucket_name`, `url`, `mime_type`, `size_bytes`, `checksum`, `provider`, `region`
- **Attachment Metadata** — source (ledger/journal/bank), transactionId, entryId, folderContext

---

### 26. Background Jobs (BullMQ)

| Job                 | Queue                        | Concurrency | Purpose                                                           |
| ------------------- | ---------------------------- | ----------- | ----------------------------------------------------------------- |
| email               | email                        | 5           | Email delivery (verification, invites)                            |
| commsDispatch       | comms-dispatch               | 5           | Multi-channel communications delivery                             |
| transactionSync     | transaction-sync             | 3           | Bank feed sync (Plaid/Mono)                                       |
| balanceRecalc       | balance-recalc               | 5           | GL/bank balance recalc                                            |
| fiscalCalendar      | fiscal-calendar              | 3           | Fiscal period management                                          |
| enrichment          | bank-transactions-enrichment | 10          | Transaction enrichment for ML                                     |
| ruleRunner          | rule-runner                  | 5           | Categorization rule execution                                     |
| mlPrediction        | ml-prediction                | 5           | ML categorization calls                                           |
| autopost            | categorization-autopost      | 5           | Auto-post high-confidence categorizations                         |
| journalAutoReversal | journal-auto-reversal        | 1           | Auto-reverse scheduled journals                                   |
| recurringTemplates  | recurring-journal-templates  | 1           | Scan recurring journal templates                                  |
| taskEvaluation      | task-evaluation              | 3           | Month-end workflow task sweep                                     |
| closeSignalEval     | close-signal-eval            | 3           | Close readiness signal evaluation                                 |
| outboxDispatch      | outbox-dispatch              | 1           | Outbox intent dispatch (materialization, notifications, activity) |

**Cron schedules**: fiscal auto-extend (nightly), journal auto-reversal (daily), recurring journal scan (daily), transaction sync daily scan (daily), task evaluation sweep (periodic), comms due delivery scan (every 30s), comms delivery purge (daily)

---

### 27. Frontend (Web App)

- **Framework** — React 18 + React Router v7; Vite; TypeScript
- **State** — Zustand (auth, page, feature flags, AI runtime) + TanStack React Query (server state)
- **UI** — shadcn/ui + Radix UI primitives + TailwindCSS v4; Lucide + Tabler icons; Recharts; ag-grid; react-hook-form + Zod
- **API Client** — Axios with CSRF token injection, `X-Correlation-Id` header (tab-scoped session ID), and silent JWT refresh on 401
- **Routes**:
  - Auth: `/login`, `/signup`, `/logout`, `/forgot-password`
  - Onboarding: `/onboarding`, `/onboarding/:step`, `/verify-email`
  - Dashboard: `/dashboard`, `/dashboard/:tab`, `/welcome`, `/queue`, `/clients`, `/home`
  - Settings: `/settings`, `/settings/billing`, `/settings/company`, `/settings/financial`, `/settings/team`
  - Accounting: `/accounting`, `/accounting/trial-balance`, `/accounting/ledger`, `/accounting/notes`, `/accounting/cat-engine`, `/accounting/transactions`, `/accounting/journals`, `/accounting/journals/recurring`, `/accounting/journals/import`
  - Banking: `/banking/connect`, `/banking/plaid-oauth`, `/banking/upload`
  - Setup: `/ws/accounting/setup`
- **Feature Areas in `/src/features/`**: accounting, auth-login, auth-signup, cat-engine, connect-bank, manage-journals, manage-projects, manage-contacts, chart-of-accounts, settings, upload-bank-transactions
- **Domains Pending Migration** — older code being refactored: accounting-ws, cat-engine, onboarding, account-classification, bankConnection, bankFeedProviders, firms, dashboard, spreadsheets, switchCompany, user, permissions
- **AI Chat** — `@ai-sdk/react` + `ai` package; `AiRuntimeProvider` wraps app

---

### 28. Infrastructure & Deployment

- **Database** — PostgreSQL 17 custom Docker image with `pgvector` (AI embeddings), `pg_cron` (scheduled queries), `pg_uuidv7` (UUID v7 IDs)
- **ORM/Query Builder** — Knex.js; 104 migrations; environment-namespaced migration tables
- **Cache/Queue Broker** — Redis 8.0 (Alpine); ioredis client
- **Deployment** — Fly.io with 2 process groups: `server` (Express API + cron registrar), `worker` (BullMQ workers). The Dockerfile branches on `FLY_PROCESS_GROUP=worker`
- **Container** — Multi-stage Docker build with Turbo monorepo pruning; node:24-alpine
- **Nginx** — reverse proxy with CSP/HSTS headers; rate limiting (API: 10 req/s, Auth: 1 req/s); 100MB body limit
- **Shared Packages** — `@accountable-books/contracts` (Zod schemas → Python Pydantic via SchemaX), `@accountable-books/utils`
- **API Docs** — Swagger/OpenAPI at `/api-docs`

---

## What's Missing / Not Yet Built

1. **Financial Reports** — P&L, Balance Sheet, Cash Flow Statement are the most glaring gaps; the `reporting/reports/` directory is empty
2. **Payment Processing** — billing data model is complete but no payment gateway (Stripe etc.) is wired up
3. **True ML Models** — current ML is TF-IDF (heuristic); no trained neural categorization model yet
4. **OAuth / SSO** — email/password only; no Google/Microsoft login
5. **Partner Firm Flow** — `workspace_class = 'partner'` and partner firm resolution logic is partially scaffolded
6. **Payroll** — `web-payroll` app exists as a separate React 19 app but is a distinct module; extent of backend implementation unclear from this pass
7. **Spreadsheet Import** — `domains-pending-migration/spreadsheets/` exists; likely CSV/Excel journal import UI not fully migrated
8. **Account Classification** — `domains-pending-migration/account-classification/` in migration queue

## Overall Assessment

This is **production-quality infrastructure with a real accounting engine**. The double-entry system, partition management, balance materialization, advisory locking, and audit trail are not toy implementations — they reflect genuine accounting software engineering.

The product is on a clear trajectory: **a firm-managed accounting SaaS targeting Nigerian and US small businesses**, with the accounting firm as the primary distribution channel. The AI layer is early but the categorization pipeline architecture (rule engine → enrichment → ML → human review → trainable) is well-designed for iteration. The month-end close task workflow is the most underrated feature — it's what turns this from a ledger into a managed service.

The billing system being entirely custom (no Stripe) is notable — it suggests the team wants full control over the firm billing → client billing relationship, which makes sense for the managed workspace pricing model.

**Biggest bets to watch**: financial report generation (once built, this unlocks serious accountant workflow value) and whether the ML categorization crosses from TF-IDF heuristics to actual trained models.
