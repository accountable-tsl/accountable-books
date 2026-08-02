# Phase 2: Billing Accounts and Ownership Plan

Status: Execution plan (Phase 2 complete)

## Implementation progress

| PR  | Scope                          | Status                                                                                                   |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| PR1 | `billing_accounts`             | **Done** — migration `20260521165447_billing_acounts.ts`, `accounts/accounts.model.ts`, 7 tests          |
| PR2 | `billing_account_profiles`     | **Done** — migration `20260521173000_billing_account_profiles.ts`, `profiles/profiles.model.ts`, 6 tests |
| PR3 | `workspace_billing_ownership`  | **Done** — migration `20260521174030_workspace_billing_ownership.ts`, validation + model, 13 tests       |
| PR4 | Ownership resolver + contracts | **Done** — `resolveWorkspaceBillingContext`, `billing/ownership.ts`, 8 tests                             |
| PR5 | Provisioning hooks + demo seed | **Done** — `provisionBillingForCompany`, createCompany/signup/demo hooks, 5 tests                        |

Cursor implementation plan: `.cursor/plans/phase_2_billing_accounts_60bbf969.plan.md`

## 1. Purpose

This document describes exactly how to implement Phase 2 of billing:

- `billing_accounts`
- `billing_account_profiles`
- `workspace_billing_ownership`

The goal is to create a clean backend truth for:

- who the payer is
- which billing account represents that payer
- how a workspace maps to a payer over time

This phase should be implementable in one focused pass without dragging later
subscription, invoice, or payout concerns forward.

## 2. Phase 2 Outcome

Phase 2 is done when the backend can answer:

- what billing account belongs to this firm, business, or individual?
- what billing identity/profile applies to that account?
- who currently pays for this workspace?
- what commercial mode is this workspace in?
- what was the previous ownership of this workspace?

By the end of Phase 2:

- billing accounts exist and attach to a single owning `companies` row with
  clear status and settlement currency
- billing profiles exist for invoice-facing/legal identity fields
- workspace ownership is effective-dated and historical
- an internal ownership resolver can deterministically resolve the current payer
  for any workspace

## 3. Strict Scope

### In scope

- account identity and ownership schema
- account/profile/ownership model functions
- internal ownership resolver service
- tests for account and ownership behavior
- optional minimal API only if needed after the internal resolver is complete

### Out of scope

- subscriptions
- checkout
- provider customers
- payment methods
- invoices
- credits ledger
- managed workspace pricing
- sell-price billing
- payout logic

Do not pull later-phase concerns into this phase.

## 4. Implementation Rule

Implement this phase in this exact order:

1. `billing_accounts`
2. `billing_account_profiles`
3. `workspace_billing_ownership`
4. internal ownership resolver
5. optional API surface only if genuinely needed

Do not start `workspace_billing_ownership` before `billing_accounts` is locked.
Do not start the resolver before the three tables are in place.

## 5. Invariants To Lock Before Writing Code

These are the rules the schema and services must enforce.

### Billing accounts

- one billing account belongs to exactly one owning `companies` row
- one billing account has exactly one `invoice_currency_code`
- one billing account has exactly one lifecycle `status`
- one owner should not accidentally get duplicate active billing accounts for
  the same purpose and currency without an explicit reason
- in v1, enforce one billing account per `owner_company_id`

### Billing profiles

- one billing account has at most one current profile row in Phase 2
- profile data is invoice-facing/commercial identity data, not arbitrary company
  metadata
- `legal_entity_name`, `billing_email`, and `billing_country_code` are required
  at creation

### Workspace ownership

- a workspace can have only one active ownership row at a time
- ownership rows are historical, not overwritten in place
- ownership transitions happen by ending the current row and inserting a new row
- the included internal firm workspace must never be treated as a billable
  managed workspace
- ownership must leave room for future `client_billing_account_id`, even if
  client sell-price billing is later
- allowed field combinations must be explicit and validated, not implied

### Auth

- internal billing/account routes must use access-token or session-aware auth
- do not gate normal billing/account routes with raw refresh-token auth

## 6. Table-By-Table Plan

## 6.1 `billing_accounts`

### Purpose

Represents the internal commercial customer account that owns future
subscriptions, invoices, credits, and provider customer mappings.

### Columns

- `id`
- `owner_company_id`
- `invoice_currency_code`
- `status`
- `billing_cycle_anchor_day`
- `billing_timezone`
- `current_billing_period_start_at`
- `current_billing_period_end_at`
- `created_at`
- `updated_at`

### Recommended constraints

- primary key on `id`
- foreign key `owner_company_id -> companies.id`
- check `status in ('active', 'suspended', 'closed')`
- check `invoice_currency_code` is 3 chars
- check `billing_cycle_anchor_day` is between `1` and `31` when present
- check `current_billing_period_end_at > current_billing_period_start_at` when
  both are present

### Recommended indexes

- index on `owner_company_id`
- unique index on `owner_company_id`

### Decision to keep simple in Phase 2

Enforce one billing account per owner company in v1. The owner category is
already represented by `companies.type` (`business`, `accounting_firm`,
`individual`), so do not duplicate that classification in billing. If billing
logic needs a commercial rail helper later, derive it from `companies.type`
instead of storing a second source of truth.

## 6.2 `billing_account_profiles`

### Purpose

Stores invoice-facing billing identity details separate from the core `companies`
model.

### Columns

- `id`
- `billing_account_id`
- `legal_entity_name`
- `billing_email`
- `billing_country_code`
- `tax_id`
- `tax_id_type`
- `tax_exemption_code`
- `address_json`
- `created_at`
- `updated_at`

### Recommended constraints

- primary key on `id`
- foreign key `billing_account_id -> billing_accounts.id`
- unique index on `billing_account_id` in Phase 2
- check `billing_country_code` is 2 chars
- check `address_json` is an object when present

### Phase 2 rule

This is one current profile row per account, not a profile-history system yet.
Require:

- `legal_entity_name`
- `billing_email`
- `billing_country_code`

Keep optional for now:

- `tax_id`
- `tax_id_type`
- `tax_exemption_code`
- `address_json`

## 6.3 `workspace_billing_ownership`

### Purpose

Records who pays the platform for a workspace over a time window.

### Columns

- `id`
- `workspace_company_id`
- `billing_account_id`
- `client_billing_account_id`
- `commercial_mode`
- `software_payer`
- `effective_at`
- `ended_at`
- `created_at`
- `updated_at`

### Recommended constraints

- primary key on `id`
- foreign key `billing_account_id -> billing_accounts.id`
- foreign key `client_billing_account_id -> billing_accounts.id`
- check `commercial_mode in ('self_serve', 'firm_managed', 'firm_internal')`
- check `software_payer in ('billing_account', 'client_billing_account')`
- check `ended_at IS NULL OR ended_at > effective_at`

### Recommended indexes and guards

- index on `workspace_company_id`
- index on `billing_account_id`
- partial unique index: one active row per `workspace_company_id` where
  `ended_at IS NULL`
- exclusion constraint to prevent overlapping ownership windows for the same
  `workspace_company_id`

### Important behavior rules

- `firm_internal` is the included internal workspace mode
- `commercial_mode = firm_internal` is the explicit source of truth for the
  included internal firm workspace
- `firm_internal` should never later generate managed-workspace wholesale
  charges
- `client_billing_account_id` can be `NULL` in Phase 2, but the column should
  exist now
- remove `workspace_ai_payer` from Phase 2; actor-based AI debit resolution is
  already authoritative and should not be shadowed by a workspace-level field

### Allowed combinations matrix

Use this as the implementation rule for valid ownership rows.

#### `commercial_mode = self_serve`

- `billing_account_id`: required
- `client_billing_account_id`: `NULL`
- `software_payer`: `billing_account`

#### `commercial_mode = firm_internal`

- `billing_account_id`: required
- `client_billing_account_id`: `NULL`
- `software_payer`: `billing_account`

#### `commercial_mode = firm_managed`

- `billing_account_id`: required
- `client_billing_account_id`: `NULL` or set
- `software_payer`: `billing_account`

If a row does not match one of these allowed combinations, reject it.

## 7. Runtime Deliverables

Phase 2 should not stop at schema. It needs a usable internal backend slice.

## 7.1 Model functions

Add model functions for:

### `billing_accounts`

- `createBillingAccount(...)`
- `getBillingAccountById(id, db)`
- `getBillingAccountByOwnerCompanyId(ownerCompanyId, db)`

### `billing_account_profiles`

- `upsertBillingAccountProfile(...)`
- `getBillingAccountProfile(billingAccountId, db)`

### `workspace_billing_ownership`

- `createWorkspaceBillingOwnership(...)`
- `endWorkspaceBillingOwnership(workspaceCompanyId, endedAt, db)`
- `getCurrentWorkspaceBillingOwnership(workspaceCompanyId, at, db)`
- `listWorkspaceBillingOwnershipHistory(workspaceCompanyId, db)`

## 7.2 Internal ownership resolver

This is the main deliverable of the phase.

Add a service that can answer:

- `resolveWorkspaceBillingContext(workspaceCompanyId, at?)`

It should return:

- current ownership row
- payer billing account
- optional client billing account
- commercial mode
- whether the workspace is an included internal firm workspace

Internal return shape should be:

- `workspaceCompanyId`
- `ownershipId`
- `billingAccountId`
- `clientBillingAccountId`
- `commercialMode`
- `softwarePayer`
- `isFirmInternalWorkspace`
- `effectiveAt`
- `endedAt`
- `billingAccount`
- `clientBillingAccount` optional

This service is what later phases should depend on.

## 7.3 Optional API

Only add a public/internal API route if something immediately needs it.

If added, keep it narrow:

- `GET /api/billing/account`
- or `GET /api/billing/workspaces/:workspaceCompanyId/ownership`

Do not invent a broad Phase 2 frontend view just to “have an endpoint.”

## 8. Recommended PR Sequence

Implement Phase 2 in four PR-sized chunks.

### PR 1: `billing_accounts`

Includes:

- migration
- model functions
- tests for account creation, owner lookup, and status/currency invariants

### PR 2: `billing_account_profiles`

Includes:

- migration
- model functions
- tests for one-profile-per-account and structured profile retrieval

### PR 3: `workspace_billing_ownership`

Includes:

- migration
- creation/end/history model functions
- overlap protection
- tests for self-serve, firm-managed, and internal ownership cases

### PR 4: ownership resolver

Includes:

- internal resolver service
- tests for current/historical resolution
- optional narrow endpoint only if already needed

## 9. Test Plan

### Account tests

- create billing account with valid owner company and status
- reject invalid status
- reject invalid billing period window
- resolve account by owner company id

### Profile tests

- insert or upsert profile for account
- reject second profile row if uniqueness is enforced
- return stored legal entity, email, country, and address

### Ownership tests

- create self-serve ownership row
- create firm-managed ownership row
- create firm-internal ownership row
- reject disallowed ownership field combinations
- reject overlapping active ownership rows
- end an ownership row and create a successor row
- resolve historical ownership by `at`
- confirm included internal workspace is recognized as non-billable managed
  ownership

### Resolver tests

- resolve self-serve workspace payer
- resolve firm-managed workspace payer
- resolve firm-internal workspace payer
- return `null` or explicit not-found when no ownership exists

## 10. Definition Of Done

Phase 2 is complete when:

- all three tables exist with locked constraints
- model functions exist and are tested
- ownership windows are deterministic and non-overlapping
- the internal ownership resolver can answer the current payer for any workspace
- Phase 3 can attach subscriptions to a resolved billing account without
  redesigning ownership

## 11. What Not To Do

- do not add provider customer tables yet
- do not add payment methods yet
- do not add subscription rows yet
- do not mix invoice logic into this phase
- do not design for every future multi-account edge case if product does not
  need it yet
- do not let a convenience API define the shape of the domain

## 12. Immediate Next Step

**Phase 2 complete.** Next: Phase 3 subscriptions (attach to `billingAccountId` from resolver).
