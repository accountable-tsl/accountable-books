# Workspace Provisioning Walkthrough

This note explains how a company becomes a usable workspace in the app today.

It is written for someone visiting the codebase for the first time and focuses on:

- what a workspace is
- what kinds of workspaces exist
- which functions are authoritative
- what happens during signup
- how platform and partner workspaces are bootstrapped
- where demo provisioning fits

It intentionally avoids exposing secrets, concrete credential values, or any operational details that would make abuse easier.

## What A Workspace Is

A workspace is the company-shaped unit that the product operates on.

In practice, a usable workspace is more than just one row in `companies`. A usable workspace needs:

- a company record
- a workspace class
- a firm assignment
- billing ownership
- chart of accounts
- company settings
- at least one workspace role grant

The canonical orchestration entrypoint for that is [`provisionCompanyWorkspace`](apps/api/src/domains/companies/company-provisioning.service.ts).

If you are reading this area for the first time, start by understanding `provisionCompanyWorkspace`. There is also a repair/re-run entrypoint, `reconcileCompanyWorkspace`, but it makes more sense after you have seen signup, demo, and bootstrap flows, so this note introduces it later.

## Workspace Classes

There are four workspace classes:

- `customer`
- `demo`
- `platform`
- `partner`

They are stored durably on `companies.workspace_class` in the schema at [`20250403194332_companies.ts`](apps/api/migrations/20250403194332_companies.ts) and in the runtime type/schema at [`companies.types.ts`](apps/api/src/domains/companies/companies.types.ts).

Helpful runtime helpers live in [`workspace-class.ts`](apps/api/src/domains/companies/workspace-class.ts):

- `isDemoWorkspace`
- `isPlatformWorkspace`
- `isPartnerWorkspace`

## Company Type vs Workspace Class

Two separate concepts matter:

- `companies.type`
  - `business`
  - `individual`
  - `accounting_firm`
- `companies.workspace_class`
  - `customer`
  - `demo`
  - `platform`
  - `partner`

Examples:

- a normal accounting-firm signup becomes `type = accounting_firm`, `workspace_class = customer`
- the platform workspace is `type = accounting_firm`, `workspace_class = platform`
- seeded Veyra firms are `type = accounting_firm`, `workspace_class = partner`
- demo businesses are `type = business`, `workspace_class = demo`

## The One Provisioning Pipeline

The provisioning service lives in [`company-provisioning.service.ts`](apps/api/src/domains/companies/company-provisioning.service.ts).

### Public entrypoints

- [`provisionCompanyWorkspace`](apps/api/src/domains/companies/company-provisioning.service.ts)
  - create a new workspace from scratch

There is also a repair/re-run entrypoint, [`reconcileCompanyWorkspace`](apps/api/src/domains/companies/company-provisioning.service.ts), but treat that as a second concept. The main mental model should start with `provisionCompanyWorkspace`.

### Internal steps

The main building blocks are:

- `insertCompanyRecord`
- `ensureAccountingFirmMeta`
- `ensureCompanyFirmAssignment`
- `ensureCompanyBilling`
- `ensureCompanyChartOfAccounts`
- `ensureCompanySettings`
- `ensureWorkspaceRoleGrant`
- `runWorkspaceProvisioningSideEffects`

The pipeline composition lives in `runWorkspacePipeline`.

### What the insert step does

`resolveCompanyInsertInput` is the insert normalizer. It:

- validates input
- checks that `created_by_id` refers to a real user
- resolves `country_id`
- resolves `reporting_currency_id`
- normalizes timezone
- generates a unique short code
- sets default year-end values
- sets default reporting framework and accounting basis
- sets default onboarding state
- sets the final `workspace_class`

This is important because it means callers should not hand-roll these defaults elsewhere.

### How short code is determined

Short code generation is centralized in `generateUniqueShortCode`.

Behavior:

- if a caller supplies a short code, that exact value is used
- if it is already taken, provisioning fails
- if no short code is supplied, one is generated
- generated values are retried until they are unique
- obviously weird generated codes are skipped before use

This means short code generation is not supposed to be reimplemented by signup, demo seeds, or bootstrap code.

### How onboarding state is determined

There are two main onboarding-state paths:

- default company onboarding state comes from `createInitialCompanyOnboardingState` and is applied in `resolveCompanyInsertInput`
- signup/demo code may override that when it intentionally wants a "completed" onboarding state

Examples:

- standard signup usually gets the normal initial onboarding state
- demo signup/workspaces can be marked complete up front in [`signup.service.ts`](apps/api/src/features/signup/signup.service.ts) and [`companies.fn.ts`](apps/api/seeds/demo/config/002_companies/companies.fn.ts)
- bootstrap platform and seeded partner firms use explicit completed onboarding state in [`workspace-bootstrap.config.ts`](apps/api/src/domains/companies/workspace-bootstrap.config.ts)

## Provisioning Policies

Provisioning behavior is driven by `WorkspaceProvisioningPolicy` in [`company-provisioning.service.ts`](apps/api/src/domains/companies/company-provisioning.service.ts).

Current policy kinds:

- `signup`
- `platform_bootstrap`
- `system_seed`
- `demo`
- `admin`

Policy resolution happens in `resolveProvisioningPlan`.

That function decides:

- final workspace class
- assignment strategy
- default role grant
- side-effect mode
- COA mode/template
- whether firm meta is required
- whether firm meta can be updated
- whether reserved slugs are allowed
- whether reassignment is allowed

Notable current behavior:

- `platform_bootstrap`
  - becomes `workspace_class = platform`
  - self-assigned
  - gets `super_admin` as its primary owner role (see note below)
- `system_seed`
  - becomes `workspace_class = partner`
  - self-assigned
  - gets `admin` as its primary owner role (this is the firm-owner role, distinct from platform `super_admin`)
- `demo`
  - becomes `workspace_class = demo`
  - skips jobs by default
- `signup` / `admin`
  - default to `workspace_class = customer`
  - non-firms go to the platform
  - accounting firms self-assign

### Why the platform workspace gets `super_admin` and not `admin`

The platform bootstrap grants `super_admin` to the admin user — not just `admin`. This is intentional and load-bearing.

Support-access and break-glass logic (see [`support-access.model.ts`](apps/api/src/domains/support-access/support-access.model.ts)) requires the platform admin to hold `super_admin`. Downgrading this to `admin` breaks break-glass access. Do not change this without understanding that dependency.

### Why accounting firms assign to themselves

That behavior comes from policy plus assignment strategy:

- in `resolveProvisioningPlan`, accounting-firm-oriented policies resolve to `assignmentStrategy: 'self'`
- in `ensureCompanyFirmAssignment`, `self` means `targetFirmId = companyId`

So self-assignment is not a special-case script anymore. It is a normal provisioning rule.

## What "Assigned To A Firm" Means

Firm assignment is owned by `ensureCompanyFirmAssignment`.

It keeps two things in sync:

- `companies.assigned_firm_id`
- `client_firm_assignments`

Assignment strategies:

- `self`
- `default_platform`
- `explicit`

Platform lookup is centralized in `resolvePlatformFirmId`, which resolves the company currently marked as the platform workspace.

### What self-assignment looks like in the database

For an accounting firm workspace, self-assignment means:

- `companies.assigned_firm_id = companies.id`
- `client_firm_assignments.accounting_firm_company_id = companies.id`

That is what allows billing and access logic to consistently treat the workspace as self-managed.

## Billing, COA, Settings, Roles

These are provisioned in one place now:

- billing: `ensureCompanyBilling`
- chart of accounts: `ensureCompanyChartOfAccounts`
- settings: `ensureCompanySettings`
- direct workspace roles: `ensureWorkspaceRoleGrant`

This is the main drift-reduction win of the refactor: callers should not manually create these pieces anymore.

### How chart of accounts is chosen

COA provisioning is owned by `ensureCompanyChartOfAccounts`.

There are two modes:

- `default`
  - creates default accounts through `createDefaultAccounts`
- `template`
  - loads a template through `loadCoaTemplateForCompany`

Template selection is resolved in `resolveCoaTemplateName`.

Current behavior:

- platform bootstrap uses the platform template
- system-seeded partner firms use the Veyra template
- demo uses deterministic demo templates
- signup/admin use template mode unless `load_coa_template = false`

Also note:

- if COA already exists, provisioning skips creating it again
- this is why rerunning bootstrap or demo apply is safe

## Signup Flow

Signup is handled by [`registerNewAccount`](apps/api/src/features/signup/signup.service.ts).

The actual transactional flow is:

1. validate input
2. create the user via `createUserDirect`
3. create the workspace via `provisionCompanyWorkspace`
4. commit
5. run non-blocking side effects post-commit (see below)

The user+workspace transaction boundary lives in `createUserAndCompany`.

### Post-commit side effects

The provisioning pipeline does not run side effects inside the transaction. Instead, it returns a `pendingSideEffects` descriptor — `{ companyId, userId, mode }` — that the caller runs after the transaction commits.

This is intentional: if the transaction rolls back, there are no orphaned jobs. Side effects (like enqueuing a fiscal calendar setup job) only execute once the workspace is durably committed.

The caller pattern in [`signup.service.ts`](apps/api/src/features/signup/signup.service.ts):

```
const { pendingSideEffects } = await createUserAndCompany(...)  // commits
await runWorkspaceProvisioningSideEffects(pendingSideEffects)    // post-commit
```

Do not move side-effect execution inside a transaction block. That is the invariant this design is protecting.

### Signup outcomes

- business / individual signup
  - workspace class: `customer`
  - assigned to platform
  - role: `client_owner`
- accounting-firm signup
  - workspace class: `customer`
  - self-assigned
  - firm meta required
  - role: `admin`

If `load_coa_template = false`, policy resolution keeps that as a `default` COA mode instead of forcing a template. That behavior is in `resolveProvisioningPlan`.

## Demo Workspaces

Demo company creation lives in [`createDemoCompaniesAndUsers`](apps/api/seeds/demo/config/002_companies/companies.fn.ts).

Important behavior:

- new demo companies call `provisionCompanyWorkspace`
- existing demo companies call `reconcileCompanyWorkspace`
- demo COA is no longer provisioned in a second path

The old separate demo COA step is intentionally a no-op in [`003_coa/coa.fn.ts`](apps/api/seeds/demo/config/003_coa/coa.fn.ts) because demo company provisioning already ensures COA during the main pipeline.

### Why reconciliation exists

This is the point where `reconcileCompanyWorkspace` becomes easier to understand.

`reconcileCompanyWorkspace` exists for cases where the `companies` row already exists, but we still want to run the same provisioning guarantees again.

Typical reasons:

- bootstrap commands are rerun
- demo seed commands are rerun
- an existing workspace needs missing provisioning pieces repaired
- we want one safe repair path instead of many ad hoc "top-up" scripts

Rule of thumb:

- new company row needed → `provisionCompanyWorkspace`
- company row already exists → `reconcileCompanyWorkspace`

## Platform Workspace

The platform workspace is bootstrapped through [`bootstrapPlatformWorkspace`](apps/api/src/domains/companies/workspace-bootstrap.service.ts).

Supporting config lives in [`workspace-bootstrap.config.ts`](apps/api/src/domains/companies/workspace-bootstrap.config.ts), including the fixed `PLATFORM_WORKSPACE_ID` used to identify the workspace across environments.

What it does:

- resolves the configured admin user and system user
- checks whether the platform workspace already exists
- provisions or reconciles the workspace through the unified provisioning pipeline
- grants special platform roles after provisioning
  - admin user gets `super_admin`
  - system user gets `system_user`

The special role grant happens in `grantSpecialPlatformRoles`.

### Command

The main command is:

- `pnpm run bootstrap`

Code path:

- script entrypoint: [`bootstrap-workspaces.ts`](apps/api/scripts/bootstrap-workspaces.ts)
- service entrypoint: `bootstrapApplicationWorkspaces` in [`workspace-bootstrap.service.ts`](apps/api/src/domains/companies/workspace-bootstrap.service.ts)

There is also a narrower platform-only command:

- `pnpm run bootstrap:platform`

Code path:

- [`bootstrap-platform-workspace.ts`](apps/api/scripts/bootstrap-platform-workspace.ts)

## Partner Workspaces

Today, the seeded partner firms are the two Veyra firms.

Their app-layer bootstrap seed definitions live in `BOOTSTRAP_SYSTEM_FIRMS` in [`workspace-bootstrap.config.ts`](apps/api/src/domains/companies/workspace-bootstrap.config.ts).

They are provisioned through `seedSystemFirms` in [`workspace-bootstrap.service.ts`](apps/api/src/domains/companies/workspace-bootstrap.service.ts).

Command:

- `pnpm run seed:system-firms`

Code path:

- script entrypoint: [`seed-system-firms.ts`](apps/api/scripts/seed-system-firms.ts)

More partner firms can be added later by extending the seed definitions and reusing the same `system_seed` policy path.

## Operational Startup Flow

The intended simple startup flow is:

1. `pnpm run migrate`
2. optionally `pnpm run demo:apply`

Note: locally, `pnpm run migrate` already bundles `bootstrap:local` as part of its script, so you do not need to run bootstrap separately after a local migrate. The explicit `pnpm run bootstrap` command exists for cases where you want to rerun bootstrap independently (e.g. after changing bootstrap config without changing schema).

Relevant scripts are defined in [`package.json`](apps/api/package.json).

### Why this matters

We do not want two conflicting bootstrap stories:

- "migrations create business workspaces"
- "commands create business workspaces"

The current intent is:

- migrations create schema and prerequisites
- app-layer bootstrap commands create business workspaces

That boundary is reflected by these no-op migrations:

- [`20260522120000_veyra_advisory_firms.ts`](apps/api/migrations/20260522120000_veyra_advisory_firms.ts)
- [`20260522130000_platform_workspace_bootstrap.ts`](apps/api/migrations/20260522130000_platform_workspace_bootstrap.ts)

## Test Database Setup

Test DB creation and migration live in [`config/test-db.ts`](apps/api/config/test-db.ts).

After migrations run, test setup also runs app-layer workspace bootstrap in `setupTestDatabase`.

That is important because tests should see the same platform/partner baseline the app expects in real environments.

## Tables You Will Usually Touch While Debugging This

When tracing workspace creation, these tables are the main ones to inspect:

- `users`
- `companies`
- `accounting_firms_meta`
- `client_firm_assignments`
- `workspace_billing_ownership`
- `coa`
- `company_settings`
- `user_company_roles`

## Suggested Reading Order

If you are brand new to this area, read in this order:

1. [`companies.types.ts`](apps/api/src/domains/companies/companies.types.ts)
2. [`workspace-class.ts`](apps/api/src/domains/companies/workspace-class.ts)
3. [`company-provisioning.service.ts`](apps/api/src/domains/companies/company-provisioning.service.ts)
4. [`signup.service.ts`](apps/api/src/features/signup/signup.service.ts)
5. [`workspace-bootstrap.service.ts`](apps/api/src/domains/companies/workspace-bootstrap.service.ts)
6. [`002_companies/companies.fn.ts`](apps/api/seeds/demo/config/002_companies/companies.fn.ts)
7. [`package.json`](apps/api/package.json)

## Practical Mental Model

If you remember only one thing, remember this:

`provisionCompanyWorkspace` is the place that turns a company into a usable workspace.

Everything else should either:

- gather input for that function
- choose the right policy
- call the bootstrap wrapper that eventually uses it
- or reconcile an existing workspace through the same pipeline

That is the main anti-drift rule for this area of the codebase.
