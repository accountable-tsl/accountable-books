# Manual Journals CSV Import (v1) — Plan (Preflight + Import)

This document defines the end-to-end CSV import flow for manual journals, with emphasis on safety (no accidental posting), performance (max 5000 lines), and security (server-side validation + company scoping).

Status: Backend implemented (preflight + import)
Last updated: 2026-02-04

---

## Goals

- Users can import up to 5000 journal lines from CSV into the system.
- Users see a preview with _all_ validation issues before saving/posting.
- Users can save as draft or post per journal, and “save all” / “post all eligible”.
- Import is deterministic: the same file produces the same grouping and validation results.
- Backend remains the source of truth for business rules, permissions, and referential integrity.

## Non-goals (v1)

- Accepting raw CSV files on the backend (we send structured JSON rows; the frontend parses CSV).
- Background/async import jobs (we keep it synchronous for ≤5000 lines).
- Automatically inferring contacts from CSV (contact can be optionally set during review).

---

## Locked CSV headers

Exact headers (in order):

```
date,title,journal_reference,description,note,currency_code,auto_reversal_date,line_description,account_code,account_name,project_code,project_name,debit,credit
```

Notes:

- The UI can hide the currency columns for most users, but the pipeline supports them.

---

## Deterministic grouping (rows → journals)

Each row belongs to exactly one journal group.

1. If `journal_reference` is present (non-empty): group key is `ref:${journal_reference}`.
   - All rows in the same `journal_reference` group must share the same `date` and `title`.
   - If a reference group contains multiple dates/titles, **the import is rejected** as structurally invalid (because grouping is ambiguous).

2. If `journal_reference` is blank: group key is `dt:${date}|${title}`.
   - This means you cannot represent two distinct journals with the same `date` + `title` unless you provide `journal_reference`.

The backend returns an `importKey` for each grouped journal equal to the group key above.

---

## Row-level rules (CSV semantics)

Required fields per row:

- `date` (YYYY-MM-DD)
- `title`
- At least one of `account_code` or `account_name`
- Exactly one of `debit` or `credit` must be > 0

Money rules:

- No negatives
- Max 2 decimal places
- Commas in numbers may be accepted (e.g. `1,234.56`) and normalized

Currency rules:

- If `currency_code` is empty: default to company reporting currency
- Each journal group must use a single currency; mixed currencies within a group are rejected
- If `currency_code` differs from reporting currency: the backend will derive an exchange rate by default
- The preview UI can allow users to override the derived exchange rate at the journal level

Auto-reversal rules:

- `auto_reversal_date` is optional (YYYY-MM-DD)
- If provided, it will schedule the existing auto-reversal mechanism _after_ the journal is posted (same behavior as normal posting flows)

---

## Journal-level rules (accounting invariants)

For each grouped journal:

- Must have at least 2 non-zero lines
- Must balance: total debits === total credits (same tolerance as manual entry)

Posting eligibility:

- A journal can be posted only if its fiscal period is open for `date`
- Preflight should return `canPost=false` with a clear message if the period is closed/locked (preflight should _not_ throw)

References:

- If `journal_reference` is provided, it must be unique for the company (same constraints as manual entry).
- Reference uniqueness should be validated during preflight to give immediate feedback.

---

## Limits (v1)

Hard limits enforced by backend (and ideally by frontend too):

- Max CSV lines: 5000
- Max distinct journals per import: 500 (proposed)
- Max lines per journal: 500 (proposed)

If the import exceeds these limits, reject early with a structured error explaining which limit was hit.

---

## Why “CSV types” exist on the backend (and what backend processes)

We do **not** parse CSV text on the backend.

However, the backend still needs to validate and normalize the _structured rows_ the frontend sends:

- CSV parsers typically produce strings, even for numbers.
- We want row-level error reporting (not “fail the whole request on the first bad row”).
- We must enforce server-side limits and business rules regardless of what the client sends.

So we define a “CSV row schema” for the JSON payload that mirrors the CSV headers, and we normalize values (trim strings, coerce numbers) in a controlled way. This is security and correctness, not “backend CSV parsing”.

---

## End-to-end flow

### A) Frontend

1. User uploads CSV
2. Parse in a Web Worker (streaming)
3. Basic client validation:
   - required headers present
   - max row count ≤ 5000
   - basic formatting checks (date, numeric parsing)
4. Send flat rows to backend preflight (backend does grouping)
5. Review UI:
   - shows journals (grouped) with errors/warnings and totals
   - provides mapping controls for unresolved/ambiguous accounts/projects
   - allows optionally setting contact per journal in review
6. User actions:
   - per journal: “Save draft” or “Post”
   - bulk: “Save all drafts” and “Post all eligible”
7. Send selected journals to backend import endpoint
8. Show per-journal results (success/failure) + created IDs/references

### B) Backend

Two endpoints:

1. `POST /api/:companyId/journals/import/preflight`
   - no DB writes
   - groups rows into journals
   - resolves account/project identifiers
   - validates balancing, reference conflicts, period status, FX requirements
   - returns preview journals + errors/warnings + `importKey` identifiers

2. `POST /api/:companyId/journals/import`
   - writes drafts/posted journals using existing journal command logic
   - re-validates everything (don’t trust preflight alone)
   - supports `partial` vs `all_or_nothing`

Implementation: `apps/api/src/domains/journals/journals.import.ts` (model), `apps/api/src/domains/journals/journals.controller.ts` (controllers), `apps/api/src/domains/journals/journals.routes.ts` (routes), `apps/api/src/domains/journals/journals.types.ts` (schemas).

---

## Backend API contracts (proposed)

### 1) Preflight

Request:

- `lines`: array of objects matching the locked headers (strings/numbers)
- optional `overrides` (for mapping selections made in the UI):
  - `accounts`: map of `{ key -> coaId }`
  - `projects`: map of `{ key -> projectId }`
  - optional per-journal `contactId`
  - optional per-journal currency override (if UI ever enables it)

Response:

- `journals`: array of grouped journals:
  - `importKey`
  - `header`: date/title/description/note/reference/currency/exchangeRate/autoReversalDate
  - `lines`: normalized entries with derived `side`/`amount`, plus resolution status:
    - `coa`: resolved/ambiguous/unresolved + candidates
    - `project`: resolved/ambiguous/unresolved + candidates
  - `errors[]` and `warnings[]`
  - `canSaveDraft` (true if structurally valid and all required refs resolved)
  - `canPost` (true if canSaveDraft and period open and posting-specific rules pass)
- `summary`: counts (total rows, total journals, errors, warnings)

### 2) Import

Request:

- `mode`: `partial` | `all_or_nothing`
- `journals`: array of:
  - `importKey`
  - `action`: `draft` | `posted` (per-journal; chosen from preview buttons)
  - `data`: the final normalized journal payload (with resolved `coaId` / `projectId`)

Response:

- `results`: array of per-journal outcomes:
  - `importKey`
  - `success`
  - `journalBatchId?`, `journalReference?`, `ledgerTransactionId?`
  - `code?`, `message?`, `error?`
- `summary`: totals posted/saved/failed

---

## Implementation tasks (backend)

1. Add Zod request/response types (journals domain)
2. Add `importPreflightJournals()` model function (no writes)
   - grouping + normalization
   - COA/project resolution (code/name, detect ambiguous)
   - period status lookup
   - reference conflict checks
3. Add `importJournals()` model function (writes)
   - validate + call `postJournalRecord()` per journal
   - enforce limit checks
4. Wire controllers + routes:
   - `POST /import/preflight`
   - `POST /import`
5. Add tests:
   - grouping rules (reference vs date/title)
   - COA/project resolution (unresolved/ambiguous)
   - balancing
   - posting blocked by closed period
   - partial vs all_or_nothing behavior

---

## Decisions (locked for v1)

1. Server-side grouping:
   - Backend receives flat rows for preflight and performs deterministic grouping (reference-first, else date+title).

2. FX imports:
   - Allowed by default.
   - Must be easy to disable via configuration (see “Config hooks”).

3. Project status filtering:
   - Allow all `projects.status` values for now (only require `is_deleted=false` and company scoping).
   - Must be easy to customize later (potentially per company).

---

## Config hooks (so we can toggle/customize later)

1. FX import enable/disable

- Short-term: environment variable (e.g. `JOURNAL_IMPORT_ENABLE_FX=true|false`)
  - If disabled: preflight returns a blocking error for any journal where `currency_code != reporting currency` (reject; do not silently coerce).
- Future: per-company setting (e.g. `companies.settings.journal_import_enable_fx` or a dedicated settings table)

2. Allowed project statuses for import

- Short-term: allow all statuses (no filter).
- Future: per-company setting (e.g. `journal_import_allowed_project_statuses: string[]`)
  - Preflight would treat disallowed statuses as a blocking error and surface status in the preview.
