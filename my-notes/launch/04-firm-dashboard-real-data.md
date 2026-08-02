# 04 — Firm Dashboard on Real Data (Roster + Task Queue)

Goal: the firm's home screens — client roster and task queue — show real clients and
real work. Today `FirmDashboardPage` (routes `/:companyId/queue` and
`/:companyId/clients` via `apps/web/src/features/accounting/temp-index.tsx`) is
entirely mock-backed.

## Current state (verified 2026-07-19)

- **Mocks in play** (`apps/web/src/modules/company/firm-practice/`): dashboard shell
  (`mock-firm-dashboard-shell.ts` — aggregate stats, weekly activity, staff options),
  client roster (`mock-firm-clients.ts`), task queue (`mock-firm-task-queue.ts`),
  all served through `api/*.ts` + `model/hooks.ts`.
- **Two task-queue contracts exist — this is important:**
  - Legacy/mock: `…/schema/source/accounting/firm-task-queue.ts`
    (`FirmTaskQueueResponse`, 9 aspirational task types) — what the UI consumes today.
  - Real: `…/schema/source/work/work-queue.ts` (`WorkQueueResponse`) — the
    work_item-native shape served by the REAL, tested API
    `GET /api/:companyId/work-queue` (`apps/api/src/domains/work/`), which
    materializes `categorize_transactions` and `review_suggestions` work items with
    exact subjects, effective owners, and deep-link destinations. Its own doc comment
    says it intentionally supersedes the legacy shape.
- **Roster contract (frozen, small):**
  `…/schema/source/accounting/firm-client-roster.ts` — `FirmClientSummary`
  { id, name, shortCode?, industry?, openTaskCount, lastActivityLabel,
  status: healthy|overdue|need_attention|new, assignee?, transactionStats? } — note
  `assignee` and `transactionStats` are **optional**.
- **Real sources available:** accessible companies per firm
  (`getAccessibleCompaniesForUser`), work-queue counts, close-readiness per company
  (`domains/reporting/close-readiness/`), bank connection status
  (`domains/banking/`), notifications domain.

## Design decisions (made)

1. **Task queue: adapt the UI to the real `WorkQueueResponse`. Do not build a backend
   for the legacy contract.** One canonical path — the work_item system is it. The
   mapping work happens in the web module (a translation layer from `WorkQueueItem`
   to what the queue rows render). Task types beyond
   categorize/review (close_period, reconnect_bank, …) are **absent at launch** — the
   queue shows what the materializer produces. Do not extend the materializer in this
   workstream.
2. **Roster: new endpoint** `GET /api/:companyId/firm/clients` returning
   `FirmClientRosterResponse`, assembled from real data with deliberately simple
   status derivation:
   - `new` — client created < 14 days ago with no posted entries yet;
   - `need_attention` — any disconnected/errored bank connection, OR open work-queue
     items above a threshold (pick one number, e.g. 25, as a named constant);
   - `overdue` — close-readiness reports an overdue open period;
   - `healthy` — otherwise.
   `openTaskCount` = work-queue open item count for that client.
   `lastActivityLabel` = humanized latest of (last sync, last posting) — both exist.
   **Omit `assignee` and `transactionStats` at launch** (schema-optional). If the UI
   renders holes for them, hide those columns/cells.
3. **Shell: shrink to what is real.** Staff options come from the real team list
   (workstream 05's endpoint). Aggregate performance stats and weekly activity charts:
   **hide the panels** at launch rather than compute pretend numbers. Honest surface
   beats full surface (same principle as the demo script's "don't show broken pages").
4. Roster endpoint lives with the firms domain
   (`apps/api/src/domains/accountingFirms/` or a new `firm-practice` read module —
   follow where `getAccessibleCompaniesForUser` and firm assignment live; keep reads
   in one place, behind `checkCompanyId` + firm-role check like workstream 03).

## Steps

1. Map the queue UI's rendered fields to `WorkQueueResponse` fields; write the
   adapter; swap `api/task-queue.ts` mock for the real `/work-queue` call; verify
   deep links land in the Cat Engine with the right client + filters (the
   destination object in the contract carries workspace + filters — the Cat Engine
   already supports filtered entry; verify the exact param wiring).
2. Build the roster endpoint + tests: seed a firm with 2–3 clients in different
   states (fresh, disconnected bank, overdue period) and assert statuses; parse with
   `firmClientRosterResponseSchema`.
3. Swap `api/client-roster.ts` mock; "open client book" goes through the existing
   `use-open-client-book.ts` / company switch.
4. Shell: real staff options (from 05), hide unbacked panels, delete
   `mock-firm-dashboard-shell.ts` when nothing imports it.
5. Local + staging verification with a seeded multi-client firm.

## Success criteria

- [ ] `grep -rln "MOCK_" apps/web/src/modules/company/firm-practice` → empty.
- [ ] Queue shows real work items for the firm's clients; clicking one lands in that
      client's Cat Engine, filtered to the exact subjects; completing the work makes
      the item close/shrink on refetch (materializer behavior — verify, don't build).
- [ ] Roster shows every client created via workstream 03 with a derived status; the
      three seeded states render correctly; opening a client switches company context.
- [ ] Firm-role gating: a client_owner user navigating to `/queue` or `/clients` is
      redirected (already coded in `temp-index.tsx`) AND the APIs themselves 403
      non-firm callers (defense in depth, tested).
- [ ] No hidden panel renders skeletons/spinners forever — hidden means not rendered.

## Out of scope

Extending the work materializer with new task types (close_period, reconnect_bank…),
assignee management UI, transaction-stats sparklines, aggregate/weekly analytics,
client archiving. All post-launch backlog.
