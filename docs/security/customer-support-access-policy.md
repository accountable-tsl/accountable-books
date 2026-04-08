# Customer Support Access Policy

## Purpose

This policy defines how Accountable staff may access customer workspaces without relying on blanket platform access.

## Access Origins

Every company access context should now carry both:

- `roleKey` and `roleScope`: who the caller is
- `accessOrigin`: why the caller can access that company

Supported `accessOrigin` values:

- `explicit_company`
- `explicit_firm`
- `demo`
- `platform_internal`
- `support_grant`
- `break_glass`

## Core Rules

- Platform identity is not the same thing as company access.
- Platform users do not receive ambient access to normal customer companies.
- A platform user may legitimately have `accessibleCompanies: []`.
- Platform users may directly access internal/platform companies and demo companies.
- Demo companies remain read-only for all non-platform users.
- Customer companies may be accessed through:
  - explicit company membership,
  - explicit firm-mediated access,
  - an active customer-granted support access grant,
  - an active `super_admin` break-glass session.

## Support Grants

- Only `client_owner` and `client_admin` may create or revoke support grants.
- Support grants are assigned to a named support user.
- `support_agent` and `support_admin` may receive `read_only` grants.
- Only `support_admin` may receive `company_profile_write`.
- Support grants are rejected for demo and internal/platform companies.
- Support viewers can list only their own active grant row.
- Company admins can list active and recent grant history for their company.

## Break-Glass

- Only `super_admin` may open or close break-glass sessions.
- Break-glass is only valid for customer companies.
- Break-glass sessions are time-boxed, reason-required, and audited.
- Customer-admin notifications are sent on break-glass open and close in v1.

## PATCH /api/companies/:companyId

Company profile mutation is allowed only when one of these conditions is true:

- `client_owner`
- `client_admin`
- firm `admin`
- `support_grant` with `supportAccessLevel = company_profile_write`
- `break_glass`
- `platform_internal`
- demo company plus `req.user.isPlatformUser === true`

PATCH must be denied for:

- `support_grant` with `read_only`
- non-platform access to demo companies
- all other unsupported or malformed access contexts

## Request-Path Rule

- Company-scoped routes must authorize against `accessibleCompanies`, not against `isPlatformUser` alone.
- `isPlatformUser` is an identity flag used for platform-only behavior such as demo editing, not a general customer-company bypass.

## Operational Notes

- Break-glass is emergency-only and should not be the routine support path.
- New support operations should prefer grants over direct platform edits.
- Audit records must be written for grant creation, grant revocation, break-glass open, and break-glass close.
