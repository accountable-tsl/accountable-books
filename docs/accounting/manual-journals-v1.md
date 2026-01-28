# Manual Journals (v1) - Implementation Spec / Plan

Owner: Accounting workspace
Status: Draft
Last updated: 2026-01-28

## Goals

- Allow accountants to create, view, search, and manage **manual journals** (double-entry; debits = credits; net = 0).
- Support **draft** vs **posted** journals.
- Enforce **closed-period** rules (cannot post into closed/locked periods).
- Provide a **recurring journal template** system that can generate journals on a schedule.
- Provide **CSV import** for regular (non-recurring) manual journals.
- Keep UX simple, fast, and hard to make mistakes in.

## Non-goals (v1)

- Multi-currency manual journals (v1 is reporting-currency only).
- Invoicing module integration (journals may be used for revenue recognition, but no AR/AP automation beyond the existing ledger rules).
- Attachments/workpapers UX for journal lines (possible future enhancement; already seems to exist as a general concept).
- “True edit” of posted journals (immutability is preferred; see Edit semantics below).

## Current repo reality (important context)

- Backend already has:
  - `journal_batches` and `journal_entries` tables (migrations exist).
  - `postJournalRecord()` and `reverseJournalRecord()` in `apps/api/src/domains/journals/journals.model.ts`.
  - Ledger supports `transaction_source: 'manual_journal'`.
  - Fiscal periods exist (`fiscal_calendar`) and the ledger constraint `period_not_locked` blocks posting into closed/locked periods.
- Gaps/mismatches to address before building UI:
  - No `journals.routes.ts` wired into `apps/api/src/app.ts` (web has `JournalServices.ts` expecting these endpoints).
  - `journals.types.ts` includes fields (e.g. `auto_reversal_date`, `reversed_journal_id`, `generated_from_template_id`) that do not exist in `journal_batches` migration (schema drift).
  - `audit_events.action` enum (migration) does not include `void` or `reverse`, but code inserts those actions today (would fail at runtime).
  - `postJournalRecord()` currently rolls back entirely on closed-period posting (because ledger constraints throw) — but desired behavior is “save as draft + notify”.

## Key product decisions to lock in (Phase 0)

These decisions avoid rework and ambiguity:

1) Terminology / navigation
- Option A (recommended): Two pages:
  - Manual Journals (actual posted/draft/voided journal batches)
  - Recurring Journals (templates)
  - Tradeoff: slightly more navigation, but avoids mixing “templates” and “real entries”.
- Option B: One page with a filter toggle `Type: Actual | Template` and a status filter that includes “Recurring”.
  - Tradeoff: simpler navigation, but harder mental model; list columns/actions differ.

2) Header fields naming
- Proposed mapping (minimal DB churn):
  - `journal_batches.title` = “Narration” (required, user-facing primary text)
  - `journal_batches.description` = optional additional description
  - `journal_entries.description` = per-line description (optional, defaults to narration)

3) Posted journal mutability
- Option A (recommended, accounting-standard):
  - Draft journals: editable; can be deleted permanently.
  - Posted journals: immutable; user can only (a) void-with-reversal (same date) or (b) reverse on a chosen open date.
  - “Edit” button for posted journals becomes “Create correcting entry” or “Reverse & copy”.
  - Tradeoff: slightly more steps, but strongest audit integrity and simplest ledger invariants.
- Option B:
  - Allow editing posted journals by soft-deleting the old and creating a new posted journal (effectively a hidden reversal).
  - Tradeoff: user-friendly label, but dangerous if not implemented as an explicit reversal; also complicates audit meaning.

4) Voiding semantics
- Proposed:
  - Draft: `delete` (hard delete) or `void` (soft delete) depending on preference; spec says “only draft can be deleted permanently”.
  - Posted: cannot be hard-deleted; must be reversed or voided via reversing entry.
- Note: “Void without reversal” for a posted journal is not recommended because the ledger already contains the effect. If implemented, it must still create opposite ledger entries (that is a reversal).

5) Closed period behavior on post / autopost
- Requirement: if user attempts to post into a closed/locked period, **save as draft** and notify.
- Proposed consistent behavior:
  - Create the journal batch + entries (status = `draft`), record an audit event “post_blocked_period”, and return a warning to UI.
  - Do not create ledger transaction in this case.

## Data model (Phase 1A)

### Manual journals (existing)

- `journal_batches`
  - `id`, `code`, `sequence_number`, `date`, `title`, `description`, `note`
  - `status`: `draft | posted | voided`
  - `currency_id`, `exchange_rate` (but v1 will enforce reporting currency and exchange_rate=1)
  - `ledger_transaction_id` (nullable; set when posted successfully)
  - reversal metadata: `reversed_by_id`, `reversed_at`, `reversal_reason`
  - `is_recurring` + `recurring_template_id` (for journals generated from a template)
  - standard columns (including `is_deleted`, `deleted_at`, etc)
- `journal_entries`
  - `journal_batch_id`, `coa_id`, `side`, `amount`, `description`
  - optional linking fields `ledger_entry_id`, `ledger_entry_fs_date`

### Fields to add/align (schema drift cleanup)

User needs “reversal date (optional) at creation time” (auto-reversal).

Recommended additions to `journal_batches`:
- `auto_reversal_date` (timestamp, nullable)
- `auto_reversal_journal_id` (uuid, nullable, FK to `journal_batches.id`) OR reuse existing reversal linkage fields with clearer naming.

Alternatives:
- Store auto-reversal as a job record only (no DB column) and rely on audit logs to discover.
  - Tradeoff: harder to reason about state in UI and support.
- Store auto-reversal data in `journal_batches.metadata`.
  - Tradeoff: no DB constraints/indexing; harder to query reliably.

Also decide how “generated from template” is represented:
- Preferred: use existing `recurring_template_id` on `journal_batches` for “this journal was generated from template X”.
- If `journals.types.ts` has `generated_from_template_id`, either:
  - remove it (and use `recurring_template_id`), or
  - add it as an alias column (not recommended).

### Recurring templates (existing tables, missing some business fields)

- `recurring_journal_templates`
  - has: `description`, `note`, `status (draft|active|paused|closed)`, `frequency`, `start_date`, `end_date`, `next_run_date`, `placeholder_vars`
  - missing (per product needs):
    - `autopost` boolean (or `default_journal_status: draft|posted`)
    - potentially a `title/narration` separate from `description` (depending on how UI wants to display)
- `recurring_journal_template_entries`
  - has: `description`, `amount`, `transaction_side`, `coa_id`, `template_id`
  - missing: `project_id` support (optional; can be deferred)

## API surface (Phase 1B)

### Manual journals endpoints (recommended)

Base: `/api/:companyId/journals`

- `GET /`
  - server-side pagination, sorting, filtering
  - query params:
    - `q` (search: code/title/description/note)
    - `status` (draft|posted|voided)
    - `dateFrom`, `dateTo`
    - `sortBy` (date|code|created_at|status), `sortDir` (asc|desc)
    - `page`, `pageSize`
- `GET /:journalId`
  - returns batch header + entries + derived totals + reversal metadata + audit summary
- `POST /`
  - create journal (draft or posted)
  - if `status=posted` and period is closed/locked: downgrade to draft and return warning
  - if `autoReversalDate` set and successfully posted: enqueue reversal job
- `PUT /:journalId`
  - update a draft journal
  - if journal is posted: reject (or route to “reverse & copy” flow)
- `PATCH /:journalId/post`
  - post a draft journal
  - same closed-period downgrade behavior
- `PATCH /:journalId/void`
  - draft: hard-delete OR void (depending on decision); posted: not allowed (must reverse)
- `PATCH /:journalId/reverse`
  - creates a reversing posted journal on selected open date
  - rejects if requested date is in closed/locked period
- `POST /:journalId/copy`
  - creates a new **draft** journal initialized from an existing journal (draft or posted)
  - copy allowed even if original journal date is in a closed period (because new is draft)

Bulk actions (optional but matches “from list view” requirement):
- `PATCH /void` with `{ ids: string[] }`
- `POST /copy` with `{ ids: string[] }` (returns new ids)

Alternatives:
- Combine `POST` + `PATCH /:id/post` and never allow `status=posted` on create.
  - Tradeoff: simplifies behavior, but more calls/UX steps.

### Recurring templates endpoints (recommended)

Base: `/api/:companyId/recurring-journals`

- `GET /` (paginated/searchable; status filter: draft|active|paused|closed)
- `GET /:templateId`
- `POST /` create template (and entries)
- `PUT /:templateId` update template
- `PATCH /:templateId/status` (activate/pause/close)
- `POST /:templateId/run` “run now” (generates next occurrence immediately; useful for testing)

## Core validation & business rules (Phase 1C)

### Double-entry balancing (must net to zero)

Approach:
- UI: show totals and block “Post” unless balanced.
- API: enforce balance with `validateDebitCreditBalance()` (source of truth).

Tradeoff:
- Allow saving unbalanced drafts (some accounting apps do). This can reduce friction, but risks forgotten unbalanced drafts and makes posting-time errors more common.
- Recommendation (v1): allow saving drafts even if unbalanced ONLY if explicitly desired; otherwise enforce balance even for drafts for simplicity.

### Currency (reporting currency only in v1)

Approach:
- Backend: ignore/forbid any `currency_id/currency_code/exchange_rate` different from company.reporting_currency_id.
- Frontend: hide currency fields; show a read-only “Reporting currency: XXX”.

Tradeoff:
- Enforcing early prevents future multi-currency; but given v1 constraint, it avoids half-working FX behavior.

### Closed/locked fiscal periods

Approach:
- Reuse existing ledger constraint `period_not_locked` to decide whether a journal can be posted on a date.
- Implement explicit pre-check for journal date before attempting ledger creation, so we can “save as draft” instead of rolling back.

Rules:
- Posting into closed/locked period:
  - create journal as draft; return warning: “Period is closed; journal saved as draft.”
- Reversals:
  - reversal date must be in an open period.
  - if user selects “void on original date” and that period is closed: disallow; offer “reverse on next open date” and a helper message “Open the period to void on original date.”

### Status and action permissions

- Draft:
  - allowed: edit, delete, post
- Posted:
  - allowed: view, copy, reverse
  - disallowed: delete, edit (unless we implement reverse+replace workflow)
- Voided:
  - allowed: view, copy
  - disallowed: edit, post, delete (except maybe admin cleanup)

## Audit trail (Phase 1D)

Goal: explain “what happened, when, by who”, and support immutable accounting records.

Approach:
- Use `audit_events` for all journal lifecycle transitions:
  - create (draft)
  - update (draft)
  - post (draft -> posted)
  - post_blocked_period (attempted post but saved as draft)
  - void (draft void/delete)
  - reverse (posted reversal created)
  - copy
  - import

Important: align `audit_events.action` enum with reality.
- Option A (recommended): expand enum to include `void`, `reverse`, `copy`, `post_blocked_period`.
  - Tradeoff: migration needed, but data becomes self-describing.
- Option B: map to existing actions:
  - `void` -> `delete`
  - `reverse` -> `update` (with payload `{type: 'reverse'}`)
  - Tradeoff: less DB churn, but less readable and more error-prone in queries.

## Background jobs (Phase 2)

### Auto-reversal on a future date

Requirement: if a journal is posted with a reversal date, enqueue a job to create the opposite entries on that date.

Approach options:
- Option A (recommended): daily “reversal scan” job
  - Store `auto_reversal_date` on `journal_batches`.
  - Daily job finds due reversals where `auto_reversal_date <= now`, not yet reversed, and journal is posted.
  - Tradeoff: at most 24h delay unless job runs more frequently; but operationally robust and avoids huge delayed-job queues.
- Option B: BullMQ delayed job per journal
  - Enqueue a delayed job scheduled exactly at `auto_reversal_date`.
  - Tradeoff: precise timing; but large volumes can stress Redis delayed set and makes recovery/idempotency trickier.

Idempotency rules:
- Reversal job must be safe to run twice: check “already reversed” and/or “auto_reversal_journal_id exists” before acting.

### Recurring journal generation

Approach options:
- Option A (recommended): periodic scan job
  - Every X minutes (or daily), find templates with `status=active` and `next_run_date <= now`.
  - Generate journal batches, then advance `next_run_date`.
  - Tradeoff: simple, resilient, easy to backfill; slightly less exact timing.
- Option B: repeatable jobs per template
  - Schedule BullMQ repeatable job for each template.
  - Tradeoff: exact scheduling, but template changes require rescheduling and operational overhead.

Closed-period handling:
- If template is `autopost` but the run date is closed/locked:
  - create generated journal as `draft` and emit an audit event on the template and/or journal.

## UX / UI plan (apps/web) (Phase 3+)

### Journals list view

Approach:
- Use the existing table patterns (data-table components) with server-side pagination.
- Filters:
  - status (draft/posted/voided)
  - date range
  - search box
  - (optional) “Source: Manual | Generated from recurring” using `recurring_template_id` presence
- Row actions:
  - View
  - Copy
  - Void (draft only)
  - Reverse (posted only; opens modal to choose date + reason)

Performance notes:
- Use debounced search.
- Return minimal list payload (no entries array on list endpoint).
- Index `journal_batches(company_id, date desc)` and `journal_batches(company_id, status, date desc)` if needed.

### New journal entry form

Approach:
- Header:
  - Date (required)
  - Reversal date (optional) with helper copy: “Creates an automatic reversing entry on this date.”
  - Narration (required)
- Lines table:
  - columns: line description, account, debit, credit
  - enforce “only one of debit/credit per row”: typing in one clears the other
  - add/remove rows; keep at least 2 rows
  - account picker should be searchable and show account code/name (and maybe type)
- Footer summary (prominent but not distracting):
  - Total debits
  - Total credits
  - Difference (highlight if non-zero)
- Actions:
  - Save draft
  - Post
  - When period closed: “Post” results in saved draft + inline warning toast/badge

Alternatives:
- Allow saving drafts without balancing and only require balance on post.
  - Tradeoff: more forgiving data entry; but increases posting failures and support burden.

### Journal detail view

Approach:
- Header shows:
  - code, date, status, narration, note
  - created by/created at, posted by/posted at (if available), reversed info
- Lines table shows debits/credits.
- Actions:
  - Draft: Edit, Post, Delete/Void
  - Posted: Reverse, Copy
  - Voided: Copy
- Closed-period messaging:
  - If the journal date is closed/locked, disable reverse-on-original-date and explain why.

### Recurring templates UI

Approach:
- Similar to “New journal” but with:
  - start date, end date/never expires
  - frequency (daily/weekly/monthly/yearly)
  - autopost toggle (or “Create as: Draft/Posted”)
- List view similar to journals list, but with next run date and status (draft/active/paused/closed).

## CSV import (Phase 4)

Scope: only regular (non-recurring) journals.

Recommended v1 behavior:
- Import creates **draft** journals only (even if balanced), then user reviews and posts.
  - Tradeoff: safer and prevents accidental posting into closed periods, but adds a step.
- Alternative: allow “import & post” with the same closed-period downgrade behavior.

CSV format proposal (simple):
- One row per journal line; group by `journal_external_id` or `journal_code` in file.
- Columns:
  - journal_date (required)
  - journal_narration (required)
  - journal_note (optional)
  - line_description (optional)
  - account_code OR account_name (required; strongly prefer account_code)
  - debit (number) OR credit (number) (exactly one)
  - auto_reversal_date (optional; journal-level; repeated per line is OK)

Import pipeline:
- Parse -> validate -> group -> build payloads -> create drafts -> return results with per-row errors.

UX:
- Reuse existing spreadsheet importer patterns (used for bank txns/COA import).
- Show mapping UI if headers differ (optional v1; can require exact headers initially).

## Implementation phases (ordered)

### Phase 0: Product + technical alignment (1-2 days)
- Lock decisions: pages vs unified list, posted edit semantics, draft balancing, import behavior.
- Confirm required fields and naming (“narration” mapping).
- Identify any permissions model (role-based) required for posting/voiding/reversing.

### Phase 1: Backend MVP for manual journals (3-6 days)
- Add/align DB columns for auto reversal and fix schema drift in types.
- Fix `audit_events` action mismatch (migration + code alignment).
- Implement `journals.routes.ts` + controller/service:
  - list, get, create (draft/posted), update draft, post draft, void/delete draft, reverse posted, copy.
- Implement reporting-currency-only enforcement.
- Implement closed-period downgrade-to-draft behavior on post (and return warning payload).
- Add request validation (zod) consistent with existing patterns.

### Phase 2: Jobs for auto reversal + recurring generation scaffolding (2-4 days)
- Add queue + worker for auto reversal (Option A scan job recommended).
- Add queue + worker for recurring templates scan generation (even if UI isn’t ready yet).
- Ensure idempotency (no double reversals, no double runs).

### Phase 3: Web UI for manual journals (5-10 days)
- Journals list page (pagination/search/filter/sort + row actions).
- New journal form (lines table + totals + save draft/post).
- Journal details page (view + actions).
- Toasts/inline messaging for closed period downgrade.

### Phase 4: Recurring templates end-to-end (4-8 days)
- Backend CRUD for templates + entries.
- Web UI for template list + create/edit.
- Generation job produces journal batches with `recurring_template_id`.
- Autopost vs draft behavior + closed-period downgrade.

### Phase 5: CSV import (3-6 days)
- Backend endpoint to accept CSV upload + parse + create drafts.
- Web importer UI + downloadable template.
- Error reporting UX (per row / per journal).

### Phase 6: Hardening, tests, and performance (ongoing; 2-5 days)
- Backend:
  - unit tests for validation/balancing
  - tests for closed-period downgrade
  - idempotency tests for jobs
- Frontend:
  - form validation tests (where feasible)
- Perf:
  - ensure list queries use indexes
  - avoid N+1 in journal detail view

## Open questions (answer before Phase 1)

- Should drafts be allowed to be unbalanced?
- Should “void” exist as a distinct status from `is_deleted` for drafts, or do we hard delete drafts?
- Do we need “void posted journal without reversal” as a label (implemented as reversal)?
- For reversing posted journals: should we allow partial reversals (v2 likely)?
- For recurring templates: should “start date” also be the first run date, and how do we compute `next_run_date`?
- For recurring templates: should generated journals inherit `auto_reversal_date`?
- CSV import: require account_code only, or support name matching (risk of ambiguity)?

