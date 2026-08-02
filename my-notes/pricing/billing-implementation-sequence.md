# Billing Implementation Sequence

Status: Working implementation guide

## 1. Purpose

This document describes the recommended implementation sequence for the billing
system defined in
[commercial-billing-platform-blueprint.md](/Users/temi/codebase/accountable-books/my-notes/pricing/commercial-billing-platform-blueprint.md).

The goal is to implement billing in a way that is:

- easy to follow
- incrementally testable
- production-safe at each step
- aligned with the long-term architecture

This is intentionally an execution guide, not a second architecture document.

## 2. Implementation Rule

We should implement billing in **vertical slices**, not just table-by-table and
not by scattering unrelated features across the codebase.

Each phase should leave us with a real, coherent loop that we can explain and
test.

For every phase, we should do the same six things:

1. Define invariants.
2. Add schema.
3. Implement domain services.
4. Add provider integration only where needed.
5. Expose API or read model.
6. Add tests before moving on.

## 3. Phase Sequence

### Phase 0: Groundwork

Goal:

- create the billing domain structure without changing product behavior yet

Build:

- `apps/api/src/domains/billing`
- contract files split by domain
- shared enums and constants:
  - plan families
  - billing intervals
  - subscription states
  - invoice states
  - charge types
  - payout entry types
  - actor types
- migration scaffold
- internal billing README or ADR

Exit criteria:

- module boundaries are clear
- naming is locked
- old billing contracts are marked legacy

### Phase 1: Catalog

Goal:

- establish internal product truth for plans, prices, and features

Tables:

- `billing_plan_catalog`
- `billing_plan_catalog_prices`
- `billing_plan_catalog_provider_prices`
- `billing_plan_features`

Build:

- catalog repositories and services
- seed launch pricing
- internal plan resolution service
- explicit guardrails that catalog prices are for direct subscription pricing
  only, not managed-workspace wholesale pricing

APIs:

- `GET /billing/catalog`

Tests:

- plan lookup by key
- price resolution by interval and currency
- feature resolution by effective date

Exit criteria:

- launch pricing is in the database
- provider pricing is mapped but not authoritative

### Phase 2: Billing Accounts and Ownership

Goal:

- model who pays for what
- establish billing identity and workspace-to-payer truth before subscriptions

Tables:

- `billing_accounts`
- `billing_account_profiles`
- `workspace_billing_ownership`

Build:

- billing account creation
- billing account status and owner-type modeling
- account profile management for commercial identity fields
- effective-dated workspace ownership resolution
- internal ownership resolver service as the main runtime deliverable
- optional `client_billing_account_id` support in ownership design, even if
  full client sell-price billing comes later

Key rules:

- one invoice and settlement currency per billing account
- billing accounts have explicit owner type and lifecycle status
- one active ownership row per workspace at a time
- ownership transitions are explicit and historical, not silent overwrites
- one invoice and settlement currency per billing account
- included firm workspace is never a billable managed workspace
- normal billing/account endpoints should use access-token or session-aware auth
  only, not raw refresh-token auth

APIs:

- internal ownership resolver service
- `GET /billing/account` only if current product flow actually needs it during
  Phase 2

Tests:

- billing account creation and status invariants
- self-serve ownership
- firm-managed ownership
- ownership transfer
- historical ownership resolution by effective date
- included firm workspace exclusion

Exit criteria:

- billing accounts can represent the correct payer with clear owner type,
  status, and settlement currency
- every workspace resolves to the correct payer through the internal ownership
  resolver
- ownership truth is explicit, historical, and queryable

### Phase 3: Subscriptions and Entitlements

Goal:

- make plan state real

Tables:

- `billing_subscriptions`
- `billing_subscription_change_requests`
- `entitlement_snapshots`

Build:

- subscription lifecycle
- change request storage
- entitlement resolver
- trialing, active, past-due, suspended handling

APIs:

- `GET /billing/subscription`
- `POST /billing/subscription/create-checkout`
- `POST /billing/subscription/commit-change`
- `POST /billing/subscription/cancel`
- `GET /billing/views/manage-plan-dialog`

Tests:

- create subscription
- plan change request
- downgrade scheduling
- entitlement refresh on subscription change
- trial-state behavior

Exit criteria:

- current plan can be shown from backend truth
- manage-plan can be powered by real backend data

### Phase 4: Provider Boundary and Webhooks

Goal:

- make external payment execution real without making it the source of truth

Tables:

- `billing_account_provider_customers`
- `billing_provider_webhook_events`

Build:

- provider adapter interface
- Stripe-first implementation
- customer sync
- checkout session creation
- webhook ingestion and reconciliation
- stale-event protection

Tests:

- idempotent webhook ingest
- replay behavior
- stale webhook ignore rule
- checkout to webhook to active-subscription loop

Exit criteria:

- first real billing loop works end to end
- provider events reconcile into internal state safely

### Phase 5: Internal Charges and Invoices

Goal:

- make internal invoices the source of truth

Tables:

- `commercial_charges`
- `commercial_charge_allocations`
- `invoice_runs`
- `invoice_documents`
- `invoice_line_items`

Build:

- charge generation
- invoice runs
- invoice assembly
- provider invoice sync
- tax snapshot persistence

APIs:

- `GET /billing/invoices`
- `GET /billing/views/settings-overview`

Tests:

- subscription charge generation
- invoice assembly
- invoice immutability
- upcoming bill estimate vs open invoice behavior
- tax fields populated from provider where supported

Exit criteria:

- settings page upcoming bill can come from real backend logic
- internal invoices are authoritative

### Phase 6: Credits and Wallet

Goal:

- make credits real, auditable, and usable by the product

Tables:

- `billing_credit_purchases`
- `credit_grants`
- `credit_wallet_entries`
- `credit_consumptions`
- `credit_auto_recharge_policies`

Build:

- grant creation
- wallet ledger
- consumption pipeline
- top-up purchases
- auto-recharge
- actor-based debit resolution

APIs:

- `GET /billing/credits/wallet`
- `POST /billing/credits/create-topup-checkout`
- `PUT /billing/credits/auto-recharge`

Tests:

- grant to wallet-entry invariant
- consumption ordering
- actor-based debit routing
- auto-recharge idempotency
- monthly credit reset

Exit criteria:

- wallet UI can be backed by real data
- AI usage can debit the correct billing account

### Phase 7: Managed Workspace Wholesale Billing

Goal:

- support firms paying the platform for managed workspaces

Tables:

- `managed_workspace_plan_assignments`
- `managed_workspace_wholesale_prices`
- `managed_workspace_wholesale_rate_snapshots`

Build:

- ownership transfer into firm-managed
- wholesale rate resolution
- monthly and annual commitment handling
- mid-cycle proration
- per-workspace bonus credit grants
- included firm workspace exclusion

Tests:

- assignment creation
- annual vs monthly assignment
- mid-cycle reassignment
- prorated workspace credit bonus
- included firm workspace excluded

Exit criteria:

- firm-managed wholesale charges can be generated correctly
- managed workspace summary views are trustworthy

### Phase 8: Client Sell-Price Billing

Goal:

- collect from end clients on the firm’s behalf

Tables:

- `firm_sell_price_policies`
- `managed_workspace_sell_price_overrides`

Uses:

- `client_billing_account_id`
- `commercial_charges`
- `invoice_documents`

Build:

- client billing accounts for managed workspaces
- client sell-price charge generation
- client invoice generation
- provider collection
- client wallet and auto-recharge support

Tests:

- client sell-price resolution
- default price vs override
- client invoice creation
- successful collection path
- client AI usage debits client wallet

Exit criteria:

- platform can charge client accounts using firm-defined sell pricing
- client-side billing truth exists cleanly

### Phase 9: Payout Statements and Manual Remittance

Goal:

- let firms trust what we collected, deducted, and owe them

Tables:

- `payout_periods`
- `payout_ledger_entries`

Future extension:

- `payout_schedule_policies`

Build:

- payout period creation
- payout ledger entry generation
- FX normalization
- manual payout approval
- payout completion workflow
- payout statement read model

Tests:

- collection to payout ledger entry
- FX normalization into settlement currency
- deduction and adjustment handling
- manual payout marking
- ending balance correctness

Exit criteria:

- for any period, a firm can see:
  - collected
  - deducted
  - adjusted
  - paid out
  - remaining

### Phase 10: Admin and Support Operations

Goal:

- make the system operable

Table:

- `billing_audit_events`

Build:

- billing audit event coverage
- support/admin inspection surfaces
- minimum admin actions:
  - replay webhook
  - manual credit grant
  - invoice void or adjustment
  - payout approval and completion
  - create or update `firm_custom` agreements

Tests:

- audit event emission
- admin action safety
- replay without duplication

Exit criteria:

- support can answer what happened
- ops can recover from common failures

### Phase 11: Refunds, Chargebacks, and Clawbacks

Goal:

- handle money moving backward without corrupting history

Build:

- refund adjustment handling
- chargeback intake path
- payout clawback entries
- support workflow for disputes

Tests:

- refund after invoice
- chargeback after payout statement inclusion
- negative payout adjustment

Exit criteria:

- historical invoices remain intact
- reversals are explicit and auditable

### Phase 12: Hardening

Goal:

- production confidence

Build:

- metrics and alerts
- DLQ and replay tooling
- concurrency protections where needed
- performance review of invoice and payout jobs
- backup and recovery considerations

Exit criteria:

- system is supportable in production
- main loops are observable

## 4. Recommended PR Order

If implementation starts soon, the practical PR sequence should be:

1. billing domain skeleton + contract split
2. catalog tables + seed data
3. billing accounts + profiles + ownership
4. subscriptions + entitlement snapshots
5. provider customers + webhook event storage + Stripe checkout
6. manage-plan backend views
7. commercial charges + invoice tables
8. settings overview upcoming bill
9. credits + wallet + top-up + auto-recharge
10. managed workspace assignments + wholesale pricing
11. client billing accounts + client sell-price invoicing
12. payout periods + payout ledger + manual payouts
13. admin audit/actions
14. refunds / chargebacks / clawbacks
15. hardening

## 5. First Real Billing Loop

The first truly useful billing loop should be:

1. catalog
2. billing accounts and ownership
3. subscriptions
4. provider checkout and webhooks
5. internal invoices

That is the smallest end-to-end slice that gives us real billing truth without
jumping straight into the hardest managed-workspace and payout logic.

## 6. What Not To Do

We should not:

- start with payouts
- start with promotions
- build all tables first and behavior later
- let Stripe objects define the billing domain
- build the accounting bridge too early
- mix firm wholesale billing with firm sell-price billing in one fuzzy flow

## 7. Reference Docs

- [commercial-billing-platform-blueprint.md](/Users/temi/codebase/accountable-books/my-notes/pricing/commercial-billing-platform-blueprint.md)
- [launch-pricing.md](/Users/temi/codebase/accountable-books/my-notes/pricing/launch-pricing.md)
