# Workspace Provisioning

> **Status:** Implemented
> **Purpose:** How workspaces are created and repaired.

This document explains how the app creates and repairs workspaces.

It is written for someone new to the codebase and is organized around the system's mental model first, then the code.

## What A Workspace Is

A workspace is the company-scoped area the product operates on.

In the database, the main anchor row is in `companies`, but a usable workspace is more than a single company row. A usable workspace needs:

1. a company record
2. a workspace class
3. a firm assignment
4. billing ownership
5. chart of accounts
6. company settings
7. at least one workspace role grant

The main orchestration function that creates those pieces for a new company is [`provisionCompanyWorkspace`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L1059).

There is also a second function, [`reconcileCompanyWorkspace`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L1089), which is used when the company row already exists and we want to bring the rest of the workspace back into the expected state. This matters later for rerunnable bootstrap and demo flows, but the main creation path to understand first is `provisionCompanyWorkspace`.

## Two Important Classifications

The `companies` table stores two separate concepts:

1. `type`
2. `workspace_class`

The schema lives in [`20250403194332_companies.ts`](../../apps/api/migrations/20250403194332_companies.ts#L9) and the runtime schema/types live in [`companies.types.ts`](../../apps/api/src/domains/companies/companies.types.ts#L79).

### Company Type

`companies.type` describes what kind of organization the company is in product terms:

- `business`
- `individual`
- `accounting_firm`

At first glance someone might ask: "isn't an accounting firm also a business?" In a general real-world sense, yes. But in this product, `accounting_firm` is separated because it behaves differently:

- it has firm-specific metadata like a slug
- it can manage client workspaces
- it assigns to itself rather than to the platform
- it gets different default roles and billing behavior

So `type` is not trying to be a universal business taxonomy. It is a product behavior classification.

### Workspace Class

`companies.workspace_class` describes what kind of workspace the row represents in the system:

- `customer`
- `demo`
- `platform`
- `partner`

Helper functions live in [`workspace-class.ts`](../../apps/api/src/domains/companies/workspace-class.ts#L1):

- [`isDemoWorkspace`](../../apps/api/src/domains/companies/workspace-class.ts#L3)
- [`isPlatformWorkspace`](../../apps/api/src/domains/companies/workspace-class.ts#L9)
- [`isPartnerWorkspace`](../../apps/api/src/domains/companies/workspace-class.ts#L15)

What the classes mean:

- `customer`
  - a workspace created for an actual user through signup or admin flows; the default for all real signups, whether a business, individual, or accounting firm
- `demo`
  - a demo/sandbox workspace used for seeded demo experiences
- `platform`
  - the app's internal platform workspace; home of platform-only roles and the fallback managing firm when no partner can be resolved or when platform assignment is explicitly requested
- `partner`
  - an accounting firm workspace that acts as the managing firm for directly-signed-up client workspaces; see below

**On `partner` workspaces:** the product is primarily built for accounting freelancers and accounting firms. Businesses and individuals can also sign up directly, and when they do, they are assigned to a partner accounting firm rather than managing their own books independently. At launch, two partner firms cover the initial markets: one for Nigeria, one for the US and everywhere else. New partner firms will be onboarded as the network grows and the routing system matures.

Examples:

- a normal accounting-firm signup becomes `type = accounting_firm`, `workspace_class = customer`
- a business or individual signup becomes `type = business` or `type = individual`, `workspace_class = customer`, assigned to a partner firm through the routing rules below
- the platform workspace is `type = accounting_firm`, `workspace_class = platform`
- the Veyra NG and Veyra US launch partner firms are `type = accounting_firm`, `workspace_class = partner`
- demo businesses are `type = business`, `workspace_class = demo`

## Provisioning Policies

Before walking through the pipeline steps, it helps to understand how policy shapes them.

Every call to `provisionCompanyWorkspace` includes a [`WorkspaceProvisioningPolicy`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L52). The policy describes the caller's intent, and [`resolveProvisioningPlan`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L444) translates it into concrete pipeline configuration: which workspace class to assign, which assignment strategy to use, which role to grant, which COA template to load, and what constraints apply.

Current policy kinds:

- `signup` / `admin` — standard user-initiated or admin-initiated workspace creation
  - `workspace_class = customer`
  - accounting firms self-assign
  - non-firms use automatic partner routing, with platform used only as fallback or by explicit request
  - role: `admin` for firms, `client_owner` for non-firms
- `demo` — seeded demo workspace
  - `workspace_class = demo`
  - jobs skipped by default
- `platform_bootstrap` — the single internal platform workspace
  - `workspace_class = platform`
  - self-assigned
  - role: `super_admin` (see note in Platform Bootstrap section)
- `system_seed` — seeded partner firm workspaces
  - `workspace_class = partner`
  - self-assigned
  - role: `admin` (firm-owner role, distinct from platform `super_admin`)

## The Main Provisioning Flow

The main provisioning logic lives in [`company-provisioning.service.ts`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L1).

The easiest way to understand it is to walk through the steps a new workspace goes through.

### 1. Insert The Company Record

Functions: [`insertCompanyRecord`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L527) and [`resolveCompanyInsertInput`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L231)

Before the insert happens, input is normalized by `resolveCompanyInsertInput`. This step is responsible for:

- validating company input
- verifying that `created_by_id` points to a real user
- resolving `country_id` and `reporting_currency_id`
- normalizing timezone
- setting default year-end values, reporting framework, and accounting basis
- setting the final `workspace_class` (driven by the policy)
- generating or validating the short code
- setting the initial onboarding state

**Short codes:** if the caller provides one it is used as-is and fails if already taken. If not, [`generateUniqueShortCode`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L188) generates and retries until it finds a unique value that does not look obviously wrong. Signup, demo seeding, and bootstrap code should not each invent their own short-code rules.

**Onboarding state:** normal workspaces get the standard initial state via `createInitialCompanyOnboardingState`. Seeded, demo, and internal workspaces may intentionally start further along — platform and partner firms use explicit completed state in [`workspace-bootstrap.config.ts`](../../apps/api/src/domains/companies/workspace-bootstrap.config.ts#L62).

This creates the row in the `companies` table and nothing more.

### 2. Create Firm Metadata If Needed

Function:

- [`ensureAccountingFirmMeta`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L549)

This step matters only for accounting-firm workspaces.

It creates or reconciles the row in `accounting_firms_meta`, including the firm's slug. It also enforces slug rules, including reserved-slug restrictions unless policy explicitly allows them.

### 3. Assign The Workspace To A Firm

Function:

- [`ensureCompanyFirmAssignment`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L653)

This step keeps two things in sync:

- `companies.assigned_firm_id`
- `client_firm_assignments`

Assignment strategies are:

- `self`
- `auto`
- `default`
- `explicit`

Partner/platform resolution is centralized in:

- [`resolvePartnerFirmForCompany`](../../apps/api/src/domains/accountingFirms/partner-firm.service.ts#L64)
- [`resolvePlatformFirmId`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L327)

#### Why accounting firms assign to themselves

For accounting-firm-oriented policies, `resolveProvisioningPlan` resolves to `assignmentStrategy: 'self'`, and in `ensureCompanyFirmAssignment` that means:

- `targetFirmId = companyId`

So self-assignment is now a normal provisioning rule, not a bespoke script path.

#### What self-assignment looks like in the database

For an accounting firm:

- `companies.assigned_firm_id = companies.id`
- `client_firm_assignments.accounting_firm_company_id = companies.id`

That is the shape other parts of the system rely on to treat the workspace as self-managed.

#### Customer routing rules

Business and individual workspaces default to `auto`.

`auto` tries to resolve a partner first and falls back to platform only when no partner can be resolved.

For the current launch markets, the routing rule is:

- Nigerian companies -> Nigerian partner firm
- US companies -> US partner firm
- all other companies -> US partner firm

In the future, that routing decision should also consider jurisdiction, partner capacity, service fit, compliance requirements, pricing, language, industry, and other routing rules.

### 4. Provision Billing

Function:

- [`ensureCompanyBilling`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L765)

This step assumes assignment is already correct.

Important behavior:

- accounting firms must already be self-assigned before billing bootstrap succeeds
- non-firm workspaces inherit the correct billing mode from their assignment context

### 5. Provision Chart Of Accounts

Function:

- [`ensureCompanyChartOfAccounts`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L798)

There are two modes:

- `default`
  - uses [`createDefaultAccounts`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L823)
- `template`
  - uses [`loadCoaTemplateForCompany`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L840)

Template selection is decided in:

- [`resolveCoaTemplateName`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L421)

Current behavior:

- platform bootstrap uses the platform template
- system-seeded partner firms use the Veyra template
- demo uses deterministic demo templates
- signup/admin use template mode unless `load_coa_template = false`

Also important:

- if COA already exists, provisioning skips it
- that is one reason rerunning bootstrap or demo apply is safe

### 6. Provision Company Settings

Function:

- [`ensureCompanySettings`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L857)

This creates the settings baseline a workspace needs.

### 7. Grant Workspace Roles

Function:

- [`ensureWorkspaceRoleGrant`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L882)

Typical defaults:

- non-firm workspaces -> `client_owner`
- accounting-firm workspaces -> `admin`
- platform bootstrap -> `super_admin` for the admin user

### 8. Run Post-Commit Side Effects

Function:

- [`runWorkspaceProvisioningSideEffects`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L914)

This is intentionally separated from the main DB transaction.

The provisioning pipeline returns a `pendingSideEffects` descriptor, and callers run it after the transaction commits. That prevents queue/job side effects from firing for a workspace that later rolls back.

## Signup As A Provisioning Entrypoint

Signup is one entrypoint into the provisioning system. It is not a separate provisioning architecture.

Main function:

- [`registerNewAccount`](../../apps/api/src/features/signup/signup.service.ts#L46)

User creation:

- [`createUserDirect`](../../apps/api/src/domains/users/users.model.ts#L58)

The transaction boundary lives in:

- [`createUserAndCompany`](../../apps/api/src/features/signup/signup.service.ts#L190)

The flow is:

1. validate signup input
2. create the user
3. call `provisionCompanyWorkspace`
4. commit
5. run post-commit provisioning side effects
6. run analytics/email side effects

Signup outcomes:

- business / individual signup
  - `workspace_class = customer`
  - assigned to a partner firm through automatic routing
  - role = `client_owner`
- accounting-firm signup
  - `workspace_class = customer`
  - self-assigned
  - firm meta required
  - role = `admin`

If `load_coa_template = false`, signup keeps COA mode as `default` rather than forcing a template.

## Demo As A Provisioning Entrypoint

Demo company creation lives in:

- [`createDemoCompaniesAndUsers`](../../apps/api/seeds/demo/config/002_companies/companies.fn.ts#L28)

Behavior:

- new demo companies call [`provisionCompanyWorkspace`](../../apps/api/seeds/demo/config/002_companies/companies.fn.ts#L134)
- existing demo companies call [`reconcileCompanyWorkspace`](../../apps/api/seeds/demo/config/002_companies/companies.fn.ts#L127)

The old separate demo COA step is intentionally a no-op in:

- [`003_coa/coa.fn.ts`](../../apps/api/seeds/demo/config/003_coa/coa.fn.ts#L1)

because demo company provisioning now ensures COA during the main pipeline.

## Why Reconciliation Exists

At this point the reason for `reconcileCompanyWorkspace` should make sense.

Use:

- [`reconcileCompanyWorkspace`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L1089)

when the company row already exists and you want to make sure the rest of the workspace is still complete and correct.

Typical reasons:

- bootstrap commands are rerun
- demo seed commands are rerun
- an existing workspace needs missing provisioning pieces repaired
- we want one repair path instead of many ad hoc “top-up” scripts

Rule of thumb:

- no company row yet -> `provisionCompanyWorkspace`
- company row already exists -> `reconcileCompanyWorkspace`

## Platform And Partner Bootstrap

Canonical workspace bootstrap lives in the app bootstrap pipeline:

- [`canonical-workspaces.bootstrap.ts`](../../apps/api/src/bootstrap/phases/canonical-workspaces.bootstrap.ts)
- [`canonical-workspaces.ts`](../../apps/api/src/bootstrap/catalogs/workspaces/canonical-workspaces.ts) (seed catalog)
- [`workspace-bootstrap.config.ts`](../../apps/api/src/domains/companies/workspace-bootstrap.config.ts) (re-exports IDs/slugs used by provisioning)

### Platform Workspace

Main entry:

- [`bootstrapCanonicalWorkspaces`](../../apps/api/src/bootstrap/phases/canonical-workspaces.bootstrap.ts) (phase in `runBootstrap`)

What it does for the platform workspace:

1. resolve the configured admin user and system user
2. check whether the platform workspace already exists
3. provision or reconcile the platform workspace through the unified pipeline
4. grant special platform roles (`super_admin` / `system_user`)

This is important because support-access and break-glass flows rely on the platform admin having `super_admin`.

### Partner Firms

Partner firms are the accounting firm workspaces that manage directly-signed-up client workspaces. At launch there are two: Veyra NG (Nigeria) and Veyra US (everywhere else). These are the firms client workspaces are assigned to when a user signs up without an existing accounting firm relationship.

Their seed definitions live in:

- [`CANONICAL_WORKSPACES`](../../apps/api/src/bootstrap/catalogs/workspaces/canonical-workspaces.ts)

They are provisioned through the same `bootstrapCanonicalWorkspaces` phase (partner entries in the catalog).

Both use the `system_seed` policy: `workspace_class = partner`, self-assigned, firm meta required.

As more partner firms are onboarded, new entries are added to `CANONICAL_WORKSPACES` and the bootstrap command is rerun. The jurisdiction-based assignment logic that decides which partner firm a new client goes to will be extended separately as that system matures.

## Commands And Startup Flow

The simple operational flow is:

1. `pnpm run migrate:local`
2. `pnpm run bootstrap:local`
3. optionally `pnpm run demo -- apply`

Relevant commands live in:

- [`package.json`](../../apps/api/package.json#L24)

The main bootstrap command entrypoint is:

- [`bootstrap-workspaces.ts`](../../apps/api/scripts/bootstrap-workspaces.ts#L1)

There are also narrower commands when needed:

- [`bootstrap-platform-workspace.ts`](../../apps/api/scripts/bootstrap-platform-workspace.ts#L1)
- [`seed-system-firms.ts`](../../apps/api/scripts/seed-system-firms.ts#L1)

## Why Migrations Are Not The Business Bootstrap Layer

The intended boundary is:

- migrations create schema and prerequisites
- app-layer bootstrap commands create business workspaces

That is why these later migrations are intentionally no-ops:

- [`20260522120000_veyra_advisory_firms.ts`](../../apps/api/migrations/20260522120000_veyra_advisory_firms.ts#L1)
- [`20260522130000_platform_workspace_bootstrap.ts`](../../apps/api/migrations/20260522130000_platform_workspace_bootstrap.ts#L1)

## Test Database Setup

Test DB setup lives in:

- [`config/test-db.ts`](../../apps/api/config/test-db.ts#L33)

After migrations run, test setup also runs:

- [`runBootstrap`](../../apps/api/config/test-db.ts) (includes the `canonical-workspaces` phase)

That means tests see the same platform/partner workspace baseline that the application expects in real environments.

## Main Tables To Inspect While Debugging

If you are tracing workspace creation, these are the main tables to inspect:

- `users`
- `companies`
- `accounting_firms_meta`
- `client_firm_assignments`
- `workspace_billing_ownership`
- `coa`
- `company_settings`
- `user_company_roles`

## Recommended Reading Order

If you want to walk the code in order:

1. [`companies.types.ts`](../../apps/api/src/domains/companies/companies.types.ts#L79)
2. [`company-provisioning.service.ts`](../../apps/api/src/domains/companies/company-provisioning.service.ts#L231)
3. [`signup.service.ts`](../../apps/api/src/features/signup/signup.service.ts#L46)
4. [`companies.fn.ts`](../../apps/api/seeds/demo/config/002_companies/companies.fn.ts#L28)
5. [`canonical-workspaces.bootstrap.ts`](../../apps/api/src/bootstrap/phases/canonical-workspaces.bootstrap.ts)
6. [`package.json`](../../apps/api/package.json)

## The Main Rule

If you remember only one thing, remember this:

`provisionCompanyWorkspace` is the place that turns a company into a usable workspace.

Everything else should either:

- gather input for it
- choose the right policy
- call bootstrap wrappers that eventually use it
- or reconcile an existing workspace through the same pipeline
