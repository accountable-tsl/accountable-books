# 03 — Firm → Client Onboarding

Goal: an accounting firm can add a client company and start doing its books, and can
optionally invite the client's owner. This is the front door of the firm product and
today it does not exist at the API level at all.

## Current state (verified 2026-07-19)

- **Contract (frozen):**
  `packages/contracts/accountable_contracts/schema/source/accounting/firm-client-invite.ts`.
  A multi-step wizard shape: invite (email, role fixed to `client_owner`, expiry),
  client company details as a discriminated union `business | individual`, and an
  optional firm-staff assignee. Response: `{ invitationId, status: 'pending',
  expiresAt, clientCompanyId }`.
- **UI:** the invite wizard exists and validates with the contract;
  `apps/web/src/modules/company/firm-practice/api/invite-firm-client.ts` returns a
  hardcoded response (its header comment plans batch/CSV + chat-driven invites — both
  post-launch).
- **Provisioning: exists and canonical.**
  `provisionCompanyWorkspace` in
  `apps/api/src/domains/companies/company-provisioning.service.ts` creates the full
  usable workspace (company row, workspace class, firm assignment, billing ownership,
  chart of accounts, settings, role grant). It already serves signup, demo seeds, and
  partner bootstrap. Read `my-notes/workspace-provisioning-walkthrough.md` first.
- **Adjacent pieces that exist:** user invite email template
  (`apps/api/src/features/communications/email/email-templates.ts`
  `getUserInviteTemplate`), durable email queue/worker, `domains/tokens` (verify what
  token flows it supports today), `user-roles` `POST /grant-access`, multi-company
  access via `getAccessibleCompaniesForUser` + the `CompanySwitcher` UI.
- **Missing:** any HTTP endpoint for "firm adds client"; an invitation record; an
  accept-invite path in signup (verify — it may partially exist around `tokens`).

## Design decisions (made)

1. **Managed-first.** Creating a client must NOT require the client's participation.
   `POST /api/:companyId/firm/clients` (`:companyId` = the firm's company, behind
   `checkCompanyId` + a firm-role check) synchronously provisions the client workspace
   via `provisionCompanyWorkspace` (workspace class `customer`, firm assignment to the
   calling firm) and returns `clientCompanyId`. The firm can immediately open the
   workspace, connect banks (in person with the client), or upload statements (the
   upload path is real today).
2. **Invite is an optional attachment, not the mechanism.** If the wizard includes an
   invite email, persist an invitation row (new table: invitation id, firm company,
   client company, email, role `client_owner`, token reference, expiry, status
   pending/accepted/expired) and send the invite email through the existing email
   queue. Design the accept path around whatever `domains/tokens` already supports —
   extend it rather than inventing a parallel token system.
3. **Accept flow:** invite link → if no account, signup (existing form) with the token
   attached → on completion, grant `client_owner` on that client company only, mark
   invitation accepted. If an account exists, login → same grant. No firm visibility
   for the client user beyond their own company.
4. **Assignee:** if provided, grant the named firm staff member the working role on the
   client company (same grant primitive). Nothing fancier; the task queue's ownership
   model (`domains/work/work-ownership.ts`) already derives from real grants.
5. **The response must satisfy the frozen contract.** For a no-invite (managed) create,
   still return an `invitationId`-shaped record (the invitation row can represent a
   "not sent" state) OR — if that offends the data model — add a sibling
   contract for managed creation and use it from the wizard's "skip invite" path.
   Prefer the first; only touch the contract if genuinely necessary, and update the
   wizard in the same PR if you do.
6. **30-day expiry sweep:** there is precedent for offer expiry via the scheduler
   (historical bank import offers expire after 30 days — see
   `feat(api): expire unused historical bank import offers after 30 days`,
   commit 10fc9c7f). Copy that pattern for invitation expiry.

## Steps

1. Read `workspace-provisioning-walkthrough.md`, `company-provisioning.service.ts`,
   the contract file, and the wizard UI. Map every contract field to a provisioning
   input; list any field with no home (e.g. industry on individual) and decide
   store-vs-drop explicitly.
2. Migration: invitations table (follow migration conventions in
   `my-notes/migrations.md` — inline field definitions, explicit schema).
3. Endpoint + service: create-client (+ optional invite). Role check: only firm
   admin/manager roles may create clients (roles exist — check
   `isFirmBookkeepingRole` usage in web and its API counterpart).
4. Accept path: token verify → signup-join or login-join → grant → mark accepted.
5. Wire the wizard: replace the mock in
   `modules/company/firm-practice/api/invite-firm-client.ts` with the HTTP call.
6. Tests (route-level, using the API sandbox harness):
   - firm creates managed client → firm user can access it; it appears in
     `getAccessibleCompaniesForUser`; COA + settings exist (provisioning completeness).
   - invite accept → invitee has `client_owner` on that company; **isolation test:**
     invitee gets 403 on the firm's other client companies and on the firm company.
   - non-firm user calling the endpoint → 403. Expired token → clean error.
   - response parses with `firmClientInviteResponseSchema`.

## Success criteria

- [ ] On staging: sign up a firm, add a client company without any invite, open its
      workspace from the switcher, upload a bank statement, categorize one
      transaction. Zero manual DB steps.
- [ ] On staging: add a second client WITH an invite to a real email you own; accept
      it in an incognito window; the client sees exactly one company; the firm sees
      both clients.
- [ ] All tests in step 6 green; `grep -rn "MOCK_FIRM_CLIENT_INVITE" apps/web/src`
      returns nothing.
- [ ] The invitation row lifecycle (pending → accepted / expired) is visible in the
      DB and the expiry sweep runs on the scheduler.

## Out of scope

Batch/CSV client import, chat-driven invite, client-portal experience beyond "client
owner can log into their own books", firm staff management UI (05 covers listing;
richer role management is post-launch), transferring clients between firms.
