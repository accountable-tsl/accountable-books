# Commercial Billing Platform Blueprint

## 1. Purpose

This document defines the backend architecture we should build for billing in
Accountable Books before launch.

It is intentionally more opinionated than the current mock-backed billing UI.
The goal is not to make the existing settings screens work as quickly as
possible. The goal is to build the commercial billing platform we would be
happiest owning long term.

This document assumes:

- product has not launched yet
- backend schema changes are allowed
- existing early billing contracts can be replaced
- payment execution may vary by provider, country, or currency over time

## 1.1 How To Read This Doc

This document now serves two purposes:

- define the long-term billing architecture we want to own
- define a practical launch implementation cut that gets us to a real working
  billing loop quickly

Not everything in this blueprint should be built in the first implementation.

We should classify items into:

- `Build now`: launch-critical and worth implementing immediately
- `Safe to build now if cheap`: small additions that reduce future rework
- `Design for now, defer implementation`: keep in the architecture, do not
  prioritize in the first slice
- `Do not build yet`: likely to create complexity before we have real demand

## 1.2 Launch Product Decisions (Locked)

These decisions are aligned across product, [launch-pricing.md](./launch-pricing.md),
and this blueprint. Implementation should treat them as fixed unless explicitly
reopened.

### Platform collections and firm payouts

- The platform **collects money from end-clients** on the firm's behalf using the
  firm's configured **sell price** (default policy or workspace override).
- The platform **bills the firm wholesale** separately for managed workspaces and
  firm subscription.
- The platform **remits net amounts to firms** via payout periods and payout
  ledger entries (manual approval at launch).

### Currency and settlement

- Each firm has **one platform billing / settlement currency** on its firm billing
  account (`invoice_currency_code`).
- Platform **wholesale** charges, firm subscription charges, firm invoices, and
  payout statements are expressed in that currency.
- Firms may set **client-facing sell prices** in other supported currencies.
- When client collections occur in a currency different from the firm's
  settlement currency, the platform records the **collection currency and amount**
  and **normalizes into the firm's settlement currency** for payout reporting
  (store `source_currency_code`, `source_amount_minor`, and `fx_rate_reference`
  on payout ledger entries).
- NGN client collection is allowed at launch through a supported launch
  collection path. Stripe may be used where operationally viable, but the
  architecture must allow a Nigeria-local provider or launch-specific rail
  without changing billing-domain truth.
- Do **not** force a USD-only internal commercial ledger.

### Subscriptions and commitments

- Firm, self-serve business, and managed-workspace **wholesale** commitments may
  be **monthly or annual**.
- The firm billing account keeps a **calendar-month invoice cycle**; annual
  wholesale charges appear on the firm's invoice stream in the start or renewal
  month.

### Credits

- Included and purchased AI credits are tracked in explicit `credit units`, not
  wallet-currency minor units.
- Launch conversion policy: `1 credit unit = $1.00 USD` of reference value for
  pricing communication, while purchase flows still convert billing-account
  currency amounts into credit units explicitly.

### Invoices

- **`invoice_documents` are the internal source of truth** for invoice structure,
  lines, and lifecycle.
- Payment providers (Stripe first) execute collection and may calculate tax where
  supported; results are **snapshotted** onto internal invoice documents and line
  items on sync/webhook.
- Payment state (`amount_paid`, status) is reconciled from the provider; internal
  line structure remains authoritative for product and firm-facing reporting.

### Included firm workspace

- Each firm's **one internal firm workspace** is included at **no wholesale or
  subscription charge**.
- It must **not** receive a `managed_workspace_plan_assignment` or wholesale
  `commercial_charge`.

### Credits

- Firms receive **base included monthly credits** from their `firm_*` plan plus
  **additional monthly grants per active managed workspace** based on assigned
  `business_*` tier (see launch-pricing).
- **AI usage debits the billing account of whoever is using the product:**
  - **firm staff** (including on a client workspace) → **firm** billing account
    wallet
  - **client users** on that workspace → **client** billing account wallet
- Managed-workspace **clients have their own billing account**, credit wallet,
  top-up, and auto-recharge (even when the firm pays platform wholesale).
- Mid-cycle managed-workspace additions use **prorated** per-workspace included
  credit grants based on remaining days in the firm's current billing month.

### Custom firm deals (`firm_custom`)

- Sales/ops creates an admin-managed **`billing_price_agreement`** on the firm
  billing account.
- The firm's **`billing_subscriptions`** row references that agreement for
  pricing.
- Custom capability comes from **plan catalog features + entitlements**, not ad
  hoc feature flags.
- Self-serve checkout for `firm_custom` is out of scope at launch.

### Promotions (launch cut)

- **Durable deals** → `billing_price_agreements` (admin-created).
- **Time-bound discounts** → simple `billing_promotions` (admin-created; optional
  single code at checkout/change).
- Provider coupons are **not** product truth; mirror totals when syncing only.
- Defer: complex stacking, campaign tooling, marketplace-style promo management.

### Tax

- Where the provider supports it (e.g. Stripe Tax / automatic tax), tax is
  **calculated by the provider** at invoice issue and **persisted** on internal
  `invoice_documents` and `invoice_line_items`.
- Where unsupported, tax fields are zero and tax treatment is documented on the
  invoice profile.

## 2. Core Decision

We should build billing as an internal commercial system with pluggable payment
execution providers.

We should not build:

- a thin Stripe adapter
- a UI-shaped API backed by ad hoc tables
- a billing system whose core rules live in provider metadata

We should build:

- an internal pricing catalog
- an internal subscription and commercial charge engine
- an internal credit ledger
- an internal entitlement resolver
- invoice assembly and billing read models
- provider adapters for payment execution, customer portal, checkout, and
  webhook reconciliation

Stripe can be the first execution provider, but it must not become the system
of record for product billing logic.

## 2.1 Launch Build Classification

### Build now

- plan catalog
- billing accounts
- workspace billing ownership
- subscriptions (including references to admin price agreements for `firm_custom`)
- simple entitlement resolver
- provider boundary with Stripe as the first execution provider
- webhook event storage and replay-safe processing
- plan management snapshot and preview read models
- manage-plan checkout and commit flows
- credit ledger with **actor-based debit resolution** (firm staff vs client user)
- credit wallet read model, top-up checkout, and auto-recharge per billing account
- **per-managed-workspace monthly credit grant** job
- **internal `invoice_documents` + line items** as source of truth with provider
  sync and tax snapshots
- `commercial_charges`, `invoice_runs`, and charge allocation
- **client sell-price invoicing/collection** on the firm's behalf
- payout periods and payout ledger entries (including FX normalization fields)
- firm-facing payout statement and overview read models
- manual payout approval and payout marking workflow
- admin-managed **price agreements** and **simple promotions**
- default managed workspace sell pricing and per-workspace overrides

### Safe to build now if cheap

- billing audit events
- explicit billing cycle fields
- strict enums for billing ownership and payer fields
- tax-ready invoice fields (populated from provider where supported)
- unique constraints for webhook dedupe and charge idempotency
- basic admin/support billing inspection views
- `is_firm_internal_workspace` (or equivalent) exclusion for included firm workspace

### Design for now, defer implementation

- payout automation and scheduled remittance
- self-serve promotion campaigns and broad promo-code UX
- accounting bridge
- second payment provider (e.g. Nigeria-local rail) beyond thin adapter prep
- provider migration workflows
- formal multi-settlement-currency firms (more than one firm settlement account)

### Do not build yet

- complex promotion stacking
- internal tax engine automation (provider-calculated tax is sufficient at launch)
- cross-currency **wholesale** per managed workspace (firm has one settlement
  currency; client sell/collection currencies are separate)
- generalized partner pricing systems
- fully abstract provider capability matrices

## 3. Context From The Current Codebase

### 3.1 What is useful today

The following assets are useful inputs:

- the pricing model in
  [launch-pricing.md](/Users/temi/codebase/accountable-books/my-notes/pricing/launch-pricing.md)
- the product direction in
  [settings-billing-page.tsx](/Users/temi/codebase/accountable-books/apps/web/src/features/settings/pages/settings-billing-page.tsx)
- the plan management UX in
  [manage-plan-dialog.tsx](/Users/temi/codebase/accountable-books/apps/web/src/features/settings/billing/manage-plan/manage-plan-dialog.tsx)
- the existing API domain structure in `apps/api/src/domains`
- the existing accounting ledger domain in
  [apps/api/src/domains/ledgers](/Users/temi/codebase/accountable-books/apps/api/src/domains/ledgers)
- the existing AI pricing precision model in
  [ai-pricing.model.ts](/Users/temi/codebase/accountable-books/apps/api/src/domains/ai/telemetry/ai-pricing.model.ts)

### 3.2 What should not drive the design

The existing billing contracts file in
[packages/contracts/accountable_contracts/schema/source/accounting/billing.ts](/Users/temi/codebase/accountable-books/packages/contracts/accountable_contracts/schema/source/accounting/billing.ts)
should not be treated as the canonical billing design.

It should be replaced by a new contract structure that mirrors the actual commercial domain.

### 3.3 Important architectural constraint

The accounting ledger domain and the billing domain are not the same thing.

The ledger domain is for accounting truth and double-entry posting.

The billing domain is for:

- commercial plans
- ownership of charges
- credit balances and consumption
- invoice assembly
- subscription changes
- firm-managed workspace wholesale billing

We should allow billing to publish into accounting later, but we should not make
the accounting ledger the billing engine.

## 4. Product Model We Are Building

The launch commercial model has four major customer rails:

- firm subscription billing
- business self-serve subscription billing
- firm-managed workspace **wholesale** billing (firm pays the platform)
- **client sell-price billing** where the platform invoices or charges the
  end-client on the firm's behalf at the firm's configured sell price

The system also includes:

- AI and automation credits
- top-up purchases
- auto-recharge
- invoices
- payment methods
- payout statements and remittance support because platform collections and
  remittance are in scope

The most important product separation is:

- platform plan assigned to a workspace
- platform wholesale price billed by the platform
- firm sell price charged by the firm to the managed customer

These are separate records and must remain separate in storage, APIs, and
business rules.

### 4.1 Current launch scope versus future scope

For launch, the pricing model is primarily defined around managed `business_*`
workspaces.

However, the backend billing model should not assume that only businesses can be
firm-managed forever.

Individuals may also become firm-managed later.

Because of that:

- plan families should remain `firm`, `business`, and `individual`
- generic firm-managed backend concepts should prefer `managed_workspace` or similar
- business-specific behavior should only be encoded where the launch product truly
  requires it

## 5. Design Principles

### 5.1 Internal IDs are stable

Internal plan IDs such as `firm_free`, `firm_standard`, `business_basic`, and
`business_premium` are stable product identifiers. Public labels may change, but
internal IDs must not.

### 5.2 Billing ownership is explicit

Every workspace must have one clear billing owner for platform charges at any
point in time.

### 5.3 Entitlements are first-class

We should not infer product capability by reading a few subscription fields.
Entitlements must be resolved intentionally and consistently.

### 5.4 Credits are ledgered, not just balanced

Credit balances must be backed by append-only entries. A cached current balance
is fine, but it cannot be the source of truth.

### 5.5 Invoice lines are derived from charge records

Invoices should be assembled from commercial charges and allocations, not from
scattered queries over unrelated product tables.

### 5.6 Providers are execution layers

Payment providers should execute payment-related actions. They should not own:

- plan catalog semantics
- entitlement semantics
- firm-managed workspace wholesale logic
- credit bucket rules

### 5.7 Accounting integration is downstream

Commercial billing should be able to emit accounting events, but commercial
state should not depend on GL posting in order to function.

### 5.8 Financial history is append-only where it matters

We should strongly prefer append-only or range-bounded history for:

- subscriptions
- ownership changes
- wholesale rate snapshots
- credit entries
- invoice records
- provider webhook receipts

We should avoid soft-deleting financial history. If something changes, we should
end-date, supersede, void, reverse, or mark inactive rather than erase the
record.

If the platform collects money on behalf of firms or later remits money to
firms, payout history must be reconstructable at statement level. Firms should
be able to see, for any relevant period:

- how much the platform collected from their clients
- how much the platform deducted
- what adjustments were made
- what was paid out
- what balance remains

### 5.9 Provider mappings are separate from product catalog

Internal plan prices and provider price objects are not the same concept.

We should keep:

- internal plan and price definitions in our own catalog
- provider product and price identifiers in a separate mapping layer

This prevents provider objects from becoming accidental product truth.

Important clarification:

- provider price mappings are only for fixed provider-priced catalog items
- they are not the source of truth for dynamic invoice math such as managed
  workspace wholesale aggregation, prorations, topups, or other internally
  assembled charges

Dynamic billing amounts should be computed internally and then billed through
our charge and invoice model, even if a provider later hosts collection or the
final invoice document.

### 5.10 Idempotency is a first-class requirement

Billing workflows must tolerate retries safely.

This applies to:

- checkout creation
- webhook processing
- charge generation
- invoice assembly
- credit consumption
- auto-recharge execution

### 5.11 Naming must follow the commercial model

Canonical backend nouns should be:

- `firm`
- `business`
- `individual`

When we need a generic term for a non-firm workspace billed through a firm, the
canonical backend term should be `managed_workspace` or similar.

We should reserve `client` mostly for:

- UX copy aimed at firms
- support conversations
- relationship language where a firm calls a managed customer its client

This means backend tables, contracts, and APIs should prefer:

- `business` when we specifically mean business accounts or `business_*` plans
- `individual` when we specifically mean individual accounts or
  `individual_*` plans
- `managed_workspace` when the concept must work for either business or
  individual firm-managed workspaces

### 5.12 Billing cycles must be explicit

Every billing account should have a clear billing cycle.

This matters especially for firms with many managed workspaces. We should not
accidentally create a different billing day per managed workspace unless we
explicitly decide to.

Default rule:

- firm subscription charges and managed workspace wholesale charges should align
  to the firm billing cycle
- in v1, firm billing accounts should default to calendar-month invoicing
- one billing account should have one invoice and settlement currency at a time
- invoices should not mix currencies
- subscription currency changes should be formal state changes, not ad hoc edits

We also need to distinguish:

- invoice cycle: when the billing account is invoiced
- subscription interval: the commercial duration of a specific commitment such
  as monthly or annual

These are related but not identical.

For pricing selection, we should also distinguish:

- billing account commercial profile: the payer's billing country and invoice
  currency
- user location: where a user happens to be physically present when initiating
  a billing action

Pricing should be selected from the billing account commercial profile, not
from browser or IP location.

We also need to distinguish:

- platform billing or settlement currency: the currency in which the platform
  invoices and settles with the firm
- client-facing sell currency: the currency in which a firm may choose to price
  a managed workspace for its client
- collection currency: the currency a client actually pays in when the platform
  collects funds

These do not all need to be the same.

Launch recommendation:

- one firm should usually have one billing account
- that billing account should have one invoice and settlement currency
- firms may still have managed workspaces priced to end clients in other
  supported currencies
- cross-currency client collections should be normalized into the firm's
  settlement currency for payout statements and remittance

We should not create one firm billing account per client-facing currency unless
the business explicitly chooses a more complex multi-settlement model later.

Important rule:

- a firm can have one monthly invoice cycle while carrying a mix of managed
  workspace commitments
- one managed workspace may be monthly while another is annual
- annual managed workspace commitments should not force every managed workspace
  under that firm onto annual billing

For managed workspaces that become firm-managed mid-cycle:

- ownership should transfer at an explicit `effective_at`
- the first firm-paid charge should be prorated to the next firm cycle boundary
- after that, the workspace should follow the firm billing account cycle

For firm subscriptions:

- the first paid period may be a prorated stub period so future renewals align
  to the calendar-month firm cycle

For annual managed workspace commitments:

- the commitment start and end dates should still align to the firm billing
  cycle boundary
- the annual charge can appear on the firm monthly invoice stream at the start
  or renewal month without requiring a separate billing account anchor

### 5.13 Launch product states must be explicit

Even if the first implementation keeps state machines simple, we should be
explicit about product-relevant billing states.

At minimum, we should model for:

- `trialing`
- `active`
- `past_due`
- `suspended`
- `cancel_scheduled`
- `canceled`
- `payment_failed`

The entitlement resolver should ultimately use these states to determine access.

### 5.14 Pricing agreements and promotions are first-class

The system must support:

- firm-level default sell pricing for managed customer plans
- workspace-specific price overrides
- negotiated pricing
- lifetime pricing
- time-bound special pricing
- promotional discounts and promo codes
- conditional discounts based on subject, plan, interval, market, or campaign

These should be modeled internally, not delegated to a provider-only coupon
system.

**Launch cut:** admin-managed price agreements (required for `firm_custom`) and
simple admin promotions; defer complex stacking and campaign tooling (see
§1.2).

## 6. Target Architecture

We should create a new backend domain:

- `apps/api/src/domains/billing`

Inside it, we should structure the system into subdomains:

- `catalog`
- `accounts`
- `ownership`
- `subscriptions`
- `managed-workspaces`
- `pricing-agreements`
- `credits`
- `charges`
- `invoices`
- `entitlements`
- `providers`
- `read-models`
- `webhooks`

### 6.1 High-level responsibility map

`catalog`

- defines plans, prices, intervals, currencies, features, recommendation flags

`accounts`

- defines the internal payer layer and provider customer linkage
- stores invoice profile and tax identity data needed for billing documents
- stores payment methods and payout accounts
- owns billing cycle configuration
- owns the platform billing and settlement currency used for invoicing and
  payouts to that payer

This is intentionally separate from `companies` or workspaces.

`companies` identify product entities.

`billing_accounts` identify who the platform bills.

That separation is what allows:

- one firm to pay for many managed workspaces
- a workspace to move from self-serve to firm-managed later
- payer-linked data such as invoice currency, payment methods, and provider
  customer IDs to live in one place

`ownership`

- answers who pays for each workspace
- tracks transitions from self-serve to firm-managed and vice versa

`subscriptions`

- handles fixed recurring subscriptions
- handles upgrade, downgrade, cancellation, annual/monthly changes

`managed-workspaces`

- stores platform plan assignment for firm-managed workspaces
- resolves wholesale rates from firm plan plus managed workspace plan plus
  currency
- stores firm-level default sell pricing
- stores workspace-specific sell price overrides
- keeps client-facing sell pricing logically separate from the platform billing
  and settlement currency of the firm

`pricing-agreements`

- stores negotiated pricing, lifetime pricing, promotional discounts, and
  conditional special pricing
- separates durable price agreements from short-lived promotional campaigns

`credits`

- stores grants, purchases, consumption, expiry, reset rules, and auto-recharge

`charges`

- stores billable commercial events before invoicing

`invoices`

- groups charges into invoice documents and line items

`entitlements`

- resolves what a workspace and its users are allowed to do

`providers`

- executes provider-specific operations through adapters

`read-models`

- serves page-specific aggregates for settings and future billing views

`webhooks`

- ingests external provider events and reconciles them into internal billing
  state

### 6.2 Shared storage conventions

The schema should follow these conventions.

- Use UUIDv7 IDs for new billing tables where possible.
- Use integer minor units for money such as cents, kobo, or pence.
- Use integer micros only where a much finer pricing granularity is required.
- This is a billing-domain standard, not an app-wide forced storage standard.
- Existing accounting, FX, and ledger domains may continue using decimal or
  numeric storage where that is the better fit.
- New commercial billing tables should default to minor units, and new
  fine-grained usage pricing tables may use micros where sub-cent precision is
  required.
- Use `effective_at` and `ended_at` for historical records that can change over
  time.
- Prefer statuses and end-dating over `is_deleted` for financial records.
- Add `created_at` and `updated_at` on mutable operational tables even if not
  spelled out in every list below.
- Add audit user references on user-triggered changes where practical.
- Prefer explicit `subject_type` and `subject_id` pairs where a rule can target
  multiple commercial subjects.
- Prefer generic workspace-targeting names where a concept may later apply to
  both `business_*` and `individual_*` plan families.
- Prefer explicit database constraints for idempotency and uniqueness, not just
  application-level checks.

### 6.3 Non-negotiable domain invariants

The implementation should enforce these invariants.

- A workspace has at most one active billing ownership record at a time.
- A workspace has at most one active payable commercial arrangement for
  platform software billing at a time.
- A billing account has at most one active fixed subscription per plan family at
  a time.
- A managed workspace has at most one active platform plan assignment at
  a time.
- A managed workspace has at most one active billing interval and commitment
  window at a time for its platform plan assignment.
- A managed workspace should resolve to at most one active sell price at a time
  after default policy plus override resolution.
- A billing account invoice cycle and a managed workspace subscription interval
  must be modeled separately and must not be conflated.
- The primary billing UI should present one billing-account invoice period at a
  time, which for v1 is the current calendar month.
- Monthly commitments should be charged in advance for the next month.
- Annual commitments should be charged in advance for the next year.
- A billing subject should not receive overlapping active price agreements of
  the same precedence and effect type unless explicitly supported.
- Price resolution order should be explicit and deterministic:
  workspace override, then durable price agreement, then promotion, then base
  catalog or wholesale price.
- Promotion stacking should be disabled by default unless a promotion explicitly
  allows stacking.
- Every credit grant must create at least one corresponding wallet entry.
- Charges must be idempotent for a given business cause and billing period.
- Invoice documents become immutable after issuance except for voiding or credit
  adjustment flows.
- Credit consumption must always point to the grant or entry it consumed from.
- Provider webhooks must be replay-safe and deduplicated.
- All billing mutations must emit an audit event.
- The firm's included internal workspace must never generate managed wholesale
  charges or managed-workspace assignments.
- AI credit consumption must resolve to exactly one billing account per usage
  event using actor type (`firm_user` vs `client_user`), not workspace alone.
- Every active managed workspace on a paying firm must be eligible for a monthly
  per-workspace included credit grant when the firm plan defines one.

## 7. Domain Model

### 7.1 Billing account

A billing account is the commercial customer account inside our platform.

Examples:

- a firm paying the platform for its own subscription and managed workspaces
- a business paying the platform directly for a self-serve subscription
- a **managed workspace client** with its own wallet, top-ups, and client-facing
  invoices even when the firm pays wholesale

A billing account is not a replacement for `companies`.

It is a linked payer record for a company or workspace that can own:

- subscriptions
- payment methods
- provider customer references
- invoice currency
- billing cycle state
- charges, credits, and invoices

In v1, we should usually expect:

- **one firm billing account** per firm (settlement currency for wholesale,
  subscription, and payouts)
- **one billing account** per self-serve business or individual workspace
- **one client billing account** per firm-managed workspace that can incur
  client-facing sell-price charges and client AI usage

A billing account should have:

- internal ID
- owner type
- owning company or firm reference
- invoice currency
- invoice profile and tax identity
- provider customer references
- status fields
- billing cycle fields

### 7.2 Workspace billing ownership

Workspace billing ownership is the canonical answer to:

- who pays the platform for this workspace right now
- which billing account owns the charges
- which commercial rail this workspace belongs to

This must be a dedicated model, not an inferred property spread across company
flags or role conditions.

For firm-managed workspaces, ownership should also link:

- which **firm billing account** pays wholesale
- which **client billing account** receives sell-price invoices and client AI
  wallet debits

### 7.3 Included firm workspace

Each firm receives one internal firm workspace at no platform subscription or
wholesale charge.

Implementation convention:

- mark the workspace as firm-internal (e.g. `is_firm_internal_workspace` on the
  company/workspace record, or `commercial_mode = firm_internal` on ownership)
- do **not** create `managed_workspace_plan_assignments` for it
- exclude it from managed wholesale charge generation and managed-workspace
  credit bonus grants

### 7.4 Plan catalog

The plan catalog defines:

- plan key
- plan family: `firm`, `business`, `individual`
- plan kind: `free`, `paid`, `custom_contact`
- public name
- billing intervals allowed
- price by currency
- included monthly credits
- feature metadata
- recommendation metadata

### 7.5 Subscription

A subscription covers fixed recurring plan commitments billed to a billing
account.

Examples:

- `firm_standard` monthly
- `firm_standard` annual
- `business_basic` self-serve monthly

A subscription does not represent:

- credit topups
- one-off adjustments

Managed workspace billing needs a distinction:

- fixed commitment metadata such as monthly versus annual interval belongs on
  the managed workspace assignment or a closely related schedule record
- generated wholesale charges still remain charge records, not subscriptions, if
  the platform chooses not to model each managed workspace commitment as a full
  provider subscription

### 7.6 Managed workspace commercial assignment

For a firm-managed workspace, we need three separate things:

- assigned platform plan
- assigned billing interval
- wholesale rate charged by the platform
- firm sell price charged by the firm to the managed customer

The wholesale rate should be derived by policy, but the derived result should be
stored when it becomes billable so invoices remain auditable.

The model must support mixed intervals within one firm.

Example:

- one managed workspace can be on a monthly plan
- another managed workspace under the same firm can be on an annual plan

The firm still has one billing account and one invoice cycle, but each managed
workspace assignment can carry its own commitment interval and commitment
window.

### 7.7 Firm sell pricing

We need two levels of firm-defined sell pricing:

- a firm default pricing policy for each managed customer plan
- a managed workspace-specific override when that workspace should not use the
  default price

This allows firms to set standard pricing while still supporting bespoke terms
for specific managed workspaces.

### 7.8 Pricing agreements and promotions

We also need first-class support for pricing changes that affect what the
platform charges firms, businesses, individuals, or firm-managed workspaces.

These include:

- negotiated special pricing
- lifetime pricing
- partner pricing
- launch pricing
- time-bound promotions
- promo code campaigns
- conditional discounts by subject, plan, interval, currency, or country

This should be modeled as internal pricing agreements and promotions so the same
logic works regardless of provider.

**Launch cut:**

- **Price agreements:** admin-created durable deals (required for `firm_custom`).
- **Promotions:** admin-created time-bound discounts; optional single redeem code
  at checkout or plan change; no complex stacking.
- Stripe coupons mirror totals only; they are not product truth.

**Custom firm (`firm_custom`) workflow:**

1. admin creates `billing_price_agreement` on the firm billing account
2. admin assigns `firm_custom` (or equivalent) subscription referencing the
   agreement via `pricing_reference_type` / `pricing_reference_id`
3. entitlements resolve from catalog plan features plus agreement overrides
4. provider subscription sync is optional; internal entitlements must work
   without waiting for Stripe

### 7.9 Credits

Credits should support these buckets:

- included monthly credits (firm base plan allowance)
- included monthly **per-managed-workspace** bonuses (by assigned `business_*`
  tier; see launch-pricing)
- gifted credits
- purchased credits
- negotiated credits if needed later

Credit rules:

- included monthly credits expire at cycle end
- included monthly credits are granted monthly even on annual plans
- purchased credits do not expire while the account remains active
- included credits are consumed before purchased credits
- manual topups and auto-recharge executions should create durable purchase
  records before they create grants, charges, or provider executions

**Actor-based debit resolution (launch):**

Each AI usage event must carry `workspace_company_id` and `actor_type`:

- `firm_user` → debit the **firm** billing account wallet (including firm staff
  working inside a client workspace)
- `client_user` → debit the **client** billing account wallet for that managed
  workspace

Managed-workspace clients have their own billing account, wallet, top-up, and
auto-recharge policies.

**Per-managed-workspace grant job (launch):**

At each firm billing cycle boundary (or monthly grant job aligned to firm cycle):

1. grant base firm included credits from the active `firm_*` subscription
2. for each active managed workspace assignment (excluding firm-internal
   workspace), grant the plan-tier bonus defined in launch-pricing
3. mid-cycle workspace adds prorate the bonus by remaining days in the firm's
   current billing month
4. the proration rule and rounded grant amount must be persisted on the grant
   metadata for audit and support investigation

### 7.10 Commercial charges

A commercial charge is the normalized billable event from which invoices are
built.

Examples:

- firm subscription charge
- managed workspace wholesale charge for a monthly or annual commitment
- usage overage charge if introduced later
- credit purchase charge
- adjustment or credit memo

A charge should preserve both:

- what service or commitment window it covers
- when it is intended to be invoiced

Those are not always the same thing, especially for annual commitments billed
in advance on a monthly invoice stream.

### 7.11 Client sell-price charges and invoices

For managed workspaces, the platform invoices or charges the end-client on the
firm's behalf using the resolved sell price (firm default policy or workspace
override).

- sell-price amounts are stored in the **client's sell currency** on policies and
  overrides
- `commercial_charges` with `charge_type = client_sell_subscription` (or similar)
  attach to the **client billing account**
- `invoice_documents` on the client billing account are internal source of truth;
  provider sync follows the same rules as firm invoices
- successful client collections create **`payout_ledger_entries`** on the firm's
  open `payout_period`, normalized to the firm's settlement currency when needed

### 7.12 Entitlements

Entitlements are the product-facing effect of billing state.

Examples:

- support tier
- included monthly credit amount
- branding allowance
- workspace limit
- managed-workspace pricing tier
- multicurrency availability

We should build a formal entitlement resolver, not just read raw plan rows in
feature code.

## 8. Relationship To The Accounting Ledger

The billing system should not directly depend on the existing ledger domain for
core operation.

### 8.1 Why

The ledger domain is optimized for accounting transactions and double-entry
rules. Commercial billing has different needs:

- plan changes
- external provider reconciliation
- credit grant lifecycle
- charge aggregation
- upcoming bill estimates

These are not naturally modeled as journal entries.

### 8.2 Correct integration model

Billing should optionally publish downstream accounting events such as:

- recognized subscription revenue
- credit liability changes
- payout liabilities

That bridge can be introduced later through a dedicated translator layer.

### 8.3 Decision

Build a commercial billing ledger and state model first.

Do not route commercial billing state through `ledgers` as the primary storage
layer.

## 9. Proposed Database Schema

This section describes the target schema shape, not final SQL.

### 9.1 Catalog tables

`billing_plan_catalog`

- `id`
- `plan_key`
- `plan_family`
- `plan_kind`
- `display_name`
- `public_label`
- `is_active`
- `metadata`

`billing_plan_catalog_prices`

- `id`
- `plan_catalog_id`
- `currency_code`
- `billing_interval`
- `unit_amount_minor` (`bigint`)
- `effective_at`
- `expires_at`

`billing_plan_catalog_provider_prices`

- `id`
- `billing_plan_catalog_price_id`
- `provider_key`
- `provider_product_id`
- `provider_price_id`
- `country_code`
- `status`
- `effective_at`
- `expires_at`

`billing_plan_features`

- `id`
- `plan_catalog_id`
- `feature_code`
- `feature_value_json`
- `effective_at`
- `expires_at`

### 9.2 Account and provider tables

`billing_accounts`

- `id`
- `owner_type`
- `owner_company_id`
- `invoice_currency_code`
- `status`
- `billing_cycle_anchor_day`
- `billing_timezone`
- `current_billing_period_start_at`
- `current_billing_period_end_at`
- `created_at`

`billing_account_profiles`

- `id`
- `billing_account_id`
- `legal_entity_name`
- `billing_email`
- `billing_country_code`
- `tax_id`
- `tax_id_type`
- `tax_exemption_code`
- `address_json`
- `updated_at`

`billing_account_provider_customers`

- `id`
- `billing_account_id`
- `provider_key`
- `provider_customer_id`
- `provider_account_scope`
- `status`
- `metadata`

`billing_payment_methods`

- `id`
- `billing_account_id`
- `provider_key`
- `provider_payment_method_id`
- `brand`
- `last4`
- `exp_month`
- `exp_year`
- `is_default`
- `status`

`billing_payout_accounts`

- `id`
- `billing_account_id`
- `provider_key`
- `provider_payout_account_id`
- `display_name`
- `last4`
- `status`

### 9.3 Ownership and managed workspace tables

`workspace_billing_ownership`

- `id`
- `workspace_company_id`
- `billing_account_id`
- `client_billing_account_id`
- `commercial_mode`
- `software_payer`
- `workspace_ai_payer`
- `effective_at`
- `ended_at`

`workspace_ai_payer` is supplemental launch metadata for ownership and display
purposes. Actor-based debit resolution remains authoritative for actual credit
consumption and wallet debiting.

`managed_workspace_plan_assignments`

- `id`
- `managed_workspace_company_id`
- `firm_billing_account_id`
- `platform_plan_key`
- `currency_code`
- `billing_interval`
- `current_commitment_start_at`
- `current_commitment_end_at`
- `effective_at`
- `ended_at`

`managed_workspace_wholesale_prices`

- `id`
- `firm_billing_account_id`
- `firm_plan_key`
- `managed_plan_key`
- `currency_code`
- `billing_interval`
- `amount_minor`
- `effective_at`
- `ended_at`

`firm_sell_price_policies`

- `id`
- `firm_billing_account_id`
- `managed_plan_key`
- `currency_code`
- `billing_interval`
- `amount_minor`
- `pricing_strategy`
- `effective_at`
- `ended_at`

`managed_workspace_sell_price_overrides`

- `id`
- `managed_workspace_company_id`
- `firm_billing_account_id`
- `currency_code`
- `billing_interval`
- `amount_minor`
- `override_reason`
- `effective_at`
- `ended_at`

`managed_workspace_wholesale_rate_snapshots`

- `id`
- `managed_workspace_company_id`
- `firm_billing_account_id`
- `firm_plan_key`
- `platform_plan_key`
- `currency_code`
- `billing_interval`
- `amount_minor`
- `effective_at`
- `source_policy_version`

### 9.4 Pricing agreement and promotion tables

`billing_price_agreements`

- `id`
- `subject_type`
- `subject_id`
- `applies_to_type`
- `plan_key`
- `currency_code`
- `billing_interval`
- `agreement_kind`
- `amount_minor`
- `percent_off_basis_points`
- `effective_at`
- `ended_at`
- `priority`
- `reason_code`

`billing_promotions`

- `id`
- `promotion_code`
- `subject_type`
- `subject_id`
- `plan_key`
- `currency_code`
- `billing_interval`
- `discount_kind`
- `amount_minor`
- `percent_off_basis_points`
- `duration_kind`
- `duration_in_periods`
- `stacking_policy`
- `priority`
- `max_redemptions`
- `max_redemptions_per_account`
- `condition_json`
- `starts_at`
- `ends_at`
- `status`

`billing_promotion_redemptions`

- `id`
- `billing_promotion_id`
- `billing_account_id`
- `redeemed_by_user_id`
- `redeemed_at`
- `applied_to_reference_type`
- `applied_to_reference_id`

### 9.5 Subscription tables

`billing_subscriptions`

- `id`
- `billing_account_id`
- `plan_key`
- `billing_interval`
- `status`
- `trial_ends_at`
- `current_period_start_at`
- `current_period_end_at`
- `billing_cycle_anchor_at`
- `cancel_at_period_end`
- `pricing_reference_type`
- `pricing_reference_id`
- `provider_key`
- `provider_subscription_id`

`billing_subscription_change_requests`

- `id`
- `billing_subscription_id`
- `from_plan_key`
- `to_plan_key`
- `from_interval`
- `to_interval`
- `preview_payload_json`
- `status`
- `requested_by_user_id`
- `requested_at`
- `committed_by_user_id`
- `committed_at`
- `failure_reason`

### 9.6 Credit tables

`billing_credit_purchases`

- `id`
- `billing_account_id`
- `trigger_type`
- `currency_code`
- `amount_minor`
- `status`
- `provider_key`
- `provider_checkout_session_id`
- `provider_payment_reference`
- `dedupe_key`
- `requested_by_user_id`
- `requested_at`
- `completed_at`
- `failure_reason`

`credit_grants`

- `id`
- `billing_account_id`
- `grant_type`
- `currency_code`
- `amount_minor`
- `granted_at`
- `expires_at`
- `source_type`
- `source_id`

`credit_wallet_entries`

- `id`
- `billing_account_id`
- `entry_type`
- `currency_code`
- `amount_minor`
- `available_delta_minor`
- `effective_at`
- `reference_type`
- `reference_id`

`credit_consumptions`

- `id`
- `billing_account_id`
- `usage_event_id`
- `consumed_from_entry_id`
- `amount_minor`
- `consumed_at`

Usage events (AI telemetry) must include `actor_type` (`firm_user` |
`client_user`) so consumption resolves to the correct billing account before
inserting a consumption row.

`credit_auto_recharge_policies`

- `id`
- `billing_account_id`
- `is_enabled`
- `currency_code`
- `threshold_minor`
- `topup_amount_minor`
- `monthly_cap_minor`
- `single_recharge_cap_minor`

### 9.7 Charge and invoice tables

`commercial_charges`

- `id`
- `billing_account_id`
- `workspace_company_id`
- `charge_type`
- `currency_code`
- `amount_minor`
- `service_period_start_at`
- `service_period_end_at`
- `scheduled_to_invoice_at`
- `source_type`
- `source_id`
- `pricing_reference_type`
- `pricing_reference_id`
- `dedupe_key`
- `status`

`commercial_charge_allocations`

- `id`
- `commercial_charge_id`
- `invoice_run_id`
- `invoice_document_id`
- `invoice_line_item_id`
- `allocated_amount_minor`

`invoice_runs`

- `id`
- `billing_account_id`
- `period_start_at`
- `period_end_at`
- `currency_code`
- `status`
- `executed_at`

`invoice_documents`

- `id`
- `billing_account_id`
- `invoice_run_id`
- `provider_key`
- `provider_invoice_id`
- `provider_invoice_number`
- `currency_code`
- `bill_to_snapshot_json`
- `subtotal_amount_minor`
- `discount_amount_minor`
- `tax_amount_minor`
- `total_amount_minor`
- `amount_paid_minor`
- `amount_due_minor`
- `tax_code`
- `tax_rate_reference`
- `status`
- `issued_at`
- `due_at`

`invoice_line_items`

- `id`
- `invoice_document_id`
- `line_category`
- `label`
- `quantity`
- `unit_amount_minor`
- `subtotal_amount_minor`
- `discount_amount_minor`
- `tax_amount_minor`
- `amount_minor`
- `tax_code`
- `tax_rate_reference`
- `meta_json`

### 9.7A Payout tables (launch)

Platform collections and firm remittance are **in scope at launch**. These tables
are required for trustable payout statements and FX-normalized settlement
reporting.

`payout_periods`

- `id`
- `firm_billing_account_id`
- `currency_code`
- `period_start_at`
- `period_end_at`
- `status`
- `approved_at`
- `paid_at`

`payout_ledger_entries`

- `id`
- `payout_period_id`
- `entry_type`
- `workspace_company_id`
- `currency_code`
- `amount_minor`
- `source_currency_code`
- `source_amount_minor`
- `fx_rate_reference`
- `source_type`
- `source_id`
- `effective_at`

### 9.8 Entitlement tables

`entitlement_snapshots`

- `id`
- `subject_type`
- `subject_id`
- `plan_key`
- `billing_account_id`
- `effective_at`
- `ended_at`
- `computed_at`
- `source_version`
- `snapshot_json`

### 9.9 Audit and provider event tables

`billing_audit_events`

- `id`
- `actor_user_id`
- `actor_type`
- `event_type`
- `subject_type`
- `subject_id`
- `request_id`
- `occurred_at`
- `before_json`
- `after_json`
- `metadata_json`

`billing_provider_webhook_events`

- `id`
- `provider_key`
- `provider_event_id`
- `event_type`
- `received_at`
- `processed_at`
- `processing_status`
- `processing_error`
- `payload_json`

### 9.10 Recommended launch constraints

These constraints are important enough that we should call them out explicitly.

`billing_provider_webhook_events`

- unique: `provider_key`, `provider_event_id`

`commercial_charges`

- unique: `billing_account_id`, `dedupe_key`

`workspace_billing_ownership`

- enforce at most one active ownership row per workspace at a time

`managed_workspace_plan_assignments`

- enforce at most one active plan assignment row per managed workspace at a time

`managed_workspace_wholesale_prices`

- enforce at most one active wholesale matrix row per firm plan plus managed
  plan plus currency plus interval at a time

`firm_sell_price_policies`

- enforce at most one active default sell-price policy per firm plus managed
  plan plus currency plus interval at a time

`managed_workspace_sell_price_overrides`

- enforce at most one active override per managed workspace plus currency plus
  interval at a time

## 10. Schema Rationale

This section explains why each recommended table and field exists.

The goal is to make future implementation decisions easier and reduce the risk
of us carrying fields that do not pull their weight.

### 10.1 Catalog tables

`billing_plan_catalog`

Purpose:

- stores the canonical internal plan definitions for the commercial system

- `id`: stable internal primary key for joins and history.
- `plan_key`: human-stable product identifier like `firm_standard`.
- `plan_family`: distinguishes firm, business, and individual commercial rails.
- `plan_kind`: separates free, paid, and contact-sales behavior.
- `display_name`: provider-agnostic product name used in UI and documents.
- `public_label`: optional marketing-facing label if it diverges from internal
  naming.
- `is_active`: lets us retire plans without destroying history.
- `metadata`: escape hatch for non-core plan annotations that do not justify
  first-class columns.

`billing_plan_catalog_prices`

Purpose:

- stores the canonical direct catalog prices for each plan, currency, and
  interval
- applies to firm subscriptions, business self-serve subscriptions, and
  individual plans
- does not model managed-workspace wholesale pricing, client sell pricing, or
  negotiated pricing agreements
- should be selected using the billing account commercial profile, not the
  user's current physical location
- in v1, that commercial profile should be derived primarily from
  `billing_account_profiles.billing_country_code` and
  `billing_accounts.invoice_currency_code`

- `id`: stable price row identity.
- `plan_catalog_id`: ties price rows back to the canonical plan.
- `currency_code`: required because pricing differs by market and currency.
- `billing_interval`: required because monthly and annual prices differ.
- `unit_amount_minor`: canonical internal monetary amount in minor units,
  stored as `bigint`.
- `effective_at`: supports future price changes and historical reconstruction.
- `expires_at`: supports end-dating superseded prices without deletion.

`billing_plan_catalog_provider_prices`

Purpose:

- maps internal direct catalog prices to provider-specific product and price
  objects
- should only be used for fixed catalog-priced items that a provider executes
  directly
- should not be used as the canonical model for dynamic managed workspace
  aggregation, prorations, topups, or other internally computed invoice amounts

- `id`: stable row identity for provider mapping.
- `billing_plan_catalog_price_id`: maps one internal catalog price to one
  provider price.
- `provider_key`: supports multiple providers simultaneously.
- `provider_product_id`: some providers separate product and price objects.
- `provider_price_id`: execution identifier for checkout and subscriptions.
- `country_code`: allows provider mapping to vary by market when needed.
- `status`: supports migration and deprecation without removing history.
- `effective_at`: lets mappings change over time safely.
- `expires_at`: supports end-dating provider mappings without deleting history.

`billing_plan_features`

Purpose:

- stores structured feature definitions used by entitlement resolution and UI
- preserves plan feature history inside the catalog itself rather than relying
  on audit logs as the primary historical source

- `id`: stable row identity for features.
- `plan_catalog_id`: associates feature rows with a plan.
- `feature_code`: normalized feature name used by entitlement resolution.
- `feature_value_json`: supports structured feature payloads like counts, tiers,
  and allowances.
- `effective_at`: defines when this feature definition becomes active.
- `expires_at`: end-dates superseded feature definitions without deleting
  history.

### 10.2 Account and provider tables

`billing_accounts`

Purpose:

- stores the internal commercial customer accounts that own subscriptions,
  charges, credits, and invoices
- keeps payer-specific commercial state separate from the core `companies`
  entity model
- defines the invoice and settlement currency in which the platform bills and
  remits to that payer

- `id`: primary billing customer identifier inside our own system.
- `owner_type`: distinguishes firm, business, and individual payer accounts.
- `owner_company_id`: links the billing account to the owning platform entity.
- `invoice_currency_code`: default currency for invoices, credits, and
  provider execution choices, and the default settlement currency for v1.
- `status`: operational state such as active, suspended, or closed.
- `billing_cycle_anchor_day`: anchors recurring billing to a consistent day of
  month where supported.
- `billing_timezone`: defines cycle calculation boundaries.
- `current_billing_period_start_at`: current lower bound of the billing cycle.
- `current_billing_period_end_at`: current upper bound of the billing cycle.
- `created_at`: supports auditability and operational debugging.

`billing_account_profiles`

Purpose:

- stores the current legal and billing identity used when issuing invoices and
  collecting tax-relevant customer details

- `id`: stable row identity.
- `billing_account_id`: associates the profile with the payer being billed.
- `legal_entity_name`: invoice-facing legal name of the payer.
- `billing_email`: default invoice delivery or billing contact email.
- `billing_country_code`: required for tax and billing-market handling.
- `tax_id`: stores VAT, GST, TIN, or similar registration when available.
- `tax_id_type`: distinguishes the kind of tax identifier stored.
- `tax_exemption_code`: supports exempt or special-tax treatment cases.
- `address_json`: stores structured billing address data without forcing a rigid
  early schema.
- `updated_at`: operational timestamp for profile changes.

`billing_account_provider_customers`

Purpose:

- links internal billing accounts to provider-side customer identities

- `id`: stable row identity.
- `billing_account_id`: associates external provider customers to internal
  billing accounts.
- `provider_key`: identifies the provider.
- `provider_customer_id`: provider-side customer identity needed for execution.
- `provider_account_scope`: supports providers with subaccounts, connected
  accounts, or regional scopes.
- `status`: indicates whether the mapping is active, pending, or deprecated.
- `metadata`: stores provider-specific operational details without polluting the
  core billing account model.

`billing_payment_methods`

Purpose:

- stores provider-tokenized payment methods available for charging a billing
  account

- `id`: stable row identity.
- `billing_account_id`: associates a payment method with its billing account.
- `provider_key`: identifies where the payment method is tokenized.
- `provider_payment_method_id`: provider token or reference used for charging.
- `brand`: display and support value.
- `last4`: safe display and support value.
- `exp_month`: needed for display and stale-card handling.
- `exp_year`: needed for display and stale-card handling.
- `is_default`: supports deterministic charge behavior.
- `status`: indicates attachability and validity without deleting rows.

`billing_payout_accounts`

Purpose:

- stores payout destinations when the platform needs to remit money

- `id`: stable row identity.
- `billing_account_id`: associates the payout destination with the billing
  account.
- `provider_key`: identifies the payout execution provider.
- `provider_payout_account_id`: provider-side bank or payout token reference.
- `display_name`: human-readable payout account label.
- `last4`: support-safe payout account reference.
- `status`: needed for payout readiness and lifecycle management.

### 10.3 Ownership and managed workspace tables

`workspace_billing_ownership`

Purpose:

- records who pays the platform for a workspace and over what time window

- `id`: stable row identity.
- `workspace_company_id`: identifies the workspace being billed.
- `billing_account_id`: identifies who pays the platform for that workspace
  (firm wholesale and firm AI for firm staff).
- `client_billing_account_id`: identifies the client payer account for sell-price
  invoices and client-user AI when the workspace is firm-managed.
- `commercial_mode`: distinguishes firm-managed, self-serve, and firm-internal
  ownership.
- `software_payer`: explicit answer to who pays platform software charges.
- `workspace_ai_payer`: workspace-level payer hint for ownership and display;
  actor-based debit resolution is still authoritative for actual usage debits.
- `workspace_ai_payer`: explicit answer to who pays workspace-facing AI usage.
- `effective_at`: supports historical ownership transitions.
- `ended_at`: closes a prior ownership interval without deleting it.

`managed_workspace_plan_assignments`

Purpose:

- records which internal customer plan a firm-managed workspace is assigned to
  for platform billing
- supports current `business_*` launch scope without blocking future
  `individual_*` firm-managed scope

- `id`: stable row identity.
- `managed_workspace_company_id`: identifies the managed workspace.
- `firm_billing_account_id`: identifies the firm paying the platform.
- `platform_plan_key`: identifies which internal customer plan is assigned.
- `currency_code`: locks the charging currency for this assignment.
- `billing_interval`: allows one managed workspace to be monthly while another
  under the same firm is annual.
- `current_commitment_start_at`: marks the start of the active commitment
  window.
- `current_commitment_end_at`: marks the end or renewal boundary of the active
  commitment window.
- `effective_at`: defines when the assignment starts billing.
- `ended_at`: ends a prior assignment cleanly.

`managed_workspace_wholesale_prices`

Purpose:

- stores the standard wholesale matrix for firm-managed workspaces
- represents what the platform charges a firm for a managed workspace based on:
  firm plan, managed workspace plan, currency, and interval

- `id`: stable row identity.
- `firm_billing_account_id`: identifies the firm-side billing account context
  the wholesale price applies to.
- `firm_plan_key`: identifies the firm plan driving the wholesale rate.
- `managed_plan_key`: identifies the managed workspace plan being billed.
- `currency_code`: wholesale billing currency.
- `billing_interval`: monthly or annual wholesale cadence.
- `amount_minor`: actual platform wholesale amount.
- `effective_at`: required for historical matrix changes.
- `ended_at`: required to preserve earlier wholesale history.

`firm_sell_price_policies`

Purpose:

- stores a firm's default sell pricing policy for each internal managed customer
  plan
- allows firms to set standard pricing once instead of pricing each managed
  workspace manually

- `id`: stable row identity.
- `firm_billing_account_id`: ensures the pricing policy belongs to the right
  firm.
- `managed_plan_key`: identifies which managed customer plan this default price
  applies to.
- `currency_code`: firms may price managed customers in a specific currency.
- `billing_interval`: supports monthly or future alternate sell-price cadence.
- `amount_minor`: actual firm-defined default sell price amount.
- `pricing_strategy`: records whether the policy is fixed, guided, or
  package-based.
- `effective_at`: required for historical default price changes.
- `ended_at`: required to preserve earlier pricing policy history.

`managed_workspace_sell_price_overrides`

Purpose:

- stores workspace-specific sell prices when a managed workspace should not use
  the firm's default pricing policy
- enables custom prices for specific managed workspaces without breaking the
  default
  pricing model

- `id`: stable row identity.
- `managed_workspace_company_id`: identifies the managed workspace getting the
  override.
- `firm_billing_account_id`: ensures the override belongs to the right firm.
- `currency_code`: billing currency for the override.
- `billing_interval`: cadence for the override.
- `amount_minor`: actual override sell price.
- `override_reason`: explains why the override exists.
- `effective_at`: supports time-bounded and historical overrides.
- `ended_at`: ends an override without losing history.

`managed_workspace_wholesale_rate_snapshots`

Purpose:

- stores the actual wholesale price the platform used for a managed workspace at
  a given time
- preserves platform charge history even if pricing policy changes later

- `id`: stable row identity.
- `managed_workspace_company_id`: identifies the billed managed workspace.
- `firm_billing_account_id`: identifies the firm paying the wholesale rate.
- `firm_plan_key`: records which firm plan drove the wholesale discount tier.
- `platform_plan_key`: records which customer plan drove the base wholesale
  price.
- `currency_code`: billing currency for the wholesale rate.
- `billing_interval`: required because monthly and annual commitments may price
  differently.
- `amount_minor`: actual wholesale amount used for charging.
- `effective_at`: starts the validity window for that derived rate.
- `source_policy_version`: preserves which pricing policy generated the rate.

### 10.4 Pricing agreement and promotion tables

`billing_price_agreements`

Purpose:

- stores negotiated or durable pricing changes such as lifetime pricing,
  special pricing, partner pricing, or custom commercial agreements
- works for firm, business, or individual subjects

- `id`: stable row identity.
- `subject_type`: identifies whether the agreement targets a firm, business,
  individual, or billing account.
- `subject_id`: identifies the specific target receiving the agreement.
- `applies_to_type`: identifies what is being repriced such as subscription or
  managed-workspace wholesale billing, and can later be extended to firm
  sell-price workflows if the product needs it.
- `plan_key`: limits the agreement to a plan when applicable.
- `currency_code`: required for deterministic pricing.
- `billing_interval`: supports monthly versus annual variants.
- `agreement_kind`: distinguishes fixed price, fixed discount, percent off,
  free forever, or other durable agreement types.
- `amount_minor`: stores the fixed price or fixed discount amount when needed.
- `percent_off_basis_points`: stores percentage discounts with precision.
- `effective_at`: start of the agreement.
- `ended_at`: end of the agreement for time-bound deals; null can represent
  lifetime.
- `priority`: resolves conflicts when multiple agreements could apply.
- `reason_code`: explains why the agreement exists.

`billing_promotions`

Purpose:

- stores time-bound or campaign-style promotions such as promo codes and launch
  discounts
- supports conditional discounts without requiring provider-native coupon logic

- `id`: stable row identity.
- `promotion_code`: redeemable code or internal promotion identifier.
- `subject_type`: optional target type if the promotion is scoped rather than
  globally redeemable.
- `subject_id`: optional specific target if the promotion is account-specific.
- `plan_key`: optional plan restriction.
- `currency_code`: optional currency restriction.
- `billing_interval`: optional interval restriction.
- `discount_kind`: distinguishes fixed amount, percent off, free period, or
  other promo effects.
- `amount_minor`: fixed amount discount where relevant.
- `percent_off_basis_points`: percentage discount where relevant.
- `duration_kind`: identifies once, repeating, forever, or fixed-period
  duration.
- `duration_in_periods`: number of billing periods when duration is period-based.
- `stacking_policy`: determines whether the promotion can stack with others.
- `priority`: resolves conflicts when multiple promotions could apply.
- `max_redemptions`: optional campaign-wide redemption cap.
- `max_redemptions_per_account`: optional per-account redemption cap.
- `condition_json`: stores structured eligibility conditions.
- `starts_at`: promotion start time.
- `ends_at`: promotion end time.
- `status`: operational state of the promotion.

`billing_promotion_redemptions`

Purpose:

- records who redeemed a promotion and what it was applied to
- makes promo usage auditable and replay-safe

- `id`: stable row identity.
- `billing_promotion_id`: identifies which promotion was redeemed.
- `billing_account_id`: identifies which billing account used it.
- `redeemed_by_user_id`: identifies who triggered redemption.
- `redeemed_at`: timestamp of redemption.
- `applied_to_reference_type`: identifies whether the redemption applied to a
  subscription, invoice, checkout, or other billing object.
- `applied_to_reference_id`: identifies the specific target object.

### 10.5 Subscription tables

`billing_subscriptions`

Purpose:

- stores active and historical fixed recurring subscriptions for billing
  accounts

- `id`: stable row identity.
- `billing_account_id`: identifies who owns the fixed subscription.
- `plan_key`: identifies the subscribed internal plan.
- `billing_interval`: distinguishes monthly from annual behavior.
- `status`: operational subscription state used by entitlements and UI.
- `trial_ends_at`: end of trial when `status = trialing`.
- `current_period_start_at`: start of the active billing period.
- `current_period_end_at`: end of the active billing period.
- `billing_cycle_anchor_at`: supports correct monthly credit grants even for
  annual subscriptions and provider-independent cycle alignment.
- `cancel_at_period_end`: required for downgrade and cancellation behavior.
- `pricing_reference_type`: identifies catalog price, price agreement, or other
  pricing artifact used for this subscription.
- `pricing_reference_id`: foreign key to the pricing artifact row.
- `provider_key`: identifies the executing provider if one exists.
- `provider_subscription_id`: reconciles to external provider subscription
  state.

`billing_subscription_change_requests`

Purpose:

- stores the exact change request and preview that a user confirmed before a
  subscription mutation is committed

- `id`: stable row identity.
- `billing_subscription_id`: ties the change request to a subscription.
- `from_plan_key`: preserves prior plan for audit and preview fidelity.
- `to_plan_key`: preserves requested target plan.
- `from_interval`: preserves prior interval.
- `to_interval`: preserves requested target interval.
- `preview_payload_json`: stores the exact preview the user confirmed.
- `status`: supports pending, committed, failed, or canceled transitions.
- `requested_by_user_id`: identifies who initiated the change.
- `requested_at`: audit timestamp for initiation.
- `committed_by_user_id`: identifies who actually committed the change if
  different from requester.
- `committed_at`: audit timestamp for completion.
- `failure_reason`: preserves operational failure detail when the request does
  not commit successfully.

### 10.6 Credit tables

`billing_credit_purchases`

Purpose:

- records manual topups and auto-recharge purchase intents as first-class
  billing objects before they become charges and credit grants

- `id`: stable row identity.
- `billing_account_id`: identifies who is buying credits.
- `trigger_type`: distinguishes manual purchase from auto-recharge or future
  system triggers.
- `currency_code`: required for execution and invoice math.
- `amount_minor`: purchase face value before downstream grant creation.
- `status`: tracks requested, pending, completed, failed, or canceled purchase
  state.
- `provider_key`: identifies which provider executes the purchase when needed.
- `provider_checkout_session_id`: links to hosted checkout when used.
- `provider_payment_reference`: links to payment intent, charge, or equivalent
  execution object.
- `dedupe_key`: prevents duplicate purchase creation during retries or
  auto-recharge reruns.
- `requested_by_user_id`: identifies the initiator when user-triggered.
- `requested_at`: audit timestamp for creation.
- `completed_at`: audit timestamp for successful completion.
- `failure_reason`: preserves operational failure detail.

`credit_grants`

Purpose:

- records the original creation of credits in the system

- `id`: stable row identity.
- `billing_account_id`: identifies the owner of the credit grant.
- `grant_type`: distinguishes monthly included, gifted, purchased, or
  negotiated credits.
- `currency_code`: credits are pegged to a monetary denomination.
- `amount_minor`: original grant value.
- `granted_at`: start of credit availability and audit reference.
- `expires_at`: required for non-rollover monthly included credits.
- `source_type`: records why this grant exists.
- `source_id`: references the source record such as subscription, purchase, or
  admin grant event.

`credit_wallet_entries`

Purpose:

- records all balance-affecting wallet movements in an append-only ledger

- `id`: stable row identity.
- `billing_account_id`: identifies whose wallet changed.
- `entry_type`: distinguishes grant, consumption, adjustment, expiration, or
  recharge effects.
- `currency_code`: needed for wallet calculations.
- `amount_minor`: raw amount represented by the entry.
- `available_delta_minor`: signed change to currently available balance.
- `effective_at`: determines when the wallet effect becomes active.
- `reference_type`: identifies the business source category behind the entry.
- `reference_id`: ties back to the originating domain record.

`credit_consumptions`

Purpose:

- records exactly how usage consumed previously granted or purchased credits

- `id`: stable row identity.
- `billing_account_id`: identifies who consumed credits.
- `usage_event_id`: links the consumption to the underlying metered usage
  event.
- `consumed_from_entry_id`: proves which wallet entry funded the consumption.
- `amount_minor`: amount consumed from that specific source entry.
- `consumed_at`: audit and reconstruction timestamp.

`credit_auto_recharge_policies`

Purpose:

- stores low-balance replenishment behavior and guardrails for a billing account

- `id`: stable row identity.
- `billing_account_id`: identifies whose policy this is.
- `is_enabled`: feature toggle for automatic recharging.
- `currency_code`: required for provider execution and validation.
- `threshold_minor`: low-balance trigger amount.
- `topup_amount_minor`: amount to purchase when triggered.
- `monthly_cap_minor`: protects users from runaway monthly replenishment.
- `single_recharge_cap_minor`: protects against oversized one-shot recharges.

### 10.7 Charge and invoice tables

`commercial_charges`

Purpose:

- stores normalized billable commercial events before invoice assembly

- `id`: stable row identity.
- `billing_account_id`: identifies who will be invoiced.
- `workspace_company_id`: ties the charge to the originating workspace when
  applicable.
- `charge_type`: distinguishes subscription, managed wholesale, topup,
  adjustment, and future charge categories.
- `currency_code`: required for invoice grouping and monetary integrity.
- `amount_minor`: canonical charge amount.
- `service_period_start_at`: lower bound of the commitment or service window
  being billed.
- `service_period_end_at`: upper bound of the commitment or service window
  being billed.
- `scheduled_to_invoice_at`: determines which invoice cycle should pick up the
  charge.
- `source_type`: business cause category for the charge.
- `source_id`: underlying source record that produced the charge.
- `pricing_reference_type`: identifies which pricing artifact determined the
  amount such as catalog price, wholesale snapshot, agreement, or promotion.
- `pricing_reference_id`: identifies the specific pricing artifact used.
- `dedupe_key`: prevents duplicate charge creation during retries or reruns.
- `status`: tracks whether the charge is pending, allocated, invoiced, voided,
  or reversed.

`commercial_charge_allocations`

Purpose:

- records how charges were allocated into invoice runs and documents

- `id`: stable row identity.
- `commercial_charge_id`: identifies the charge being allocated.
- `invoice_run_id`: identifies which invoice assembly run picked it up.
- `invoice_document_id`: identifies the resulting invoice document.
- `invoice_line_item_id`: identifies which line on the invoice the charge
  rolled into.
- `allocated_amount_minor`: supports full or partial allocation to invoices or
  credits.

`invoice_runs`

Purpose:

- records execution of invoice assembly for one billing account and currency
  window

- `id`: stable row identity.
- `billing_account_id`: identifies whose invoice group is being assembled.
- `period_start_at`: invoice period lower bound.
- `period_end_at`: invoice period upper bound.
- `currency_code`: invoices should not mix currencies.
- `status`: tracks draft, executing, completed, or failed invoice generation.
- `executed_at`: operational audit timestamp for the run.

`invoice_documents`

Purpose:

- stores the canonical invoice record regardless of whether a provider also
  hosts it

- `id`: stable row identity.
- `billing_account_id`: identifies invoice ownership.
- `invoice_run_id`: ties the document back to the assembly run.
- `provider_key`: identifies the provider hosting or executing the invoice if
  any.
- `provider_invoice_id`: provider-side invoice reference for sync.
- `provider_invoice_number`: human-facing provider invoice number.
- `currency_code`: invoice currency.
- `bill_to_snapshot_json`: preserves the immutable billed legal identity and
  address at issuance time.
- `subtotal_amount_minor`: pre-discount, pre-tax base amount.
- `discount_amount_minor`: total discount applied to the invoice.
- `tax_amount_minor`: total tax applied to the invoice.
- `total_amount_minor`: canonical total due or credited.
- `amount_paid_minor`: supports partial and full payment tracking.
- `amount_due_minor`: supports collections and UI display.
- `tax_code`: stores tax treatment classification when needed.
- `tax_rate_reference`: stores the applied tax rate identity or provider
  reference.
- `status`: invoice lifecycle state such as draft, open, paid, void, or
  uncollectible.
- `issued_at`: issuance timestamp for history and due date logic.
- `due_at`: payment due timestamp for collections and UI.

`invoice_line_items`

Purpose:

- stores the human-readable and computationally useful breakdown of each invoice

- `id`: stable row identity.
- `invoice_document_id`: associates the line item with an invoice.
- `line_category`: classifies the line for display and reporting.
- `label`: human-readable line description.
- `quantity`: supports grouped line summaries like managed workspace counts or
  units.
- `unit_amount_minor`: supports transparent pricing math on the line.
- `subtotal_amount_minor`: line amount before discount and tax.
- `discount_amount_minor`: line-level discount amount where applicable.
- `tax_amount_minor`: line-level tax amount where applicable.
- `amount_minor`: actual total amount of the line.
- `tax_code`: stores line-level tax classification if needed.
- `tax_rate_reference`: stores the applied tax rate identity or provider
  reference.
- `meta_json`: stores supplemental structured details without exploding the
  table shape.

### 10.7A Payout tables (launch)

`payout_periods`

Purpose:

- groups one remittance cycle for a firm billing account when the platform is
  collecting money and later paying a firm
- gives the payout UI a stable period object rather than forcing it to derive
  payout state from scattered invoice or ledger rows

- `id`: stable row identity.
- `firm_billing_account_id`: identifies which firm this payout period belongs
  to.
- `currency_code`: payouts should not mix currencies.
- `period_start_at`: lower bound of the payout period.
- `period_end_at`: upper bound of the payout period.
- `status`: tracks open, pending approval, paid, closed, or future payout
  states.
- `approved_at`: records when the payout was approved for release.
- `paid_at`: records when funds were actually remitted.

`payout_ledger_entries`

Purpose:

- stores the normalized components of a payout such as opening balance, client
  collections, platform fees, adjustments, and paid-out amounts
- allows the payout overview UI to render a deterministic ledger without
  depending on ad hoc calculations
- provides enough provenance to explain and defend every firm-facing payout
  statement row
- supports cross-currency client collections while still producing a single
  firm-facing settlement statement in the payout period currency

- `id`: stable row identity.
- `payout_period_id`: associates the entry with one payout window.
- `entry_type`: classifies the contribution to the payout ledger.
- `workspace_company_id`: ties the entry to a specific managed workspace when
  relevant.
- `currency_code`: settlement currency used for the firm-facing payout
  statement.
- `amount_minor`: signed monetary effect of the entry in settlement currency.
- `source_currency_code`: original client collection or source currency when it
  differs from settlement currency.
- `source_amount_minor`: original amount in the source currency when relevant.
- `fx_rate_reference`: stores the FX rate or conversion reference used to
  normalize into settlement currency.
- `source_type`: identifies the business cause category behind the entry.
- `source_id`: ties the entry back to the originating billing or collection
  object.
- `effective_at`: supports ordering, auditability, and reconstruction.

Recommended launch approach:

- create payout periods and payout ledger entries from the start
- allow finance or operations users to approve and execute payouts manually
- record the resulting remittance event in the payout period state and ledger
- add automated payout scheduling later without replacing the underlying payout
  ledger model

Possible future extension:

- a small `payout_schedule_policies` table keyed by firm billing account can
  store preferred cadence and timing rules once per-firm automated schedules
  are introduced
- this should control payout execution timing only, not replace payout-period
  or payout-ledger truth

### 10.8 Entitlement tables

`entitlement_snapshots`

Purpose:

- stores resolved entitlement states so product code and read models do not have
  to recalculate everything ad hoc

- `id`: stable row identity.
- `subject_type`: distinguishes whether the snapshot applies to a billing
  account, workspace, firm, or other future subject.
- `subject_id`: identifies the entity receiving the entitlement set.
- `plan_key`: preserves the plan basis behind the entitlement set.
- `billing_account_id`: ties the snapshot back to the commercial owner.
- `effective_at`: defines the start of this entitlement state.
- `ended_at`: closes out a historical snapshot when a new one supersedes it.
- `computed_at`: records when the resolver produced the snapshot.
- `source_version`: ties the snapshot to the resolver or rules version that
  produced it.
- `snapshot_json`: stores the resolved entitlement bundle used by product code
  and read models.

### 10.9 Audit and provider event tables

`billing_audit_events`

Purpose:

- records every meaningful billing mutation in a domain-specific audit trail
- makes auditability first-class rather than incidental

- `id`: stable row identity.
- `actor_user_id`: identifies the user who triggered the change when available.
- `actor_type`: distinguishes user, system, admin, or webhook actors.
- `event_type`: identifies the billing action that occurred.
- `subject_type`: identifies the kind of object changed.
- `subject_id`: identifies the specific changed object.
- `request_id`: ties the event back to the originating request or job.
- `occurred_at`: authoritative event timestamp.
- `before_json`: preserves the relevant prior state.
- `after_json`: preserves the relevant resulting state.
- `metadata_json`: stores supplemental audit context.

`billing_provider_webhook_events`

Purpose:

- stores raw provider events and their reconciliation state for replay-safe
  processing

- `id`: stable row identity.
- `provider_key`: identifies where the event came from.
- `provider_event_id`: deduplication key for replay-safe ingestion.
- `event_type`: routes processing logic.
- `received_at`: raw ingestion timestamp.
- `processed_at`: reconciliation completion timestamp.
- `processing_status`: operational state of the event handler.
- `processing_error`: preserves failure detail without losing the event.
- `payload_json`: raw provider payload for replay, audit, and debugging.

## 11. Contract Strategy

We should retire the current single-file billing contract model and replace it
with a grouped contract structure.

Suggested package layout:

- `packages/contracts/.../billing/catalog.ts`
- `packages/contracts/.../billing/accounts.ts`
- `packages/contracts/.../billing/subscriptions.ts`
- `packages/contracts/.../billing/credits.ts`
- `packages/contracts/.../billing/invoices.ts`
- `packages/contracts/.../billing/managed-workspaces.ts`
- `packages/contracts/.../billing/pricing-agreements.ts`
- `packages/contracts/.../billing/entitlements.ts`
- `packages/contracts/.../billing/views.ts`

Important rule:

The contracts should model the backend domain first, then add UI read models on
top.

We should not create one oversized contract intended to describe every billing
screen.

### 11.1 Legacy contract migration map

The old
`packages/contracts/accountable_contracts/schema/source/accounting/billing.ts`
should be treated as legacy and gradually replaced.

Recommended migration mapping:

- legacy billing overview or context response shapes →
  `billing/views.ts`
- legacy plan-management request and response shapes →
  `billing/subscriptions.ts` and `billing/views.ts`
- legacy wallet or credit shapes →
  `billing/credits.ts`
- legacy invoice and payout summary shapes →
  `billing/invoices.ts` and `billing/views.ts`
- any legacy revenue-share or payout-like shapes →
  `billing/views.ts` initially, then a dedicated payout contract group if
  payout APIs expand materially

Rule:

- do not attempt a one-to-one file-port of the old contract
- map old screen-shaped payloads into domain contracts plus explicit read-model
  contracts

## 12. Provider Abstraction

We should define a provider interface that isolates payment execution details.

The first provider may be Stripe. The architecture should still support:

- Stripe for USD and supported countries
- another provider for NGN
- multiple providers at once
- provider migration over time

### 12.1 Provider capabilities

A payment execution provider may support:

- customer creation
- checkout session creation
- subscription lifecycle updates
- invoice hosting
- payment method setup
- portal sessions
- top-up purchases
- webhook events
- payouts

Each capability should be optional at the provider layer.

### 12.2 Internal interface shape

We should expose internal adapter methods such as:

- `ensureCustomer`
- `createSubscriptionCheckout`
- `previewSubscriptionChange` if provider-supported
- `commitSubscriptionChange`
- `createBillingPortalSession`
- `createTopupCheckout`
- `syncInvoice`
- `syncSubscription`
- `listSupportedCapabilities`

The backend should decide when provider help is needed. Core commercial rules
should still remain internal.

## 12.3 Launch Provider Scope

For launch, the provider abstraction should stay thin.

We should implement only the provider capabilities we actually need:

- customer creation
- subscription checkout
- subscription sync
- payment method setup
- billing portal session if we decide to expose it
- invoice sync
- webhook ingestion

We should not build a generalized provider capability matrix until a second
provider is real.

## 13. Read Models For The Current UI

The current billing UI is still a valid read-model target.

We should build dedicated read models for:

- billing settings overview page
- manage plan dialog
- invoices tab
- credits and usage tab
- managed workspaces billing tab

### 13.1 Important rule

The read-model APIs are derived projections. They are not the core write model.

This lets us keep the UI stable while improving backend structure freely.

### 13.2 Current page mapping

The current settings billing page wants:

- current plan summary
- upcoming bill summary
- upcoming payout summary later
- credit wallet summary
- payment and payout account summary
- managed-workspace counts

The plan dialog wants:

- current subscription state
- available plans
- interval choices
- recommendation metadata
- action permissions
- effective-date or transition messaging when relevant
- optional backend-provided preview details when a flow truly needs them

Future managed workspace billing views should also support:

- mixed monthly and annual managed workspace commitments under one firm
- clear commitment start and end dates per managed workspace
- workspace ownership transfers that align to the firm billing cycle
- a single current calendar-month invoice window even when the underlying
  commitments have different intervals

These can be cleanly served from `read-models/views`.

### 13.3 Settings overview payload guidance

To keep the frontend stable, the settings overview read model should be treated
as a deliberately shaped projection rather than a thin wrapper around raw
tables.

`current plan summary`

Should come primarily from:

- `billing_subscriptions`
- `billing_plan_catalog`
- `billing_plan_catalog_prices`

Recommended fields:

- billing owner context such as self-serve, firm-managed, or other future
  commercial mode
- current plan key and display name
- current billed amount and interval
- subscription status
- current period end date
- `cancel_at_period_end`
- `trial_ends_at` when applicable
- high-level action permissions such as whether plan management is allowed

`upcoming bill summary`

Should come from:

- `invoice_documents` and `invoice_line_items` when an invoice already exists
- otherwise an estimate projected from unallocated `commercial_charges`

Recommended fields:

- bill state: none, estimate, open invoice, past due
- billing-account invoice period start and end
- due date if an invoice exists
- invoice reference and hosted URL when available
- currency code
- total amount
- grouped line breakdown with stable backend categories aligned to the UI

Important rule:

- the overview should return grouped categories for the summary card
- the invoices tab can return richer item-level detail separately

`upcoming payout summary`

Until payouts are implemented, the overview should be able to return an
explicit unavailable state rather than forcing the frontend to infer absence
from missing data.

Recommended fields:

- `available`
- `unavailable_reason` when false, such as not enabled, not configured, or not
  applicable
- payout period start and end when available
- currency code
- confidence state such as estimated or finalized
- grouped payout ledger slots
- payout account summary when one is configured

Launch recommendation:

- the payout statement shown to a firm should be denominated in the firm's
  single settlement currency for that billing account
- underlying client collections may originate in other currencies, but the
  read model should present normalized settlement values while still allowing
  drill-down to original source currency when needed

If payouts are in product scope, we should also support a firm-facing payout
statement or history view that can answer, for any selected period:

- how much was collected from client workspaces
- how much the platform deducted
- what adjustments were applied
- what was paid out
- what balance remained at period end

This should be backed by payout-period and payout-ledger storage, not
reconstructed ad hoc from invoice rows alone.

`credit wallet summary`

Should come from:

- `credit_wallet_entries`
- `credit_grants`
- `credit_consumptions`
- `credit_auto_recharge_policies`

Recommended fields:

- current available balance
- bucket breakdown for gifted, monthly included, and purchased credits
- next monthly reset date
- current-cycle usage summary
- auto-recharge enabled state and thresholds
- optionally the soonest-expiring non-monthly credit bucket if that becomes
  useful in UI

`payment and payout account summary`

Should come from:

- `billing_payment_methods`
- `billing_payout_accounts`

Recommended fields:

- masked display details
- default flags
- operational status
- whether user action is required

The frontend should not need to derive account readiness by interpreting raw
provider states.

`managed workspace summary`

Should come from:

- `workspace_billing_ownership`
- `managed_workspace_plan_assignments`

Recommended fields:

- active managed workspace count
- count billed through firm
- count still platform billed or self-serve
- optionally counts by monthly and annual commitment when cheap to compute

The first overview card can stay small, but the backend read model should not
paint us into a corner if the clients tab later wants interval-aware counts.

### 13.4 Manage plan payload guidance

The manage-plan dialog should not have to infer too much business logic from
bare catalog rows.

Recommended snapshot payload characteristics:

- current subscription status, current plan key, current interval, and current
  period end
- available plans with display metadata and supported intervals
- explicit permissions for manage, cancel, and downgrade actions
- contact-sales handoff information for custom plans
- optional selection constraints such as disabled reasons when a plan or
  interval is not selectable

Recommended change-result payload characteristics:

- effective date of the change
- resulting current subscription snapshot
- whether the provider checkout flow is required
- any user-facing warning or confirmation copy the backend wants the frontend
  to display consistently

### 13.5 Backend-to-frontend enum discipline

The backend should expose stable enums for read-model display categories rather
than relying on loosely interpreted strings.

Examples:

- upcoming bill line categories
- payout ledger slot categories
- payment and payout account statuses
- managed workspace summary bucket categories

This does not mean the core storage tables must mirror the UI one-for-one.
It does mean the read-model contract should be stable and explicit.

## 14. API Surface

We should separate domain APIs from read-model APIs.

### 14.1 Domain APIs

- `GET /billing/catalog`
- `GET /billing/account`
- `GET /billing/subscription`
- `POST /billing/subscription/preview-change`
- `POST /billing/subscription/commit-change`
- `POST /billing/subscription/create-checkout`
- `POST /billing/subscription/cancel`
- `GET /billing/credits/wallet`
- `POST /billing/credits/create-topup-checkout`
- `PUT /billing/credits/auto-recharge`
- `GET /billing/managed-workspaces`
- `PUT /billing/managed-workspaces/:companyId/platform-plan`
- `GET /billing/firm-managed-plan-pricing-policies`
- `PUT /billing/firm-managed-plan-pricing-policies/:managedPlanKey`
- `PUT /billing/managed-workspaces/:companyId/price-override`
- `GET /billing/pricing-agreements`
- `POST /billing/pricing-agreements`
- `GET /billing/promotions`
- `POST /billing/promotions/redeem`
- `GET /billing/invoices`
- `GET /billing/payment-methods`
- `POST /billing/payment-methods/setup-session`

### 14.2 Read-model APIs

- `GET /billing/views/settings-overview`
- `GET /billing/views/manage-plan-dialog`
- `GET /billing/views/invoice-history`
- `GET /billing/views/credits`
- `GET /billing/views/managed-workspaces`

## 15. Key Workflows

### 15.1 Free to paid upgrade

1. Frontend requests plan snapshot.
2. User selects paid plan and interval.
3. Backend creates provider checkout session.
4. Provider confirms payment and subscription creation.
5. Webhook updates internal subscription state.
6. Entitlements refresh.
7. Read models refresh.

### 15.2 Paid plan change

1. Frontend requests preview.
2. Backend computes effective date, proration, warnings, and next recurring
   amount.
3. User confirms.
4. Backend commits change internally and through provider if required.
5. Webhook reconciles provider-side invoice and subscription state.
6. Entitlements refresh.

### 15.3 Downgrade to free

1. Frontend requests preview.
2. Backend determines whether downgrade is immediate or period-end.
3. User confirms.
4. Backend stores scheduled downgrade and provider schedule changes.
5. Entitlements refresh at the effective time.

### 15.4 Managed workspace reassignment

1. A customer workspace becomes firm-managed or changes firm.
2. Workspace ownership record updates.
3. Managed workspace plan assignment becomes active.
4. First firm-paid charge is prorated to the next firm cycle boundary if needed.
5. Future wholesale charges attach to the firm billing account.
6. Prior invoice periods remain immutable.

### 15.5 Managed workspace mixed interval support

1. A firm chooses a platform plan and billing interval for a managed workspace.
2. The assignment records both plan key and billing interval.
3. Commitment boundaries align to the firm billing cycle boundary.
4. A monthly managed workspace can coexist with an annual managed workspace
   under the same firm billing account.
5. Annual managed workspace commitments are charged on the firm's monthly
   invoice stream at the relevant start or renewal month.
6. Wholesale rate snapshots preserve the interval-specific amount used.

### 15.6 Firm default pricing and workspace override resolution

1. A firm sets default sell pricing for one or more managed customer plans.
2. A managed workspace is assigned a platform plan.
3. Billing resolves the default firm pricing policy for that plan.
4. If a workspace-specific override exists and is active, it wins.
5. The resolved sell price is used for client-facing invoices and collection on
   the firm's behalf.

### 15.7 Client sell-price collection on the firm's behalf

1. Billing resolves the active sell price (workspace override, else firm default).
2. A `commercial_charge` is created on the **client billing account** in the
   sell currency for the commitment window.
3. An internal `invoice_document` is assembled on the client billing account.
4. The provider executes payment (card, etc.) where configured; tax is
   calculated by the provider when supported and snapshotted on the invoice.
5. On successful payment, a `payout_ledger_entry` records the collection on the
   firm's open `payout_period`, including FX normalization fields when the
   collection currency differs from the firm's settlement currency.
6. Platform fees and adjustments post as additional payout ledger entries before
   remittance.

### 15.8 Internal invoice issue and provider sync

1. Billing assembles a draft `invoice_run` from eligible `commercial_charges`.
2. Internal `invoice_documents` and `invoice_line_items` are created (source of
   truth for structure and amounts pre-tax).
3. The provider adapter creates or updates the provider invoice / payment object.
4. On `invoice.finalized` (or equivalent), tax and totals from the provider are
   **snapshotted** onto internal rows.
5. On payment webhooks, `amount_paid`, `amount_due`, and status are reconciled.
6. If provider and internal totals diverge after sync, **internal line structure
   remains authoritative** for product UI; payment fields follow the provider.

### 15.9 Manual payout at launch

1. Platform collections and deductions for a firm accumulate as
   `payout_ledger_entries` inside an open `payout_period`.
2. The firm can view the running payout statement for the period.
3. At period end, finance or operations reviews the payout period.
4. The payout period is approved manually when ready.
5. Funds are remitted through the chosen payment rail or bank workflow.
6. The payout period is marked paid and the payout ledger reflects the remitted
   amount.
7. Future periods continue from the resulting closing balance where relevant.

### 15.10 Automated payout schedules later

Manual payouts at launch should not block later automation.

The important design rule is:

- payout execution timing can evolve from manual to scheduled or provider-driven
  automation
- payout statement truth should still live in `payout_periods` and
  `payout_ledger_entries`

That means a future automated payout scheduler should create and complete the
same payout-period lifecycle rather than introducing a second competing payout
truth model.

### 15.11 Promotions and special pricing resolution

1. Billing determines the base commercial price from catalog or wholesale
   policy.
2. Durable price agreements are evaluated first by scope and priority.
3. Promotional rules are then evaluated if applicable.
4. The effective price and applied adjustments are persisted in the preview,
   charge, or invoice context.
5. Any redemption or applied agreement is recorded for audit.

### 15.12 Credit consumption

1. Usage service emits a priced usage event with `workspace_company_id` and
   `actor_type` (`firm_user` or `client_user`).
2. Credits subsystem resolves the target billing account (firm vs client).
3. Consumption engine applies deterministic bucket ordering.
4. Consumption entries are written.
5. If balance falls below threshold and auto-recharge is enabled, recharge
   workflow can be triggered.

### 15.13 Monthly billing run

1. Collect fixed subscription charges due this cycle (firm billing account).
2. Collect managed workspace wholesale charges for active assignments (firm
   billing account, firm settlement currency).
3. Collect client sell-price charges due for managed workspaces (client billing
   accounts, sell currencies).
4. Collect any billable adjustments.
5. Group charges by billing account and currency.
6. Assemble internal `invoice_documents` and lines (source of truth).
7. Sync to provider for execution, tax, and payment reconciliation.

## 15.14 First Vertical Slice

The first end-to-end useful slice should be:

1. plan catalog
2. billing account
3. workspace billing ownership
4. subscription
5. entitlement resolver
6. manage-plan snapshot API
7. plan-change preview API
8. Stripe checkout and webhook sync
9. manage-plan dialog wired to the real backend

After that, the next useful slice should be:

1. credit ledger
2. credit wallet read model
3. top-up checkout
4. auto-recharge policy
5. settings billing overview read model

Only after that should we prioritize:

1. managed workspace wholesale and sell-price billing
2. internal charge generation and invoice assembly (internal SoT + Stripe sync)
3. payout periods, client collection normalization, and manual remittance

## 16. Entitlement System

Entitlements should be a formal subsystem because billing meaningfully changes
product capability.

### 16.1 Resolver inputs

- active subscription
- plan catalog
- managed workspace plan assignment
- pricing agreements and promotions
- billing ownership
- temporary overrides if needed later

### 16.2 Resolver outputs

- current plan key
- support tier
- monthly included credits
- branding level
- workspace limits
- managed workspace pricing tier
- AI billing behavior
- feature switches relevant to product flows

### 16.3 Consumption pattern

Product code should ask the entitlement subsystem for capability. It should not
read raw subscription tables directly.

## 17. Migration And Implementation Strategy

This should be built in phases.

### Phase 0: Prepare the ground

- create new billing domain folder structure
- write replacement contracts
- mark existing billing contracts as legacy
- align naming across pricing docs, UI, and backend

### Phase 1: Catalog, ownership, subscriptions, entitlements

- create plan catalog tables
- create billing accounts and workspace ownership tables
- create subscriptions and change request tables
- create billing audit event table
- create entitlement resolver
- build plan management snapshot and preview APIs

This phase is the minimum foundation for real plan management.

### Phase 2: Provider execution

- implement provider interface
- add Stripe adapter first
- add customer creation
- add checkout session creation
- add subscription reconciliation via webhooks
- add payment method setup and portal support

### Phase 3: Credits

- add credit grants, wallet entries, consumptions, and auto-recharge policies
- integrate with AI usage pricing events
- expose wallet and top-up APIs

### Phase 4: Managed workspace billing

- add managed workspace plan assignments
- add firm default pricing policies
- add workspace-specific price overrides
- add wholesale rate resolution
- add pricing agreements and promotions
- generate monthly managed workspace charges

### Phase 5: Invoices, client collection, and read models

- add commercial charge and invoice tables
- implement invoice runs with **internal `invoice_documents` as source of truth**
- provider sync, tax snapshots, and payment reconciliation
- client sell-price invoicing on the firm's behalf
- build overview read models for settings billing page
- build invoice history read models

### Phase 6: Payout statements and manual remittance

- add payout periods and payout ledger entries (including FX normalization)
- build payout overview and payout statement read models
- add manual approval and payout completion workflow

### Phase 7: Accounting bridge and payout automation

- add downstream accounting export if needed
- add automated payout scheduling and execution on top of the payout model

## 17.1 Recommended launch implementation order

1. billing domain skeleton
2. replacement contracts
3. plan catalog and seed data
4. billing accounts
5. workspace billing ownership
6. subscriptions
7. entitlement resolver
8. plan management read models
9. provider boundary with Stripe checkout and webhook sync
10. wire manage-plan dialog
11. credit ledger
12. credit wallet read model
13. top-up checkout and auto-recharge policy
14. settings billing overview read model
15. managed workspace assignment and wholesale pricing
16. internal charge generation and invoice assembly
17. payout periods and payout ledger
18. payout overview and manual payout workflow
19. richer pricing agreements and promotions only if needed
20. payout automation only when ready

## 17.2 Billing jobs and queues

Billing needs explicit background job design.

At minimum, we should plan for:

- monthly credit grants
- credit expiry processing
- provider sync retries
- entitlement refresh
- auto-recharge checks
- past-due status transitions
- invoice sync or charge assembly later

Each job should define:

- trigger
- idempotency key
- retry behavior
- failure handling
- audit implications

### 17.3 Job policy notes for launch

`monthly credit grants`

- trigger: billing-cycle boundary or scheduled monthly grant job
- idempotency key: billing account + grant month + grant type + workspace where
  applicable
- retry: safe to retry until committed
- failure rule: no partial duplicate grants; a failed rerun must detect already
  created grants and wallet entries

`provider webhook processing`

- trigger: inbound provider event
- idempotency key: provider key + provider event id
- retry: exponential backoff with dead-letter queue after repeated failure
- failure rule: event remains replayable; no event is dropped because processing
  failed once
- stale event rule: ignore state rewrites when the incoming provider update is
  older than the stored provider-updated timestamp or equivalent monotonic
  marker for the affected object

`auto-recharge`

- trigger: low-balance threshold crossing
- idempotency key: billing account + policy version + threshold window
- retry: safe retry while purchase remains incomplete
- failure rule: no repeated topup creation for the same threshold crossing

`past-due transitions`

- trigger: invoice due-date and retry schedule evaluation
- idempotency key: invoice id + target lifecycle state
- failure rule: transition must be safe to replay and must emit audit events

`invoice assembly`

- trigger: billing-account cycle close or scheduled invoice run
- idempotency key: billing account + period start + period end + currency
- failure rule: reruns must not duplicate charges or invoice documents

## 18. Testing Strategy

We should test billing at four levels.

### 18.1 Domain unit tests

- plan price resolution
- entitlement resolution
- wholesale rate resolution
- credit bucket ordering
- interval rules
- downgrade timing rules

### 18.2 Integration tests

- subscription change preview
- subscription commit
- provider webhook idempotency
- invoice run assembly and provider tax snapshot
- managed workspace reassignment
- client sell-price collection and payout ledger FX normalization
- actor-based credit consumption (firm user vs client user)
- special pricing resolution
- promotion redemption

### 18.3 State transition tests

We should also test allowed transitions for:

- subscription lifecycle
- invoice lifecycle
- webhook processing lifecycle
- credit grant lifecycle
- subscription change request lifecycle

### 18.4 Contract tests

- billing read-model payloads
- plan management snapshot payloads
- credit wallet payloads

### 18.5 End-to-end tests

- free to paid upgrade
- paid to paid change
- downgrade to free
- buy credits
- auto-recharge trigger

## 19. Operational Requirements

Billing needs stronger than average operational discipline.

Required properties:

- idempotent webhook processing
- immutable invoice history after issuance
- auditable plan changes
- auditable credit grants and consumption
- auditable pricing agreements, promotions, and price overrides
- replayable provider sync where possible
- clear internal admin visibility into billing state
- first-class billing audit event coverage

### 19.0 Authorization matrix (launch)

`firm admin`

- manage firm subscription
- manage managed-workspace wholesale assignments and sell-price policies
- view payout statements
- view client collection status

`client admin`

- manage self-serve subscription for their own billing account
- manage client wallet topups and auto-recharge for their billing account
- view their own invoices and payment methods

`platform ops/admin`

- perform internal billing support actions
- manage `firm_custom` agreements
- approve and complete manual payouts

Rule:

- no user should be able to manage another billing account without explicit
  tenant relationship or platform-admin authority

## 19.1 Minimum admin and support visibility

Even at launch, internal operators should be able to inspect:

- billing account
- current subscription
- workspace billing ownership
- current credits and recent wallet entries
- provider customer and provider invoice references
- webhook events and processing failures
- billing audit events

This does not need to be a polished admin app immediately, but it should be
available.

### 19.1A Minimum admin and support actions

At launch, internal operators should also be able to:

- replay a failed provider webhook
- grant credits manually to a billing account
- void an internal invoice before or after provider sync where business rules
  allow
- record a manual payout approval and mark payout completion
- apply a manual billing adjustment or credit memo
- create or update a `billing_price_agreement` for `firm_custom`
- mark a collection or payout issue for manual investigation

## 19.2 State models to define before implementation

Before building, we should define allowed transitions for:

- subscriptions
- invoices
- provider webhook events
- subscription change requests
- credit grants or credit wallet states where relevant

We do not need beautiful diagrams immediately, but we do need explicit allowed
state transitions.

### 19.2A Minimum launch state transitions

`subscriptions`

- `trialing -> active`
- `active -> past_due`
- `past_due -> active`
- `past_due -> suspended`
- `active -> cancel_scheduled`
- `cancel_scheduled -> canceled`

`invoice_documents`

- `draft -> open`
- `open -> paid`
- `open -> past_due`
- `past_due -> paid`
- `open -> void`
- `past_due -> void`

`billing_provider_webhook_events`

- `received -> processing`
- `processing -> processed`
- `processing -> failed`
- `failed -> processing` on replay

`billing_subscription_change_requests`

- `requested -> committed`
- `requested -> failed`
- `requested -> canceled`

Launch access rule:

- `active` and `trialing` keep normal access
- `past_due` may retain grace access briefly
- `suspended` blocks paid entitlements but should preserve enough access to fix
  billing

## 20. What We Should Explicitly Avoid

- storing only current credit balance without ledger entries
- putting provider metadata at the center of plan logic
- inferring billing ownership from incidental company flags
- using the accounting ledger as the commercial source of truth
- coupling UI page payloads directly to write models
- mixing firm wholesale price with firm sell price
- conflating invoice cycle with subscription interval
- assuming every managed workspace under a firm must share the same billing
  interval
- forcing a USD-only internal commercial ledger when the firm settlement
  currency is NGN or another market currency
- treating Stripe coupons or metadata as canonical pricing truth

## 20.1 Launch handling notes

### Refunds, chargebacks, and clawbacks

At launch, refunds and chargebacks may be handled with a manual-first policy as
long as the ledger impact is explicit:

- provider refund or dispute events must create corresponding billing
  adjustments
- if a client collection was already reflected in a firm payout ledger, the
  clawback must be represented as a later negative payout ledger entry or
  adjustment
- no refund or chargeback should silently mutate historical invoice totals

### Proration examples

`firm subscription stub period`

- if a firm starts a monthly paid subscription on May 20 and the firm invoice
  cycle is calendar-month, the first charge covers May 20 through May 31
- June 1 begins the first full monthly cycle

`mid-cycle managed-workspace credit bonus`

- if a managed workspace is added halfway through the firm's billing month, the
  monthly included credit bonus for that workspace is granted at roughly 50% of
  the normal monthly bonus, subject to the chosen day-count and rounding rule

### Usage to credits bridge

Launch usage processing should follow this minimal pipeline:

1. AI telemetry emits a usage event with `usage_event_id`,
   `workspace_company_id`, `actor_type`, and metered cost basis
2. billing resolves the responsible billing account from actor type and
   ownership context
3. billing converts the metered cost basis into credit minor units using the
   current pricing rule
4. billing creates `credit_consumptions` plus corresponding wallet-entry
   debits idempotently by `usage_event_id`

### Grant versus wallet-entry rule

- `credit_grants` are the business records explaining why credits came into
  existence
- `credit_wallet_entries` are the append-only balance deltas that affect
  available wallet state
- every grant must create at least one wallet entry, but not every wallet entry
  is itself a grant

### Entitlement snapshot write policy

Entitlement snapshots should be written or refreshed when:

- subscription state changes
- workspace ownership changes
- managed-workspace assignment changes
- price agreement or promotion state changes when they affect entitlement
- trial, suspension, or cancellation state changes

Product reads may use snapshots by default, with live resolver fallback for
support or reconciliation flows.

### Domain integration hooks

At launch, billing should integrate with existing product lifecycle events such
as:

- firm creation or activation -> create firm billing account
- managed workspace becomes firm-managed -> create ownership row, client
  billing account where required, and managed-workspace assignment
- managed workspace leaves firm management -> end-date ownership and assignment
- onboarding completion or payment-method setup -> unlock relevant billing flows

## 21. Recommended First Implementation Sequence In This Repo

If implementation starts soon, the first backend PR sequence should be:

1. Introduce new billing domain skeleton under `apps/api/src/domains/billing`.
2. Add new contract files and mark the old billing contract file as legacy.
3. Add plan catalog migrations and seed data for launch pricing.
4. Add billing accounts and workspace ownership migrations.
5. Add subscriptions and subscription change request migrations.
6. Add managed workspace pricing policy, price override, and wholesale snapshot
   migrations.
7. Add pricing agreement, promotion, redemption, and billing audit event
   migrations.
8. Implement entitlement resolver.
9. Implement plan management snapshot and preview APIs.
10. Add provider adapter boundary and Stripe implementation.
11. Replace dialog mocks with real snapshot and preview calls.
12. Add commit-change and checkout flows.

This sequence gives us the first real vertical slice without prematurely
committing to a bad internal model.

## 22. Final Recommendation

We should treat billing as a foundational product subsystem, not a settings page
feature.

The correct long-term architecture for Accountable Books is:

- internal commercial billing core
- explicit ownership and entitlements
- ledgered credits
- derived invoices
- pluggable provider execution
- optional downstream accounting integration

If we build that now, we will avoid the most common failure mode in early
billing systems: shipping something that works for one provider and one page,
then spending the next year undoing it.
