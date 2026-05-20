# Billing Domain

Status: In progress
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

Requires a valid `refreshToken` cookie. The route is mounted after `verifyRefreshToken` on `/api` (session-authenticated only at launch; not public).

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
| 401    | Missing or invalid refresh token      |
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

## Important constraints

- internal invoices are the source of truth
- providers execute payments but do not define billing logic
- one firm billing account has one settlement currency in v1
- client-facing sell currencies may differ from firm settlement currency
- billing mutations must be auditable and replay-safe
