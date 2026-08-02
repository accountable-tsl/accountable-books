# Launch Pricing Reference

Status: draft working document (aligned with
[commercial-billing-platform-blueprint.md](./commercial-billing-platform-blueprint.md)
§1.2 launch decisions)

This document captures the current pricing recommendation for launch so the team has one place to review, revise, and productize over time.

The plan naming convention in this document is intentional:

- `firm_*` for accounting firm plans
- `business_*` for business client plans
- `individual_*` for individual plans

This is meant to be an internal commercial and product reference. Public pricing labels can change later without changing the internal plan IDs.

## Core Pricing Model

The launch model uses two commercial rails for business customers:

- `business_self_serve`: the business pays the platform directly
- `business_managed`: an accounting firm is the platform customer and pays the platform for that client

Accounting firms should be able to set what they charge their own clients separately from what they pay the platform.

For managed clients, keep these concepts separate:

- platform plan: the internal `business_*` tier assigned to the client
- platform wholesale price: what the firm owes the platform
- firm sell price: what the firm charges the client

Firms are charged per managed `business_*` workspace. There is no cap on how many managed business workspaces a firm can have, and billing starts from the first managed business workspace.

At launch, the platform also **collects from end-clients on the firm's behalf** at the firm's configured sell price and **remits net amounts to the firm** (see Platform collections below).

## Principles

- Firms can sign up for free.
- Firms always get unlimited employee seats.
- Firms always get their own bookkeeping workspace included.
- Each firm gets `1` internal firm workspace included at no subscription charge.
- Core bookkeeping should exist across all business plans.
- AI and automation usage should be billed with credits.
- `1 credit = $1`.
- Core bookkeeping access should not be billed with credits.
- Public display names can change later, but internal plan IDs should remain stable.

## Currency and settlement (launch)

- Each firm has **one platform settlement currency** on its firm billing account
  (typically USD or NGN from the firm's commercial profile).
- Platform **wholesale** and firm subscription amounts are charged in that currency.
- Firms may set **client sell prices** in other supported currencies.
- Client collections in non-settlement currencies are **normalized into the firm's
  settlement currency** for payout reporting (FX rate stored for audit).

## Platform collections (launch)

For firm-managed business workspaces:

1. the platform bills the firm **wholesale** in the firm's settlement currency
2. the platform invoices or charges the **end-client** at the firm's **sell
   price** (default policy or per-workspace override)
3. collected client funds flow through **payout periods**; the platform deducts
   fees and remits the net amount to the firm (manual approval at launch)

NGN launch note:

- NGN client collection is allowed at launch through a supported collection
  path
- Stripe may be used where operationally viable
- a Nigeria-local execution provider may be used where Stripe is insufficient,
  without changing the commercial billing model

## Firm Plans

### `firm_free`

- Price: `$0/mo`
- Intended customer: new and early-stage firms starting or validating a practice
- Employee seats: unlimited
- Firm workspace: `1` internal workspace included
- Included monthly credits: `$5`
- Extra included monthly AI credits per managed business workspace:
  - `business_basic`: `+$1`
  - `business_standard`: `+$3`
  - `business_premium`: `+$7`
- Managed client pricing: standard rack rate
- Branding: app subdomain only
- Support level: standard

Included capabilities:

- firm workspace
- client creation and invite flow
- bank sync and CSV import
- categorization
- journals
- ledgers
- basic client management

### `firm_standard`

- Price: `$149/mo`
- Intended customer: firms actively running and growing a real client base
- Employee seats: unlimited
- Firm workspace: `1` internal workspace included
- Included monthly credits: `$20`
- Extra included monthly AI credits per managed business workspace:
  - `business_basic`: `+$2`
  - `business_standard`: `+$5`
  - `business_premium`: `+$12`
- Managed client pricing: discounted from `firm_free`
- Branding: basic branding on client-facing touch points
- Support level: better than standard

Included capabilities:

- everything in `firm_free`
- lower per-client managed pricing
- better AI allowance
- client assignment and reviewer workflows
- stronger firm-level workflow and operational controls

### `firm_custom`

- Price: custom
- Intended customer: larger firms or firms with onboarding, support, branding, or commercial complexity that does not fit packaged plans

Typical commercial differences:

- lowest managed client pricing
- negotiated credit package
- onboarding and migration support
- deeper branding or operational support as available

Firm AI credits cover AI usage by **firm employees** on the firm's own workspace and on firm-managed business workspaces. Included credits are consumed first, and purchased credits are used after that.

**Client users** on firm-managed workspaces have a **separate client credit wallet** with their own included allowances (if any), top-ups, and auto-recharge. Client AI usage debits the **client** wallet, not the firm's.

## Business Plans

All business plans should include:

- core bookkeeping workspace
- unlimited manual bank accounts
- unlimited CSV imports
- categorization
- journals
- ledgers
- accountant collaboration

Business plans should primarily differ by complexity handled, connected banking allowance, currency support, and AI/support level.

### `business_basic`

- Best fit: simple books
- Currency support: single currency
- Connected bank accounts: `2`
- Included monthly AI credits for self-serve: `$5`
- Support: standard

Typical examples:

- very small businesses
- early-stage businesses
- businesses with straightforward monthly books

### `business_standard`

- Best fit: growing businesses
- Currency support: multicurrency enabled
- Connected bank accounts: `10`
- Included monthly AI credits for self-serve: `$15`
- Support: better than standard

Typical examples:

- businesses with more transaction volume
- businesses with more operational complexity
- cross-border businesses

### `business_premium`

- Best fit: high-complexity or high-touch books
- Currency support: multicurrency enabled
- Connected bank accounts: unlimited
- Included monthly AI credits for self-serve: `$40`
- Support: priority

Typical examples:

- businesses with heavy month-end work
- businesses requiring stronger oversight or tighter handling
- clients that need a more operationally demanding bookkeeping setup

## Individual Plans

### `individual_free`

- Price: `$0/mo` for now
- Intended customer: simple individual use cases
- Scope: limited initial launch use
- Currency support: single currency only

## Recommended Pricing

### Firm Pricing

| Plan            | Monthly price | Managed business workspaces            | Included monthly credits | Employee seats |
| --------------- | ------------: | -------------------------------------- | -----------------------: | -------------- |
| `firm_free`     |          `$0` | unlimited, billed from first workspace |                     `$5` | unlimited      |
| `firm_standard` |        `$149` | unlimited, billed from first workspace |                    `$20` | unlimited      |
| `firm_custom`   |        custom | unlimited, negotiated pricing          |                   custom | unlimited      |

### Business Self-Serve Pricing

These are the prices paid directly by businesses that are not managed commercially through a firm.

| Plan                | USD monthly |   NGN monthly |
| ------------------- | ----------: | ------------: |
| `business_basic`    |       `$89` | `NGN 135,000` |
| `business_standard` |      `$199` | `NGN 300,000` |
| `business_premium`  |      `$399` | `NGN 600,000` |

### Business Managed Pricing

These are the platform wholesale prices paid by firms for managed business workspaces.

Managed business workspaces do not receive separate **business-plan** included AI credits. Instead:

- the **firm** receives extra monthly credits per active managed workspace (by
  `business_*` tier) on top of the firm plan allowance
- **firm staff** AI on managed workspaces debits the **firm** credit pool
- **client users** on managed workspaces debit the **client** credit pool

| Business plan       | `firm_free` USD | `firm_standard` USD | `firm_free` NGN | `firm_standard` NGN |
| ------------------- | --------------: | ------------------: | --------------: | ------------------: |
| `business_basic`    |           `$39` |               `$35` |    `NGN 60,000` |        `NGN 52,500` |
| `business_standard` |           `$99` |               `$90` |   `NGN 150,000` |       `NGN 135,000` |
| `business_premium`  |          `$299` |              `$275` |   `NGN 450,000` |       `NGN 412,500` |

## Annual Billing

Annual billing should apply to fixed subscriptions and managed-workspace **wholesale**
commitments, not usage meters or credit top-ups.

- `firm_standard`: `2 months off`
- `business_self_serve` plans: `2 months off`
- managed workspace **wholesale** (firm pays platform): monthly or annual commitment
- client **sell-price** billing (platform collects for firm): monthly or annual to
  match the workspace commitment unless the firm configures otherwise
- usage credits: no annual discount
- annual subscribers still receive included AI credits **monthly**, not as one yearly bucket
- included monthly AI credits expire at the end of each monthly billing cycle and do not roll over

Firm invoice cycle stays **calendar-month**. An annual managed wholesale charge
appears on the firm's invoice in the commitment start or renewal month.

Examples:

- `firm_standard`: `$149/mo` or `$1,490/yr`
- `business_basic`: `$89/mo` or `$890/yr`
- `business_standard`: `$199/mo` or `$1,990/yr`
- `business_premium`: `$399/mo` or `$3,990/yr`
- `business_basic` (NGN): `NGN 135,000/mo` or `NGN 1,350,000/yr`
- `business_standard` (NGN): `NGN 300,000/mo` or `NGN 3,000,000/yr`
- `business_premium` (NGN): `NGN 600,000/mo` or `NGN 6,000,000/yr`

## AI Credit Rules

Included plan credit allowances are defined in explicit `credit units`, not in
wallet-currency minor units. This keeps the entitlement layer stable across USD
and NGN billing accounts.

Launch conversion policy:

- `1 credit unit = $1.00 USD` of reference value for product/pricing
  communication
- top-ups and invoice charges are still taken in the billing account currency
- purchase and wallet flows should convert currency amounts into `credit units`
  explicitly rather than treating credits as raw cents or kobo

- included monthly AI credits reset each monthly billing cycle
- included monthly AI credits do not roll over
- included monthly AI credits expire at the end of the billing cycle
- purchased AI credits are used only after included credits are exhausted
- purchased AI credits do not expire while the account remains active

**Who is charged:**

| Actor         | Workspace                     | Wallet debited |
| ------------- | ----------------------------- | -------------- |
| Firm employee | Firm internal workspace       | Firm           |
| Firm employee | Firm-managed client workspace | Firm           |
| Client user   | Firm-managed client workspace | Client         |
| Business user | Self-serve business workspace | Business       |

**Per-managed-workspace firm bonuses (monthly grant):**

In addition to the firm plan's base included credits, grant the following **per
active managed business workspace** each firm billing month:

| Firm plan       | `business_basic` | `business_standard` | `business_premium` |
| --------------- | ---------------: | ------------------: | -----------------: |
| `firm_free`     |            `+$1` |               `+$3` |              `+$7` |
| `firm_standard` |            `+$2` |               `+$5` |             `+$12` |

The firm's internal workspace does not count as a managed workspace for this bonus.

For annual subscriptions:

- included AI credits are still granted monthly (base + per-workspace bonuses)
- annual billing does not create a single front-loaded yearly AI credit balance

For mid-cycle managed workspace additions:

- the per-workspace monthly credit bonus is **prorated** by remaining days in
  the firm's current billing month

## Auto-Recharge Rules

Auto-recharge may be enabled for:

- `firm_*`
- paid `business_*` (self-serve)
- **client billing accounts** on firm-managed workspaces
- `individual_*` if credit purchases are enabled for the plan

Users may choose their own auto-recharge threshold and recharge amount, subject to platform minimums and safety rules.

Recommended guardrails:

- minimum auto-recharge threshold: `$10`
- minimum auto-recharge amount: `$25`
- recharge amount should be greater than or equal to the threshold
- optional maximum single auto-recharge cap
- optional monthly auto-recharge cap

## How Firms Should Price Their Own Clients

The platform should not force firms to charge their clients the same amount the firm pays the platform.

Recommended approach:

- the platform defines internal `business_*` plans
- the platform bills the firm a wholesale rate for managed clients
- the firm chooses its own sell price to the end-client
- the firm can override pricing per client

This allows firms to price by:

- fixed monthly amount
- expected effort
- monthly expenses
- relationship or service package

At launch, the platform **does** invoice or charge clients on the firm's behalf at
the sell price; it does **not** meter by client monthly expenses in `v1`.

## Custom firm deals (`firm_custom`)

Launch workflow (admin-managed):

1. create a **price agreement** on the firm billing account
2. attach the firm subscription to that agreement
3. resolve entitlements from plan catalog features, not ad hoc flags
4. optional provider sync; internal entitlements must work without self-serve checkout

## v1 Guidance

For launch:

- keep platform billing tier-based
- use expense bands only as internal or onboarding guidance
- do not meter self-serve billing by monthly expenses in `v1`
- do not meter managed client billing by monthly expenses in `v1`
- allow firms to set their own client-facing prices independently
- use **internal invoices** as source of truth; payment provider calculates tax
  where supported and results are stored on invoice records

## Open Questions For Future Revisions

- whether `individual_free` should remain free permanently or become a limited funnel product
- whether multicurrency should be the main upgrade driver from `business_basic` to `business_standard`
- whether `business_premium` should remain fully packaged or become partly sales-led for the most demanding clients
- Nigeria-local payment execution provider when Stripe is insufficient for NGN
  collections (commercial amounts remain NGN on the firm billing account)
