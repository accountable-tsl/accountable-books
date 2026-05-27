# Recurring Journals v1 (Backend + UX Process)

This document defines end-to-end recurring journal behavior (templates + generation) and the corresponding backend shape. It is intentionally aligned to repo evidence:

- Tables exist: `recurring_journal_templates`, `recurring_journal_template_entries`, plus `journal_batches.is_recurring` + `journal_batches.recurring_template_id`.
- Idempotency exists: unique `(recurring_template_id, date)` where `is_recurring=true` and `is_deleted=false`.
- Companies have `default_timezone`.

## Goals

- Let users define a **recurring journal template** (balanced entries, schedule).
- Generate **journal occurrences** on schedule, as `draft` or `posted` (auto-post).
- Make generation **idempotent** and safe under concurrency.
- Keep the UI familiar by reusing the **manual journal entry grid**.

## Non-Goals (v1)

- Complex RRULE scheduling / arbitrary intervals (`frequency='custom'` is not supported in v1).
- Editing past posted occurrences and reconciling them back into the template.
- Full template versioning (v1 applies edits to future occurrences only).

## Terminology

- **Template**: row in `recurring_journal_templates` + entries in `recurring_journal_template_entries`.
- **Occurrence (Generated Journal)**: row in `journal_batches` with `is_recurring=true` and `recurring_template_id=<template.id>`.

## Timezone Policy (Pinned Per Template)

Recurring templates are scheduled in a specific timezone that is **pinned on the template**.

- Add `template_timezone` on `recurring_journal_templates`.
- On create (or on activate), set `template_timezone = companies.default_timezone` for that template.
- Scheduling and placeholder rendering use `template_timezone`, not the current company timezone.

Rationale: if a company later changes `companies.default_timezone`, templates do not silently shift their run timing or ISO week/year placeholder boundaries.

## UX Recommendation

Use the **same journal UI** (same entry grid and validation), with a mode toggle:

- Mode A: **One-off Journal**
  - Shows `date`, `autoReversalDate`, etc.
  - Saves/Posts a single `journal_batches` record.
- Mode B: **Recurring Journal (Template)**
  - Hides one-off-only fields and instead shows: `frequency`, `startDateYMD`, optional `endDateYMD`, `auto_post`.
  - Saves/Activates a template; occurrences show up in the normal journals list with a “Recurring” badge and link back to the template.

This keeps one consistent mental model (journal entries) while making it clear the “Recurring” mode creates a template, not a single journal.

### Date-Only UX (Important)

For v1, treat recurring schedules as **date-only**, not time-of-day:

- Frontend sends `startDateYMD` as `YYYY-MM-DD` (YMD).
- Occurrence journals use that YMD directly as `journal_batches.date`.
- Backend stores `start_date` / `end_date` / `next_run_date` as timestamps (per existing schema), but they represent the **start of that day in the company's timezone**, encoded as UTC timestamps. This preserves good UX across timezones while keeping the backend UTC-normalized.
  - For templates: use `template_timezone` for this conversion.

## Template Lifecycle (End-to-End)

### 1) Create Template (Draft)

1. User toggles “Recurring”.
2. User fills:
   - Description (required; template-level)
   - Title template (optional; copied into occurrence title; supports placeholders)
   - Note (optional; copied into occurrence note; supports placeholders)
   - Contact (optional)
   - Currency (optional; default to company reporting currency)
   - Frequency: `daily|weekly|monthly|yearly` (reject `quarterly` + `custom` in v1)
   - Start date (YYYY-MM-DD only)
   - End date (optional)
   - Auto-post (boolean)
   - Entries (balanced debits/credits; COA required)
3. Save creates:
   - `recurring_journal_templates` with `status='draft'`
   - `recurring_journal_template_entries` rows
4. `next_run_date`:
   - For `draft` templates, we can set `next_run_date = NULL` until activation (recommended to avoid accidental generation).

### 2) Activate / Pause / Close

- Activate:
  - Validate template and compute `next_run_date` (see scheduling semantics below).
  - Set `status='active'`.
- Pause:
  - Set `status='paused'` (do not modify `next_run_date`).
- Close:
  - Set `status='closed'` and `next_run_date=NULL`.

### 3) Generate Occurrence (Worker)

A background worker periodically scans due templates:

- Select templates where:
  - `status='active'`
  - `is_deleted=false`
  - `next_run_date <= now()`
- For each template:
  - Load template entries.
  - Compute the occurrence journal `date` using company timezone.
  - Create an occurrence via existing journal command path:
    - Call `postJournalRecord()` with:
      - `isRecurring: true`
      - `recurringTemplateId: template.id`
      - `status: 'posted'` if `auto_post=true` and the fiscal period is open
      - otherwise `status: 'draft'`
  - Advance the template’s `next_run_date` by one interval.
  - If `end_date` is set and the next run would be after it, set `status='closed'` + `next_run_date=NULL`.

### 4) User Reviews Occurrences

- Draft occurrences behave like normal drafts:
  - Can be edited/voided/posted with existing endpoints.
  - They remain linked to the template via `recurring_template_id`.
- Posted occurrences behave like normal posted journals:
  - Can be reversed (existing behavior).

## Scheduling Semantics

### Timezone (UTC Storage, Local Day Boundaries)

- Use `template_timezone` to interpret what “today” means for scheduling.
- Store schedule timestamps in UTC, but computed from the company's local midnight:
  - Given `runDateYMD` (e.g. `2026-02-04`) and company tz `America/Los_Angeles`:
    - compute `localMidnight = 2026-02-04T00:00:00` in that timezone
    - store `next_run_date = localMidnight converted to UTC`
- Worker runs on UTC time, selecting due templates where `next_run_date <= now()`; this triggers generation near local midnight instead of arbitrary UTC midnight.

### Company Timezone Changes

If `companies.default_timezone` changes:

- Existing templates keep their `template_timezone` unchanged.
- Future occurrences continue to schedule according to the pinned template timezone.
- Optional follow-up (not v1): provide an admin tool/endpoint to migrate templates by recomputing `next_run_date` using a new timezone.

### Frequency Rules

Derived from `startDateYMD` (date-only):

- `daily`: every calendar day.
- `weekly`: every 7 days (same weekday as the start date).
- `monthly`: same day-of-month as the start date.
  - If the day doesn’t exist in a month, use month-end.
- `yearly`: same month/day as the start date.
  - If Feb 29 on non-leap years, use Feb 28.
- `quarterly`: not supported in v1.
- `custom`: not supported in v1 (`400 INVALID_INPUT`).

### Computing `next_run_date`

- On activate or update:
  - Compute the first occurrence date (`runDateYMD`) that is:
    - On/after `todayInCompanyTz`, AND
    - On/after `startDateYMD`, AND
    - Aligned to the template frequency (e.g., weekly stays on the same weekday as the start date).
  - Store `next_run_date` as UTC timestamp representing company-local midnight for that `runDateYMD`.
  - Validate `endDateYMD >= startDateYMD` when `endDateYMD` is provided.
  - End date is inclusive:
    - If `endDateYMD` exists and the next computed `runDateYMD` would be after `endDateYMD`, set `next_run_date=NULL` and `status='closed'`.
    - If `runDateYMD == endDateYMD`, allow generation for that day, then close the template on the subsequent advance.

### Start Date Edge Cases (v1 behavior)

- If `startDateYMD` is **today** in the company timezone and the template is activated:
  - The next scan will treat it as due and generate the first occurrence for today.
  - If the user does not want that, they should choose a future start date or keep the template paused/draft.
- If `startDateYMD` is in the **past**:
  - Do **not** backfill missed occurrences in v1.
  - Compute the next aligned run date in the future and set that as `next_run_date`.

## Generation Robustness

### Idempotency

- DB guard: unique `(recurring_template_id, date)` where `is_recurring=true AND is_deleted=false` on `journal_batches`.
- Worker must handle conflicts as “already generated” and advance `next_run_date` (do not crash-loop).

### Concurrency

- Prefer selecting due templates inside a transaction with `FOR UPDATE SKIP LOCKED` so multiple workers can run safely.
- Always update `next_run_date` in the same transaction as generation, per template.

### Auto-Post vs Closed Period

Proposed v1 rule:

- If `auto_post=true` but the fiscal period for the occurrence date is closed/locked:
  - Create the occurrence as `draft` (do not post).
  - Advance the template schedule (so the system doesn’t repeatedly try to post the same date forever).
  - Include a small metadata marker on the journal batch (e.g., `metadata.post_blocked_period=true`) so UI can explain why it’s draft.

### Failure Handling (Auto-Pause + Error Marker)

If generation fails for a template (e.g., COA inactive, currency missing, DB constraint, unexpected error):

- Set template `status='paused'`.
- Keep `next_run_date` unchanged (so fixing + resuming retries the same due date, without backfill).
- Record a lightweight failure marker on the template:
  - `last_failed_at` (UTC timestamp)
  - `last_error` (short string message)
  - `failure_count` (int; cumulative; increment on each failure and never reset in v1)
  - optional `last_run_at` for successful runs

This avoids retry spam and gives the UI something to display.

## Backend Shape (Proposed)

Base path (preferred for routing consistency): `/api/:companyId/journals/templates`

- `GET /` list templates (status filter, pagination)
- `GET /:templateId` get template + entries
- `POST /` create template + entries (status draft)
- `PUT /:templateId` update template + replace entries
- `PATCH /:templateId/status` set `draft|active|paused|closed`
- `POST /:templateId/run` run now (generate the next scheduled occurrence immediately)
- `POST /preview` preview placeholder rendering for the next aligned run date (no writes)

Worker:

- BullMQ queue + worker similar to journal auto-reversal.
- Repeat job (cron) scans due templates.

## Validation Rules (v1)

- Template entries must be:
  - At least 2 lines.
  - Debits == credits.
  - Amounts positive.
  - COA IDs exist and are active for the company.
- `frequency` must be one of: `daily|weekly|monthly|yearly` (reject `quarterly` + `custom`).
- Occurrence creation uses `postJournalRecord()` so journal invariants remain centralized.

## v1 Decisions (Locked)

- Schedule is **date-only** (no time-of-day in UI). Backend stores `next_run_date` as UTC timestamp representing company-local midnight for the next run date.
- `run now` generates the journal for the template's **current `next_run_date`**.
- Frequencies supported: `daily|weekly|monthly|yearly` (reject `quarterly` + `custom`).
- Amount UX: enforce **2 decimal places**.
- Start dates in the past do **not** backfill; the system finds the next aligned run date >= today.
- On generation failures, auto-`pause` the template and store a lightweight error marker (see below).
- Currency: if template `currencyId` is omitted, default to company reporting currency. If provided and different, generation relies on existing FX handling in `postJournalRecord()` (rate determined on run date when not explicitly provided).
- Projects: not supported in recurring templates v1 (template entries table does not have `project_id`).
- End date: `endDateYMD` is inclusive (the template may generate on that date, but will not schedule beyond it).
- Placeholder output format: deterministic and not user-locale dependent in v1 (English month names; ISO week and ISO week-year rules; uses company timezone for day boundaries).
- Templates use a pinned timezone (`template_timezone`) for scheduling and placeholder rendering.

## Remaining Decisions (Small, But Important)

None. This document locks all v1 decisions for implementation.

## Placeholder Variables (v1)

### Supported Tokens

Tokens are bracketed, may appear multiple times per field, and may include an integer offset:

- `[Day]`, `[Day+N]`, `[Day-N]`
- `[Week]`, `[Week+N]`, `[Week-N]`
- `[Month]`, `[Month+N]`, `[Month-N]`
- `[Year]`, `[Year+N]`, `[Year-N]`
- `[Week Year]`, `[Week Year+N]`, `[Week Year-N]`
- `[Month Year]`, `[Month Year+N]`, `[Month Year-N]`

Validation regex (frontend + backend should match):

- `^\\[(Day|Week|Month|Year|Week Year|Month Year)([+-]\\d+)?\\]$`

### Offset Semantics

Offsets are applied in the unit implied by the token:

- `Day`: days
- `Week` / `Week Year`: weeks
- `Month` / `Month Year`: months
- `Year`: years

Examples for an occurrence date of `2026-04-15`:

- `[Month]` -> `April`
- `[Month+1]` -> `May`
- `[Month Year]` -> `April 2026`
- `[Month Year+1]` -> `May 2026`
- `[Year]` -> `2026`
- `[Week Year]` -> `2026-W16` (ISO week)

### Rendering Format (v1)

- `Day`: `Apr 15, 2026`
- `Week`: `W16` (ISO week number)
- `Month`: `April`
- `Year`: `2026`
- `Week Year`: `2026-W16` (ISO week-year)
- `Month Year`: `April 2026`

Notes:

- Output is ASCII and deterministic (English month names).
- Week and week-year are ISO-based; company timezone is used to interpret day boundaries for week/year changes.

### Preview Placeholders

Provide a backend preview endpoint so the UI preview matches the backend's source-of-truth rendering (especially for ISO week-year boundaries and timezone semantics).

- `POST /api/:companyId/journals/templates/preview`

Input:

- `startDateYMD` (required)
- `frequency` (required)
- `title`, `note` (optional; fields that support placeholders)
- `entries` (optional; for previewing placeholders inside entry descriptions)
- optional `previewForYMD`
  - If omitted, backend computes the next aligned run date >= today (company timezone).

Output:

- `runDateYMD`
- `rendered`:
  - `title`, `note`
  - `entries`: array with rendered `description` per line (plus original amounts/sides/coaIds)

Backend still validates placeholders on create/update and renders placeholders at generation time; the preview endpoint is strictly for UX correctness.

## Auto-Reversal For Recurring Templates (v1)

Recurring templates do not need special reversal logic. Treat it as a property of the generated occurrence:

- Add optional template field: `auto_reversal_days` (integer >= 1).
- When generating an occurrence with `runDateYMD`:
  - set `journal_batches.auto_reversal_date = runDateYMD + auto_reversal_days` (as a YMD date)
  - existing auto-reversal queue/worker handles reversing once the journal is posted
- If an occurrence is generated as `draft` (auto-post disabled or period closed):
  - keep `auto_reversal_date` on the draft
  - when the user later posts the draft (existing endpoints), the per-journal auto-reversal scheduling will run as usual

## Implementation Notes (Hand This To A Junior Engineer)

This section is the concrete checklist (files, schemas, algorithms) to implement v1 as specified above.

### 1) DB Migrations

Add columns to `recurring_journal_templates`:

- `template_timezone` text not null
  - default to `companies.default_timezone` at create/activate time
  - add a CHECK constraint similar to `companies.default_timezone` (basic `Area/Location` shape)
- `auto_reversal_days` integer nullable, CHECK `auto_reversal_days >= 1`
- `last_run_at` timestamptz nullable
- `last_failed_at` timestamptz nullable
- `last_error` text nullable (keep it short; UI-friendly)
- `failure_count` integer not null default 0

Indexes:

- keep existing `rjt_frequency_nextrun_idx` and consider adding `(company_id, status, next_run_date)` if scans are slow.

### 2) New API Files (Backend)

Create these under `apps/api/src/domains/journals/`:

- `recurring-templates.types.ts` zod schemas + TypeScript types
- `recurring-templates.model.ts` DB access + business logic
- `recurring-templates.controller.ts` express handlers
- `recurring-templates.routes.ts` router mounted under `/api/:companyId/journals/templates`
- `recurring-templates.queue.ts` BullMQ queue + repeat scheduling helper
- `recurring-templates.worker.ts` worker implementation
- `recurring-templates.placeholders.ts` placeholder parsing + rendering helpers
- `recurring-templates.schedule.ts` next-run computations (date-only)

Wire routes in `apps/api/src/app.ts` and ensure the templates routes are registered before `/:journalId` style routes to avoid collisions.

Register the worker in `apps/api/src/jobs/registry.ts` and schedule the scan job in `apps/api/src/worker.ts` using `getJobSchedule()`.

Add a new schedule key in `apps/api/src/jobs/schedules.ts` (recommended hourly): e.g. `recurringJournalScan` with cron `0 * * * *`.

### 3) Endpoint Contracts

Base: `/api/:companyId/journals/templates`

`POST /` create template:

- Request (example):

```json
{
  "description": "Monthly rent accrual",
  "title": "Rent - [Month Year]",
  "note": "Office rent for [Month] ([Month-1] billed, paid [Month])",
  "frequency": "monthly",
  "startDateYMD": "2026-04-01",
  "endDateYMD": null,
  "autoPost": false,
  "autoReversalDays": 30,
  "currencyId": null,
  "contactId": null,
  "entries": [
    {
      "description": "Rent expense - [Month]",
      "side": "debit",
      "amount": 1200.0,
      "coaId": "<uuid>"
    },
    {
      "description": "Accrued liabilities - [Month]",
      "side": "credit",
      "amount": 1200.0,
      "coaId": "<uuid>"
    }
  ]
}
```

- Response: template header + entries + computed `nextRunDate` (optional) and `status='draft'`.

`PATCH /:templateId/status`:

- Request: `{ "status": "active" | "paused" | "closed" }`
- On activate: compute and persist `next_run_date`.

`POST /:templateId/run`:

- Generates exactly one occurrence for `next_run_date` (idempotent).
- Returns generated journal ids + updated template `next_run_date`.

`POST /preview`:

- Request: `{ "template": { ...same fields as POST /... }, "previewForYMD": "2026-04-01" }` (previewForYMD optional)
- Response:
  - `runDateYMD`
  - `rendered` (template fields + entries):
    - `title`, `note`
    - `entries`: array with rendered `description` per line (and the same amounts/sides/coaIds)

### 4) Placeholder Engine (Backend Source Of Truth)

Where placeholders apply:

- Template `title`, `note`
- Template entry `description`

Notes:

- The existing DB column `recurring_journal_template_entries.placeholder_description_var` is not required for this v1 approach (we render directly from the `description` string). It can remain unused in v1.

Token regex (must match frontend):

- `^\\[(Day|Week|Month|Year|Week Year|Month Year)([+-]\\d+)?\\]$`

Render inputs:

- `runDateYMD` (the occurrence date)
- `templateTimezone` (for ISO week-year calculations and formatting consistency)

Implementation approach:

- Parse any `[...]` segments in a string; reject the template if any bracketed token does not match the regex.
- Convert `runDateYMD` to a date object anchored to company-local midnight, then apply offsets by unit:
  - Day: add days
  - Week: add weeks
  - Month: add months (month-end clamping)
  - Year: add years
- Formats (v1):
  - Day: `Apr 15, 2026`
  - Week: `W16`
  - Month: `April`
  - Year: `2026`
  - Week Year: `2026-W16`
  - Month Year: `April 2026`

### 5) Date-Only Scheduling Computations

Key concept: store `next_run_date` as UTC timestamp representing company-local midnight for the computed `runDateYMD`.

Suggested helpers:

- `computeNextAlignedRunDateYMD({ startDateYMD, frequency, todayYMDInCompanyTz }) -> runDateYMD`
- `advanceRunDateYMD({ runDateYMD, frequency, startDateYMD }) -> nextRunDateYMD`
- `encodeCompanyLocalMidnightUtc({ ymd, tz }) -> ISO timestamptz`

Avoid backfill:

- If `startDateYMD` is in the past, compute the next aligned date >= today, do not generate historical occurrences.

### 6) Worker Generation Logic

Scan job:

- Query due templates with row locking:
  - `status='active' AND next_run_date <= now() AND is_deleted=false`
  - `FOR UPDATE SKIP LOCKED` (inside a transaction)
- For each template:
  - Determine `runDateYMD` from `next_run_date` in company timezone.
  - Render placeholders for `title/note/entry descriptions`.
  - Determine occurrence status:
    - if `auto_post=true`, attempt `posted`
    - if fiscal period closed/locked, fallback to `draft` and set `metadata.post_blocked_period=true`
  - Compute `auto_reversal_date` if `auto_reversal_days` set.
  - Call `postJournalRecord()` with:
    - `date = runDateYMD`
    - `status = posted|draft`
    - `isRecurring = true`
    - `recurringTemplateId = template.id`
    - `entries = rendered template entries`
  - Advance and persist `next_run_date`.
  - On conflict for `(recurring_template_id, date)`, treat as already-generated and still advance.

Failure handling:

- On any generation error (validation, db, unexpected):
  - `status='paused'`
  - `last_failed_at=now()`, `last_error=<message>`, `failure_count=failure_count+1`
  - keep `next_run_date` unchanged

Success handling:

- `last_run_at=now()`
- clear `last_error` (set to NULL)
- do not reset `failure_count` (cumulative)

### 7) Tests

Add integration tests under `apps/api/src/domains/journals/__tests__/`:

- placeholder validation accepts/rejects correctly (including offsets)
- preview endpoint renders same as worker renderer
- worker idempotency: running twice does not create duplicates
- auto-pause-on-failure updates template status + error marker
