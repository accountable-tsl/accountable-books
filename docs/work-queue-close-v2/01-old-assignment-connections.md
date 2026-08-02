# Old assignment system — everything connected

Phase 0 inventory (see `00-notes.txt`). Purpose: track every writer/reader
of the old client-to-firm model so each can be repointed to the new engagement
system, then this list becomes the deletion checklist.

Old model: `companies.assigned_firm_id` (denormalized pointer) +
`client_firm_assignments` (canonical, one active row per client) +
`firm_user_client_assignments` (staff-to-client, no roles, "oldest row" = owner).

## Writers — repoint first

I

- [ ] `company-provisioning.service.ts::ensureCompanyFirmAssignment` — writes `client_firm_assignments` + `companies.assigned_firm_id` together. Called from `createCompany`, `provisionCompanyWorkspace`/`reconcileCompanyWorkspace` (signup, demo seed, canonical bootstrap).
- [ ] `partner-firm.service.ts::resolvePartnerFirmForCompany` — auto-routing logic feeding the above; port the country-based rule into new-engagement creation.
- [ ] `user-roles.model.ts::grantAccessToFirmClient` — writes `firm_user_client_assignments`.
- [ ] `companies.model.ts::updateCompany` — unguarded second writer to `companies.assigned_firm_id` via `PATCH /companies/:id`. Remove, don't migrate — it's a drift bug.

## Readers of `client_firm_assignments`

- [ ] `work-ownership.ts::resolveFirmCompanyId` — also used by `activity-intent.ts::writeActivityEventIntent`
- [ ] `bankAccountNotifications.ts::resolveManagingFirmCompanyId` / `OrNull`
- [ ] `user-roles.model.ts::getFirmMediatedRoles` — access control, top priority
- [ ] `user-roles.model.ts::grantAccessToFirmClient` (read-before-write check)
- [ ] `billing/provisioning.service.ts::resolveAssignedFirmId`
- [ ] `task-evaluation.worker.ts` sweep job
- [ ] `canonical-workspaces.bootstrap.ts::verifyExistingCanonicalWorkspace`
- [ ] `seeds/.../companies.fn.ts::deleteDemoCompanies`

## Readers of `firm_user_client_assignments`

- [ ] `work-ownership.ts::resolveEffectiveOwnerUserId` / `loadEffectiveOwnerUserIds` — becomes Primary Bookkeeper lookup
- [ ] `work-materialization.ts::materializeBankAccountScope`
- [ ] `work-queue.read.ts` — assignee display/context via `loadEffectiveOwnerUserIds`
- [ ] `bankAccountNotifications.ts::loadFirmAssigneeRecipient`
- [ ] `user-roles.model.ts::getFirmMediatedRoles`

## Readers of `companies.assigned_firm_id`

- [ ] `companies.model.ts::fetchCompanies` — join + filter + DTO fields
- [ ] `firms.model.ts::getCompanySlug`
- [ ] `user-roles.model.ts::getDirectCompanyRoles`, `getDemoCompanies`
- [ ] `support-access.model.ts::getCompanyAccessRow`, `getActiveSupportGrantCompaniesForUser`, `getActiveBreakGlassCompaniesForUser`
- [ ] `close-readiness.service.ts` — `firmCompanyId` on evaluation + `getAudience` / `getSurfaces`
- [ ] `company-provisioning.service.ts::ensureCompanyBilling` — requires firm self-assignment before billing bootstrap
- [ ] `billing/provisioning.service.ts::resolveCommercialMode`, `resolvePayerBillingAccount`
- [ ] `subdomain.middleware.ts` (via `req.company.assignedFirmSlug`)
- [ ] `signup.service.ts::trackSignupEvents` + `event-catalog.ts` (`signup.completed`/`workspace.created` analytics)
- [ ] `canonical-workspaces.bootstrap.ts::verifyExistingCanonicalWorkspace`

## Frontend (`apps/web`) — swap DTO fields, no logic to port

- [ ] `app-sidebar.tsx`, `FinancialSettings.tsx`, `settings-company-page.tsx`, `billing-visibility.ts`, `settings-sections.ts`, `switchCompany/hooks.ts`, `routes/registry.ts`, `CompanyInfo.tsx`
- [ ] `Onboarding.tsx` — `assignedFirmName` / `assignedFirmLogo`
- [ ] `modules/company/companies/api/index.ts` — maps `assignedFirmSlug` → `slug` on update
- [ ] `company-defaults.ts`, `model/types.ts` — defaults / DTO surface

## Delete last — schema, types, contracts

- [ ] Migration to drop `client_firm_assignments`, `firm_user_client_assignments`, `companies.assigned_firm_id` (column/FK/index)
- [ ] `companies.types.ts` — `assigned_firm_id` in `newCompanyInput`, `fieldToColumnMap` entry
- [ ] `companies.utils.ts` — `CompanyCloseReadinessContext.assigned_firm_id`
- [ ] `db.types.ts` — `clientFirmAssignments`/`newFuca` zod schemas
- [ ] `knex.d.ts` — table types for both assignment tables
- [ ] `company-provisioning.audit.ts` — `firmAssignmentPayload` / `company.firm_assignment_provisioned` (decide: keep as historical trail or replace)
- [ ] `packages/contracts/.../accounting/company.ts` — `assignedFirmId` in `companyResponse` and `updateCompanyPayload`
- [ ] `firms.model.ts::getCompanySlug` Redis cache keys, if the slug-resolution join changes shape

## Docs to update / archive

- [ ] `docs/architecture/workspace-provisioning.md`
- [ ] `docs/architecture/transaction-flow-to-work-queue-build-map.md`
- [ ] `docs/archive/architecture/accountable-engage-design.md`
- [ ] `apps/api/src/domains/billing/README.md`

## Test fixtures to rewrite

`company-provisioning.service.test.ts`, `companies.workspace-mutation.policy.test.ts`,
`companies.model.test.ts`, `companies.controller.test.ts`, `user-roles.test.ts`,
`bankAccounts.creation.test.ts`, `provisioning.service.test.ts`, `coa.concurrency.test.ts`,
`coa.lifecycle-resolution.test.ts`, `signup.service.test.ts`, `auth.controller.test.ts`,
`support-access.controller.test.ts`, `companies.middleware.test.ts`,
`capture-product-event.test.ts`, `companies.test.ts` (seed), `work-materialization.test.ts`,
`categorization-materialization.test.ts`, `activity-outbox.test.ts`,
plus `apps/web` tests stubbing `assignedFirmSlug`/`assignedFirmIsPlatform` on company fixtures.
