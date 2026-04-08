# Support Access API

## Purpose

These endpoints provide explicit, auditable support access to customer companies without granting blanket platform access.

Base route:

- `/api/:companyId/support-access`

## Company Context Fields

Auth and access responses may now include:

- `accessOrigin`
- `supportAccessLevel`
- `supportGrantId`
- `breakGlassSessionId`
- `isPlatformCompany`

Important behavior:

- `isPlatformUser` indicates platform identity, not automatic access to customer companies.
- A platform user may receive a successful auth context with `accessibleCompanies: []`.
- Company-scoped routes should still deny access unless the target company appears in `accessibleCompanies`.

## Data Shapes

Contract source:

- `packages/contracts/accountable_contracts/schema/source/accounting/support-access.ts`

Important enums:

- `supportAccessLevel`
  - `read_only`
  - `company_profile_write`
- `supportAccessOrigin`
  - `explicit_company`
  - `explicit_firm`
  - `demo`
  - `platform_internal`
  - `support_grant`
  - `break_glass`

## Endpoints

### `GET /api/:companyId/support-access/grants`

Lists support grants for a company.

Allowed callers:

- `client_owner`
- `client_admin`
- `super_admin`
- granted support assignee for that company

Behavior:

- company admins and `super_admin` see active and recent grant history
- support assignees see only their own active grant row

Success:

- `200 OK`
- body: `listSupportGrantsResponse`

Errors:

- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`

### `POST /api/:companyId/support-access/grants`

Creates a support grant.

Allowed callers:

- `client_owner`
- `client_admin`

Body:

- `supportUserId`
- `supportAccessLevel`
- `expiresAt`
- `reason`

Validation:

- `reason` is required and max 500 chars
- `expiresAt` is required and must be in the future
- `read_only` max TTL: 7 days
- `company_profile_write` max TTL: 24 hours
- write grants are rejected for `support_agent`
- demo and internal/platform companies reject support grants

Success:

- `201 Created`
- body: `supportGrantResponse`

Errors:

- `400 INVALID_INPUT`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`

### `POST /api/:companyId/support-access/grants/:grantId/revoke`

Revokes an active support grant immediately.

Allowed callers:

- `client_owner`
- `client_admin`

Body:

- optional `reason`

Success:

- `200 OK`
- body: `supportGrantResponse`

Errors:

- `400 INVALID_INPUT`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 OPERATION_NOT_ALLOWED`

### `POST /api/:companyId/support-access/break-glass-sessions`

Opens a temporary emergency access session.

Allowed callers:

- `super_admin`

Body:

- `expiresAt`
- `reason`

Validation:

- `reason` is required and max 500 chars
- `expiresAt` is required and must be in the future
- max TTL: 1 hour
- demo and internal/platform companies reject break-glass

Success:

- `201 Created`
- body: `breakGlassSessionResponse`

Errors:

- `400 INVALID_INPUT`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`

### `POST /api/:companyId/support-access/break-glass-sessions/:sessionId/close`

Closes an active break-glass session.

Allowed callers:

- `super_admin`

Body:

- optional `reason`

Success:

- `200 OK`
- body: `breakGlassSessionResponse`

Errors:

- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 OPERATION_NOT_ALLOWED`

## Audit Events

- `support_access.grant_created`
- `support_access.grant_revoked`
- `support_access.break_glass_opened`
- `support_access.break_glass_closed`

## Notifications

V1 sends customer-admin email notifications when break-glass access is opened and when it is closed.
