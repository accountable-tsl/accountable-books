# Company Context Middleware Rollout

## Goal

- Resolve `:companyId` once at request boundary and expose canonical company UUID to handlers.
- Remove ad-hoc `getCompanyUUID(...)` calls from controllers/models over time.

## Current Middleware Contract

- `checkCompanyId` now sets:
  - `req.company` (existing access context, backward compatible)
  - `req.companyContext.identifier` (incoming route/body/query identifier)
  - `req.companyContext.shortCode` (canonical short code)
  - `req.companyContext.uuid` (canonical UUID for DB usage)

## Phase 1 (Completed in this PR)

- AI routes migrated to read `req.companyContext.uuid`:
  - `POST /api/:companyId/ai/chat`
  - `GET /api/:companyId/ai/threads`
  - `POST /api/:companyId/ai/threads`
  - `GET /api/:companyId/ai/threads/:threadId/messages`

## Phase 2 (Next)

- Migrate company-scoped controllers under:
  - `/api/:companyId/settings`
  - `/api/:companyId/projects`
  - `/api/:companyId/contacts`
  - `/api/:companyId/journals`
  - `/api/:companyId/ledgers`
  - `/api/:companyId/coa`
  - `/api/:companyId/categorization`
- Rule: controller/service entry should consume `req.companyContext.uuid` for DB operations.

## Phase 3 (Cleanup)

- Remove redundant `getCompanyUUID(...)` calls in migrated flows.
- Add guardrails:
  - lint/search check to flag new direct conversions in controller layer
  - tests for middleware behavior with UUID + short-code inputs

## Definition of Done

- All company-scoped routes using `checkCompanyId` consume canonical `req.companyContext.uuid`.
- No per-controller identifier translation remains in migrated domains.
