# Manual Journals v1 - Implementation Spec

## Overview

Manual journals allow accountants to record transactions that don't flow through the bank statement (depreciation, revenue accruals, adjustments, etc.). Double-entry: debits = credits, net = 0.

Covers: journal list, create/void/reverse/copy, recurring templates, auto-reversal, CSV import, audit trail, projects, and batch-level attachments.

**Non-goals (v1):** Multi-currency journals, invoicing integration, partial reversals, per-entry (line-level) attachments, enforcing project/contact relationships.

---

## Locked-in Product Decisions

| Decision                  | Choice                                                                                            | Rationale                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Posted journal mutability | **Immutable.** No edit. Only Reverse & Copy.                                                      | Accounting standard. Strongest audit integrity.                 |
| Draft balancing           | **Always balanced.** Zero-sum enforced even for drafts.                                           | Less error-prone. User must balance before saving anything.     |
| Navigation                | **Sub-page of Accounting** at `/ws/accounting/journals`                                           | User preference                                                 |
| Frequencies (recurring)   | **All**: daily, weekly, monthly, quarterly, yearly                                                | Maximum flexibility. Document exact semantics in code + docs.   |
| CSV grouping              | **Prefer reference_id, else date + title.**                                                       | Stable grouping + supports idempotency when provided            |
| Currency (v1)             | **Reporting currency only.** Hide currency fields. Exchange rate = 1.0                            | Avoids half-working FX                                          |
| Status actions            | Draft: edit, delete, post. Posted: view, copy, reverse. Voided: view, copy.                       | Standard accounting                                             |
| Voiding semantics         | Draft: soft-delete. Posted: must reverse (creates reversing entry). "Void" for posted = reversal. | Cannot remove posted entries from the ledger without a reversal |
| Contact vs project fields | **Contact at batch level. Project at entry level.**                                               | Contact is the counterparty; projects are line-level costing.   |
| Attachments               | **Batch-level only.** Show in both Journal view and Ledger view (read-time inheritance).          | Clean UX; avoids line-level complexity in v1.                   |

---

## Bugs & Schema Drift to Fix First

These are existing issues that will cause runtime failures or incorrect behavior:

### 1. `audit_events.action` enum mismatch

**Problem:** `reverseJournalRecord()` in [journals.model.ts](apps/api/src/domains/journals/journals.model.ts) inserts `'void'` and `'reverse'` into `audit_events.action`, but the DB enum likely doesn't include these values. This would fail at runtime.
**Fix:** Migration to expand the `audit_events.action` enum to include: `create`, `update`, `post`, `post_blocked_period`, `void`, `reverse`, `copy`, `import`.

### 2. `postJournalRecord()` closed-period rollback

**Problem:** When posting into a closed/locked fiscal period, `createLedgerRecord()` throws (via `period_not_locked` constraint), causing the entire transaction to roll back. The journal is not saved at all.
**Desired behavior (user agency):** Reject with a specific error code so the frontend can ask the user whether to:
- Save as draft (same payload, `status: 'draft'`)
- Go back (change date, etc)
- Cancel
**Fix:** Add a fiscal period pre-check in `postJournalRecord()` (and `postDraftJournal()`) before calling `createLedgerRecord()`. If period is closed/locked, return `{ success: false, code: 'PERIOD_CLOSED', message: 'Fiscal period for this date is closed or locked.' }` **without saving anything**.
**Exception:** Background jobs (recurring generation, auto-reversal) have no user to ask — they save as draft automatically and log a `post_blocked_period` audit event.

### 3. Schema drift in `journals.types.ts`

**Problem:** The Zod schema includes `generated_from_template_id` and `auto_reversal_date` which don't exist as DB columns.
**Fix:**

- Remove `generated_from_template_id` from types — use existing `recurring_template_id` column instead.
- Add `auto_reversal_date` column to DB (Phase 1 migration).
- Replace reversal linkage with a single, consistent approach (see Phase 1): `reversal_journal_id` on the original journal.

---

## Phase 1: Database Migration

**Migration: `add_journal_manual_columns`**

Add to `journal_batches`:

- `auto_reversal_date` (timestamp with tz, nullable) — date to auto-create reversing entry
- `reversal_journal_id` (UUID, nullable, FK to `journal_batches`) — link to the reversing journal (manual reversal or auto-reversal)
- `original_journal_id` (UUID, nullable, FK to `journal_batches`) — tracks copies (source journal)
- `voided_at` (timestamp with tz, nullable) — when journal was voided

Add to `journal_entries`:

- `project_id` (UUID, nullable, FK to `projects`) — optional project dimension for the line item

Add to `recurring_journal_templates`:

- `auto_post` (boolean, default false) — whether generated journals auto-post or save as draft
- `title` (varchar 512, nullable) — title template for generated journals (supports placeholder vars)
- `currency_id` (UUID, nullable, FK to currencies) — defaults to reporting currency at generation time
- `contact_id` (UUID, nullable, FK to contacts)

Add indexes on `journal_batches`:

- `(company_id, date DESC)` — list queries sorted by date
- `(company_id, status, date DESC)` — filtered list queries
- Partial index: `(company_id, auto_reversal_date)` WHERE `auto_reversal_date IS NOT NULL AND status = 'posted' AND reversed_at IS NULL AND reversal_journal_id IS NULL` — auto-reversal job
- Partial unique index (idempotency): `(recurring_template_id, date)` WHERE `is_recurring = true AND is_deleted = false` — prevents duplicate generation per template per run date

**Expand `audit_events.action` enum** (or make it a varchar if not already) to include: `create`, `update`, `post`, `post_blocked_period`, `void`, `reverse`, `copy`, `import`.

**Recurring frequency enum:** update `recurrence_frequency` to include `quarterly` (and document exact behavior in code; see Phase 6).

**Clean up `journals.types.ts`:** Remove `generated_from_template_id`. Replace any `auto_reversal_journal_id`/`reversed_journal_id` fields with `reversal_journal_id` (original journal points to reversing journal).

**Files:**

- `apps/api/migrations/TIMESTAMP_add_journal_manual_columns.ts`
- `apps/api/src/domains/journals/journals.types.ts` (schema drift cleanup)

---

## Phase 2: Backend — Journal CRUD API

### 2a. Types & Validation (`journals.types.ts`)

New schemas:

- `ListJournalsQuery` — pagination (`page`, `pageSize`), filters (`status`, `dateFrom`, `dateTo`, `q` search), sort (`sortBy`, `sortDir`)
- `CreateJournalInput` — `date`, `title`, `description`, `note`, `autoReversalDate`, `entries[]`, `status` (draft/posted)
- `UpdateDraftInput` — same fields for updating a draft journal
- `ReverseJournalInput` — `reversalDate` (required, must be in open period), `reason` (optional)
- `CopyJournalInput` — `date` (optional override), other optional overrides
- `ImportJournalsInput` — array of journal payloads from CSV parse

Entry payload fields (manual journals):
- `entries[].projectId` optional. Must belong to the same company. No requirement that it matches the batch contact.
- Batch payload field:
  - `contactId` optional (already supported on `journal_batches`). Applies to the overall journal as the counterparty contact.

### 2b. Model Functions (`journals.model.ts`)

| Function                 | Description                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listJournals()`         | Paginated list with search/filter/sort. Returns header data only (no entries array). Includes computed total debit/credit per journal via subquery. Filters: company, status, date range, search text (title, description, code, note).                          |
| `getJournal()`           | Single journal with all entries (joined with COA names), audit trail from `audit_events`, related journals (reversal link, original link).                                                                                                                       |
| `postJournalRecord()`    | **Modify existing.** Add fiscal period pre-check (and ensure period exists). If period closed/locked and status is `'posted'`: return `{ success: false, code: 'PERIOD_CLOSED' }` **without saving**. If status is `'draft'`: allow save (draft never hits ledger). If open: existing logic (create batch + entries + ledger). |
| `updateDraftJournal()`   | Update a draft journal in-place. Reject if status !== `'draft'`. Re-validate balance. Create `update` audit event.                                                                                                                                               |
| `postDraftJournal()`     | Post an existing draft. Same closed-period pre-check (reject with `PERIOD_CLOSED` if closed/locked). Creates ledger transaction, updates journal status to `'posted'`, links `ledger_transaction_id`. Create `post` audit event.                                  |
| `voidDraftJournal()`     | Soft-delete a draft journal and its entries. Create `void` audit event.                                                                                                                                                                                          |
| `reversePostedJournal()` | Create a reversing journal+ledger on a given date. Validate date is in an open period. Mark original as reversed (`reversed_at`, `reversed_by_id`). Create `reverse` audit event. Reuse existing `reverseJournalRecord()` logic but fix the closed-period check. |
| `copyJournal()`          | Create new draft from any journal (draft, posted, or voided). Set `original_journal_id`. Create `copy` audit event.                                                                                                                                              |
| `importJournals()`       | Batch create journals from parsed CSV data. Validate each independently. Default behavior in v1: create **drafts** only (still must balance). If import ever attempts posting, it must use the same `PERIOD_CLOSED` behavior (reject without saving, UI decides draft vs cancel). Create `import` audit events. |

Attachment behavior (manual journals):
- Journal files are stored in `transaction_files` with `source='journal'`, `transaction_id=journal_batch_id`, `entry_id=null`.
- `getJournal()` should return the batch-level attached files (or the UI can fetch via objects `get-txn-files`).
- Ledger transactions created from manual journals should *display* the journal batch files as well (see Phase 5).

### 2c. Controller (`journals.controller.ts`)

Standard Express handlers. Extract `companyId` from `req.params`, `userId` from `res.locals.userId`.

### 2d. Routes (`journals.routes.ts`)

```
GET    /                    — listJournals (paginated)
GET    /:journalId          — getJournal
POST   /                    — createJournal (draft or posted)
PUT    /:journalId          — updateDraftJournal (draft only)
PATCH  /:journalId/post     — postDraftJournal (draft → posted)
PATCH  /:journalId/void     — voidDraftJournal (draft only)
PATCH  /:journalId/reverse  — reversePostedJournal (posted only)
POST   /:journalId/copy     — copyJournal (any status)
POST   /import              — importJournals (CSV)
```

**Period status check** (for frontend date hint):

```
GET    /period-status?date=YYYY-MM-DD  — returns { status: 'open' | 'closed' | 'locked', periodInfo? }
```

Lightweight endpoint for the form to check if a date's fiscal period is open before the user submits.

Behavior:
- If fiscal period records do not exist yet for the date, the API should silently create them (server responsibility) and return the computed status (typically `open`).
- If the period exists and is `closed`/`locked`, return that so the UI can warn early.

Register in `app.ts`:

```typescript
app.use('/api/:companyId/journals', journalRoutes);
```

**Performance notes:**

- List endpoint returns minimal payload (no entries array). Compute total debit/credit via SQL subquery.
- Use debounced search on frontend.
- Indexes from Phase 1 support the main query patterns.

**Files:**

- `apps/api/src/domains/journals/journals.types.ts` (extend)
- `apps/api/src/domains/journals/journals.model.ts` (extend + fix)
- `apps/api/src/domains/journals/journals.controller.ts` (new)
- `apps/api/src/domains/journals/journals.routes.ts` (new)
- `apps/api/src/app.ts` (register route)

---

## Phase 3: Frontend — Module & List View

### 3a. Module Structure

```
modules/accounting/journals/
├── api/index.ts              # HTTP calls (list, get, create, update, post, void, reverse, copy, import)
├── model/
│   ├── types.ts              # Zod schemas, TS types mirroring backend
│   ├── hooks.ts              # React Query hooks (no toasts)
│   └── constants.ts          # Status labels, colors, column config
├── ui/
│   └── journal-status-badge.tsx  # Shared badge component
└── index.ts                  # Barrel exports
```

### 3b. Feature Structure

```
features/manage-journals/
├── ui/
│   ├── journals-page.tsx             # Main page: tabs (Journals | Recurring) + list + toolbar
│   ├── journal-list-columns.tsx      # TanStack Table column defs
│   ├── journal-detail-sheet.tsx      # Side sheet for viewing
│   ├── journal-create-form.tsx       # Full-page form for new journal
│   ├── journal-entry-table.tsx       # Dynamic rows table (debit/credit lines)
│   ├── journal-summary-bar.tsx       # Totals: debits, credits, difference
│   ├── journal-actions-menu.tsx      # Context-aware dropdown: reverse, copy, void, post
│   ├── journal-reverse-dialog.tsx    # Dialog: choose reversal date + reason
│   ├── journal-void-confirm.tsx      # Simple confirmation for draft deletion
│   └── journal-import-dialog.tsx     # CSV upload + preview + submit
├── model/
│   └── use-journal-form.ts           # Form logic, row management, debit/credit exclusion
└── index.ts
```

### 3c. List View

- **DataTable** with `useDataTable()` and TanStack Table
- **Columns:** Code, Date, Title/Narration, Total Amount, Status (badge), Created By, Actions
- **Toolbar:** Debounced search input, status filter (All/Draft/Posted/Voided), date range picker, "New Journal" button, "Import" button
- **Sorting:** Default date DESC; sortable on code, date, status, created_at
- **Pagination:** Server-side, 25 per page
- **Row click:** Opens detail sheet (side panel)
- **Actions column:** Three-dot menu with context-aware actions:
  - Draft: Edit, Post, Delete, Copy
  - Posted: Reverse, Copy
  - Voided: Copy

### 3d. Route Registration

In `apps/web/src/shared/routes/definitions/accounting.ts`:

```typescript
journals: route('/ws/accounting/journals', { label: 'Journals' }),
journalNew: route('/ws/accounting/journals/new', { label: 'New Journal' }),
journalRecurring: route('/ws/accounting/journals/recurring', { label: 'Recurring Journals' }),
```

Add a "Journals" quick-action card/nav link in the accounting workspace page.

In `App.tsx`: Add `<Route>` entries nested under the `:companyId` path.

**Files:**

- `apps/web/src/modules/accounting/journals/` (new directory)
- `apps/web/src/features/manage-journals/` (new directory)
- `apps/web/src/shared/routes/definitions/accounting.ts` (extend)
- `apps/web/src/App.tsx` (add routes)
- `apps/web/src/domains-pending-migration/accounting-ws/acc-ws.tsx` (add Journals quick-action)

---

## Phase 4: Frontend — Create Journal Form

**Layout:** Dedicated page (not a dialog — journals can have many lines).

1. **Header fields:**
   - Date (required, date picker)
   - Reversal Date (optional, date picker, helper text: "Creates an automatic reversing entry on this date")
   - Narration / Title (required, text input, maps to `journal_batches.title`)
   - Description (optional, textarea)

2. **Entries table** (dynamic rows):
   - Row # | Description | Account (COA searchable dropdown) | Project (optional) | Debit | Credit | Remove (X)
   - **Mutual exclusion:** Typing in Debit clears Credit on same row, and vice versa. Use `watch` + `setValue` from React Hook Form.
   - **Dynamic rows:** `useFieldArray` from React Hook Form. Minimum 2 rows enforced.
   - Account picker: searchable, shows account code + name + type
   - Project picker: searchable, company-scoped. No validation that the project belongs to the batch contact (projects may represent customers while contact is a vendor, etc).
   - Optional UX helper: "Apply project to all lines" (non-blocking convenience).

3. **Summary bar** (below table, always visible):
   - Total Debits | Total Credits | Difference
   - Difference highlighted red if non-zero, green/neutral if zero

4. **Period status hint (on date change):**
   - When user selects a date, debounced check against fiscal calendar (lightweight API call or cached data)
   - If period is closed/locked: show inline hint near the date picker: _"This date is in a closed fiscal period. You can save as draft, but posting requires opening the period."_
   - Not blocking — informational only. User can still fill out the form.

5. **Actions:**
   - "Save as Draft" — disabled unless balanced (difference === 0), and minimum 2 valid lines
   - "Post Journal" — disabled unless balanced (difference === 0), and minimum 2 valid lines
   - **Closed period flow (on post attempt):** If backend returns `PERIOD_CLOSED`, show confirmation dialog: "The fiscal period for this date is closed. Would you like to save as draft instead?" → Yes: re-submit as draft → No: dismiss, form stays open

**Files:** Components listed in 3b feature structure.

---

## Phase 5: Frontend — Detail View, Reverse, Copy

### 5a. Detail Sheet

Side panel (Sheet component):

- Header: Code badge, Status badge, Date, Reversal date (if set)
- Narration and description
- Entries table (read-only): Account code+name, Description, Debit, Credit
- Totals row
- Metadata: Created by, Created at, Last updated, Posted at (if posted)
- Related journals: Link to reversal journal, link to original (if copy)
- Audit trail: Timeline of events from `audit_events`

Attachments (batch-level):
- Show journal batch files (max 5, 10MB each, 20MB total per batch - reuse existing transaction file limits).
- Upload/remove allowed only while journal is draft (recommended). Posted journal files can be view-only (v1).

Ledger view visibility (requirement):
- Any files attached to a journal batch must show up when viewing the ledger transaction created from that journal.
- Implementation approach (v1): when fetching ledger transaction details for `transaction_source='manual_journal'`, also fetch `transaction_files` for `source='journal'` and `transaction_id=source_transaction_id` (journal batch id), and merge them into the UI display.

### 5b. Reverse Posted Journal

Dialog with:

- Reversal date picker (required, must be in open period)
- Reason textarea (optional)
- If original date's period is open: default reversal date = original date
- If original date's period is closed: show message "Original period is closed. Select an open date, or open the fiscal period first."
- On confirm: calls `PATCH /:journalId/reverse`

### 5c. Copy Journal

- Creates a new draft pre-populated from source journal
- Navigates to the create form with data filled in
- User can modify before saving
- `original_journal_id` tracked silently

### 5d. Context-Aware Actions from List

Each row's three-dot menu shows only valid actions:
| Status | View | Edit | Post | Delete/Void | Reverse | Copy |
|--------|------|------|------|-------------|---------|------|
| Draft | yes | yes | yes | yes | - | yes |
| Posted | yes | - | - | - | yes | yes |
| Voided | yes | - | - | - | - | yes |

---

## Phase 6: Recurring Journals

### 6a. Backend — Recurring Journal CRUD

**Separate base path:** `/api/:companyId/recurring-journals`

```
GET    /                    — listRecurringTemplates (paginated)
GET    /:templateId         — getRecurringTemplate (with entries)
POST   /                    — createRecurringTemplate
PUT    /:templateId         — updateRecurringTemplate
PATCH  /:templateId/status  — activate / pause / close template
POST   /:templateId/run     — run now (generate next occurrence immediately; useful for testing)
```

**Model functions:**

- `listRecurringTemplates()` — paginated, filtered by status (draft/active/paused/closed)
- `getRecurringTemplate()` — template + entries
- `createRecurringTemplate()` — validate entries balance, store template + entries, compute `next_run_date`
- `updateRecurringTemplate()` — update template + replace entries, recompute `next_run_date`
- `updateTemplateStatus()` — activate/pause/close
- `runTemplateNow()` — generate next journal immediately (calls into worker logic)

**`next_run_date` computation:** Given `start_date`, `frequency`, and current date, find next occurrence >= today. If past `end_date`, set to null.

**Template status enum:** `draft` | `active` | `paused` | `closed` (matches existing DB enum `recurring_journal_status`)

**Frequency semantics (must be documented in code + docs):**
- `daily`: every calendar day
- `weekly`: every 7 days (same weekday as `start_date`)
- `monthly`: same day-of-month as `start_date` (if day doesn’t exist in a month, use month-end)
- `quarterly`: every 3 months (same rule as monthly for day-of-month handling)
- `yearly`: same month/day as `start_date` (if Feb 29, use Feb 28 on non-leap years)

**Files:**

- `apps/api/src/domains/journals/recurring-templates.model.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.types.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.controller.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.routes.ts` (new)
- `apps/api/src/app.ts` (register route)

### 6b. Backend — Recurring Journal Worker

**Daily cron job** (consistent with existing fiscal calendar nightly job pattern):

1. Runs daily (e.g., 3 AM company timezone or UTC)
2. Query: `SELECT * FROM recurring_journal_templates WHERE status = 'active' AND next_run_date <= NOW() AND is_deleted = false`
3. For each template:
   a. Fetch template entries
   b. Apply placeholder variables (`[Month]`, `[Year]`, `[Day]`, `[Week]`, `[Month Year]`, `[Week Year]` in title/descriptions)
   c. Determine status: if `auto_post = true` → `'posted'`, else → `'draft'`
   d. If `auto_post` and period is closed → save as `'draft'` + `post_blocked_period` audit event
   e. Call `postJournalRecord()` with `is_recurring = true`, `recurring_template_id = template.id`
   f. Advance `next_run_date` by frequency
   g. If `next_run_date > end_date` (and end_date is set) → set template status to `'closed'`
4. **Idempotency:** Check if a journal already exists for this template + run date before creating.
   - Use a DB uniqueness guard: unique `(recurring_template_id, date)` for generated journals.
   - Select templates due for processing with row locking (e.g., `FOR UPDATE SKIP LOCKED`) inside a transaction to avoid double-processing under concurrency.

**Files:**

- `apps/api/src/jobs/queues/recurring-journal.queue.ts` (new)
- `apps/api/src/jobs/workers/recurring-journal.worker.ts` (new)
- `apps/api/src/jobs/workers/index.ts` (register worker)
- `apps/api/src/worker.ts` (add cron schedule)

### 6c. Frontend — Recurring Journals

- Tab within the journals page (Journals | Recurring)
- List: Description/Title, Frequency, Next Run Date, Status, Actions
- Create/edit form:
  - Title (narration template, supports placeholders)
  - Start Date (required)
  - End Date (optional — "Never expires" checkbox)
  - Frequency dropdown (daily, weekly, monthly, quarterly, yearly)
  - Auto-post toggle
  - Same debit/credit entry table as regular journals
- Actions: Edit, Activate/Pause, Close, Run Now

---

## Phase 7: Auto-Reversal Job

**Daily cron** (same pass as recurring journal worker or separate function in same schedule):

1. Query (date semantics): `SELECT * FROM journal_batches WHERE auto_reversal_date <= NOW() AND status = 'posted' AND reversed_at IS NULL AND reversal_journal_id IS NULL AND is_deleted = false`
2. For each journal:
   a. Ensure fiscal period exists for the reversal date, then check if it is open
   b. If open: call `reversePostedJournal()` with the auto_reversal_date, update `reversal_journal_id`
   c. If closed: log warning, skip (create audit event for tracking)
3. **Idempotency:** `reversal_journal_id IS NULL` check + transaction-level locking prevents double processing.
   - Select due journals with `FOR UPDATE SKIP LOCKED` (and update `reversal_journal_id` in the same transaction) to make concurrency safe.

**Files:**

- Logic added to `apps/api/src/jobs/workers/recurring-journal.worker.ts` (or a dedicated `auto-reversal.worker.ts`)

---

## Phase 8: CSV Import

### 8a. Backend

**Endpoint:** `POST /api/:companyId/journals/import`

Accepts structured JSON (frontend parses CSV). Array of journal payloads.

**Validation per journal:**

- Required: date, title, at least 2 entries, entries must balance to zero
- All account codes must resolve to valid, active COAs for this company
- Period status is returned as metadata for user visibility:
  - Draft import is allowed regardless of period status (drafts never hit the ledger)
  - If the date is in a closed/locked period, include a warning so the user knows posting will be blocked until an open date is chosen
- Currency defaults to reporting currency

**Response:** `{ results: Array<{ index, success, journalId?, journalCode?, errors? }> }`

### 8b. Frontend

**CSV Import flow** (reuses existing spreadsheet importer patterns from bank transactions upload):

1. User clicks "Import" button on journals list toolbar
2. Dialog opens with:
   - CSV file upload (drag & drop or file picker)
   - Template download link (CSV with expected columns)
3. Frontend parses CSV
4. Preview table shows parsed journals with validation errors highlighted
5. Summary: X valid journals, Y errors
6. Submit sends valid journals to API as draft
7. Success/error feedback with per-journal results

**CSV columns:**

```
reference_id?, date, title, description, entry_description, account_code, debit, credit
```

Project support (optional v1):
- If we include projects in v1 import, add `project_code?` or `project_name?` (prefer code) as an optional column.
- Otherwise omit from template and keep project assignment manual in the UI.

**Grouping:** Prefer `reference_id` if provided. Otherwise, rows sharing the same `date` + `title` are grouped into one journal batch.

**Import creates drafts only.** User reviews and posts individually or in bulk.

**Files:**

- `apps/web/src/features/manage-journals/ui/journal-import-dialog.tsx` (new)
- Backend validation in `journals.model.ts`

---

## Implementation Order

| #   | Phase   | Scope                                    | Dependencies      |
| --- | ------- | ---------------------------------------- | ----------------- |
| 1   | Phase 1 | DB migration + schema drift fixes        | None              |
| 2   | Phase 2 | Backend CRUD API + fix postJournalRecord | Phase 1           |
| 3   | Phase 3 | Frontend module + list view              | Phase 2           |
| 4   | Phase 4 | Frontend create journal form             | Phase 3           |
| 5   | Phase 5 | Frontend detail, reverse, copy           | Phase 4           |
| 6   | Phase 6 | Recurring journals (full stack + worker) | Phase 2           |
| 7   | Phase 7 | Auto-reversal job                        | Phase 2           |
| 8   | Phase 8 | CSV import (full stack)                  | Phase 2 + Phase 3 |

Phases 6, 7, 8 are independent and can be parallelized after Phase 2.

---

## Key Constraints & Rules

1. **V1: Reporting currency only.** `currency_id` = `companies.reporting_currency_id`. Exchange rate = 1.0. Hide currency fields in UI.
2. **Zero-sum enforced always.** Both drafts and posted journals must balance. Tolerance: 0.0000000001.
3. **Closed period handling (posting only).** User-facing flows that attempt to post (create with `status='posted'`, or post draft): reject with `PERIOD_CLOSED`, frontend asks user to save as draft / go back / cancel. Background jobs (recurring, auto-reversal): save as draft automatically + audit event.
4. **Posted journals are immutable.** No edit. Only reverse (with new journal) or copy (creates draft).
5. **Audit trail on all mutations.** Via `audit_events` table. Events: create, update, post, post_blocked_period, void, reverse, copy, import.
6. **Soft deletes.** `is_deleted = true`. Even "deleting" a draft is a soft-delete.
7. **Balance recalculation** handled by `createLedgerRecord()` → `enqueueGLBalance()`. No extra calls needed from journal layer.
8. **Advisory locks** handled inside `createLedgerRecord()`. No extra locking in journal layer.
9. **Fiscal calendar auto-creation:** Journal pre-checks and `/period-status` should ensure periods exist (silent server-side creation). Do not rely on `createLedgerRecord()` for this.
10. **Date semantics (journals + ledger):** API accepts `YYYY-MM-DD` for journal dates and reversal dates. Persist as UTC-normalized date semantics (either DB `DATE` or timestamp at `00:00:00Z` consistently) so list ordering, uniqueness guards, and recurring/idempotency are stable.
11. **Projects:** Project selection is per entry (optional). Reporting on projects is line-based (i.e., project views show only lines tagged to that project; totals may not "balance within project", which is expected).
12. **Attachments shown in ledger:** Do not duplicate `transaction_files` rows (file keys are unique today). Instead, when viewing a ledger transaction sourced from a manual journal, fetch and show journal batch files alongside any ledger-native files (read-time inheritance).

---

## Files Summary

### New Files

- `apps/api/migrations/TIMESTAMP_add_journal_manual_columns.ts`
- `apps/api/src/domains/journals/journals.controller.ts`
- `apps/api/src/domains/journals/journals.routes.ts`
- `apps/api/src/domains/journals/recurring-templates.model.ts`
- `apps/api/src/domains/journals/recurring-templates.types.ts`
- `apps/api/src/domains/journals/recurring-templates.controller.ts`
- `apps/api/src/domains/journals/recurring-templates.routes.ts`
- `apps/api/src/jobs/queues/recurring-journal.queue.ts`
- `apps/api/src/jobs/workers/recurring-journal.worker.ts`
- `apps/web/src/modules/accounting/journals/` (full module)
- `apps/web/src/features/manage-journals/` (full feature)

### Modified Files

- `apps/api/src/domains/journals/journals.model.ts` — add list/get/update/post/void/reverse/copy/import + fix closed-period behavior
- `apps/api/src/domains/journals/journals.types.ts` — schema drift cleanup + new schemas
- `apps/api/src/app.ts` — register journal + recurring-journal routes
- `apps/api/src/jobs/workers/index.ts` — register recurring journal worker
- `apps/api/src/worker.ts` — add daily cron schedule
- `apps/web/src/shared/routes/definitions/accounting.ts` — add journal routes
- `apps/web/src/App.tsx` — add route elements
- `apps/web/src/domains-pending-migration/accounting-ws/acc-ws.tsx` — add Journals quick-action

---

## Verification Plan

### Backend

- Create draft journal → verify stored, no ledger entry, entries balance
- Create posted journal → verify stored + ledger transaction + GL balance enqueued
- Post to closed period → verify `PERIOD_CLOSED` error returned, nothing saved
- Post draft journal → verify status change + ledger created
- Update draft → verify in-place update + audit event
- Attempt update on posted → verify rejection
- Void draft → verify soft-deleted + audit event
- Reverse posted (open period) → verify reversing journal + ledger + audit
- Reverse posted (closed period date) → verify rejection with message
- Copy any journal → verify new draft + `original_journal_id` set
- Import CSV → verify per-journal results
- List journals → verify pagination, search, filter, sort
- Recurring: create template → run now → verify journal created
- Auto-reversal: create journal with reversal date → trigger worker → verify reversal created

### Frontend

- Create journal with multiple rows, verify debit/credit mutual exclusion
- Verify totals update in real-time; Post disabled when unbalanced
- Save as draft / post → verify in list with correct status
- Click posted journal → verify detail sheet, no edit button, reverse + copy available
- Reverse from detail → verify date picker, reason, and period check
- Copy from list → verify form pre-populated as new draft
- Filter by status, search by title/code/narration
- Sort by date, amount
- Import CSV → verify preview → submit → verify drafts in list

### End-to-End

1. Create journal → post → verify in ledger → reverse → verify reversing entry in ledger
2. Create recurring template → activate → run now → verify journal created with template fields
3. Import CSV → verify drafts → post selected → verify in ledger
4. Post to closed period → verify PERIOD_CLOSED rejection → re-submit as draft → verify draft saved → open period → post → verify ledger
