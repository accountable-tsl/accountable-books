# Company access model (origins and support tooling)

> **Status:** Implemented
> **Purpose:** Access origins and permission levels (firm, demo, support, break-glass).

## Purpose

Company access was moved from “this user can reach this company” to **every company access has a clear origin and a clear permission level**. The API can distinguish:

- a real company admin
- a firm admin
- demo visibility
- internal/platform access
- a temporary support grant
- a temporary break-glass session

## Core types

Auth context for each accessible company is shaped by `AccessibleCompanies` in:

- `apps/api/src/domains/user-roles/user-roles.types.ts`

Relevant fields:

- `accessOrigin` — why the user can see this company
- `supportAccessLevel` — grant capability when origin is `support_grant`
- `supportGrantId` / `breakGlassSessionId` — stable references for audit and UI
- `isPlatformCompany` — internal/platform company marker (alongside other company metadata)

## How access is resolved

**Entry point:** `getAccessibleCompaniesForUser` in `apps/api/src/domains/user-roles/user-roles.model.ts`.

The service loads role assignments, then builds the accessible company list by merging, in order:

1. **Explicit direct company access** and **explicit firm-mediated access** (from role rows → `userRoleToAccessibleCompany`).
2. **Active break-glass sessions** (`getActiveBreakGlassCompaniesForUser`).
3. **Active support grants** (`getActiveSupportGrantCompaniesForUser`).
4. **Demo visibility** (`getDemoCompanies`, mapped via `demoToAccessibleCompany`), excluding companies the user already has via explicit roles.

The **merge** that produces the final `accessibleCompanies` array is performed in `getAccessibleCompaniesForUser` (see the `mergeAccessibleCompanies` call in that function — currently around **lines 431–436** in the same file).

**Platform users** no longer receive ambient access to ordinary customer companies solely because they hold a platform role. They only see companies that appear in that merged list (grants, break-glass, demos, explicit roles, platform-internal assignments, etc.).

### Platform user with an empty company list

If a user is flagged as `isPlatformUser` but the merged list is **empty**, `getAccessibleCompaniesForUser` can still return **success** with `accessibleCompanies: []` (it errors only when there are no companies **and** the user is not a platform user). That is intentional: it preserves “has platform identity” for flows that do not require a company. **Company-scoped routes** still fail closed in `checkCompanyId` until at least one company row exists in the list.

## Request path: company middleware

**File:** `apps/api/src/core/middlewares/companies.middleware.ts` — `checkCompanyId`.

For each request it:

1. Resolves the company identifier safely (`getCompanyIdentifiers`).
2. Loads the user’s access profile (`getAccessibleCompaniesForUser`).
3. Hydrates platform flags onto `req.user` (`isPlatformUser`, `platformUserKey`) when the profile says the user is platform, so handlers and policies can read them without re-querying.
4. **Allows the request through only if** the resolved company **short code** appears in `accessibleCompanies`. Otherwise it responds **403**. There is **no** synthetic “platform bypass” row for companies missing from the list.

## Request path: PATCH company / workspace profile

**Policy:** `apps/api/src/domains/companies/companies.workspace-mutation.policy.ts` — `getWorkspaceCompanyPatchDeniedReason`.

PATCH permission is derived from `accessOrigin` (and related fields), not from “any access”:

- **Demo companies:** only platform users may PATCH (`req.user.isPlatformUser`).
- **`platform_internal`:** allowed.
- **`break_glass`:** allowed.
- **`support_grant`:** allowed only when `supportAccessLevel === 'company_profile_write'`; read-only grants are denied for profile mutation.
- **Explicit firm / company roles:** same admin rules as before (firm `admin`; client `client_owner` / `client_admin`).

`checkCompanyId` already guarantees the caller has **some** authorized path to the company; the policy enforces **who may mutate** profile fields and keeps demo workspaces safe.

## Helper: `hasAccessToCompany`

`hasAccessToCompany` in `user-roles.model.ts` treats access as **membership in `accessibleCompanies`** for the resolved company (no blanket `isPlatformUser` shortcut). When a row exists, `accessReason` aligns with the row’s `accessOrigin`.

## Support access domain (first-class workflow)

Support access is implemented as its own domain instead of middleware exceptions:

| Area   | Location                                                         |
| ------ | ---------------------------------------------------------------- |
| Model  | `apps/api/src/domains/supportAccess/supportAccess.model.ts`      |
| HTTP   | `apps/api/src/domains/supportAccess/supportAccess.controller.ts` |
| Routes | `apps/api/src/domains/supportAccess/supportAccess.routes.ts`     |

Capabilities include listing grants, creating and revoking grants, and opening/closing break-glass sessions. **HTTP details and response shapes** are documented in [Support Access API](../api/support-access.md).

## Database

Migration: `apps/api/migrations/20260406055806_support_access.ts`

Tables:

- `company_support_access_grants`
- `company_break_glass_sessions`

These store grantee, granter, level, status, expiry, and revoke/close metadata for **time-boxed, auditable** access.

## Safety and operations

- **Audit events:** `apps/api/src/domains/supportAccess/supportAccess.audit.ts`
- **Break-glass notifications:** `apps/api/src/domains/supportAccess/supportAccess.email.ts`
- **Product/security policy** (who may grant, break-glass rules, PATCH matrix): [Customer support access policy](../security/customer-support-access-policy.md)
- **Runbook:** [Support access operations](../runbooks/support-access-operations.md)

Post-implementation tightening worth noting in code reviews:

- Support assignees see **only their own active grant** when listing, not full grant history (controller behavior).
- `AppError`-style validation and lookup failures preserve correct HTTP semantics in the support access controller and model.
- Optional close reasons are normalized and validated before persistence in the model layer.

## Impact summary

- Auth context is **richer and explicit** per company.
- Company access is **list-backed and fail-closed** at the middleware.
- Support access is a **real domain** with APIs and persistence.
- PATCH protection for company/workspace profile updates is **harder to bypass** because mutation is tied to **origin and level**, not merely “can open the company.”

## Related code references

| Concern                        | File                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Accessible company shape       | `apps/api/src/domains/user-roles/user-roles.types.ts`                                                   |
| Building `accessibleCompanies` | `apps/api/src/domains/user-roles/user-roles.model.ts` (`getAccessibleCompaniesForUser`, merge ~431–436) |
| Company route gate             | `apps/api/src/core/middlewares/companies.middleware.ts`                                                 |
| PATCH authorization            | `apps/api/src/domains/companies/companies.workspace-mutation.policy.ts`                                 |
