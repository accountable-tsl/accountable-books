# Manual Journals v1 - Implementation Spec

## Overview

Manual journals allow accountants to record transactions that don't flow through the bank statement (depreciation, revenue accruals, adjustments, etc.). Double-entry: debits = credits, net = 0.

Covers: journal list, create/void/reverse/copy, recurring templates, auto-reversal, CSV import, audit trail, projects, and batch-level attachments.

**Non-goals (v1):** Per-entry multi-currency (multiple currencies within a single journal), invoicing integration, partial reversals, per-entry (line-level) attachments, enforcing project/contact relationships.

---

## Current Implementation Status

**Last Updated:** 2026-02-05

| Component                                | Status       | Notes |
| ---------------------------------------- | ------------ | ----- |
| Database migrations                      | Complete     | Manual journals + recurring templates tables/fields are in place. |
| Backend: Manual journals API             | Complete     | List/get/create/update draft/post/void/reverse/copy implemented. |
| Backend: CSV import API                  | Complete     | Preflight + import endpoints exist under `/api/:companyId/journals/import/*`. |
| Backend: Recurring templates API + worker| Complete     | CRUD + preview + run-now + scheduled scan worker implemented under `/api/:companyId/journals/templates`. |
| Ops: Scheduler process (repeatable jobs) | In progress  | Fly process group is defined; needs deploy + scaling verification per environment. |
| Frontend: Journals UI                    | Not started  | List/detail/create/post/void/reverse/copy. |
| Frontend: Recurring templates UI         | Not started  | Template list + create/edit + status + run-now. |
| Frontend: CSV import UX                  | Not started  | Upload → preflight → review → import. |

**Next Steps (recommended order):**

1. Build the frontend journals module (list + detail + create/post flow) and wire to the API routes.
2. Build the frontend recurring templates UI and wire to `/api/:companyId/journals/templates` (including preview + run-now).
3. Build the frontend CSV import UX (upload → preflight → review → import). See `docs/accounting/manual-journals_import_v1.md`.
4. Verify scheduler process deployment/scaling in staging + production (repeatable jobs registration).

---

## Locked-in Product Decisions

| Decision                  | Choice                                                                                                                                   | Rationale                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Posted journal mutability | **Immutable.** No edit. Only Reverse & Copy.                                                                                             | Accounting standard. Strongest audit integrity.                 |
| Draft balancing           | **Always balanced.** Zero-sum enforced even for drafts.                                                                                  | Less error-prone. User must balance before saving anything.     |
| Navigation                | **Sub-page of Accounting** at `/ws/accounting/journals`                                                                                  | User preference                                                 |
| Frequencies (recurring)   | **v1**: daily, weekly, monthly, yearly (reject quarterly)                                                                                | Keep v1 simple. Document exact semantics in code + docs.        |
| CSV grouping              | **Prefer reference_id, else date + title.**                                                                                              | Stable grouping + supports idempotency when provided            |
| Currency (v1)             | **Single currency per journal batch (FX supported).** `currencyId` may differ from reporting; `exchangeRate` may be provided or derived. | Enables basic FX without per-line currency complexity           |
| Status actions            | Draft: edit, delete, post. Posted: view, copy, reverse. Voided: view, copy.                                                              | Standard accounting                                             |
| Voiding semantics         | Draft: soft-delete. Posted: must reverse (creates reversing entry). "Void" for posted = reversal.                                        | Cannot remove posted entries from the ledger without a reversal |
| Contact vs project fields | **Contact at batch level. Project at entry level.**                                                                                      | Contact is the counterparty; projects are line-level costing.   |
| Attachments               | **Batch-level only.** Show in both Journal view and Ledger view (read-time association).                                                 | Clean UX; avoids line-level complexity in v1.                   |

---

## Implementation Decisions & Deviations from Plan

### Key Changes Made During Implementation

1. **Cursor-based pagination added** (not in original plan)
   - Added `getJournalsByCursor()` for infinite scroll support
   - Safer than offset-based for large datasets (prevents skipping/duplicate rows)
   - Uses keyset pagination with composite (sortColumn, id) ordering
   - Cursor includes sort metadata to prevent misuse across different sort orders

2. **Audit trail removed from `getJournal()`**
   - Original plan: include full audit trail in every journal fetch
   - Decision: Remove audit trail to reduce payload size and query complexity
   - Rationale: Audit trail not needed for every view, can be fetched separately if needed

3. **Reference generation system**
   - Uses sequence-counter service (`allocateSequence()`) for atomic sequence numbers
   - Format: `JE-YYYYMM-NNNN` (e.g., `JE-202501-0042`)
   - Sequence buckets by month (`sequence_month = YYYY-MM-01`)
   - Handles both auto-generated (posted) and custom references (drafts)

4. **Journal-to-ledger entry linking**
   - Pre-allocate UUIDs for both journal entries and ledger entries
   - Allows bi-directional linking maintained in same transaction
   - Updates `journal_entries.ledger_entry_id` and `ledger_entry_fs_date` after ledger creation

5. **Contact field naming**
   - Uses `display_name` from contacts table (not `name`)
   - Provides formatted contact name for display

6. **Helper functions pattern**
   - `selectAliasedFields()` — consistent field aliasing across queries
   - `buildJournalsBaseQuery()` — shared query builder for list endpoints
   - Cursor helpers: `encodeCursor()`, `decodeCursor()`, `applyKeysetCursor()`, `getSortValueFromRow()`

7. **File handling**
   - Integrated with existing `persistTxnFiles()` service
   - Files can be returned from `getJournal()` via `?includeFiles=true`
   - Draft update supports file replace vs merge semantics (see `syncTxnFilesForTarget()`)

8. **Enhanced validation in `postJournalRecord()`**
   - Contact validation (must be active in company)
   - Project validation (must be active in company)
   - Zero-amount filtering with logging
   - Negative amount detection
   - Recurring template validation (both fields required together)

---

## ✅ Completed: Phase 1 Migration & Schema Fixes

### 1. Database Migration - DONE

All schema additions completed in migration `20250404142800_journal_batches.ts`:

- ✅ `auto_reversal_date`, `reversal_journal_id`, `original_journal_id`, `voided_at` on `journal_batches`
- ✅ `project_id` on `journal_entries` (migration `20250404152719_journal_entries.ts`)
- ✅ Indexes on `journal_batches` for date sorting and filtering
- ✅ Partial index for auto-reversal job
- ✅ Partial unique index for recurring template idempotency
- ✅ `audit_events` table with flexible `action` varchar field (migration `20250812095743_audit_events.ts`)

### 2. Fiscal Period Pre-check - DONE

✅ **Implemented in `postJournalRecord()`** - Added fiscal period validation before posting:

```typescript
if (batch.status === 'posted') {
  await ensureAndFetchFiscalCalendar({
    companyId: companyUUID,
    startYMD: toYMD(batch.date),
    endYMD: toYMD(batch.date),
    fetchTypes: ['monthly'],
    trx: txn,
  });
}
```

- Throws error if period is closed/locked (prevents posting)
- Auto-creates fiscal period if it doesn't exist
- Only applies to posted journals (drafts skip this check)

### 3. Schema Cleanup - DONE

✅ Types updated in `journals.types.ts`:

- Using `recurring_template_id` (not `generated_from_template_id`)
- `auto_reversal_date` properly typed
- Reversal linkage uses `reversal_journal_id` and `original_journal_id`

---

## Phase 1: Database Migration - ✅ COMPLETED

**Migrations completed:**

- ✅ `20250404142800_journal_batches.ts`
- ✅ `20250404152719_journal_entries.ts`
- ✅ `20250812095743_audit_events.ts`

**journal_batches additions:**

- ✅ `sequence_month`, `sequence_number` — for JE-YYYYMM-NNNN reference generation
- ✅ `reference` — user-defined or auto-generated journal reference
- ✅ `auto_reversal_date` — date to auto-create reversing entry
- ✅ `reversal_journal_id` — link to the reversing journal
- ✅ `original_journal_id` — tracks copies (source journal)
- ✅ `voided_at` — when journal was voided
- ✅ `reversed_at`, `reversed_by_id`, `reversal_reason` — reversal tracking

**journal_entries additions:**

- ✅ `project_id` (FK to `projects`) — optional project dimension per line

**Indexes on journal_batches:**

- ✅ `(company_id, date)` — list queries sorted by date
- ✅ `(company_id, status, date)` — filtered list queries
- ✅ Partial index for auto-reversal job: `(company_id, auto_reversal_date)` WHERE conditions
- ✅ Partial unique index for recurring idempotency: `(recurring_template_id, date)` WHERE `is_recurring = true`
- ✅ Unique index on `(company_id, reference)` for reference uniqueness
- ✅ Unique index on `(company_id, sequence_month, sequence_number)` for sequence uniqueness

**audit_events:**

- ✅ Uses varchar `action` field (not enum) — flexible for all event types
- ✅ Append-only table with trigger preventing updates/deletes

**Notes:**

- Recurring journal templates table already existed with required fields
- `recurring_journal_templates` has `auto_post`, `contact_id` fields

---

## Phase 2: Backend — Journal CRUD API

### 2a. ✅ Types & Validation (`journals.types.ts`) - DONE

Implemented schemas:

- ✅ `listJournalsPageQuery` — page-based pagination with filters
- ✅ `listJournalsCursorQuery` — cursor-based pagination for infinite scroll
- ✅ `listJournalsFilters` — shared filters (status, dateFrom, dateTo, searchQuery, sortBy, sortDir)
- ✅ `journalsCursor` — cursor validation schema (v1, sortBy, sortDir, value, id)
- ✅ `journalBatchDataCamel` — create/update input with entries, files, etc.
- ✅ `JournalListRow` — list response type with computed totals, currency/contact details
- ✅ `JournalDetailEntry` — entry with COA and project names
- ✅ `GetJournalResponse` — single journal response type
- ✅ `RelatedJournalSummary` — related journal summary type
- ⏳ `UpdateDraftInput`, `ReverseJournalInput`, `CopyJournalInput` — pending

**Implementation notes:**

- Contact field uses `display_name` from contacts table
- Currency includes code, name, symbol
- Files handled via `TxnFileInput` from contracts

### 2b. Model Functions (`journals.model.ts`)

| Function                     | Status  | Notes                                                                                                                                                                                                                                          |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getJournalsByPage()`        | ✅ DONE | Page-based pagination. Returns headers only with computed totals. Uses `buildJournalsBaseQuery()` helper. Includes currency/contact details.                                                                                                   |
| `getJournalsByCursor()`      | ✅ DONE | **Not in original plan.** Cursor-based pagination for infinite scroll. Uses keyset pagination with composite (sortColumn, id). Includes cursor validation to prevent reuse across different sorts.                                             |
| `getJournal()`               | ✅ DONE | **Modified from plan:** Removed audit trail (not needed for every fetch). Returns journal with entries (COA+project names), related journals (reversal/original). Uses `selectAliasedFields()` helper for consistency.                         |
| `postJournalRecord()`        | ✅ DONE | **Enhanced from plan:** Fiscal period pre-check, sequence generation via `allocateSequence()`, pre-allocated UUIDs for journal-ledger links, file persistence via `persistTxnFiles()`, contact/project validation, robust logging with phases. |
| `generateJournalReference()` | ✅ DONE | **Not in original plan.** Generates JE-YYYYMM-NNNN references using sequence-counter service. Handles both posted journals (auto-generate) and drafts with custom references.                                                                  |
| `updateDraftJournal()`       | ✅ DONE | Update draft in-place. Re-validates, replaces entries/files, writes audit event.                                                                                                                                                               |
| `postDraftJournal()`         | ✅ DONE | Post existing draft. Fiscal period pre-check, create ledger, update status, writes audit event, schedules auto-reversal if applicable.                                                                                                         |
| `voidDraftJournal()`         | ✅ DONE | Soft-delete draft + entries, audit event.                                                                                                                                                                                                      |
| `postDraftJournalsBatch()`   | ✅ DONE | Batch post existing drafts. Supports `partial` (default) and `all_or_nothing` modes.                                                                                                                                                           |
| `voidDraftJournalsBatch()`   | ✅ DONE | Batch void existing drafts. Supports `partial` (default) and `all_or_nothing` modes.                                                                                                                                                           |
| `reverseJournalRecord()`     | ✅ DONE | Reverse posted journal (creates reversing entry). Drafts should use `voidDraftJournal()` instead.                                                                                                                                              |
| `copyJournal()`              | ✅ DONE | Copy any journal to a new draft (defaults `date=today`, `reference=null`). If `includeFiles=true`, creates new attachments referencing the same underlying file rows.                                                                          |
| `importJournals()`           | ✅ DONE | CSV import (preflight + import) for regular (non-recurring) journals.                                                                                                                                                                         |

**Helper functions added:**

- ✅ `selectAliasedFields()` — generates aliased select fields for consistency
- ✅ `getSortValueFromRow()` — extracts sort value for cursor encoding
- ✅ `encodeCursor()` / `decodeCursor()` — cursor serialization
- ✅ `applyKeysetCursor()` — applies cursor filter to query
- ✅ `buildJournalsBaseQuery()` — shared query builder with filters/search/sort
- ✅ `firstOfMonth()`, `yyyymm()`, `pad4()` — reference generation utilities

**Attachment behavior:**

- ✅ Files stored via `persistTxnFiles()` with `source='journal'`, `transaction_id=journal_batch_id`
- Files can be returned inline from `getJournal()` using `?includeFiles=true`

### 2c. Controller (`journals.controller.ts`)

Standard Express handlers. Extract `companyId` from `req.params`, `userId` from `req.user.id` (via `AuthRequest`).

### 2d. Routes (`journals.routes.ts`)

```
POST   /query               — listJournals (page-based)
POST   /query/cursor        — listJournals (cursor-based)
GET    /period-status       — getPeriodStatus (for date hints)
POST   /import/preflight    — importJournalsPreflight (CSV)
POST   /import              — importJournals (CSV)
GET    /:journalId          — getJournal
POST   /                    — createJournal (draft or posted)
PUT    /:journalId          — updateDraftJournal (draft only)
PATCH  /batch/post          — postDraftJournalsBatch (draft → posted)
PATCH  /batch/void          — voidDraftJournalsBatch (draft only)
PATCH  /:journalId/post     — postDraftJournal (draft → posted)
PATCH  /:journalId/void     — voidDraftJournal (draft only)
PATCH  /:journalId/reverse  — reverseJournalRecord (posted only)
POST   /:journalId/copy     — copyJournal (any status)
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

**Status:** Not started. There is a legacy `apps/web/src/shared/services/JournalServices.ts` file, but its endpoints do not match the current API (it calls `GET /journals` and `PATCH /journals/void`, which do not exist). Treat it as stale until updated to use `/query`, `/batch/*`, and `/:journalId/*` routes.

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
- Implementation approach (v1): when fetching ledger transaction details for `transaction_source='manual_journal'`, also fetch `file_attachments` (joined to `files`) for `source='journal'` and `transaction_id=source_transaction_id` (journal batch id), and merge them into the UI display.

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

**Base path:** `/api/:companyId/journals/templates`

```
GET    /                    — listRecurringTemplates (paginated)
GET    /:templateId         — getRecurringTemplate (with entries)
POST   /                    — createRecurringTemplate
POST   /preview             — previewRecurringTemplate (validates + renders placeholders)
PUT    /:templateId         — updateRecurringTemplate
PATCH  /:templateId/status  — activate / pause / close template
POST   /:templateId/run     — run now (generate next occurrence immediately; useful for testing)
```

**Model functions:**

- `listRecurringTemplates()` — paginated, filtered by status (draft/active/paused/closed)
- `getRecurringTemplate()` — template + entries
- `createRecurringTemplate()` — validate entries balance, store template + entries, compute `next_run_date`
- `updateRecurringTemplate()` — update template + replace entries, recompute `next_run_date`
- `updateRecurringTemplateStatus()` — activate/pause/close
- `previewRecurringTemplate()` — validate COAs + balance, render placeholders for a given run date (or next eligible date)
- `runRecurringTemplateNow()` — generate next journal immediately

**`next_run_date` computation:** Given `start_date`, `frequency`, and current date, find next occurrence >= today. If past `end_date`, set to null.

**Template status enum:** `draft` | `active` | `paused` | `closed` (matches existing DB enum `recurring_journal_status`)

**Frequency semantics (must be documented in code + docs):**

- `daily`: every calendar day
- `weekly`: every 7 days (same weekday as `start_date`)
- `monthly`: same day-of-month as `start_date` (if day doesn’t exist in a month, use month-end)
- `quarterly`: **not supported in v1** (reject with 400 INVALID_INPUT)
- `yearly`: same month/day as `start_date` (if Feb 29, use Feb 28 on non-leap years)

**Files:**

- `apps/api/src/domains/journals/recurring-templates.model.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.types.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.controller.ts` (new)
- `apps/api/src/domains/journals/recurring-templates.routes.ts` (new)
- `apps/api/src/app.ts` (register route)

### 6b. Backend — Recurring Journal Worker

**Repeatable scan job** (registered by the scheduler process; processed by the worker process):

1. Scheduler registers a repeatable queue job (default hourly; `RECURRING_JOURNAL_SCAN_CRON`, tz `UTC`).
2. Worker processes due templates safely under concurrency using row locking (`FOR UPDATE SKIP LOCKED`) inside a transaction.
3. For each due template:
   a. Fetch template entries
   b. Render placeholders in title/note/entry descriptions
   c. Determine whether to auto-post:
      - if `auto_post = true` and fiscal period is open → post
      - else save as draft and set `metadata.post_blocked_period = true` when blocked by period
   e. Call `postJournalRecord()` with `is_recurring = true`, `recurring_template_id = template.id`
   f. Advance `next_run_date` by frequency
   g. If `next_run_date > end_date` (and end_date is set) → set template status to `'closed'`
4. **Idempotency:** enforced by a partial unique DB index on `(recurring_template_id, date)` for recurring journals (`is_recurring = true`).

**Files:**

- `apps/api/src/domains/journals/recurring-templates.queue.ts`
- `apps/api/src/domains/journals/recurring-templates.worker.ts`
- `apps/api/src/jobs/schedules.ts` + `apps/api/src/jobs/schedule-registry.ts` (repeatable job registration)
- `apps/api/src/scheduler.ts` (scheduler process entrypoint)
- `apps/api/src/worker.ts` + `apps/api/src/jobs/registry.ts` (worker registration)

### 6c. Frontend — Recurring Journals

- Tab within the journals page (Journals | Recurring)
- List: Description/Title, Frequency, Next Run Date, Status, Actions
- Create/edit form:
  - Title (narration template, supports placeholders)
  - Start Date (required)
  - End Date (optional — "Never expires" checkbox)
  - Frequency dropdown (daily, weekly, monthly, yearly)
  - Auto-post toggle
  - Same debit/credit entry table as regular journals
- Actions: Edit, Activate/Pause, Close, Run Now

---

## Phase 7: Auto-Reversal Job

**Implementation (current):** BullMQ queue + worker

- Queue: `journal-auto-reversal` in `apps/api/src/domains/journals/auto-reversal.queue.ts`
  - Job types:
    - `scan-due` (daily cron): scans for due auto-reversals
    - `reverse-one` (delayed): scheduled when a posted journal is created/posted with `auto_reversal_date`
- Worker: `apps/api/src/domains/journals/auto-reversal.worker.ts`
  - `scan-due` uses keyset pagination by `id` to process due journals in batches
  - `reverse-one` validates eligibility and calls `reverseJournalRecord()`
- Scheduling:
  - Daily cron is registered in `apps/api/src/worker.ts` via `scheduleDailyJournalAutoReversalScan()` and `getJobSchedule('journalAutoReversal')`
  - Per-journal delayed job is scheduled from journal posting flows via `scheduleJournalAutoReversal()`

**What’s still missing / follow-ups:**

- Period-closed handling for auto-reversal: today a closed/locked period will cause reversal to fail and be retried; consider making this a “skippable” failure + writing an audit event (e.g. `journal.auto_reversal_blocked_period`) so it’s observable and doesn’t spam retries.
- Consider `FOR UPDATE SKIP LOCKED` selection for scans if you run multiple scan workers concurrently (current idempotency is still safe because reversal locks the row, but scan work can be duplicated and then skipped).

**Files:**

- `apps/api/src/domains/journals/auto-reversal.queue.ts`
- `apps/api/src/domains/journals/auto-reversal.worker.ts`
- `apps/api/src/jobs/registry.ts` (worker registration)
- `apps/api/src/jobs/schedules.ts` + `apps/api/src/worker.ts` (cron schedule)

---

## Phase 8: CSV Import

Canonical spec: `docs/accounting/manual-journals_import_v1.md`.

### Backend (implemented)

- `POST /api/:companyId/journals/import/preflight` groups flat rows → journals, resolves COA/projects, validates, returns preview + `canSaveDraft` / `canPost`.
- `POST /api/:companyId/journals/import` writes journals (per journal `action: draft|posted`) with `mode: partial|all_or_nothing`.
- Limits: max 5000 rows; grouping is by `journal_reference` (strict date/title match) else `(date,title)`.

### Frontend (still to do)

- Build the import dialog + template download, parse CSV in a worker, call preflight, render review UI, then submit selected journals to import.
- Support account/project resolution UX (overrides) and optional contact assignment during review.

---

## Implementation Order & Status

| #   | Phase   | Scope                                    | Status      | Dependencies      |
| --- | ------- | ---------------------------------------- | ----------- | ----------------- |
| 1   | Phase 1 | DB migration + schema drift fixes        | ✅ **DONE** | None              |
| 2   | Phase 2 | Backend CRUD API                         | ✅ **DONE** | Phase 1           |
|     |         | - Types & schemas                        | ✅ Done     |                   |
|     |         | - `getJournalsByPage()`                  | ✅ Done     |                   |
|     |         | - `getJournalsByCursor()` (bonus)        | ✅ Done     |                   |
|     |         | - `getJournal()`                         | ✅ Done     |                   |
|     |         | - `postJournalRecord()`                  | ✅ Done     |                   |
|     |         | - `generateJournalReference()` (bonus)   | ✅ Done     |                   |
|     |         | - `updateDraftJournal()`                 | ✅ Done     |                   |
|     |         | - `postDraftJournal()`                   | ✅ Done     |                   |
|     |         | - `voidDraftJournal()`                   | ✅ Done     |                   |
|     |         | - `reverseJournalRecord()`               | ✅ Done     |                   |
|     |         | - `copyJournal()`                        | ✅ Done     |                   |
|     |         | - Controller & Routes                    | ✅ Done     |                   |
|     |         | - `importJournals()`                     | ⏳ TODO     |                   |
| 3   | Phase 3 | Frontend module + list view              | ⏳ **TODO** | Phase 2           |
| 4   | Phase 4 | Frontend create journal form             | ⏳ **TODO** | Phase 3           |
| 5   | Phase 5 | Frontend detail, reverse, copy           | ⏳ **TODO** | Phase 4           |
| 6   | Phase 6 | Recurring journals (full stack + worker) | ⏳ **TODO** | Phase 2           |
| 7   | Phase 7 | Auto-reversal job                        | ✅ **DONE** | Phase 2           |
| 8   | Phase 8 | CSV import (full stack)                  | ⏳ **TODO** | Phase 2 + Phase 3 |

**Current focus:** Frontend (Phases 3–5) + CSV import (Phase 8). Recurring (Phase 6) can follow once core UX is stable.

Phases 6, 7, 8 are independent and can be parallelized after Phase 2 completion.

---

## Key Constraints & Rules

1. **Single currency per journal batch.** FX is supported by setting `currencyId != reporting_currency_id` with an `exchangeRate` (provided or derived).
2. **Zero-sum enforced always.** Both drafts and posted journals must balance. Tolerance: 0.0000000001.
3. **Closed period handling (posting only).** Posting into a closed/locked month is rejected by fiscal calendar pre-checks. TODO: return a typed `ErrorCode` (instead of a generic error message) so the UI can handle this cleanly.
4. **Posted journals are immutable.** No edit. Only reverse (with new journal) or copy (creates draft).
5. **Audit trail on all mutations.** Via `audit_events` table. Events: create, update, post, post_blocked_period, void, reverse, copy, import.
6. **Soft deletes.** `is_deleted = true`. Even "deleting" a draft is a soft-delete.
7. **Balance recalculation** handled by `createLedgerRecord()` → `enqueueGLBalance()`. No extra calls needed from journal layer.
8. **Advisory locks**: journal mutations also acquire a per-company advisory transaction lock in `resolveJournalCompanyContext()` to reduce concurrency hazards during posting/reversal/copy.
9. **Fiscal calendar auto-creation:** Journal pre-checks and `/period-status` should ensure periods exist (silent server-side creation). Do not rely on `createLedgerRecord()` for this.
10. **Date semantics (journals + ledger):** API accepts `YYYY-MM-DD` for journal dates and reversal dates. Persist as UTC-normalized date semantics (either DB `DATE` or timestamp at `00:00:00Z` consistently) so list ordering, uniqueness guards, and recurring/idempotency are stable.
11. **Projects:** Project selection is per entry (optional). Reporting on projects is line-based (i.e., project views show only lines tagged to that project; totals may not "balance within project", which is expected).
12. **Attachments shown in ledger:** When viewing a ledger transaction sourced from a manual journal, fetch and show journal batch files (via `file_attachments` + `files`) alongside any ledger-native files.

---

## Files Summary

### New Files

- `apps/api/src/domains/journals/journals.controller.ts`
- `apps/api/src/domains/journals/journals.routes.ts`
- `apps/api/src/domains/journals/journals.audit.ts`
- `apps/api/src/domains/journals/journals.command.ts`
- `apps/api/src/domains/journals/journals.prepare.ts`
- `apps/api/src/domains/journals/journals.query.ts`
- `apps/api/src/domains/journals/journals.reference.ts`
- `apps/api/src/domains/journals/journals.types.ts`
- `apps/api/src/domains/journals/journals.utils.ts`
- `apps/api/src/domains/journals/auto-reversal.queue.ts`
- `apps/api/src/domains/journals/auto-reversal.worker.ts`
- `apps/api/src/domains/journals/__tests__/journals.command.test.ts`

### Planned (not yet created)

- `apps/api/src/domains/journals/recurring-templates.*` (recurring templates CRUD)
- `apps/api/src/jobs/queues/recurring-journal.queue.ts` + worker (recurring runner)
- `apps/web/src/modules/accounting/journals/` (frontend module)
- `apps/web/src/features/manage-journals/` (journals feature UI)

### Modified Files

- `apps/api/src/domains/journals/journals.model.ts` — add list/get/update/post/void/reverse/copy/import + fix closed-period behavior
- `apps/api/src/domains/journals/journals.types.ts` — schema drift cleanup + new schemas
- `apps/api/src/app.ts` — register journal routes
- `apps/api/src/jobs/registry.ts` — register journal auto-reversal worker
- `apps/api/src/jobs/schedules.ts` — add journal auto-reversal cron config
- `apps/api/src/worker.ts` — schedule daily journal auto-reversal scan
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
