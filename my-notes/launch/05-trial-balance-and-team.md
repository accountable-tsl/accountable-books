# 05 — Credibility Small Wins: Trial Balance UI, Team List, Honest Surface

Goal: three small items that make the product credible to an accountant. Each is
days-not-weeks because the hard half already exists.

## A. Trial Balance page (backend done, page is a 12-line stub)

Current state: `apps/web/src/features/accounting/trial-balance/page.tsx` says
"Content will be implemented next." The API is real and tested:
`GET /api/:companyId/balances/trial-balance` (+ `POST …/refresh`) in
`apps/api/src/domains/balances/` — it was even part of the investor demo script as a
curl. The route is already in the sidebar.

Decisions:
- Consume the existing endpoint as-is. If its shape is awkward for the UI, adapt in
  the web module — do not redesign the API before launch.
- Columns: account code/name, debit, credit; grouped by account element (the element
  hierarchy is in the COA data the web already loads for the Cat Engine); totals row
  must visibly foot (debits = credits).
- Period selection: same period-picker component the dashboard uses
  (`dashboard-client/components/report-period-picker.tsx` / `period-utils.ts`).
- Keep it read-only. No drill-through at launch (ledger page is post-launch).

Success criteria:
- [ ] Page renders real data for the demo company; totals foot; period switch works.
- [ ] One number cross-checked by hand against the statements (workstream 02) on
      staging, noted in `my-notes/launch/smoke-runs.md`.
- [ ] Stub text gone.

## B. Team members list (mock → the data already in the DB)

Current state: `apps/web/src/modules/company/team-settings/api/team-members.ts`
returns `MOCK_TEAM_MEMBERS_RESPONSE`. The real data exists (users + company role
grants — the same tables `checkCompanyId` / `getAccessibleCompaniesForUser` query, and
`user-roles` has `POST /grant-access`), but there is **no list endpoint**.

Decisions:
- Add `GET` list endpoint in `apps/api/src/domains/user-roles/` (it owns grants):
  members of a company with name, email, role, status. Shape it to what the settings
  UI + workstream 04's staff options need — check the mock's shape first and keep it
  if reasonable (the UI was built against it).
- Swap the web mock; also feed workstream 04's shell staff options from it.
- If the settings page has invite-member UI, wire it to the existing grant/invite
  primitives (03 builds the token-accept path; reuse it for staff with the
  appropriate firm role instead of `client_owner`).

Success criteria:
- [ ] Settings → Team shows the real members of the current company with roles.
- [ ] `grep -rn "MOCK_TEAM_MEMBERS" apps/web/src` → empty.
- [ ] A staff member invited to the firm appears in the list and in the firm
      dashboard staff options after accepting.

## C. Honest surface (hours, not days)

The demo-script principle, applied to the product: do not show placeholder pages.

- Remove/hide sidebar links and routes for: **Ledger** page and **Account notes**
  page (12-line stubs in `apps/web/src/features/accounting/`), and the `/table`
  dev-demo route in `App.tsx` (`components/data-table/fake`).
- Billing settings page: keep it, but make the copy honest for Gate A — current plan
  "Beta", a contact link, no fake subscription state. (Real billing is workstream 06;
  the mock currently invents plans and a subscription.)
- Leave `data-export.tsx` alone (intentionally kept, unreachable).

Success criteria:
- [ ] No route reachable from the UI renders scaffold text or fake data-table demos.
- [ ] Clicking every sidebar item on staging lands on a real, working page.

## Out of scope

Ledger drill-through page, account notes feature, role editing UI, member removal
flows, audit views. Post-launch.
