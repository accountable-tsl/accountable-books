# Billing Domain

Status: Phase 2 complete (subscriptions next)
Owner: Engineering

## Purpose

This domain will own commercial billing for Accountable Books.

It is intentionally separate from:

- `ledgers` for accounting and GL truth
- workspace/company lifecycle domains
- provider-specific payment execution details

## Core responsibilities

The billing domain will eventually own:

- plan catalog
- billing accounts
- workspace billing ownership
- subscriptions and subscription changes
- internal charges and invoices
- credits and wallets
- managed-workspace wholesale billing
- client sell-price billing
- payout periods and payout ledgers
- read models for billing UI
- provider webhook reconciliation

## Implementation rule

Billing should be implemented in vertical slices.

The first real loop is:

1. catalog
2. billing accounts and ownership
3. subscriptions
4. provider checkout and webhooks
5. internal invoices

## Near-term scope

The initial implementation groundwork should establish:

- shared billing enums and types
- grouped contract surface for the new billing model
- a clean place for future services, routes, and read models

## Structure

Expected subdomains:

- `catalog`
- `accounts`
- `ownership`
- `subscriptions`
- `credits`
- `charges`
- `invoices`
- `managed-workspaces`
- `pricing-agreements`
- `entitlements`
- `providers`
- `read-models`
- `webhooks`

## Catalog API (Phase 1)

### Route

`GET /api/billing/catalog`

### Authentication

Requires a valid `accessToken` cookie. Billing routes are mounted after `verifyAccessToken` on `/api` (session-authenticated only at launch; not public).

### Query parameters

| Parameter      | Required | Validation                                              |
| -------------- | -------- | ------------------------------------------------------- |
| `currencyCode` | Yes      | Three uppercase letters, e.g. `USD`, `NGN`              |
| `at`           | No       | ISO-8601 datetime; defaults to server time when omitted |

### Response envelope

All billing domain APIs use the shared wrapper:

```json
{
  "success": true,
  "message": "Billing catalog retrieved",
  "data": {
    "asOf": "2026-05-18T00:00:00.000Z",
    "currencyCode": "USD",
    "plans": []
  }
}
```

Clients must read catalog payload from `response.data`, not the top level.

### Errors

| Status | When                                  |
| ------ | ------------------------------------- |
| 400    | Invalid query parameters              |
| 401    | Missing or invalid access token       |
| 500    | Assembly or unexpected server failure |

### Catalog invariants

- `billing_plan_catalog_prices` stores **direct subscription catalog prices** only (firm, business self-serve, individual). It must not be used for managed-workspace wholesale or firm sell-price policies.
- Provider price mappings live in `billing_plan_catalog_provider_prices` and are execution metadata, not product truth.

### Plan key naming

| Layer           | Field      | Example         |
| --------------- | ---------- | --------------- |
| API / contracts | `planKey`  | `firm_standard` |
| Database        | `plan_key` | `firm_standard` |

- Runtime plan keys are validated with `billingPlanKeySchema` (format only; any active catalog row).
- `BILLING_LAUNCH_PLAN_KEYS` / `billingLaunchPlanKeySchema` lock the **v1 seed snapshot** for migrations and tests only — not a runtime catalog boundary. New plans added via migration do not require updating that list.

Types for catalog responses live in `@accountable-books/contracts/schema` under `billing.*`.

## Phase 2: Accounts, ownership, resolver

### Tables

- `billing_accounts` — one row per `owner_company_id` (payer identity)
- `billing_account_profiles` — invoice-facing identity per account
- `workspace_billing_ownership` — effective-dated workspace → payer mapping

DB enforces allowed ownership combinations (not only the model layer):

- `software_payer = billing_account` in Phase 2
- `self_serve` / `firm_internal` → `client_billing_account_id IS NULL`
- `client_billing_account_id` must differ from `billing_account_id` when set

### Resolver

`resolveWorkspaceBillingContext(workspaceCompanyId, { at?, db? })` in
`resolver/ownership-resolver.service.ts` returns `billing.WorkspaceBillingContext`
or `null` when no ownership exists. `ownerType` on embedded accounts is derived
from `companies.type` (`accounting_firm` → `firm`).

Contracts: `billing.workspaceBillingContextSchema` in `schema/source/billing/ownership.ts`.

### Provisioning

`provisionBillingForCompany(companyId, { billingEmail, db })` in
`provisioning/provisioning.service.ts`:

1. `ensureBillingAccountForCompany` — account + profile (idempotent)
2. `ensureWorkspaceBillingOwnershipForCompany` — ownership from company type,
   `assigned_firm_id`, and platform flag (reconciles if mode changes)

**Commercial mode rules:**

- `firm_internal` — `accounting_firm` assigned to itself
- `firm_managed` — non-firm workspace assigned to a non-platform accounting firm
- `self_serve` — everything else (including platform-assigned businesses)

**Hooks:**

- `createCompany` — provisions non–accounting-firm companies only (firms wait for self-assignment)
- Signup — `finalizeAccountingFirmBillingBootstrap` after `setupAccountingFirm`
- Demo seed — firms use `finalizeAccountingFirmBillingBootstrap`, then clients
  provision after them (`companies.fn.ts`)

`finalizeAccountingFirmBillingBootstrap` is intentionally stricter than plain
`provisionBillingForCompany`: it rejects calls before an accounting firm is
self-assigned, so firm bootstrap cannot silently land in `self_serve`.

`companies.assigned_firm_id` references `accounting_firms_meta.company_id`.

## Important constraints

- internal invoices are the source of truth
- providers execute payments but do not define billing logic
- one firm billing account has one settlement currency in v1
- client-facing sell currencies may differ from firm settlement currency
- billing mutations must be auditable and replay-safe
