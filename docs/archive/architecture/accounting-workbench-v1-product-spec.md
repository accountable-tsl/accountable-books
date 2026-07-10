# Accounting Workbench v1 Product Spec (Archived)

> **Archive status:** Historical product/UX spec — keep for reference; not day-to-day Books guidance.
> **Original status:** Draft for iteration
> **Last updated:** February 20, 2026
> **Owner:** Product + Design + Engineering
> See [docs index](../../README.md#archive).

## 0. Reader Guide

This document is intended to be usable by:

- Designers new to accounting
- Engineers new to this codebase
- Product/operations stakeholders
- Experienced accountants and bookkeepers

How to use this document:

1. Read `Section 0.1` and `Section 0.2` first for context and vocabulary.
2. Read `Sections 16-21` for locked v1 behavior and wireframes.
3. Use `Section 26` as the execution checklist before implementation starts.

### 0.1 Product in One Minute

Accountable Books helps accountants and clients complete monthly bookkeeping and reporting without confusion.

Core outcome:

- Clients always know what action is required from them.
- Bookkeepers always know what to work on next.
- Every reported number can be traced back to source evidence.

### 0.2 Non-Negotiables vs Design Freedom

Non-negotiables:

- Action clarity over visual novelty.
- Drillability from summary numbers to source records.
- Role-aware surfaces (client vs firm) with consistent data truth.
- Strong state handling (no data, initializing, blocked, all clear).

Design freedom:

- Typography and visual style.
- Card and table styling.
- Motion and transitions.
- Iconography and visual polish.

As long as non-negotiables are preserved, designers are free to propose better visual execution.

## 1. Product Position

Decision: The dashboard should not be generic.
We should ship a role-aware, interactive dashboard that feels alive but remains accounting-safe:

- Interactive: users can ask questions, pivot periods, filter entities, and jump straight into actions.
- Natural language accessible: "Ask Accountable" sits on dashboard/workbench and can answer, filter, and deep-link.
- Safe: natural language can suggest and navigate in v1; destructive/accounting mutations always require explicit confirmation in structured UI.

## 2. North Star

Users move from ingest -> classify -> adjust -> close -> report without context switching.
This means one continuous operating model, not disconnected pages.

## 3. Core IA (v1)

1. Dashboard
2. Workbench
3. Close
4. Financials
5. Ledger Explorer (panel-first, not primary nav)

## 4. Role-Specific Dashboard Strategy

### 4.1 Shared skeleton (same framework for all roles)

- Top context bar: company/client, period, accounting basis, search, "Ask Accountable".
- Main grid: KPIs, exceptions, trend cards, task queue.
- Right rail or panel: activity feed + pending approvals/reviews.

### 4.2 Client dashboard (read-first + action prompts)

- Cash and runway, profit trend, receivables/payables signals.
- "Needs your input" queue: uncategorized items requiring owner context, approvals, missing docs.
- Month-end progress: % ready for close.
- Quick links: Go to Workbench filtered views.

### 4.3 Bookkeeper/firm dashboard (operations-first)

- Portfolio view: list of assigned clients with health signals.
- Queue view: uncategorized count, needs-review count, close blockers, overdue tasks by client.
- My work view: "my clients", "my pending reviews", "my posted today".
- Admin-only firm tab: firm-level metrics + firm's own books quick access.

Decision: Firm dashboard should be tabbed:

- Portfolio
- My Work
- Firm Admin (admin role only)

## 5. Workbench: keep and evolve current workspace

Current `Accounting Workspace` is useful, but should evolve from card launcher into the real daily operations cockpit.

Keep route intent:

- `/:companyId/ws/accounting` = Workbench home (operational queue + actions)

Evolve behavior:

- Replace mostly static quick-action cards with live queue blocks and deep links.
- Keep fast actions (connect bank, upload, journals, categorization), but make them contextual with counts/state.

## 6. Trial Balance Access (must be obvious)

Primary:

- Close hub (`/:companyId/ws/accounting/close`) includes Trial Balance as a first-class surface.

Secondary shortcuts:

- Dashboard "Close readiness" card -> Trial Balance.
- Workbench "period exceptions" block -> Trial Balance.
- Financials drill path can open Trial Balance filtered to account/period.

Tertiary:

- Global command/search can jump to Trial Balance by period.

## 7. Trial Balance Presentation

Use these section names:

- Bank-Sourced
- Journal-Sourced
- Consolidated

Each section supports drill:

- Account -> movements -> entries -> source -> files/audit trail.

Notes:

- UI labels may shorten to `Bank`, `Journal`, `Total` in tight tables, but the meaning should remain explicit in tooltips/help text.

## 8. Drill Model (non-negotiable)

Statement line -> account(s) -> period movements -> ledger entries -> source (bank transaction or journal) -> attachment + audit trail.

Rule: Every financial number in v1 must have a visible trace path.

## 9. One Screen System (shared shell)

Use one shell pattern across Workbench, Close, Financials:

- Top context bar
- Left pane: queue/list
- Center pane: working canvas
- Right pane: inspector/detail/actions
- Sticky action row: save/post/review/export

This should reuse the proven split-pane model from:

- `apps/web/src/features/manage-journals/ui/pages/journals-list.tsx`
- `apps/web/src/features/cat-engine/ui/cat-engine.tsx`

## 10. Natural Language Accessibility (v1)

Ship "Ask Accountable" as assistive control, not free-form autopilot.

Allowed in v1:

- Explain numbers and variances.
- Build filters ("show clients with >50 uncategorized txns").
- Navigate ("open Trial Balance for Jan 2026").
- Prepare actions ("draft a close checklist"), then user confirms.

Not in v1:

- Silent posting/reversal/voiding or any mutation without explicit confirm in structured UI.

## 11. Route Map Proposal (aligned to current `apps/web`)

Add/standardize:

- `/:companyId/dashboard` (role-aware content)
- `/:companyId/ws/accounting` (Workbench)
- `/:companyId/ws/accounting/close` (Close Hub)
- `/:companyId/ws/accounting/close/trial-balance`
- `/:companyId/ws/accounting/financials`
- `/:companyId/ws/accounting/financials/:statement` (`pl`, `bs`, `cf`, `notes`)

Ledger Explorer:

- Default as sheet/panel launched from drill context, with optional deep-link URL state.

## 12. Build Sequence

1. Extract reusable workbench shell from Journals/Cat Engine layouts.
2. Implement Close Hub + Trial Balance UI (3 sections + drill chain).
3. Implement Financials using same drill infrastructure.
4. Implement role-aware dashboards as curated entry layers on top.

## 13. Decisions Made in This Draft

- Dashboard is role-aware and interactive, not generic.
- Workspace remains useful and becomes the Workbench.
- Trial Balance is primarily accessed from Close Hub, with dashboard/workbench shortcuts.
- One shell pattern is shared across operations and reporting.
- NL interface is assistive + confirm-gated in v1.

## 14. Recommended Answers to Open Questions

1. Firm dashboard default tab:
   Use `My Work` as default for bookkeepers to reduce morning decision friction. Keep `Portfolio` one click away.

2. Client switching:
   Use both patterns:

- Inline client switcher in top bar for speed.
- Portfolio list for triage and health comparison.

3. Close ownership model:
   Use one accountable owner per client-period in v1, plus optional collaborators/watchers. Move to multi-owner checklists in v1.1+.

4. Notes to accounts:
   Use manual note blocks in v1 with clear links to drilled evidence. Add AI draft suggestions later, but keep explicit user-accepted final text.

5. Permissions baseline:

- Client: view, export, upload docs, respond to requests, no posting/period close.
- Bookkeeper: categorize, journal, post where allowed, cannot close/reopen periods by default.
- Firm admin/manager: full close controls including period close/reopen and approval overrides.

## 15. AI Command Bar Positioning

The existing AI command bar should be used on dashboard pages.

v1 behavior:

- Keep one shared AI surface across dashboard, workbench, close, and financials.
- Provide a lightweight inline "Ask Accountable" input in top context bar.
- Opening the input launches the current AI command bar with page context preloaded.
- AI can explain, filter, and navigate.
- Any mutation path must hand off to structured UI with confirmation.

## 16. Dashboard Blueprints (v1)

### 16.1 Client Dashboard (Action + Confidence)

Primary objective: help clients complete required actions quickly and see business outcomes.

Sections:

- Action Center (top priority)
- Cash and runway snapshot
- Profit trend and variance
- Close readiness progress
- Reports quick access and export
- Activity and decisions feed

Action Center cards:

- Connect bank account
- Reconnect disconnected bank feed
- Upload requested documents
- Respond to bookkeeping clarifications
- Review and approve exceptions

Reports quick access:

- Profit & Loss by period
- Balance Sheet by period
- Cash Flow by period
- Trial Balance export

### 16.2 Firm/Bookkeeper Dashboard (Throughput + Risk)

Primary objective: maximize portfolio throughput while controlling close risk.

Tabs:

- My Work
- Portfolio
- Firm Admin (admin only)

My Work:

- Assigned clients by urgency
- Pending reviews and approvals
- Aging exceptions
- Today targets and completion

Portfolio:

- Client list with health signals
- Close blockers by client
- Needs-client-input queue
- Uncategorized and stale-feed indicators

Firm Admin:

- Firm-level operational metrics
- Capacity utilization
- SLA/risk hotspots
- Access to firm's own books

### 16.3 Critical Review: Client Dashboard (Tightened)

This section is the hard guardrail for v1 scope and quality.

Critical risks to avoid:

- Status-only UI with no action path.
- Generic KPI cards above urgent client tasks.
- Ambiguous month states that do not show owner, due date, or impact.
- "All clear" states when data freshness is unknown (stale/disconnected feeds).
- Forcing clients into accounting internals instead of guided decisions.

Final v1 contract:

1. Above-the-fold must be Action Center

- Show only tasks requiring client action.
- Each task must include: owner, due date/time, consequence, primary CTA.
- One primary CTA per task: `Reconnect`, `Upload`, `Respond`, `Approve`.

2. Readiness Center (month matrix) must be decision-enabled

- Keep full FY month visibility on desktop.
- Month click opens a detail panel with blockers and CTAs.
- Month cells must show count badges (e.g., `2 actions`) not icon-only status.
- Current period auto-selected by default.

3. Month status model must be explicit

- `Closed`
- `Ready for close`
- `Awaiting client`
- `In progress (accountant)`
- `Blocked`
- `Not due`

4. Data reliability strip is mandatory

- `Bank feeds`: connected/disconnected/stale with last sync timestamp.
- `Document completeness`: requested vs received counts.
- No optimistic "healthy" label without these checks.

5. Reports access is first-class

- Prominent section with period selector and one-click export:
  - Profit & Loss
  - Balance Sheet
  - Cash Flow
  - Trial Balance

6. Clarification flow must be lightweight but present

- v1 uses request/response cards tied to transactions/period tasks.
- Full messaging center remains v1.1.

7. AI assist must be contextual and safe

- "Ask Accountable" can explain readiness gaps and route users to the right task.
- AI cannot finalize accounting mutations directly; user confirms in structured UI.

8. Mobile behavior must prioritize action completion

- Replace full matrix with horizontal month rail + selected-month detail stack.
- Keep Action Center and reconnect/upload/respond CTAs at top.

9. Empty and edge states must be explicit

- No feeds connected -> onboarding-focused state.
- Feeds disconnected -> reconnect-focused state.
- No client tasks -> confirm "All clear" plus next milestone.
- Overdue tasks -> escalated visual priority + urgency label.

10. Instrumentation required from day 1

- Task completion rate by type.
- Time-to-complete from task creation to client action.
- Overdue task count and age.
- Report export usage by statement and period.
- Reconnect success/failure funnel.

Design principle:

- Clients should never ask "what do I do now?" after opening dashboard.
- The UI should always answer: action, deadline, impact, next click.

### 16.4 Final Interaction Defaults (Locked for v1)

1. Bookkeeper view on client dashboard:

- Default is the same core dashboard that clients see.
- Add accountant-only overlay controls:
  - `Viewing as Accountant` indicator.
  - Internal shortcuts (`Open Workbench`, `Assign owner`, `Internal note`).
  - Optional `View as Client` toggle to verify client experience.

2. Mobile Readiness Center behavior:

- Use a horizontal month rail (`Jan ... Dec`) plus one selected-month detail card.
- Do not use four generic swipe cards as the primary pattern.
- Detail card supports swipe left/right to move month context.
- Show compact status counters above rail: `Awaiting client`, `Blocked`, `In progress`.

3. Collapsible behavior:

- `Action Center`: collapsible, but auto-expanded when any overdue or due-soon client task exists.
- `Readiness Center`: collapsible, default expanded for current open period.
- Collapsed headers must always show summary counts and highest-priority state.

4. Naming standard:

- Use `Center` (US spelling) consistently in UI copy and docs.

### 16.5 Initial Client Dashboard States (Locked for v1)

1. No bank connected (true empty state):

- Primary message: `Connect your first bank account to start bookkeeping.`
- Primary CTA: `Connect bank`
- Secondary CTA: `Upload statement CSV`
- Show a simple 3-step timeline:
  - Connect account
  - Accountant reviews/categorizes
  - Reports become available
- Financial overview cards should be placeholder state, not zero-value fake data.

2. Bank connected, no usable data yet (initializing state):

- Banner: `Bank connected. Importing and preparing your books.`
- Primary CTA: `View connection status`
- Secondary CTA: `Upload missing historical statement` (if gap detected)
- Current period in Readiness Center shows `Initializing`.
- Reports are visible but disabled with expected readiness guidance.

3. Bank connected, data available, no client-owned tasks (all-clear calm state):

- Top card: `[ALL CLEAR] No action needed from you now.`
- Show Financial Overview + Reports Ready + Data Reliability strip.
- Keep `Ask Accountable` and `Message accountant` available.

State priority order (highest first):

1. No bank connected
2. Feed disconnected/stale or initializing
3. Client action required
4. All clear

Guardrail:

- Never show `All clear` when feed freshness/connection checks fail.

### 16.6 Preview Mode (Demo Data) Policy (Locked for v1)

Goal:

- Let new clients experience report flows (including drill paths) before real data is available, without confusing demo data for live books.

Entry:

- Available when company has no usable accounting data yet.
- Accessed via explicit CTA: `Explore sample reports`.

Core rules:

1. Hard separation from live mode

- Demo data must not appear inline with live dashboard cards.
- Enter a distinct `Preview Mode` surface with clear mode framing.

2. Persistent labeling

- Show a red `Demo data` badge in header at all times.
- Show a top banner on every preview page: `This is sample data, not your books.`
- Keep labeling on all drilled views, not just top-level report pages.

3. Feature scope in preview

- Allow report viewing and drill navigation (P&L, Balance Sheet, Cash Flow, Trial Balance).
- Do not allow accounting mutations.
- Export actions must be disabled or clearly labeled `Sample export`.

4. Exit clarity

- Provide a persistent `Back to my dashboard` action.
- Returning exits Preview Mode and restores real state context.

5. CTA priority remains real onboarding

- Primary dashboard CTAs stay focused on real setup (`Connect bank`, `Upload statement`, `Respond`).
- `Explore sample reports` stays secondary.

### 16.7 Value Communication Layer (Locked for v1)

Problem:

- Clients often do not understand what their bookkeeper did, or why it mattered, even when work is progressing.

Solution:

- Make value visible as a first-class dashboard block, not a manual email habit.

Client dashboard must include a `Done / Impact / Needed` summary:

1. Done (what was completed for you)

- Examples: transactions reviewed, journals posted, reconciliations completed.

2. Impact (why it matters)

- Examples: close risk reduced, reports ready earlier, issues prevented.

3. Needed (what we need from you)

- This maps directly to Action Center items and deadlines.

Firm dashboards should include a `Client Update Queue` in `My Work`:

- Clients with pending updates to send
- Clients with no update in 7+ days
- Clients with high blocker count but low visibility

Policy:

- Any time we request client action, we should show a one-line "why this matters" explanation.

## 17. Client Needs Prioritization for v1 and v1.1

v1 must include:

- Bank connect and reconnect flows
- Upload-doc flow tied to action requests
- Clarification request/response flow (simple threaded request log)
- Report viewing and export by period

v1.1 candidates:

- Full messaging center
- Slack integration
- WhatsApp integration

## 18. Branching Recommendation

Yes, create a branch, but avoid an overly broad name like `reporting`.

Recommended:

- `feat/accounting-workbench-v1`

If splitting work:

- `feat/workbench-shell`
- `feat/close-trial-balance`
- `feat/financials-drill`
- `feat/role-aware-dashboard`

Use this doc as the contract for those branches.

## 19. Low-Fidelity Client Dashboard Wireframes (v1)

## 19.1 Desktop: Default (Action Required)

```text
+------------------------------------------------------------------------------------------------------+
| Top Bar: [Client Switcher] [FY/Period] [Basis] [Search] [Ask Accountable] [Notifications] [User]  |
+------------------------------------------------------------------------------------------------------+
| ACTION CENTER (Client-owned tasks only)                                                               |
| [Reconnect GTB feed | Due: Today | Impact: Close delay risk | CTA: Reconnect]                       |
| [Upload VAT receipt pack | Due: Fri | Impact: Filing blocked | CTA: Upload]                         |
| [Clarify "ABC payment" | Due: Thu | Impact: Misclassification risk | CTA: Respond]                  |
+------------------------------------------------------------------------------------------------------+
| READINESS CENTER                                                                                      |
| FY 2026  [<] [>]                                                     [View Reports]                 |
| Jan [Closed]  Feb [Closed]  Mar [Ready]  Apr [Awaiting Client:2]  May [In Progress] ... Dec[NotDue]|
| Legend: Closed | Ready | Awaiting Client | In Progress | Blocked | Not Due                          |
+------------------------------------------------------+------------------------------------------------+
| DATA RELIABILITY                                     | PERIOD DETAIL (selected month: Apr)           |
| Bank feeds: 2 connected, 1 disconnected, last 3h ago | Status: Awaiting client (2 blockers)          |
| Docs: 4 requested / 2 received                        | Blocker 1: Reconnect bank feed                |
|                                                      | Blocker 2: Upload documents                    |
|                                                      | Owner: Client | Due: Apr 25                    |
|                                                      | CTAs: [Reconnect] [Upload] [Ask Accountant]   |
+------------------------------------------------------+------------------------------------------------+
| REPORTS READY                                                                                         |
| [P&L Export] [Balance Sheet Export] [Cash Flow Export] [Trial Balance Export] [Period Selector]     |
+------------------------------------------------------------------------------------------------------+
```

## 19.2 Desktop: All Clear State

```text
+------------------------------------------------------------------------------------------------------+
| ACTION CENTER                                                                                         |
| [ALL CLEAR] Current period has no client blockers. Next milestone: Draft reports ready on Apr 28.    |
| [View readiness details] [View reports]                                                               |
+------------------------------------------------------------------------------------------------------+
| READINESS CENTER                                                                                      |
| Jan[Closed] Feb[Closed] Mar[Closed] Apr[Ready for close] May[Not due] ...                           |
+------------------------------------------------------------------------------------------------------+
| OPTIONAL PROMPTS                                                                                      |
| [Review draft P&L] [Download board pack] [Ask Accountable: explain Apr variance]                     |
+------------------------------------------------------------------------------------------------------+
```

## 19.3 Desktop: Disconnected Feed Priority State

```text
+------------------------------------------------------------------------------------------------------+
| ACTION CENTER (High Priority)                                                                         |
| [WARN] Bank feed disconnected (Primary Operating Account)                                             |
| Impact: Cash/report freshness at risk                                                                  |
| CTA: [Reconnect Now]  Secondary: [Upload statement CSV]                                               |
+------------------------------------------------------------------------------------------------------+
| DATA RELIABILITY                                                                                      |
| Feed health: Disconnected since Apr 17, 09:20                                                         |
| Last successful sync: Apr 17, 08:50                                                                   |
+------------------------------------------------------------------------------------------------------+
```

## 19.4 Mobile: Priority Stack

```text
+---------------------------------------------+
| Top: [Period] [Ask] [Bell]                  |
+---------------------------------------------+
| Action Center (cards)                        |
| 1) Reconnect feed  [Reconnect]               |
| 2) Upload docs     [Upload]                  |
| 3) Clarify txn     [Respond]                 |
+---------------------------------------------+
| Month Rail: Jan Feb Mar Apr* May Jun ...     |
| Selected Month Card (Apr)                     |
| Status: Awaiting client (2)                   |
| Blockers + Due + CTA buttons                  |
+---------------------------------------------+
| Data Reliability Strip                        |
| Feed: Disconnected | Docs: 2/4                |
+---------------------------------------------+
| Reports Ready                                 |
| [P&L] [BS] [CF] [TB]                          |
+---------------------------------------------+
```

## 19.5 Interaction Rules for Wireframes

- Month click/tap updates both `Period Detail` and `Reports` period context.
- Action Center always shows only client-owned tasks.
- At least one direct CTA is visible without opening modals.
- "Ask Accountable" uses current page + selected month context.
- Overdue items sort above due-soon, then informational items.

## 19.6 Low-Fidelity Initial-State Wireframes (v1)

## 19.6.1 No Bank Connected

```text
+------------------------------------------------------------------------------------------------------+
| Top Bar: [Client] [Period] [Ask Accountable]                                                        |
+------------------------------------------------------------------------------------------------------+
| EMPTY STATE                                                                                          |
| Connect your first bank account to start bookkeeping.                                                |
| [Connect bank]   [Upload statement CSV]                                                              |
|                                                                                                      |
| What happens next:                                                                                   |
| 1) Connect account -> 2) Accountant reviews -> 3) Reports become available                          |
+------------------------------------------------------------------------------------------------------+
| PLACEHOLDERS                                                                                         |
| Financial Overview: Available after first sync                                                       |
| Readiness Center: Waiting for first connection                                                       |
| Reports: Locked until initial data prep completes                                                    |
+------------------------------------------------------------------------------------------------------+
```

## 19.6.2 Bank Connected, Initializing

```text
+------------------------------------------------------------------------------------------------------+
| STATUS BANNER                                                                                        |
| Bank connected. Importing and preparing your books.                                                  |
| [View connection status] [Upload missing historical statement]                                       |
+------------------------------------------------------------------------------------------------------+
| READINESS CENTER                                                                                     |
| Current period: Initializing                                                                         |
| Jan[Closed] Feb[Closed] Mar[Initializing] Apr[Not due] ...                                          |
+------------------------------------------------------------------------------------------------------+
| REPORTS READY                                                                                        |
| P&L [disabled]  BS [disabled]  CF [disabled]  TB [disabled]                                         |
| Note: Reports unlock after initial sync and review.                                                  |
+------------------------------------------------------------------------------------------------------+
```

## 19.6.3 Bank Connected, No Client Tasks (All Clear)

```text
+------------------------------------------------------------------------------------------------------+
| ACTION CENTER                                                                                        |
| [ALL CLEAR] No action needed from you now. Next milestone: draft reports on Apr 28.                 |
| [View reports] [Ask Accountable]                                                                     |
+------------------------------------------------------------------------------------------------------+
| FINANCIAL OVERVIEW                                                                                   |
| Cash | P&L trend | Receivables/Payables signals                                                      |
+------------------------------------------------------------------------------------------------------+
| READINESS CENTER + DATA RELIABILITY                                                                  |
| Current period status: In progress (accountant)                                                      |
| Feed freshness: Connected, last sync 2h ago                                                          |
+------------------------------------------------------------------------------------------------------+
```

## 20. Firm Dashboard Model (v1)

### 20.1 Core Intent

The firm dashboard is designed around mode separation:

- `My Work` = execution mode (task-level throughput)
- `Portfolio` = triage mode (client-level risk and prioritization)
- `Firm Admin` = management mode (capacity, SLA, and controls)

This separation is intentional to reduce cognitive load and context switching.

### 20.2 Why `Portfolio` and `My Work` are separate

`Portfolio` answers:

- Which clients are most at risk?
- Where are the biggest close blockers?
- Which clients need escalation this week?

`My Work` answers:

- What should I do next right now?
- Which assigned tasks are due today/overdue?
- What can I complete fastest with highest impact?

Design principle:

- Triage and execution are different mental tasks and should not compete in one dense screen.

### 20.3 Persona Goals

Bookkeeper:

- Clear assigned queue
- Resolve categorization/journal/review blockers
- Hit period deadlines

Firm owner/admin:

- Monitor portfolio risk
- Balance team load
- Prevent SLA misses
- Oversee period close posture

Freelancer:

- Uses both `My Work` and `Portfolio` frequently
- Needs fast mode switching without data-model switching

### 20.4 Tab Contract (Locked for v1)

Default tab behavior:

- Bookkeeper/freelancer default: `My Work`
- Firm admin default: `Portfolio`

Tab purposes:

1. My Work

- Assigned task queue only
- Sorted by urgency then due date
- Includes one-click actions into Workbench/Close flows

2. Portfolio

- One row per client
- Shows health signals and blockers
- Supports filtering by assignee, risk, and period state

3. Firm Admin

- Team capacity view
- SLA/overdue exposure
- Approval queues and escalation controls

### 20.5 Bookkeeper-on-Client View (Locked for v1)

- Bookkeepers see the same core client dashboard as clients by default.
- Accountant-only overlay appears for internal actions:
  - `Viewing as Accountant`
  - `Open Workbench`
  - `Assign owner`
  - `Add internal note`
- Optional `View as Client` toggle for parity validation.

### 20.6 Critical Guardrails for Firm Dashboard

1. No mixed-granularity overload

- Do not combine client portfolio rows and task queue cards in one primary pane.

2. No ambiguous ownership

- Every actionable item must show explicit owner and due date.

3. No vanity metrics without action routes

- Every high-level metric should deep-link to filtered lists.

4. No hidden urgency

- Overdue and due-soon items must be visually prioritized by default.

5. No data ambiguity

- Use consistent period context and freshness indicators across all tabs.

### 20.7 Low-Fidelity Wireframes (Firm Dashboard)

### 20.7.1 Desktop: My Work (Default for Bookkeeper)

```text
+------------------------------------------------------------------------------------------------------+
| Top Bar: [Client Switcher] [Period] [Search] [Ask Accountable] [User]                               |
+------------------------------------------------------------------------------------------------------+
| Tabs: [My Work*] [Portfolio] [Firm Admin?]                                                           |
+------------------------------------------------------------------------------------------------------+
| MY WORK QUEUE                                                                                         |
| [Overdue] Reconcile ABC Holdings - Due: Today - Owner: You - CTA: Open Workbench                    |
| [Due Soon] Review 14 proposed entries - Due: 4pm - Owner: You - CTA: Open Review                    |
| [Due Soon] Close checklist item: TB signoff - Due: Fri - CTA: Open Close Hub                        |
+------------------------------------------------------------------------------------------------------+
| QUICK FILTERS: [Assigned to me] [Overdue] [Due today] [Needs client input] [Open period only]      |
+------------------------------------------------------------------------------------------------------+
| TODAY SUMMARY: Completed 18 | Remaining 7 | At-risk 3                                                |
+------------------------------------------------------------------------------------------------------+
```

### 20.7.2 Desktop: Portfolio

```text
+------------------------------------------------------------------------------------------------------+
| Tabs: [My Work] [Portfolio*] [Firm Admin?]                                                           |
+------------------------------------------------------------------------------------------------------+
| FILTERS: [Team member] [Risk level] [Period status] [Needs client input] [Industry]                 |
+------------------------------------------------------------------------------------------------------+
| CLIENT PORTFOLIO TABLE                                                                               |
| Client            | Period | Health | Blockers | Needs Client | Overdue | Assignee | Last Sync     |
| Alpha Foods       | Apr-26 | High   | 3        | 2            | 1       | Tolu     | 2h ago        |
| Nexus Retail      | Apr-26 | Medium | 1        | 0            | 0       | Amina    | 5h ago        |
| Delta Services    | Apr-26 | Low    | 0        | 0            | 0       | You      | 1h ago        |
+------------------------------------------------------------------------------------------------------+
| Row click -> Client dashboard or filtered Workbench, preserving selected period context              |
+------------------------------------------------------------------------------------------------------+
```

### 20.7.3 Desktop: Firm Admin

```text
+------------------------------------------------------------------------------------------------------+
| Tabs: [My Work] [Portfolio] [Firm Admin*]                                                            |
+------------------------------------------------------------------------------------------------------+
| CLIENT MANAGEMENT                                                                                    |
| [Invite new client]  Total clients: 128  Active: 121  Pending invites: 5  Expired invites: 2       |
+------------------------------------------------------------------------------------------------------+
| CLIENT DIRECTORY                                                                                     |
| Client        | Invite Status | Onboarding | Owner | Last Activity | Open                           |
| Nova Foods    | Accepted      | Active     | Tolu  | 2h ago        | [Open Client]                 |
| Axis Trade    | Pending       | Not started| Amina | 3d ago        | [Open Client]                 |
| Peak Studio   | Expired       | Not started| You   | 7d ago        | [Re-send Invite]              |
+------------------------------------------------------------------------------------------------------+
| TEAM CAPACITY                                                                                         |
| Member   | Assigned | Completed Today | Overdue | Utilization | Reassign CTA                        |
| Tolu     | 34       | 12              | 4       | 91%         | [Reassign]                         |
| Amina    | 28       | 15              | 1       | 76%         | [Reassign]                         |
+------------------------------------------------------------------------------------------------------+
| RISK + SLA                                                                                           |
| Clients at high risk: 6   | Overdue close items: 12   | Pending approvals: 9                        |
| [Open high-risk clients] [Open approvals] [Open overdue]                                             |
+------------------------------------------------------------------------------------------------------+
```

### 20.7.4 Mobile: Firm Dashboard

```text
+---------------------------------------------+
| Top: [Tab] [Period] [Ask]                   |
+---------------------------------------------+
| Tab chips: My Work* | Portfolio | Admin?    |
+---------------------------------------------+
| My Work: task cards (owner, due, CTA)       |
| Portfolio: compact client rows + risk badge  |
| Admin: compact metrics + deep-link actions   |
+---------------------------------------------+
```

### 20.8 Acceptance Criteria (Firm Dashboard v1)

1. Bookkeeper can clear daily queue from `My Work` without opening `Portfolio`.
2. Manager can identify top-risk clients from `Portfolio` within one screen.
3. Every major metric deep-links to a filtered actionable list.
4. Period context is persistent across tab switches.
5. Overdue items are always visible and prioritized in default sorting.

### 20.9 Firm Client Management and Invite Flow (Locked for v1)

This section defines how firms add/manage clients and view firm-wide posture.

Where firm users can add/invite clients:

1. Firm Admin tab (primary)

- `Invite new client` primary button.
- `Total clients` metric with status breakdown.
- Client directory table (all firm clients):
  - Name
  - Invite status (`pending`, `accepted`, `expired`)
  - Onboarding status (`not_started`, `in_progress`, `active`)
  - Assigned owner
  - Last activity

2. Top-bar client menu (secondary)

- `Clients (N)` menu visible to firm users.
- Includes quick `Invite client` action.

Permission rules:

- Invite client: firm admin/manager only.
- Bookkeepers: view assigned clients only by default (unless elevated access).

### 20.10 Firm-Wide Position Metrics (Locked for v1)

Portfolio and Firm Admin must expose firm-wide posture at a glance:

- Total active clients
- Clients needing attention
- Clients awaiting client response
- Overdue close blockers
- Disconnected feed count
- Pending approvals

All posture metrics must deep-link to a filtered actionable list.

### 20.11 Cross-Client Safety Boundaries (Locked for v1)

1. Cross-client view is triage only

- `My Work` and `Portfolio` can list items across clients.
- Detailed execution must occur in explicit client context.

2. Explicit client context before mutation

- Any mutating action requires active client context in header.
- Sensitive actions (post/approve/close) include client + period in confirmation.

3. No cross-client mutation bulk actions in v1

- Bulk actions can apply only within one active client context.

## 21. Workbench Specification (v1)

### 21.1 Core Purpose

The Workbench is the accountant execution cockpit.

- It is not a navigation card page.
- It is where tasks are triaged, worked, and completed.
- It should minimize context switching between categorization, journals, close blockers, and client requests.

### 21.2 Workbench Layout Contract (Desktop)

1. Top context bar

- Client/company switcher
- Period selector
- Assignee filter
- Search
- `Ask Accountable`

2. Left queue rail (operational buckets)

- `Needs Client Input`
- `Needs Review`
- `Uncategorized`
- `Ready to Post`
- `Close Blockers`
- `Disconnected Feeds`

Each queue must show:

- open item count
- overdue count
- highest urgency badge

3. Center canvas (selected queue table/list)

- Dense, sortable list
- Columns vary by queue
- Multi-select for safe bulk actions
- Keyboard-first interaction for power users

4. Right inspector panel

- Selected item details
- Source drill chain (bank transaction/journal/file/audit)
- Context-specific actions

5. Sticky action bar

- Shows available actions for selected row(s)
- Examples: assign, request info, approve, open in journals, open TB slice, post (where allowed)

### 21.3 Queue Definitions (Locked for v1)

1. Needs Client Input

- Items blocked on client response, document upload, or account reconnect.

2. Needs Review

- Items proposed by automation or prepared by team awaiting human review.

3. Uncategorized

- Transactions without finalized ledger intent.

4. Ready to Post

- Reviewed items that can be posted, subject to period lock/permission checks.

5. Close Blockers

- Period-specific blockers preventing close readiness.

6. Disconnected Feeds

- Bank connections requiring reconnect or import fallback.

### 21.4 What Changes from Current Workspace

Current page (`apps/web/src/domains-pending-migration/accounting-ws/acc-ws.tsx`) should evolve as follows:

Replace:

- Static quick-action-first layout

With:

- Queue-first operational layout with live counts and urgency sorting

Keep (as secondary tools panel):

- Connect bank
- Upload transactions
- Open journals
- Open categorization engine

Add:

- URL-persisted state (`queue`, `period`, `assignee`, `client`, `search`)
- Deep links into Journals/Cat Engine/Close/TB
- Ownership and SLA metadata (owner, due date, age, blocker reason)

### 21.5 Workbench Entry Points (Locked for v1)

Primary:

- `/:companyId/ws/accounting` (default to most urgent queue)

Secondary:

- From firm dashboard `My Work` item -> open workbench with queue + filters preselected
- From portfolio row -> open workbench scoped to client + current period
- From client dashboard task -> open specific queue item in inspector

### 21.6 Low-Fidelity Workbench Wireframes (v1)

### 21.6.1 Desktop Workbench

```text
+------------------------------------------------------------------------------------------------------+
| Top Bar: [Client/Company] [Period] [Assignee] [Search] [Ask Accountable]                            |
+------------------------------------------------------------------------------------------------------+
| Queues                         | Selected Queue: Needs Review                    | Inspector          |
|----------------------------------------------------------------------------------|--------------------|
| Needs Client Input  12 (4!)    | Row: Client | Item | Due | Owner | Status      | Item detail        |
| Needs Review        34 (7!) *  |--------------------------------------------------|--------------------|
| Uncategorized       81 (10!)   | Acme | 14 txn proposals | Today | You | Due     | Source summary     |
| Ready to Post       22 (2!)    | Beta | Journal draft #42 | Fri | Tolu | Review  | Blockers           |
| Close Blockers      9  (3!)    | Delta| TB diff warning    | Today| You | Risk    | Related files      |
| Disconnected Feeds  5  (5!)    | ...                                              | Actions            |
|----------------------------------------------------------------------------------| [Assign] [Request] |
| Quick Filters: [Overdue] [Due today] [Assigned to me] [Open period]             | [Open Journal]     |
+------------------------------------------------------------------------------------------------------+
| Sticky Action Bar: [Bulk Assign] [Request Info] [Approve] [Open in Journals] [Open TB Slice]       |
+------------------------------------------------------------------------------------------------------+
```

### 21.6.2 Mobile Workbench

```text
+---------------------------------------------+
| Top: [Queue] [Period] [Search] [Ask]        |
+---------------------------------------------+
| Queue chips: Client Input | Review* | ...   |
+---------------------------------------------+
| List of queue items (cards/compact rows)    |
| Card: title, client, due, owner, urgency    |
| Tap -> full-screen inspector                 |
+---------------------------------------------+
| Inspector screen                             |
| Source detail + actions                      |
| [Assign] [Request] [Approve]                 |
+---------------------------------------------+
```

### 21.7 Acceptance Criteria (Workbench v1)

1. User can complete a queue item without visiting more than one additional surface.
2. Queue ordering defaults to urgency, then due date, then age.
3. All queue items display owner and due date (or explicitly `No due date`).
4. Deep links preserve context when moving to journals/categorization/close.
5. Workbench state persists in URL so refresh/back/forward restores view.

## 22. Accounting Primer and Glossary (For Non-Accountants)

### 22.1 Simple Accounting Primer

- Bank transactions are raw money movements from feeds/imports.
- Journals are manual accounting adjustments entered by accountants.
- General Ledger (GL) is the full book of account entries.
- Trial Balance (TB) is a period snapshot of account balances.
- Financial Statements are formal reports derived from TB/GL:
  - Profit and Loss
  - Balance Sheet
  - Cash Flow
  - Notes

Important principle:

- Reports are trusted only when users can drill from report line -> entries -> source records.

### 22.2 Glossary

- Action Center: tasks that need user action now.
- Readiness Center: month-by-month close readiness and blockers.
- Workbench: accountant execution cockpit with queue-based work.
- Close Hub: period close and trial balance operations.
- Inspector: right-side detail panel for selected row/item.
- Preview Mode: isolated demo-data experience for new users.
- Client-owned task: an item blocked specifically on client action.
- Overdue: task past due date and requiring escalation priority.

## 23. User Jobs and Success Criteria

### 23.1 Client Jobs

- Understand what they need to do now.
- Complete required actions quickly.
- Verify the business is on track.
- View and export reports by period.

Success signals:

- Client can identify next action in under 10 seconds.
- Client can complete top task in under 2 minutes.
- Report exports are accessible without navigating to internal accounting pages.

### 23.2 Bookkeeper Jobs

- Prioritize and complete assigned work.
- Resolve review/uncategorized queues.
- Escalate client blockers early.
- Move periods toward close with minimal friction.

Success signals:

- Bookkeeper can start next task from `My Work` without extra navigation.
- Queue completion velocity increases with fewer overdue carryovers.

### 23.3 Firm Admin Jobs

- Monitor portfolio risk.
- Rebalance workload.
- Prevent SLA failures.
- Manage approvals and close controls.

Success signals:

- High-risk clients are identifiable in one screen.
- Overdue and capacity hotspots are actionable with one click.

## 24. End-to-End Journeys (v1 Reference)

### 24.1 New Client Journey

1. Lands on dashboard with no bank connected.
2. Connects bank or uploads statement.
3. Sees initializing state while data is prepared.
4. Transitions to either action-required or all-clear state.
5. Views/exports reports once data is ready.

### 24.2 Client Action-Required Journey

1. Opens dashboard and sees Action Center first.
2. Clicks top-priority task.
3. Completes action (`Reconnect`, `Upload`, `Respond`, or `Approve`).
4. Returns to dashboard with updated readiness state.

### 24.3 Bookkeeper Daily Journey

1. Opens firm dashboard `My Work`.
2. Picks top overdue/due-soon item.
3. Opens Workbench item and resolves it.
4. Uses inspector drill to verify evidence.
5. Posts/assigns/escalates based on permissions.

## 25. Interaction State Machine (Client Dashboard)

Allowed high-level states:

1. `no_bank_connected`
2. `initializing_data`
3. `action_required`
4. `all_clear`
5. `preview_mode`

Priority resolution (top wins):

1. `no_bank_connected`
2. `initializing_data` or feed unhealthy
3. `action_required`
4. `all_clear`
5. `preview_mode` only when user explicitly enters it

Invariant:

- `all_clear` cannot render if feed health or required data checks fail.

## 26. Implementation and Handoff Checklist

### 26.1 Design Checklist

- Every major card has a clear primary action.
- Every status has explicit copy (no icon-only semantics).
- Empty, initializing, blocked, and all-clear states are designed.
- Mobile parity is defined for every desktop interaction.
- Demo data surfaces are visually and textually separated from real data.

### 26.2 Product Checklist

- Role permissions are mapped per action.
- Entry points are defined for client, bookkeeper, and admin.
- Period context rules are documented and consistent.
- Success metrics and instrumentation events are defined.

### 26.3 Engineering Checklist

- URL state contract implemented (`period`, `queue`, `assignee`, `client`, `search`, `previewMode`).
- Deep links preserve context across features.
- Data freshness checks are available to dashboard state resolver.
- Drill chain works end-to-end to source evidence.
- Feature flags support partial rollout by role/company type.

### 26.4 QA Acceptance Gates

- New client sees correct empty/initializing flow.
- Client can complete each Action Center task type.
- Bookkeeper `My Work` and `Portfolio` tabs behave as specified.
- Trial Balance and report drill paths resolve to valid source records.
- Demo data mode never contaminates live metrics or exports.

## 27. Anti-Patterns to Avoid

- Generic dashboard cards with no action context.
- Mixing client-level and task-level primary views in one pane.
- Hidden ownership/due dates on actionable items.
- State ambiguity between real and demo data.
- Requiring users to memorize navigation paths for common actions.

## 28. Additional Gaps Closed (v1)

1. Notification and reminder model

- In-app reminders for due-soon and overdue tasks.
- Daily digest for firm users (my overdue, my due today, high-risk clients).

2. Invite lifecycle visibility

- Pending/accepted/expired invite statuses must be visible in Firm Admin.
- Re-send invite action available for expired/pending states.

3. Audit and accountability basics

- Show who requested, who acted, and when for client-facing requests.
- Keep immutable event trail for sensitive actions.

4. Failure recovery actions

- Feed disconnect state must always present reconnect + CSV fallback.
- Failed uploads/reports should provide retry with actionable error copy.

5. Empty-state consistency

- Every major pane has explicit empty/loading/error states with next-best action.

## 29. Frontend File Structure (Reference)

Use the existing architecture standard (`features` + `modules` + `shared`) and avoid adding new work under `domains-pending-migration`.

Target structure for new accounting surfaces:

```text
apps/web/src/
  features/
    accounting/
      dashboard-client/
        ui/
          page.tsx
          components/
          states/
        model/
          use-dashboard-state.ts
          types.ts
        index.ts
      dashboard-firm/
        ui/
          page.tsx
          components/
          tabs/
        model/
          use-firm-dashboard-state.ts
          types.ts
        index.ts
      workbench/
        ui/
          page.tsx
          components/
          queues/
          inspector/
        model/
          use-workbench-state.ts
          types.ts
        index.ts
      close-hub/
        ui/
          page.tsx
          components/
        model/
          use-close-state.ts
        index.ts
      trial-balance/
        ui/
          page.tsx
          components/
        model/
          use-trial-balance-view.ts
        index.ts
      financials/
        ui/
          page.tsx
          components/
          statements/
        model/
          use-financials-view.ts
        index.ts
      ledger-explorer/
        ui/
          panel.tsx
          page.tsx
        model/
          use-ledger-explorer.ts
        index.ts

  modules/
    accounting/
      workbench-queues/
        api/index.ts
        model/types.ts
        model/hooks.ts
        index.ts
      trial-balance/
        api/index.ts
        model/types.ts
        model/hooks.ts
        index.ts
      financial-statements/
        api/index.ts
        model/types.ts
        model/hooks.ts
        index.ts
      ledger/
        api/index.ts
        model/types.ts
        model/hooks.ts
        index.ts
      close/
        api/index.ts
        model/types.ts
        model/hooks.ts
        index.ts
      period-context/
        model/types.ts
        lib/period-utils.ts
        index.ts
```

Routing and app integration touch points:

- `apps/web/src/shared/routes/definitions/accounting.ts`
- `apps/web/src/App.tsx`
- Sidebar/nav wiring in existing app shell

## 30. Implementability Status and Start-Now Plan

Current status: implementable now for frontend.

What is ready:

- UX contracts, role behavior, state definitions, and wireframes are defined in this document.
- Existing journals and categorization features provide reusable layout and interaction patterns.

What is partially ready (use frontend mocks first):

- Trial balance and financial statement UI can start with mocked/fake data adapters.
- Workbench queue APIs may be composed from existing endpoints initially.

### 30.1 Phase-by-Phase Implementation (Frontend First)

Phase A: Foundations (day 1-2)

1. Create feature/module folders from Section 29.
2. Add route definitions and placeholder pages.
3. Add shared period/context URL state utilities.
4. Add unified top context bar component for new accounting surfaces.

Phase B: Client + Firm Dashboard shells (day 2-4)

1. Implement client dashboard states:
   - no bank
   - initializing
   - action required
   - all clear
   - preview mode
2. Implement firm dashboard tabs:
   - My Work
   - Portfolio
   - Firm Admin
3. Implement `Invite new client` UI entry points and client directory shell.

Phase C: Workbench (day 4-6)

1. Implement queue rail + center list + inspector + sticky action bar.
2. Wire URL state (`queue`, `period`, `assignee`, `search`, `client`).
3. Add deep links into journals/categorization/close views.

Phase D: Close + Trial Balance + Financials shells (day 6-8)

1. Implement Close Hub page and trial balance table structure.
2. Implement financial statements tabs and drill shells.
3. Implement ledger explorer panel and drill routing.

Phase E: Hardening (day 8-10)

1. Add empty/loading/error state polish.
2. Add permissions gating and client-context safety checks.
3. Add instrumentation events for key user actions.

### 30.2 Required Mock Adapters (to avoid waiting on backend)

Frontend can start immediately by creating module-level mock adapters for:

- workbench queue list
- trial balance rows and decomposition
- financial statement lines and drill nodes
- firm client directory and invite status list

Then switch adapters to real APIs incrementally.

### 30.3 Definition of Ready for UI Build

A page/feature is ready to build when:

1. Route path exists.
2. State model is defined.
3. Primary CTA list is defined.
4. Empty/loading/error states are defined.
5. Permission visibility rules are defined.

### 30.4 Definition of Done for v1 Frontend

1. All major views render with real role-aware states.
2. Task-driven deep links preserve period/client context.
3. Client cannot trigger privileged accountant actions.
4. Demo mode is visually isolated from real data mode.
5. QA acceptance gates in Section 26.4 pass.

## 31. Income Statement v1 Canvas (Locked)

### 31.1 Final Design Decisions

1. Toolbar placement:

- Keep report toolbar above the statement canvas (page-level), not inside table rows.
- Toolbar order (right side): `AI icon` -> `Export` -> `Print`.
- Use icon-only AI affordance (no "Ask Accountable" text label) so discovery is behavioral, not promotional.

2. Period + compare behavior:

- Period picker supports month, quarter, full year, YTD, trailing 12M.
- Compare supports `None`, `Prior period`, `Prior year`.
- Trailing 12M disables compare.

3. Income statement body:

- Show three KPI cards on a single desktop row.
- Default table state shows headline lines first for fast scanning.
- Provide inline expansion for line-level detail (sub-accounts) without page navigation.

4. Right rail behavior:

- Two tabs: `Insights` and `Details`.
- Insights surfaces proactive observations (anomalies/trends) and lightweight trend charting.
- Details reflects currently selected line and exposes drill path actions.

5. Nomenclature policy:

- Labels must be reporting-framework aware (`US GAAP` vs `IFRS`).
- If framework is unknown, use safe GAAP-default wording until company preference is set.

### 31.2 Implementation Scope (Now vs Later)

Now (v1 UI):

- Framework-aware statement labels.
- KPI cards + headline-first expandable statement.
- Contextual right rail for insights and selected-line details.
- AI icon in report toolbar with reporting-context prompt handoff.

Later (v1.1+):

- Live insight generation from model outputs.
- Fully functional Ledger Explorer launch from details rail.
- Export variants beyond CSV/Excel parity decisions and print templates.
